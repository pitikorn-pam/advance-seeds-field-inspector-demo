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
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.min

class AdvanceSeedsTfliteFrameProcessorPlugin : FrameProcessorPlugin() {
  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    return AndroidTfliteRunner.run(frame, params)
  }
}

private object AndroidTfliteRunner {
  private const val TAG = "AdvanceSeedsTFLite"
  private const val INPUT_SIZE = 640
  private const val CHANNELS = 3
  private const val FLOAT_BYTES = 4
  private const val LIVE_OUTPUT_FIELDS = 6
  private const val CPU_NUM_THREADS = 4
  private const val GPU_WIN_MARGIN = 0.85

  private val lock = Any()
  @Volatile private var runner: Runner? = null
  @Volatile private var lastTimingLogAtMs = 0L

  fun run(frame: Frame, params: Map<String, Any>?): Map<String, Any>? {
    try {
      val image = frame.imageProxy
      val modelPath = (params?.get("modelPath") as? String)?.takeIf { it.isNotBlank() }
        ?: return null
      val cropSize = numberParam(params, "cropSize", min(image.width, image.height).toDouble())
        .toInt()
        .coerceAtLeast(1)
      val cropX = numberParam(params, "cropX", ((image.width - cropSize) / 2.0))
        .toInt()
        .coerceIn(0, max(0, image.width - cropSize))
      val cropY = numberParam(params, "cropY", ((image.height - cropSize) / 2.0))
        .toInt()
        .coerceIn(0, max(0, image.height - cropSize))
      val preprocessProfile = (params?.get("preprocessProfile") as? String)
        ?.takeIf { it == "morph_fused_v1" }
        ?: "raw_rgb"

      val activeRunner = getRunner(modelPath)
      val startedAtMs = System.currentTimeMillis()
      synchronized(lock) {
        activeRunner.fillInputFromYuv(
          image.planes,
          image.width,
          image.height,
          cropX,
          cropY,
          cropSize,
          preprocessProfile,
        )
        activeRunner.run()
      }
      val elapsedMs = System.currentTimeMillis() - startedAtMs
      val now = System.currentTimeMillis()
      if (now - lastTimingLogAtMs > 2_000) {
        lastTimingLogAtMs = now
        Log.d(
          TAG,
          "native live inference ${image.width}x${image.height} crop=${cropX},${cropY},${cropSize} preprocess=$preprocessProfile elapsed=${elapsedMs}ms delegate=${activeRunner.delegateName} outputIndex=${activeRunner.selectedOutputIndex} output=${activeRunner.outputShape.joinToString("x")} bridgeOutput=${activeRunner.bridgeOutputShape.joinToString("x")}"
        )
      }
      return mapOf(
        "shape" to activeRunner.bridgeOutputShape.toList(),
        "values" to activeRunner.outputValues(),
        "delegate" to activeRunner.delegateName,
        "outputIndex" to activeRunner.selectedOutputIndex,
      )
    } catch (t: Throwable) {
      Log.w(TAG, "live TFLite frame processing failed", t)
      return null
    }
  }

  private fun getRunner(modelPath: String): Runner {
    val sourceKey = modelPath
    runner?.takeIf { it.sourceKey == sourceKey }?.let { return it }
    synchronized(lock) {
      runner?.takeIf { it.sourceKey == sourceKey }?.let { return it }
      val path = modelPath.removePrefix("file://")
      val bytes = File(path).readBytes()
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
    private val modelBuffer = modelBuffer.duplicate().rewinded()
    private val cpuInterpreter = Interpreter(modelBuffer.duplicate().rewinded(), cpuOptions())
    @Volatile private var selectedInterpreter: Interpreter = cpuInterpreter
    @Volatile var delegateName: String = "cpu"
      private set
    @Volatile private var gpuBenchmarkStarted = false
    @Volatile private var lastCpuInferenceMs: Long? = null
    private val inputTensor = cpuInterpreter.getInputTensor(0)
    val selectedOutputIndex = selectDetectionOutputTensorIndex(cpuInterpreter)
    private val outputTensor = cpuInterpreter.getOutputTensor(selectedOutputIndex)
    val outputShape: IntArray = outputTensor.shape()
    private val inputType = inputTensor.dataType()
    private val outputType = outputTensor.dataType()
    private val inputBuffer: ByteBuffer
    private val outputBuffer: ByteBuffer
    private val outputFloatCount = outputShape.fold(1) { acc, v -> acc * v }
    private val bridgeCompactsSegmentationOutput =
      outputShape.size == 3 && outputShape[2] > LIVE_OUTPUT_FIELDS
    val bridgeOutputShape: IntArray =
      if (bridgeCompactsSegmentationOutput) intArrayOf(outputShape[0], outputShape[1], LIVE_OUTPUT_FIELDS) else outputShape
    private val bridgeOutputFloatCount = bridgeOutputShape.fold(1) { acc, v -> acc * v }
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
      Log.i(TAG, "loaded $sourceKey input=${inputShape.joinToString("x")} type=$inputType outputIndex=$selectedOutputIndex output=${outputShape.joinToString("x")} bridgeOutput=${bridgeOutputShape.joinToString("x")} delegate=cpu threads=$CPU_NUM_THREADS gpuLazy=true")
    }

    fun fillInputFromYuv(
      planes: Array<ImageProxy.PlaneProxy>,
      frameWidth: Int,
      frameHeight: Int,
      cropX: Int,
      cropY: Int,
      cropSize: Int,
      preprocessProfile: String,
    ) {
      if (preprocessProfile == "morph_fused_v1") {
        fillInputMorphFusedFromYuv(planes, frameWidth, frameHeight, cropX, cropY, cropSize)
      } else {
        fillInputRawFromYuv(planes, frameWidth, frameHeight, cropX, cropY, cropSize)
      }
    }

    private fun fillInputRawFromYuv(
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

    private val sampledRgb = ByteArray(INPUT_SIZE * INPUT_SIZE * CHANNELS)
    private val sampledLuma = IntArray(INPUT_SIZE * INPUT_SIZE)
    private val morphGradient = IntArray(INPUT_SIZE * INPUT_SIZE)
    private val morphEroded = IntArray(INPUT_SIZE * INPUT_SIZE)
    private val morphOpened = IntArray(INPUT_SIZE * INPUT_SIZE)

    private fun fillInputMorphFusedFromYuv(
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
          val idx = outY * INPUT_SIZE + outX
          val rgb = idx * CHANNELS
          sampledRgb[rgb] = r.toByte()
          sampledRgb[rgb + 1] = g.toByte()
          sampledRgb[rgb + 2] = b.toByte()
          sampledLuma[idx] = clamp((77 * r + 150 * g + 29 * b) shr 8)
        }
      }

      fillGradient(sampledLuma, morphGradient, 1)
      erode(sampledLuma, morphEroded, 3)
      dilate(morphEroded, morphOpened, 3)

      for (idx in sampledLuma.indices) {
        val rgb = idx * CHANNELS
        val grad = morphGradient[idx] / 255f
        val topHat = max(0, sampledLuma[idx] - morphOpened[idx]) / 255f
        val local = localContrast(sampledLuma, idx, 3)
        writeInputPixel(
          fuseChannel(sampledRgb[rgb].toInt() and 0xff, grad, topHat, local),
          fuseChannel(sampledRgb[rgb + 1].toInt() and 0xff, grad, topHat, local),
          fuseChannel(sampledRgb[rgb + 2].toInt() and 0xff, grad, topHat, local),
        )
      }
      inputBuffer.rewind()
    }

    fun run() {
      outputBuffer.rewind()
      val interpreter = selectedInterpreter
      val inferenceStartedAtMs = System.currentTimeMillis()
      try {
        interpreter.runForMultipleInputsOutputs(
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
      val inferenceMs = System.currentTimeMillis() - inferenceStartedAtMs
      if (delegateName == "cpu") {
        lastCpuInferenceMs = inferenceMs
        startGpuBenchmarkAsync()
      }
      outputBuffer.rewind()
    }

    private fun startGpuBenchmarkAsync() {
      if (gpuBenchmarkStarted) return
      gpuBenchmarkStarted = true
      thread(name = "AdvanceSeedsTfliteGpuBenchmark", isDaemon = true) {
        benchmarkGpuDelegate()
      }
    }

    private fun benchmarkGpuDelegate() {
      val delegate = createGpuDelegate() ?: return
      val gpu = try {
        Interpreter(modelBuffer.duplicate().rewinded(), Interpreter.Options().addDelegate(delegate))
      } catch (err: Throwable) {
        Log.w(TAG, "gpu interpreter unavailable; staying on cpu", err)
        delegate.close()
        return
      }
      val gpuInput = ByteBuffer.allocateDirect(inputBuffer.capacity()).order(ByteOrder.nativeOrder())
      val gpuOutput = ByteBuffer.allocateDirect(outputBuffer.capacity()).order(ByteOrder.nativeOrder())
      val gpuMs = benchmark("gpu", gpu, gpuInput, gpuOutput)
      val cpuMs = lastCpuInferenceMs
      if (gpuMs != null && cpuMs != null && gpuMs < (cpuMs * GPU_WIN_MARGIN).toLong()) {
        synchronized(lock) {
          selectedInterpreter = gpu
          delegateName = "gpu"
        }
        Log.i(TAG, "delegate benchmark cpu=${cpuMs}ms gpu=${gpuMs}ms selected=gpu")
      } else {
        gpu.close()
        delegate.close()
        Log.i(
          TAG,
          "delegate benchmark cpu=${cpuMs?.toString() ?: "unknown"}ms gpu=${gpuMs?.toString() ?: "failed"}ms selected=cpu"
        )
      }
    }

    private fun benchmark(
      name: String,
      candidate: Interpreter,
      benchmarkInput: ByteBuffer,
      benchmarkOutput: ByteBuffer,
    ): Long? {
      return try {
        benchmarkInput.rewind()
        benchmarkOutput.rewind()
        val startedAtMs = System.currentTimeMillis()
        candidate.runForMultipleInputsOutputs(
          arrayOf(benchmarkInput),
          mapOf(selectedOutputIndex to benchmarkOutput as Any),
        )
        benchmarkInput.rewind()
        benchmarkOutput.rewind()
        System.currentTimeMillis() - startedAtMs
      } catch (err: Throwable) {
        benchmarkInput.rewind()
        benchmarkOutput.rewind()
        Log.w(TAG, "delegate benchmark failed for $name", err)
        null
      }
    }

    // Returns List<Double>. Tried FloatArray for ~10× less boxing but
    // Vision Camera's plugin bridge on Z Flip 7 FE doesn't serialize
    // primitive `float[]` to JS reliably — live overlay stops drawing
    // bboxes (the JS receives empty `values`). The Double-boxing cost
    // is real (~11k allocations per frame at NMS-fused YOLO seg
    // scales) but it's the format the bridge actually understands.
    // Future option: explore a typed-array bridge or a binary-blob
    // path; not worth the risk in this session.
    fun outputValues(): List<Double> {
      outputBuffer.rewind()
      val values = ArrayList<Double>(bridgeOutputFloatCount)
      if (bridgeCompactsSegmentationOutput) {
        val rows = outputShape[1]
        val fields = outputShape[2]
        for (row in 0 until rows) {
          val base = row * fields * FLOAT_BYTES
          for (field in 0 until LIVE_OUTPUT_FIELDS) {
            values.add(outputBuffer.getFloat(base + field * FLOAT_BYTES).toDouble())
          }
        }
      } else {
        repeat(outputFloatCount) {
          values.add(outputBuffer.float.toDouble())
        }
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

    private fun writeInputPixel(r: Int, g: Int, b: Int) {
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

    private fun fillGradient(src: IntArray, dst: IntArray, radius: Int) {
      for (y in 0 until INPUT_SIZE) {
        for (x in 0 until INPUT_SIZE) {
          var minValue = 255
          var maxValue = 0
          for (dy in -radius..radius) {
            val yy = (y + dy).coerceIn(0, INPUT_SIZE - 1)
            for (dx in -radius..radius) {
              val xx = (x + dx).coerceIn(0, INPUT_SIZE - 1)
              val value = src[yy * INPUT_SIZE + xx]
              if (value < minValue) minValue = value
              if (value > maxValue) maxValue = value
            }
          }
          dst[y * INPUT_SIZE + x] = maxValue - minValue
        }
      }
    }

    private fun erode(src: IntArray, dst: IntArray, radius: Int) {
      for (y in 0 until INPUT_SIZE) {
        for (x in 0 until INPUT_SIZE) {
          var minValue = 255
          for (dy in -radius..radius) {
            val yy = (y + dy).coerceIn(0, INPUT_SIZE - 1)
            for (dx in -radius..radius) {
              val xx = (x + dx).coerceIn(0, INPUT_SIZE - 1)
              val value = src[yy * INPUT_SIZE + xx]
              if (value < minValue) minValue = value
            }
          }
          dst[y * INPUT_SIZE + x] = minValue
        }
      }
    }

    private fun dilate(src: IntArray, dst: IntArray, radius: Int) {
      for (y in 0 until INPUT_SIZE) {
        for (x in 0 until INPUT_SIZE) {
          var maxValue = 0
          for (dy in -radius..radius) {
            val yy = (y + dy).coerceIn(0, INPUT_SIZE - 1)
            for (dx in -radius..radius) {
              val xx = (x + dx).coerceIn(0, INPUT_SIZE - 1)
              val value = src[yy * INPUT_SIZE + xx]
              if (value > maxValue) maxValue = value
            }
          }
          dst[y * INPUT_SIZE + x] = maxValue
        }
      }
    }

    private fun localContrast(src: IntArray, index: Int, radius: Int): Float {
      val y = index / INPUT_SIZE
      val x = index % INPUT_SIZE
      var minValue = 255
      var maxValue = 0
      for (dy in -radius..radius) {
        val yy = (y + dy).coerceIn(0, INPUT_SIZE - 1)
        for (dx in -radius..radius) {
          val xx = (x + dx).coerceIn(0, INPUT_SIZE - 1)
          val value = src[yy * INPUT_SIZE + xx]
          if (value < minValue) minValue = value
          if (value > maxValue) maxValue = value
        }
      }
      val range = maxValue - minValue
      if (range <= 0) return 0.5f
      return (src[index] - minValue) / range.toFloat()
    }

    private fun fuseChannel(rgb: Int, gradient: Float, topHat: Float, localContrast: Float): Int {
      return clamp(((0.7f * rgb) + (0.15f * gradient * 255f) + (0.1f * topHat * 255f) + (0.05f * localContrast * 255f)).toInt())
    }

    private fun clamp(value: Int): Int = min(255, max(0, value))
  }

  private fun cpuOptions(): Interpreter.Options =
    Interpreter.Options().apply {
      setNumThreads(CPU_NUM_THREADS)
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
