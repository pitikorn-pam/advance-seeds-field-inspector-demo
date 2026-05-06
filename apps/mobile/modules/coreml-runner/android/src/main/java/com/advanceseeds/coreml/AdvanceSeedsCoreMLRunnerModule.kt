package com.advanceseeds.coreml

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

object AdvanceSeedsAppContextHolder {
  @Volatile var context: Context? = null
}

// Core ML APIs remain iOS-only, but this module also owns the Android native
// YOLO frame-processor plugin so live camera inference can stay off the JS
// bridge.
class AdvanceSeedsCoreMLRunnerModule : Module() {
  companion object {
    init {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("advanceSeedsRunTFLite") { _, _ ->
        AdvanceSeedsTfliteFrameProcessorPlugin()
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AdvanceSeedsCoreMLRunner")

    OnCreate {
      AdvanceSeedsAppContextHolder.context = appContext.reactContext?.applicationContext
    }

    OnDestroy {
      AdvanceSeedsAppContextHolder.context = null
    }

    AsyncFunction("loadModel") { _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("loadModelAtPath") { _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("compileModelPackage") { _: String, _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("runOnImageURL") { _: String, _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("runOnImageURLAtPath") { _: String, _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    // Native JPEG → RGBA byte buffer. Replaces the pure-JS jpeg-js path
    // used by TfliteSeedAnalyzer on Android, which decoded a 1280×960
    // photo in ~400 ms on Hermes; BitmapFactory does the same in ~30–
    // 50 ms. Returns a flat byte array in RGBA order (1 byte per channel,
    // 4 bytes per pixel) plus the width/height so the JS letterbox
    // helper can index into it without a second decode.
    AsyncFunction("decodeJpegToRgba") { uri: String ->
      val path = resolveLocalPath(uri)
        ?: throw CodedException("decodeJpegToRgba: unsupported uri scheme — expected file:// or absolute path, got '$uri'")
      val opts = BitmapFactory.Options().apply {
        inPreferredConfig = Bitmap.Config.ARGB_8888
        // We want pixel data, not display-density-scaled data.
        inScaled = false
      }
      val raw = BitmapFactory.decodeFile(path, opts)
        ?: throw CodedException("decodeJpegToRgba: BitmapFactory returned null for '$path'")
      // BitmapFactory ignores the JPEG's EXIF rotation tag — it returns
      // the raw stored pixel orientation. React Native's <Image> on the
      // result page DOES apply EXIF, so without rotation here the
      // analyzer sees the photo in landscape while the inspection page
      // sees it in portrait. Bboxes from the analyzer then land on the
      // wrong pixels of the displayed image. Apply the EXIF rotation
      // so the bitmap dims match what the rest of the app sees.
      val bitmap = applyExifRotation(path, raw)
      try {
        val w = bitmap.width
        val h = bitmap.height
        val pixelCount = w * h
        val buffer = ByteBuffer.allocate(pixelCount * 4)
        bitmap.copyPixelsToBuffer(buffer)
        val bytes = buffer.array()
        mapOf(
          "width" to w,
          "height" to h,
          "data" to bytes,
        )
      } finally {
        bitmap.recycle()
      }
    }
  }

  private fun applyExifRotation(path: String, source: Bitmap): Bitmap {
    val orientation = try {
      ExifInterface(path).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL,
      )
    } catch (_: Throwable) {
      ExifInterface.ORIENTATION_NORMAL
    }
    if (orientation == ExifInterface.ORIENTATION_NORMAL ||
        orientation == ExifInterface.ORIENTATION_UNDEFINED) {
      return source
    }
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.postRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.postRotate(270f)
        matrix.postScale(-1f, 1f)
      }
      else -> return source
    }
    return try {
      val rotated = Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
      if (rotated !== source) source.recycle()
      rotated
    } catch (_: Throwable) {
      source
    }
  }

  private fun resolveLocalPath(uri: String): String? {
    if (uri.startsWith("/")) return uri
    if (uri.startsWith("file://")) {
      return try {
        File(Uri.parse(uri).path ?: return null).absolutePath
      } catch (_: Throwable) {
        null
      }
    }
    return null
  }
}

private class NotSupportedOnAndroidException :
  CodedException("Core ML is iOS-only. Use the TFLite analyzer on Android.")
