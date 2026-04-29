package com.advanceseeds.aruco

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.imgproc.Imgproc
import org.opencv.objdetect.ArucoDetector
import org.opencv.objdetect.DetectorParameters
import org.opencv.objdetect.Objdetect
import java.io.File
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

class AdvanceSeedsArucoCalibratorModule : Module() {
  companion object {
    init {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectArucoCalibration") { _, _ ->
        AdvanceSeedsArucoFrameProcessorPlugin()
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AdvanceSeedsArucoCalibrator")

    AsyncFunction("detectInImageAsync") Coroutine { uri: String, markerSizeMm: Double ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React application context is unavailable")
      val bitmap = context.contentResolver.openInputStream(fileUriFrom(uri)).use { stream ->
        BitmapFactory.decodeStream(stream)
      } ?: throw IllegalArgumentException("Unable to load image for ArUco detection")

      return@Coroutine ArucoDetectorBridge.detect(bitmap, markerSizeMm)
    }
  }

  private fun fileUriFrom(uri: String): Uri {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == null) return Uri.fromFile(File(uri))
    return parsed
  }
}

object ArucoDetectorBridge {
  init {
    if (!OpenCVLoader.initLocal()) {
      throw IllegalStateException("Unable to initialize OpenCV")
    }
  }

  fun detect(bitmap: Bitmap, markerSizeMm: Double): Map<String, Any>? {
    if (markerSizeMm <= 0) return null

    val rgba = Mat()
    val gray = Mat()

    try {
      Utils.bitmapToMat(bitmap.copy(Bitmap.Config.ARGB_8888, false), rgba)
      Imgproc.cvtColor(rgba, gray, Imgproc.COLOR_RGBA2GRAY)
      return detectInGrayMat(gray, markerSizeMm)
    } finally {
      rgba.release()
      gray.release()
    }
  }

  fun detectInGrayMat(gray: Mat, markerSizeMm: Double): Map<String, Any>? {
    if (gray.empty() || markerSizeMm <= 0) return null

    val ids = Mat()
    val corners = mutableListOf<Mat>()
    val rejected = mutableListOf<Mat>()

    try {
      val dictionary = Objdetect.getPredefinedDictionary(Objdetect.DICT_4X4_50)
      val parameters = DetectorParameters()
      val detector = ArucoDetector(dictionary, parameters)
      detector.detectMarkers(gray, corners, ids, rejected)

      if (ids.empty() || corners.isEmpty()) return null

      var bestIndex = 0
      var bestArea = 0.0
      corners.forEachIndexed { index, mat ->
        val points = matToPoints(mat)
        val area = polygonArea(points)
        if (area > bestArea) {
          bestArea = area
          bestIndex = index
        }
      }

      val points = matToPoints(corners[bestIndex])
      val pixelWidth = edgeLength(points)
      if (pixelWidth <= 0) return null

      val imageArea = gray.cols().toDouble() * gray.rows().toDouble()
      val areaRatio = if (imageArea > 0) min(1.0, bestArea / imageArea / 0.08) else 0.0
      val confidence = max(0.6, min(1.0, 0.65 + areaRatio * 0.35))
      val markerId = ids.get(bestIndex, 0)?.firstOrNull()?.toInt() ?: return null

      return mapOf(
        "pxPerMm" to pixelWidth / markerSizeMm,
        "markerId" to markerId,
        "confidence" to confidence,
        "observedAtMs" to System.currentTimeMillis().toDouble(),
        "markerSizeMm" to markerSizeMm,
        "pixelWidth" to pixelWidth,
      )
    } finally {
      ids.release()
      corners.forEach { it.release() }
      rejected.forEach { it.release() }
    }
  }

  private fun matToPoints(mat: Mat): List<Pair<Double, Double>> {
    val reshaped = if (mat.type() == CvType.CV_32FC2) mat.reshape(1, 4) else mat
    return (0 until min(4, reshaped.rows())).mapNotNull { row ->
      val values = reshaped.get(row, 0) ?: return@mapNotNull null
      if (values.size < 2) null else values[0] to values[1]
    }
  }

  private fun edgeLength(points: List<Pair<Double, Double>>): Double {
    if (points.size != 4) return 0.0
    return points.indices.sumOf { index ->
      val a = points[index]
      val b = points[(index + 1) % points.size]
      hypot(a.first - b.first, a.second - b.second)
    } / 4.0
  }

  private fun polygonArea(points: List<Pair<Double, Double>>): Double {
    if (points.size != 4) return 0.0
    val area = points.indices.sumOf { index ->
      val a = points[index]
      val b = points[(index + 1) % points.size]
      (a.first * b.second) - (b.first * a.second)
    }
    return abs(area) / 2.0
  }
}
