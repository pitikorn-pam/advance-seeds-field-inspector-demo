package com.advanceseeds.coreml

import android.util.Log
import androidx.camera.core.ImageProxy
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.CompatibilityList
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.File
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
    val modelPath = (params?.get("modelPath") as? String)?.takeIf { it.isNotBlank() }
    val cropSize = numberParam(params, "cropSize", min(image.width, image.height).toDouble())
      .toInt()
      .coerceAtLeast(1)
    val cropX = numberParam(params, "cropX", ((image.width - cropSize) / 2.0))
      .toInt()
      .coerceIn(0, max(0, image.width - cropSize))
    val cropY = numberParam(params, "cropY", ((image.height - cropSize) / 2.0))
      .toInt()
      .coerceIn(0, max(0, image.height - cropSize))

    val activeRunner = getRunner(assetName, modelPath)
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
        "native live inference ${image.width}x${image.height} crop=${cropX},${cropY},${cropSize} elapsed=${elapsedMs}ms delegate=${activeRunner.delegateName} outputIndex=${activeRunner.selectedOutputIndex} output=${activeRunner.outputShape.joinToString("x")}"
      )
    }
    return mapOf(
      "shape" to activeRunner.outputShape.toList(),
      "values" to activeRunner.outputValues(),
      "delegate" to activeRunner.delegateName,
      "outputIndex" to activeRunner.selectedOutputIndex,
    )
  }

  private fun getRunner(assetName: String, modelPath: String?): Runner {
    val sourceKey = modelPath ?: "asset:$assetName"
    runner?.takeIf { it.sourceKey == sourceKey }?.let { return it }
    synchronized(lock) {
      runner?.takeIf { it.sourceKey == sourceKey }?.let { return it }
      val context = AdvanceSeedsAppContextHolder.context
        ?: throw IllegalStateException("Android app context unavailable for TFLite asset loading")
      val bytes = if (modelPath != null) {
        val path = modelPath.removePrefix("file://")
        File(path).readBytes()
      } else {
        context.assets.open(assetName).use { stream -> stream.readBytes() }
      }
      return Runner(ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).also { buffer ->
        buffer.put(bytes)
        buffer.rewind()
      }, sourceKey).also { runner = it }
    }
  }

  private fun numberParam(params: Map<String, Any>?, name: String, fallback: Double): Double {
    return (params?.get(name) as? Number)?.toDouble() ?: fallback
  }

  private class Runner(modelBuffer: ByteBuffer, val sourceKey: String) {
    private val cpuInterpreter = Interpreter(modelBuffer.duplicate().rewinded(), cpuOptions())
    private val gpuDelegate: GpuDelegate? = createGpuDelegate()
    private val gpuInterpreter: Interpreter? = gpuDelegate?.let { delegate ->
      try {
        Interpreter(modelBuffer.duplicate().rewinded(), Interpreter.Options().addDelegate(delegate))
      } catch (err: Throwable) {
        Log.w(TAG, "gpu interpreter unavailable; using cpu", err)
        delegate.close()
        null
      }
    }
    private var selectedInterpreter: Interpreter = cpuInterpreter
    @Volatile var delegateName: String = "cpu"
      private set
    private var benchmarked = false
    private val inputTensor = cpuInterpreter.getInputTensor(0)
    val selectedOutputIndex = selectDetectionOutputTensorIndex(cpuInterpreter)
    private val outputTensor = cpuInterpreter.getOutputTensor(selectedOutputIndex)
    val outputShape: IntArray = outputTensor.shape()
    private val inputType = inputTensor.dataType()
    private val outputType = outputTensor.dataType()
    private val inputBuffer: ByteBuffer
    private val outputBuffer: ByteBuffer
    private val outputFloatCount = outputShape.fold(1) { acc, v -> acc * v }
    private var mapKey = ""
    private val srcXMap = IntArray(INPUT_SIZE)
    private val srcYMap = IntArray(INPUT_SIZE)

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
      Log.i(TAG, "loaded $sourceKey input=${inputShape.joinToString("x")} type=$inputType outputIndex=$selectedOutputIndex output=${outputShape.joinToString("x")} delegate=cpu gpuCandidate=${gpuInterpreter != null}")
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
      updateCoordinateMaps(frameWidth, frameHeight, cropX, cropY, cropSize)
      val yRowStride = yPlane.rowStride
      val yPixelStride = yPlane.pixelStride
      val uRowStride = uPlane.rowStride
      val uPixelStride = uPlane.pixelStride
      val vRowStride = vPlane.rowStride
      val vPixelStride = vPlane.pixelStride

      for (outY in 0 until INPUT_SIZE) {
        val srcY = srcYMap[outY]
        val yRowOffset = srcY * yRowStride
        val uvY = srcY / 2
        val uRowOffset = uvY * uRowStride
        val vRowOffset = uvY * vRowStride
        for (outX in 0 until INPUT_SIZE) {
          val srcX = srcXMap[outX]
          val yValue = yBuffer.get(yRowOffset + srcX * yPixelStride).toInt() and 0xff
          val uvX = srcX / 2
          val uValue = uBuffer.get(uRowOffset + uvX * uPixelStride).toInt() and 0xff
          val vValue = vBuffer.get(vRowOffset + uvX * vPixelStride).toInt() and 0xff
          val c = yValue - 16
          val d = uValue - 128
          val e = vValue - 128
          val r = clamp((298 * c + 409 * e + 128) shr 8)
          val g = clamp((298 * c - 100 * d - 208 * e + 128) shr 8)
          val b = clamp((298 * c + 516 * d + 128) shr 8)
          if (inputType == DataType.FLOAT32) {
            inputBuffer.putFloat(r / 255f)
            inputBuffer.putFloat(g / 255f)
            inputBuffer.putFloat(b / 255f)
          } else {
            inputBuffer.put(r.toByte())
            inputBuffer.put(g.toByte())
            inputBuffer.put(b.toByte())
          }
        }
      }
      inputBuffer.rewind()
    }

    fun run() {
      if (!benchmarked) benchmarkDelegate()
      outputBuffer.rewind()
      try {
        selectedInterpreter.runForMultipleInputsOutputs(
          arrayOf(inputBuffer),
          mapOf(selectedOutputIndex to outputBuffer as Any),
        )
      } catch (err: Throwable) {
        if (delegateName != "cpu") {
          Log.w(TAG, "delegate=$delegateName failed during live inference; falling back to cpu", err)
          selectedInterpreter = cpuInterpreter
          delegateName = "cpu"
          outputBuffer.rewind()
          cpuInterpreter.runForMultipleInputsOutputs(
            arrayOf(inputBuffer),
            mapOf(selectedOutputIndex to outputBuffer as Any),
          )
        } else {
          throw err
        }
      }
      outputBuffer.rewind()
    }

    private fun benchmarkDelegate() {
      benchmarked = true
      val gpu = gpuInterpreter ?: return
      val cpuMs = benchmark("cpu", cpuInterpreter) ?: return
      val gpuMs = benchmark("gpu", gpu)
      if (gpuMs != null && gpuMs < cpuMs) {
        selectedInterpreter = gpu
        delegateName = "gpu"
      } else {
        selectedInterpreter = cpuInterpreter
        delegateName = "cpu"
      }
      Log.i(TAG, "delegate benchmark cpu=${cpuMs}ms gpu=${gpuMs?.toString() ?: "failed"}ms selected=$delegateName")
    }

    private fun benchmark(name: String, candidate: Interpreter): Long? {
      return try {
        outputBuffer.rewind()
        val startedAtMs = System.currentTimeMillis()
        candidate.runForMultipleInputsOutputs(
          arrayOf(inputBuffer),
          mapOf(selectedOutputIndex to outputBuffer as Any),
        )
        outputBuffer.rewind()
        inputBuffer.rewind()
        System.currentTimeMillis() - startedAtMs
      } catch (err: Throwable) {
        outputBuffer.rewind()
        inputBuffer.rewind()
        Log.w(TAG, "delegate benchmark failed for $name", err)
        null
      }
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

    private fun updateCoordinateMaps(
      frameWidth: Int,
      frameHeight: Int,
      cropX: Int,
      cropY: Int,
      cropSize: Int,
    ) {
      val key = "$frameWidth:$frameHeight:$cropX:$cropY:$cropSize"
      if (key == mapKey) return
      mapKey = key
      val scale = cropSize.toDouble() / INPUT_SIZE
      for (i in 0 until INPUT_SIZE) {
        srcXMap[i] = (cropX + ((i + 0.5) * scale).toInt()).coerceIn(0, frameWidth - 1)
        srcYMap[i] = (cropY + ((i + 0.5) * scale).toInt()).coerceIn(0, frameHeight - 1)
      }
    }

    private fun clamp(value: Int): Int = min(255, max(0, value))
  }

  private fun cpuOptions(): Interpreter.Options =
    Interpreter.Options().apply {
      setNumThreads(2)
      setUseXNNPACK(true)
    }

  private fun selectDetectionOutputTensorIndex(interpreter: Interpreter): Int {
    var bestIndex = 0
    var bestRank = -1
    var bestCount = -1
    for (i in 0 until interpreter.outputTensorCount) {
      val shape = interpreter.getOutputTensor(i).shape()
      var rank = 1
      if (shape.size == 3) {
        if (shape[0] == 1 && shape[1] == 300 && (shape[2] == 6 || shape[2] >= 38)) {
          rank = 3
        } else {
          rank = 2
        }
      }
      val count = shape.fold(1) { acc, value -> acc * value }
      if (rank > bestRank || (rank == bestRank && count > bestCount)) {
        bestRank = rank
        bestCount = count
        bestIndex = i
      }
    }
    return bestIndex
  }

  private fun createGpuDelegate(): GpuDelegate? {
    return try {
      val compat = CompatibilityList()
      if (!compat.isDelegateSupportedOnThisDevice) {
        Log.i(TAG, "gpu delegate not supported on this device")
        return null
      }
      GpuDelegate(compat.bestOptionsForThisDevice)
    } catch (err: Throwable) {
      Log.w(TAG, "gpu delegate unavailable", err)
      null
    }
  }

  private fun ByteBuffer.rewinded(): ByteBuffer {
    rewind()
    return this
  }
}
