package com.advanceseeds.coreml

import android.util.Log
import androidx.camera.core.ImageProxy
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

class AdvanceSeedsTfliteFrameProcessorPlugin : FrameProcessorPlugin() {
  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    return AndroidTfliteRunner.run(frame, params)
  }
}

private object AndroidTfliteRunner {
  private const val TAG = "AdvanceSeedsTFLite"
  private const val DEFAULT_MODEL_ASSET = "yolo11n-seeds.tflite"
  private const val INPUT_SIZE = 640
  private const val CHANNELS = 3
  private const val FLOAT_BYTES = 4

  private val lock = Any()
  @Volatile private var runner: Runner? = null
  @Volatile private var lastTimingLogAtMs = 0L

  fun run(frame: Frame, params: Map<String, Any>?): Map<String, Any>? {
    val image = frame.imageProxy
    val assetName = (params?.get("assetName") as? String)?.takeIf { it.isNotBlank() }
      ?: DEFAULT_MODEL_ASSET
    val cropSize = numberParam(params, "cropSize", min(image.width, image.height).toDouble())
      .toInt()
      .coerceAtLeast(1)
    val cropX = numberParam(params, "cropX", ((image.width - cropSize) / 2.0))
      .toInt()
      .coerceIn(0, max(0, image.width - cropSize))
    val cropY = numberParam(params, "cropY", ((image.height - cropSize) / 2.0))
      .toInt()
      .coerceIn(0, max(0, image.height - cropSize))

    val activeRunner = getRunner(frame, assetName)
    val startedAtMs = System.currentTimeMillis()
    synchronized(lock) {
      activeRunner.fillInputFromYuv(image.planes, image.width, image.height, cropX, cropY, cropSize)
      activeRunner.run()
    }
    val elapsedMs = System.currentTimeMillis() - startedAtMs
    val now = System.currentTimeMillis()
    if (now - lastTimingLogAtMs > 2_000) {
      lastTimingLogAtMs = now
      Log.d(
        TAG,
        "native live inference ${image.width}x${image.height} crop=${cropX},${cropY},${cropSize} elapsed=${elapsedMs}ms delegate=cpu output=${activeRunner.outputShape.joinToString("x")}"
      )
    }
    return mapOf(
      "shape" to activeRunner.outputShape.toList(),
      "values" to activeRunner.outputValues(),
      "delegate" to "cpu",
    )
  }

  private fun getRunner(frame: Frame, assetName: String): Runner {
    runner?.takeIf { it.assetName == assetName }?.let { return it }
    synchronized(lock) {
      runner?.takeIf { it.assetName == assetName }?.let { return it }
      val context = AdvanceSeedsAppContextHolder.context
        ?: throw IllegalStateException("Android app context unavailable for TFLite asset loading")
      return Runner(context.assets.open(assetName).use { stream ->
        val bytes = stream.readBytes()
        ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).also { buffer ->
          buffer.put(bytes)
          buffer.rewind()
        }
      }, assetName).also { runner = it }
    }
  }

  private fun numberParam(params: Map<String, Any>?, name: String, fallback: Double): Double {
    return (params?.get(name) as? Number)?.toDouble() ?: fallback
  }

  private class Runner(modelBuffer: ByteBuffer, val assetName: String) {
    private val interpreter = Interpreter(
      modelBuffer,
      Interpreter.Options().apply {
        setNumThreads(2)
        setUseXNNPACK(true)
      },
    )
    private val inputTensor = interpreter.getInputTensor(0)
    private val outputTensor = interpreter.getOutputTensor(0)
    val outputShape: IntArray = outputTensor.shape()
    private val inputType = inputTensor.dataType()
    private val outputType = outputTensor.dataType()
    private val inputBuffer: ByteBuffer
    private val outputBuffer: ByteBuffer
    private val outputFloatCount = outputShape.fold(1) { acc, v -> acc * v }

    init {
      val inputShape = inputTensor.shape()
      require(inputShape.size == 4 && inputShape[1] == INPUT_SIZE && inputShape[2] == INPUT_SIZE && inputShape[3] == CHANNELS) {
        "Unsupported TFLite input shape ${inputShape.joinToString("x")}; expected 1x640x640x3"
      }
      require(outputShape.size == 3) {
        "Unsupported TFLite output rank ${outputShape.size}; expected rank-3"
      }
      require(outputType == DataType.FLOAT32) {
        "Unsupported TFLite output type $outputType; expected FLOAT32"
      }
      val inputBytes = when (inputType) {
        DataType.FLOAT32 -> INPUT_SIZE * INPUT_SIZE * CHANNELS * FLOAT_BYTES
        DataType.UINT8 -> INPUT_SIZE * INPUT_SIZE * CHANNELS
        else -> throw IllegalArgumentException("Unsupported TFLite input type $inputType")
      }
      inputBuffer = ByteBuffer.allocateDirect(inputBytes).order(ByteOrder.nativeOrder())
      outputBuffer = ByteBuffer.allocateDirect(outputFloatCount * FLOAT_BYTES).order(ByteOrder.nativeOrder())
      Log.i(TAG, "loaded $assetName input=${inputShape.joinToString("x")} type=$inputType output=${outputShape.joinToString("x")} delegate=cpu")
    }

    fun fillInputFromYuv(
      planes: Array<ImageProxy.PlaneProxy>,
      frameWidth: Int,
      frameHeight: Int,
      cropX: Int,
      cropY: Int,
      cropSize: Int,
    ) {
      inputBuffer.rewind()
      val yPlane = planes[0]
      val uPlane = planes[1]
      val vPlane = planes[2]
      val yBuffer = yPlane.buffer.duplicate()
      val uBuffer = uPlane.buffer.duplicate()
      val vBuffer = vPlane.buffer.duplicate()
      val scale = cropSize.toDouble() / INPUT_SIZE

      for (outY in 0 until INPUT_SIZE) {
        val srcY = (cropY + ((outY + 0.5) * scale).toInt()).coerceIn(0, frameHeight - 1)
        for (outX in 0 until INPUT_SIZE) {
          val srcX = (cropX + ((outX + 0.5) * scale).toInt()).coerceIn(0, frameWidth - 1)
          val yValue = yBuffer.get(srcY * yPlane.rowStride + srcX * yPlane.pixelStride).toInt() and 0xff
          val uvX = srcX / 2
          val uvY = srcY / 2
          val uValue = uBuffer.get(uvY * uPlane.rowStride + uvX * uPlane.pixelStride).toInt() and 0xff
          val vValue = vBuffer.get(uvY * vPlane.rowStride + uvX * vPlane.pixelStride).toInt() and 0xff
          val rgb = yuvToRgb(yValue, uValue, vValue)
          if (inputType == DataType.FLOAT32) {
            inputBuffer.putFloat(rgb[0] / 255f)
            inputBuffer.putFloat(rgb[1] / 255f)
            inputBuffer.putFloat(rgb[2] / 255f)
          } else {
            inputBuffer.put(rgb[0].toByte())
            inputBuffer.put(rgb[1].toByte())
            inputBuffer.put(rgb[2].toByte())
          }
        }
      }
      inputBuffer.rewind()
    }

    fun run() {
      outputBuffer.rewind()
      interpreter.run(inputBuffer, outputBuffer)
      outputBuffer.rewind()
    }

    fun outputValues(): List<Double> {
      outputBuffer.rewind()
      val values = ArrayList<Double>(outputFloatCount)
      repeat(outputFloatCount) {
        values.add(outputBuffer.float.toDouble())
      }
      outputBuffer.rewind()
      return values
    }

    private fun yuvToRgb(y: Int, u: Int, v: Int): IntArray {
      val c = y - 16
      val d = u - 128
      val e = v - 128
      val r = clamp((298 * c + 409 * e + 128) shr 8)
      val g = clamp((298 * c - 100 * d - 208 * e + 128) shr 8)
      val b = clamp((298 * c + 516 * d + 128) shr 8)
      return intArrayOf(r, g, b)
    }

    private fun clamp(value: Int): Int = min(255, max(0, value))
  }
}
