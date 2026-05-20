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
import kotlin.math.exp
import kotlin.math.ceil
import kotlin.math.floor
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
      // Caller throttles mask polygon decode: even with the matmul + trace
      // in native, sigmoid over ~820k float ops per wantMask frame stays
      // expensive enough to keep gated. When wantMask=false we keep the
      // existing 6-field-truncated detection-only path. On wantMask=true
      // the plugin runs the YOLO segmentation post-process natively and
      // returns `polygons` parallel to the JS row iteration — the
      // ~820k-float prototype tensor never crosses the bridge.
      val wantMask = (params?.get("wantMask") as? Boolean) == true
      // Mask-decode args; consulted only when wantMask=true and the model
      // emits a rank-4 prototype tensor. Must match JS-side filtering for
      // index alignment between the i-th JS detection and the i-th
      // non-empty polygons[] entry.
      val maskScoreThreshold = numberParam(params, "scoreThreshold", 0.25).toFloat()
      @Suppress("UNCHECKED_CAST")
      val maskClassFilterRaw = params?.get("classFilter") as? List<Any>
      val maskClassFilter: IntArray? = maskClassFilterRaw?.mapNotNull {
        (it as? Number)?.toInt()
      }?.takeIf { it.isNotEmpty() }?.toIntArray()
      val maskBinThreshold = numberParam(params, "maskThreshold", 0.5).toFloat()
      // Derive letterbox from cropX/cropY/cropSize. The Android path
      // feeds a square crop directly into TFLite at 640×640, so the
      // "letterbox-inverse" the polygon decoder runs is simply
      //   x_src = cropX + x_canvas * (cropSize / 640)
      // which we encode as scale = 640/cropSize, padX = -cropX*scale,
      // padY = -cropY*scale — matching the JS-side decodeOpts.letterbox.
      val maskLetterboxTarget = INPUT_SIZE.toFloat()
      val maskLetterboxScale = if (cropSize > 0) maskLetterboxTarget / cropSize else 0f
      val maskLetterboxPadX = -cropX * maskLetterboxScale
      val maskLetterboxPadY = -cropY * maskLetterboxScale
      val maskSrcW = image.width
      val maskSrcH = image.height

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
      val detectionShape: List<Int>
      val detectionValues: List<Double>
      if (wantMask) {
        detectionShape = activeRunner.outputShape.toList()
        detectionValues = activeRunner.fullOutputValues()
      } else {
        detectionShape = activeRunner.bridgeOutputShape.toList()
        detectionValues = activeRunner.outputValues()
      }
      val result = HashMap<String, Any>(6)
      result["shape"] = detectionShape
      result["values"] = detectionValues
      result["delegate"] = activeRunner.delegateName
      result["outputIndex"] = activeRunner.selectedOutputIndex
      if (wantMask) {
        // Native polygon decode — runs on the worklet thread inside the
        // plugin, after model inference, while the prototype tensor is
        // still in-process. Emits `polygons` parallel to the JS row
        // iteration; the ~820k-float prototype is never copied to JS.
        val protoShape = activeRunner.prototypeShape
        val canDecode = protoShape != null && maskLetterboxScale > 0f &&
            maskLetterboxTarget > 0f && maskSrcW > 0 && maskSrcH > 0
        if (canDecode) {
          val polygons = activeRunner.decodeAllPolygonsToBridge(
            scoreThreshold = maskScoreThreshold,
            classFilter = maskClassFilter,
            scale = maskLetterboxScale,
            padX = maskLetterboxPadX,
            padY = maskLetterboxPadY,
            target = maskLetterboxTarget,
            srcW = maskSrcW,
            srcH = maskSrcH,
            maskThreshold = maskBinThreshold,
          )
          if (polygons != null) {
            result["polygons"] = polygons
          }
        }
      }
      return result
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
    /** Rank-4 mask prototype tensor index for YOLO seg models; -1 otherwise. */
    private val prototypeOutputIndex = selectPrototypeOutputTensorIndex(cpuInterpreter, selectedOutputIndex)
    /** Cached prototype shape; null when the model emits no rank-4 output. */
    val prototypeShape: IntArray? =
      if (prototypeOutputIndex >= 0) cpuInterpreter.getOutputTensor(prototypeOutputIndex).shape() else null
    private val inputType = inputTensor.dataType()
    private val outputType = outputTensor.dataType()
    private val inputBuffer: ByteBuffer
    private val outputBuffer: ByteBuffer
    private val prototypeBuffer: ByteBuffer?
    private val prototypeFloatCount: Int = prototypeShape?.fold(1) { acc, v -> acc * v } ?: 0
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
      prototypeBuffer = if (prototypeFloatCount > 0) {
        ByteBuffer.allocateDirect(prototypeFloatCount * FLOAT_BYTES).order(ByteOrder.nativeOrder())
      } else {
        null
      }
      Log.i(TAG, "loaded $sourceKey input=${inputShape.joinToString("x")} type=$inputType outputIndex=$selectedOutputIndex output=${outputShape.joinToString("x")} bridgeOutput=${bridgeOutputShape.joinToString("x")} protoIndex=$prototypeOutputIndex proto=${prototypeShape?.joinToString("x") ?: "none"} delegate=cpu threads=$CPU_NUM_THREADS gpuLazy=true")
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
      prototypeBuffer?.rewind()
      val interpreter = selectedInterpreter
      val inferenceStartedAtMs = System.currentTimeMillis()
      val outputsMap = HashMap<Int, Any>(2)
      outputsMap[selectedOutputIndex] = outputBuffer
      if (prototypeBuffer != null && prototypeOutputIndex >= 0) {
        outputsMap[prototypeOutputIndex] = prototypeBuffer
      }
      try {
        interpreter.runForMultipleInputsOutputs(arrayOf(inputBuffer), outputsMap)
      } catch (err: Throwable) {
        if (delegateName != "cpu") {
          Log.w(TAG, "delegate=$delegateName failed during live inference; falling back to cpu", err)
          selectedInterpreter = cpuInterpreter
          delegateName = "cpu"
          outputBuffer.rewind()
          prototypeBuffer?.rewind()
          cpuInterpreter.runForMultipleInputsOutputs(arrayOf(inputBuffer), outputsMap)
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
      prototypeBuffer?.rewind()
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

    /**
     * Full (non-truncated) detection output as a List<Double>. Caller pays
     * the extra bridge cost only when it has set `wantMask=true` and
     * actually needs the mask coefficient fields downstream.
     */
    fun fullOutputValues(): List<Double> {
      outputBuffer.rewind()
      val values = ArrayList<Double>(outputFloatCount)
      repeat(outputFloatCount) {
        values.add(outputBuffer.float.toDouble())
      }
      outputBuffer.rewind()
      return values
    }

    /**
     * Mask prototype tensor as a flat List<Double> (~820k entries for
     * `[1, 160, 160, 32]`). Returns null when the model has no
     * prototype output or the prototype buffer is unavailable.
     *
     * Retained as a fallback for diagnostic / non-standard model paths.
     * The hot path uses [decodeAllPolygonsToBridge] which keeps these
     * floats native and returns just polygons.
     */
    fun prototypeValues(): List<Double>? {
      val buf = prototypeBuffer ?: return null
      buf.rewind()
      val values = ArrayList<Double>(prototypeFloatCount)
      repeat(prototypeFloatCount) {
        values.add(buf.float.toDouble())
      }
      buf.rewind()
      return values
    }

    /**
     * Run the YOLO segmentation mask post-process natively. Iterates
     * raw detection rows applying the same score + class filter as
     * JS-side `decodeYoloSegmentationNms`, decodes each row's mask
     * against the cached prototype tensor (sigmoid + threshold), traces
     * the largest connected component's boundary, and returns flat
     * `[x0, y0, x1, y1, ...]` arrays in source-image pixel space —
     * parallel to the JS row iteration so JS attaches by index.
     *
     * Assumes the Ultralytics NMS-fused xyxy-in-canvas-pixel format.
     * Non-standard exports return an empty list per row; the JS fallback
     * path (proto serialization) is no longer triggered, so polygons
     * simply won't appear for exotic models.
     */
    fun decodeAllPolygonsToBridge(
      scoreThreshold: Float,
      classFilter: IntArray?,
      scale: Float,
      padX: Float,
      padY: Float,
      target: Float,
      srcW: Int,
      srcH: Int,
      maskThreshold: Float,
    ): List<List<Double>>? {
      if (prototypeBuffer == null || prototypeShape == null) return null
      if (outputShape.size != 3) return null
      val maxDet = outputShape[1]
      val fields = outputShape[2]
      if (fields < 7) return null
      val coefCount = fields - 6

      // Channel-last/first detection. Mirrors yoloSegMask.ts.
      val protoDims = if (prototypeShape.size == 4 && prototypeShape[0] == 1) {
        intArrayOf(prototypeShape[1], prototypeShape[2], prototypeShape[3])
      } else if (prototypeShape.size == 3) {
        prototypeShape
      } else {
        return null
      }
      val channelLast: Boolean
      val protoH: Int
      val protoW: Int
      val protoC: Int
      if (protoDims[2] == coefCount) {
        protoH = protoDims[0]; protoW = protoDims[1]; protoC = protoDims[2]; channelLast = true
      } else if (protoDims[0] == coefCount) {
        protoC = protoDims[0]; protoH = protoDims[1]; protoW = protoDims[2]; channelLast = false
      } else {
        return null
      }

      val det = FloatArray(outputFloatCount)
      outputBuffer.rewind()
      outputBuffer.asFloatBuffer().get(det)
      outputBuffer.rewind()
      val proto = FloatArray(prototypeFloatCount)
      prototypeBuffer.rewind()
      prototypeBuffer.asFloatBuffer().get(proto)
      prototypeBuffer.rewind()

      val out = ArrayList<List<Double>>(maxDet)
      val sx = (protoW.toFloat() / target) * scale
      val sy = (protoH.toFloat() / target) * scale
      val ox = (padX * protoW) / target
      val oy = (padY * protoH) / target

      for (i in 0 until maxDet) {
        val base = i * fields
        val score = det[base + 4]
        if (score < scoreThreshold) { out.add(emptyList()); continue }
        val classId = Math.round(det[base + 5])
        if (classFilter != null && !classFilter.any { it == classId }) {
          out.add(emptyList()); continue
        }
        // xyxy in 0..target canvas pixel space; apply letterbox-inverse.
        val rawX1 = det[base + 0]
        val rawY1 = det[base + 1]
        val rawX2 = det[base + 2]
        val rawY2 = det[base + 3]
        val fx1 = (rawX1 - padX) / scale
        val fy1 = (rawY1 - padY) / scale
        val fx2 = (rawX2 - padX) / scale
        val fy2 = (rawY2 - padY) / scale
        if (fx2 - fx1 <= 1f || fy2 - fy1 <= 1f) { out.add(emptyList()); continue }
        val x0 = max(0, floor(fx1).toInt())
        val y0 = max(0, floor(fy1).toInt())
        val x1 = min(srcW, ceil(fx2).toInt())
        val y1 = min(srcH, ceil(fy2).toInt())
        val w = max(0, x1 - x0)
        val h = max(0, y1 - y0)
        if (w <= 0 || h <= 0) { out.add(emptyList()); continue }

        // Decode bbox-cropped mask in source pixel space.
        val mask = ByteArray(w * h)
        var pixelCount = 0
        val coefBase = base + 6
        if (channelLast) {
          val pwc = protoW * protoC
          for (py in 0 until h) {
            val sy0 = (y0 + py) * sy + oy
            val ry = sy0.toInt().coerceIn(0, protoH - 1)
            val protoRow = ry * pwc
            for (px in 0 until w) {
              val sx0 = (x0 + px) * sx + ox
              val rx = sx0.toInt().coerceIn(0, protoW - 1)
              val cellBase = protoRow + rx * protoC
              var acc = 0f
              for (c in 0 until coefCount) acc += det[coefBase + c] * proto[cellBase + c]
              if (sigmoidf(acc) > maskThreshold) {
                mask[py * w + px] = 1
                pixelCount++
              }
            }
          }
        } else {
          val planeStride = protoH * protoW
          for (py in 0 until h) {
            val sy0 = (y0 + py) * sy + oy
            val ry = sy0.toInt().coerceIn(0, protoH - 1)
            val rowOff = ry * protoW
            for (px in 0 until w) {
              val sx0 = (x0 + px) * sx + ox
              val rx = sx0.toInt().coerceIn(0, protoW - 1)
              val off = rowOff + rx
              var acc = 0f
              for (c in 0 until coefCount) acc += det[coefBase + c] * proto[c * planeStride + off]
              if (sigmoidf(acc) > maskThreshold) {
                mask[py * w + px] = 1
                pixelCount++
              }
            }
          }
        }
        if (pixelCount == 0) { out.add(emptyList()); continue }
        val poly = extractPolygonFromMask(mask, w, h, x0, y0)
        if (poly.size < 6) { out.add(emptyList()); continue }
        val boxed = ArrayList<Double>(poly.size)
        for (v in poly) boxed.add(v.toDouble())
        out.add(boxed)
      }
      return out
    }

    private fun extractPolygonFromMask(
      mask: ByteArray,
      w: Int,
      h: Int,
      x0: Int,
      y0: Int,
    ): FloatArray {
      val labels = IntArray(w * h)
      val sizes = ArrayList<Int>()
      sizes.add(0)
      var nextLabel = 1
      val stack = IntArray(w * h)
      var sp: Int
      for (y in 0 until h) {
        for (x in 0 until w) {
          val idx = y * w + x
          if (mask[idx].toInt() == 0 || labels[idx] != 0) continue
          val label = nextLabel++
          var size = 0
          sp = 0
          stack[sp++] = idx
          labels[idx] = label
          while (sp > 0) {
            val cur = stack[--sp]
            size++
            val cy = cur / w
            val cx = cur - cy * w
            if (cx > 0) {
              val n = cur - 1
              if (mask[n].toInt() != 0 && labels[n] == 0) {
                labels[n] = label; stack[sp++] = n
              }
            }
            if (cx + 1 < w) {
              val n = cur + 1
              if (mask[n].toInt() != 0 && labels[n] == 0) {
                labels[n] = label; stack[sp++] = n
              }
            }
            if (cy > 0) {
              val n = cur - w
              if (mask[n].toInt() != 0 && labels[n] == 0) {
                labels[n] = label; stack[sp++] = n
              }
            }
            if (cy + 1 < h) {
              val n = cur + w
              if (mask[n].toInt() != 0 && labels[n] == 0) {
                labels[n] = label; stack[sp++] = n
              }
            }
          }
          sizes.add(size)
        }
      }
      if (nextLabel == 1) return FloatArray(0)
      var bestLabel = 1
      for (l in 2 until sizes.size) {
        if (sizes[l] > sizes[bestLabel]) bestLabel = l
      }
      var start = -1
      for (i in labels.indices) {
        if (labels[i] == bestLabel) { start = i; break }
      }
      if (start < 0) return FloatArray(0)
      val dx = intArrayOf(-1, -1, 0, 1, 1, 1, 0, -1)
      val dy = intArrayOf(0, -1, -1, -1, 0, 1, 1, 1)
      val startX = start % w
      val startY = start / w
      val poly = ArrayList<Float>(64)
      poly.add(x0 + startX + 0.5f)
      poly.add(y0 + startY + 0.5f)
      var cx = startX
      var cy = startY
      var dir = 6
      var advanced = false
      val safetyLimit = 4L * (w.toLong() * h.toLong() + 1L)
      var safety = 0L
      while (safety < safetyLimit) {
        safety++
        var found = false
        for (step in 0 until 8) {
          val d = (dir + step) % 8
          val nx = cx + dx[d]
          val ny = cy + dy[d]
          if (nx in 0 until w && ny in 0 until h && labels[ny * w + nx] == bestLabel) {
            cx = nx
            cy = ny
            dir = (d + 6) % 8
            val vx = x0 + cx + 0.5f
            val vy = y0 + cy + 0.5f
            val n = poly.size
            if (n < 2 || poly[n - 2] != vx || poly[n - 1] != vy) {
              poly.add(vx); poly.add(vy)
            }
            found = true
            advanced = true
            break
          }
        }
        if (!found) break
        if (advanced && cx == startX && cy == startY) break
      }
      if (poly.size >= 4) {
        val n = poly.size
        if (poly[n - 2] == poly[0] && poly[n - 1] == poly[1]) {
          poly.removeAt(n - 1); poly.removeAt(n - 2)
        }
      }
      val arr = FloatArray(poly.size)
      for (i in poly.indices) arr[i] = poly[i]
      return arr
    }

    private fun sigmoidf(z: Float): Float {
      return if (z >= 0f) 1f / (1f + exp(-z))
      else { val e = exp(z); e / (1f + e) }
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

  /**
   * Picks the YOLO segmentation mask prototype output tensor — a rank-4
   * tensor of roughly `[1, 160, 160, 32]` for Ultralytics seg exports.
   * Returns -1 when no rank-4 output exists (detection-only model).
   */
  private fun selectPrototypeOutputTensorIndex(interpreter: Interpreter, skipIndex: Int): Int {
    for (i in 0 until interpreter.outputTensorCount) {
      if (i == skipIndex) continue
      val shape = interpreter.getOutputTensor(i).shape()
      if (shape.size == 4 && shape[0] == 1) return i
    }
    return -1
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
