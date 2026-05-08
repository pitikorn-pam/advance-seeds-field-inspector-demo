package com.advanceseeds.roivideo

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.view.Surface
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class AdvanceSeedsRoiVideoExporterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AdvanceSeedsRoiVideoExporter")

    AsyncFunction("exportWithRoiAsync") Coroutine { inputUri: String, roi: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React application context is unavailable")
      val inputFile = fileFrom(inputUri)
      if (!inputFile.exists()) {
        throw IllegalArgumentException("Input video does not exist")
      }
      val outputFile = File(context.cacheDir, "advance-seeds-roi-${UUID.randomUUID()}.mp4")
      AndroidRoiVideoExporter.export(inputFile, outputFile, roi)
      return@Coroutine Uri.fromFile(outputFile).toString()
    }
  }

  private fun fileFrom(uri: String): File {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == null) return File(uri)
    if (parsed.scheme == "file") return File(parsed.path ?: "")
    throw IllegalArgumentException("Expected a local file URI")
  }
}

private object AndroidRoiVideoExporter {
  private const val MIME_AVC = "video/avc"
  private const val FRAME_RATE = 15
  private const val I_FRAME_INTERVAL_SECONDS = 1
  private const val TIMEOUT_US = 10_000L
  private const val MAX_EXPORT_WIDTH = 1280

  fun export(inputFile: File, outputFile: File, roi: Map<String, Any?>) {
    val metadata = readMetadata(inputFile)
    val scale = min(1.0, MAX_EXPORT_WIDTH.toDouble() / metadata.width.toDouble())
    val outWidth = even(max(2, (metadata.width * scale).roundToInt()))
    val outHeight = even(max(2, (metadata.height * scale).roundToInt()))
    val durationUs = metadata.durationUs
    val frameCount = max(1, ((durationUs / 1_000_000.0) * FRAME_RATE).roundToInt())

    if (outputFile.exists()) outputFile.delete()

    val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val encoder = MediaCodec.createEncoderByType(MIME_AVC)
    val format = MediaFormat.createVideoFormat(MIME_AVC, outWidth, outHeight).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, outWidth * outHeight * 3)
      setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_SECONDS)
    }

    var inputSurface: Surface? = null
    var videoTrack = -1
    var audioTrack = -1
    var muxerStarted = false

    try {
      encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      inputSurface = encoder.createInputSurface()
      encoder.start()

      val retriever = MediaMetadataRetriever()
      retriever.setDataSource(inputFile.absolutePath)
      val bufferInfo = MediaCodec.BufferInfo()
      var frameIndex = 0
      var encoderDone = false

      while (!encoderDone) {
        if (frameIndex < frameCount) {
          val presentationUs = min(durationUs, (frameIndex * 1_000_000L) / FRAME_RATE)
          val bitmap = frameAt(retriever, presentationUs)
          if (bitmap != null) {
            drawFrame(inputSurface, bitmap, roi, outWidth, outHeight)
            bitmap.recycle()
          }
          frameIndex++
          if (frameIndex == frameCount) {
            encoder.signalEndOfInputStream()
          }
        }

        var draining = true
        while (draining) {
          val outputIndex = encoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
          when {
            outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> draining = false
            outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              videoTrack = muxer.addTrack(encoder.outputFormat)
              audioTrack = addAudioTrackIfPresent(inputFile, muxer)
              muxer.start()
              muxerStarted = true
            }
            outputIndex >= 0 -> {
              val encoded = encoder.getOutputBuffer(outputIndex)
              if (encoded != null && bufferInfo.size > 0) {
                if (!muxerStarted) throw IllegalStateException("Muxer has not started")
                encoded.position(bufferInfo.offset)
                encoded.limit(bufferInfo.offset + bufferInfo.size)
                muxer.writeSampleData(videoTrack, encoded, bufferInfo)
              }
              encoderDone = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0
              encoder.releaseOutputBuffer(outputIndex, false)
            }
          }
        }
      }

      retriever.release()
      if (muxerStarted && audioTrack >= 0) {
        copyAudioSamples(inputFile, muxer, audioTrack)
      }
    } finally {
      try {
        encoder.stop()
      } catch (_: Throwable) {
      }
      encoder.release()
      inputSurface?.release()
      try {
        muxer.stop()
      } catch (_: Throwable) {
      }
      muxer.release()
    }
  }

  private fun readMetadata(inputFile: File): VideoMetadata {
    val retriever = MediaMetadataRetriever()
    retriever.setDataSource(inputFile.absolutePath)
    val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
    val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
    val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
    retriever.release()
    if (width <= 0 || height <= 0 || durationMs <= 0) {
      throw IllegalArgumentException("Unable to read video metadata")
    }
    return VideoMetadata(width, height, durationMs * 1000L)
  }

  private fun frameAt(retriever: MediaMetadataRetriever, presentationUs: Long): Bitmap? {
    return if (Build.VERSION.SDK_INT >= 27) {
      retriever.getScaledFrameAtTime(presentationUs, MediaMetadataRetriever.OPTION_CLOSEST, 1280, 1280)
    } else {
      retriever.getFrameAtTime(presentationUs, MediaMetadataRetriever.OPTION_CLOSEST)
    }
  }

  private fun drawFrame(surface: Surface?, bitmap: Bitmap, roi: Map<String, Any?>, width: Int, height: Int) {
    if (surface == null) return
    val canvas = surface.lockCanvas(null)
    try {
      canvas.drawColor(Color.BLACK)
      val target = fitCenter(bitmap.width, bitmap.height, width, height)
      canvas.drawBitmap(bitmap, null, target, null)
      drawOverlay(canvas, roi, target)
    } finally {
      surface.unlockCanvasAndPost(canvas)
    }
  }

  private fun drawOverlay(canvas: Canvas, overlay: Map<String, Any?>, rect: RectF) {
    val roi = overlay["roi"] as? Map<*, *> ?: if (overlay["kind"] is String) overlay else null
    if (roi != null) drawRoi(canvas, roi, rect)
    drawSeeds(canvas, overlay, rect)
  }

  private fun drawRoi(canvas: Canvas, roi: Map<*, *>, rect: RectF) {
    val path = Path()
    when (roi["kind"] as? String) {
      "rect" -> {
        val x = rect.left + number(roi["x"]) * rect.width()
        val y = rect.top + number(roi["y"]) * rect.height()
        val w = number(roi["w"]) * rect.width()
        val h = number(roi["h"]) * rect.height()
        path.addRect(x, y, x + w, y + h, Path.Direction.CW)
      }
      "circle" -> {
        val radius = number(roi["r"]) * min(rect.width(), rect.height())
        val cx = rect.left + number(roi["cx"]) * rect.width()
        val cy = rect.top + number(roi["cy"]) * rect.height()
        path.addOval(RectF(cx - radius, cy - radius, cx + radius, cy + radius), Path.Direction.CW)
      }
      "polygon" -> {
        val points = roi["points"] as? List<*> ?: return
        val first = points.firstOrNull() as? Map<*, *> ?: return
        path.moveTo(pointX(first, rect), pointY(first, rect))
        points.drop(1).forEach { raw ->
          val point = raw as? Map<*, *> ?: return@forEach
          path.lineTo(pointX(point, rect), pointY(point, rect))
        }
        if (roi["closed"] == true) path.close()
      }
      else -> return
    }

    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(46, 93, 202, 165)
      style = Paint.Style.FILL
    }
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(93, 202, 165)
      style = Paint.Style.STROKE
      strokeWidth = max(6f, min(rect.width(), rect.height()) * 0.006f)
      strokeJoin = Paint.Join.ROUND
      strokeCap = Paint.Cap.ROUND
    }
    canvas.drawPath(path, fill)
    canvas.drawPath(path, stroke)
  }

  private fun addAudioTrackIfPresent(inputFile: File, muxer: MediaMuxer): Int {
    val extractor = MediaExtractor()
    extractor.setDataSource(inputFile.absolutePath)
    try {
      val index = findTrack(extractor, "audio/") ?: return -1
      return muxer.addTrack(extractor.getTrackFormat(index))
    } finally {
      extractor.release()
    }
  }

  private fun copyAudioSamples(inputFile: File, muxer: MediaMuxer, audioTrack: Int) {
    val extractor = MediaExtractor()
    extractor.setDataSource(inputFile.absolutePath)
    val inputTrack = findTrack(extractor, "audio/") ?: run {
      extractor.release()
      return
    }
    extractor.selectTrack(inputTrack)
    val format = extractor.getTrackFormat(inputTrack)
    val maxInputSize = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
      format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
    } else {
      256 * 1024
    }
    val buffer = ByteBuffer.allocate(maxInputSize)
    val info = MediaCodec.BufferInfo()
    while (true) {
      val size = extractor.readSampleData(buffer, 0)
      if (size < 0) break
      info.set(0, size, extractor.sampleTime, extractor.sampleFlags)
      muxer.writeSampleData(audioTrack, buffer, info)
      extractor.advance()
      buffer.clear()
    }
    extractor.release()
  }

  private fun findTrack(extractor: MediaExtractor, prefix: String): Int? {
    for (i in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(i)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith(prefix)) return i
    }
    return null
  }

  private fun fitCenter(sourceWidth: Int, sourceHeight: Int, targetWidth: Int, targetHeight: Int): RectF {
    val scale = min(targetWidth.toFloat() / sourceWidth.toFloat(), targetHeight.toFloat() / sourceHeight.toFloat())
    val width = sourceWidth * scale
    val height = sourceHeight * scale
    val left = (targetWidth - width) / 2f
    val top = (targetHeight - height) / 2f
    return RectF(left, top, left + width, top + height)
  }

  private fun pointX(point: Map<*, *>, rect: RectF) = rect.left + number(point["x"]) * rect.width()

  private fun pointY(point: Map<*, *>, rect: RectF) = rect.top + number(point["y"]) * rect.height()

  private fun drawSeeds(canvas: Canvas, overlay: Map<String, Any?>, rect: RectF) {
    val seeds = overlay["seeds"] as? List<*> ?: return
    if (seeds.isEmpty()) return
    val frameWidth = number(overlay["frameWidth"])
    val frameHeight = number(overlay["frameHeight"])
    val orientation = overlay["frameOrientation"] as? String ?: "up"
    val rotates = orientation == "left" || orientation == "right" || orientation == "left-mirrored" || orientation == "right-mirrored"
    val orientedWidth = if (rotates) frameHeight else frameWidth
    val orientedHeight = if (rotates) frameWidth else frameHeight
    val scaleX = if (orientedWidth > 0f) rect.width() / orientedWidth else 1f
    val scaleY = if (orientedHeight > 0f) rect.height() / orientedHeight else 1f
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(34, 197, 94)
      style = Paint.Style.STROKE
      strokeWidth = max(4f, min(rect.width(), rect.height()) * 0.004f)
      strokeJoin = Paint.Join.ROUND
      strokeCap = Paint.Cap.ROUND
    }
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(26, 34, 197, 94)
      style = Paint.Style.FILL
    }
    val labelFill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(209, 12, 18, 14)
      style = Paint.Style.FILL
    }
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = 14f
      isFakeBoldText = true
    }

    seeds.forEach { rawSeed ->
      val seed = rawSeed as? Map<*, *> ?: return@forEach
      val bbox = seed["bbox"] as? Map<*, *> ?: return@forEach
      val orientedBox = rotateBox(bbox, frameWidth, frameHeight, orientation)
      val x = rect.left + orientedBox.left * scaleX
      val y = rect.top + orientedBox.top * scaleY
      val box = RectF(
        x,
        y,
        x + max(1f, orientedBox.width() * scaleX),
        y + max(1f, orientedBox.height() * scaleY),
      )
      canvas.drawRoundRect(box, 4f, 4f, fill)
      canvas.drawRoundRect(box, 4f, 4f, stroke)
      val label = "#${(seed["index"] as? Number)?.toInt() ?: 0} ${seed["grade"] as? String ?: ""}"
      val labelRect = RectF(
        box.left,
        max(0f, box.top - 28f),
        box.left + max(58f, text.measureText(label) + 12f),
        max(0f, box.top - 28f) + 24f,
      )
      canvas.drawRoundRect(labelRect, 4f, 4f, labelFill)
      canvas.drawText(label, labelRect.left + 6f, labelRect.top + 17f, text)
    }
  }

  private fun rotateBox(bbox: Map<*, *>, frameWidth: Float, frameHeight: Float, orientation: String): RectF {
    val x = number(bbox["x"])
    val y = number(bbox["y"])
    val width = number(bbox["width"])
    val height = number(bbox["height"])
    return when (orientation) {
      "right", "right-mirrored" -> RectF(frameHeight - y - height, x, frameHeight - y, x + width)
      "left", "left-mirrored" -> RectF(y, frameWidth - x - width, y + height, frameWidth - x)
      "down", "down-mirrored" -> RectF(frameWidth - x - width, frameHeight - y - height, frameWidth - x, frameHeight - y)
      else -> RectF(x, y, x + width, y + height)
    }
  }

  private fun number(value: Any?): Float {
    return when (value) {
      is Number -> value.toFloat()
      else -> 0f
    }
  }

  private fun even(value: Int) = if (value % 2 == 0) value else value - 1
}

private data class VideoMetadata(val width: Int, val height: Int, val durationUs: Long)
