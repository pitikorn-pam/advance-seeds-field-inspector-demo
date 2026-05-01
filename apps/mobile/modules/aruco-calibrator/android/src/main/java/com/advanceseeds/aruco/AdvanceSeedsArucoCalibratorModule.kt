package com.advanceseeds.aruco

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.Core
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
  private const val TAG = "AdvanceSeedsAruco"
  @Volatile private var loaded = false
  @Volatile private var lastLogAtMs = 0L
  @Volatile private var lastFrameLogAtMs = 0L
  private val detectorLock = Any()
  @Volatile private var detector: ArucoDetector? = null

  @Synchronized
  fun ensureOpenCvLoaded() {
    if (loaded) return
    if (!OpenCVLoader.initLocal()) {
      throw IllegalStateException("Unable to initialize OpenCV")
    }
    Core.setNumThreads(1)
    loaded = true
  }

  private fun getDetector(): ArucoDetector {
    detector?.let { return it }
    synchronized(detectorLock) {
      detector?.let { return it }
      val dictionary = Objdetect.getPredefinedDictionary(Objdetect.DICT_4X4_50)
      val parameters = DetectorParameters()
      return ArucoDetector(dictionary, parameters).also { detector = it }
    }
  }

  fun logDetection(message: String) {
    val now = System.currentTimeMillis()
    if (now - lastLogAtMs < 1_000) return
    lastLogAtMs = now
    Log.d(TAG, message)
  }

  fun logFrame(message: String) {
    val now = System.currentTimeMillis()
    if (now - lastFrameLogAtMs < 10_000) return
    lastFrameLogAtMs = now
    Log.d(TAG, message)
  }

  fun logError(message: String, err: Throwable) {
    Log.e(TAG, message, err)
  }

  fun detect(bitmap: Bitmap, markerSizeMm: Double): Map<String, Any>? {
    if (markerSizeMm <= 0) return null
    ensureOpenCvLoaded()

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

  fun detectInGrayMat(gray: Mat, markerSizeMm: Double, pixelScale: Double = 1.0): Map<String, Any>? {
    if (gray.empty() || markerSizeMm <= 0) return null
    ensureOpenCvLoaded()

    val ids = Mat()
    val corners = mutableListOf<Mat>()

    try {
      val startedAtMs = System.currentTimeMillis()
      try {
        synchronized(detectorLock) {
          getDetector().detectMarkers(gray, corners, ids)
        }
      } catch (err: Throwable) {
        logError("detect failed frame=${gray.cols()}x${gray.rows()}", err)
        return null
      }
      logDetection(
        "detect elapsed=${System.currentTimeMillis() - startedAtMs}ms ids=${ids.rows()} corners=${corners.size} frame=${gray.cols()}x${gray.rows()}"
      )

      if (ids.empty() || corners.isEmpty()) {
        return null
      }

      // Compute pxPerMm for every detected marker, not just the largest. The
      // primary "best" marker (largest visible area) still drives confidence
      // scoring, but we expose the per-marker px/mm list so JS can take a
      // median across multiple physical markers in the same frame for
      // tighter calibration when an inspector lays out a multi-marker card.
      val perMarkerPxPerMm = mutableListOf<Double>()
      var bestIndex = 0
      var bestArea = 0.0
      corners.forEachIndexed { index, mat ->
        val points = matToPoints(mat)
        val area = polygonArea(points)
        val pxWidth = edgeLength(points) * pixelScale
        if (pxWidth > 0) perMarkerPxPerMm.add(pxWidth / markerSizeMm)
        if (area > bestArea) {
          bestArea = area
          bestIndex = index
        }
      }

      val points = matToPoints(corners[bestIndex])
      val pixelWidth = edgeLength(points) * pixelScale
      if (pixelWidth <= 0) return null

      val imageArea = gray.cols().toDouble() * gray.rows().toDouble()
      val areaRatio = if (imageArea > 0) min(1.0, bestArea / imageArea / 0.08) else 0.0
      val singleConfidence = max(0.6, min(1.0, 0.65 + areaRatio * 0.35))
      val markerId = ids.get(bestIndex, 0)?.firstOrNull()?.toInt() ?: return null
      val markerCount = perMarkerPxPerMm.size
      // Median across all markers in this frame; falls back to the best
      // marker's value when only one was found.
      val multiMedianPxPerMm = if (markerCount > 1) {
        val sorted = perMarkerPxPerMm.sorted()
        val mid = sorted.size / 2
        if (sorted.size % 2 == 0) (sorted[mid - 1] + sorted[mid]) / 2 else sorted[mid]
      } else {
        pixelWidth / markerSizeMm
      }
      // Multi-marker agreement boosts confidence: with N≥2 markers giving
      // consistent px/mm, we trust the lock more than a single marker.
      val confidence = if (markerCount > 1) min(1.0, singleConfidence + 0.05 * (markerCount - 1)) else singleConfidence
      logDetection(
        "markers=${corners.size} bestId=$markerId pixelWidth=${"%.1f".format(pixelWidth)} confidence=${"%.2f".format(confidence)} multi=${"%.2f".format(multiMedianPxPerMm)} frame=${gray.cols()}x${gray.rows()}"
      )

      return mapOf(
        "pxPerMm" to pixelWidth / markerSizeMm,
        "markerId" to markerId,
        "confidence" to confidence,
        "observedAtMs" to System.currentTimeMillis().toDouble(),
        "markerSizeMm" to markerSizeMm,
        "pixelWidth" to pixelWidth,
        "markerCount" to markerCount.toDouble(),
        "multiMedianPxPerMm" to multiMedianPxPerMm,
      )
    } finally {
      ids.release()
      corners.forEach { it.release() }
    }
  }

  fun detectInGrayMatValues(gray: Mat, markerSizeMm: Double): List<Double>? {
    val result = detectInGrayMat(gray, markerSizeMm) ?: return null
    return resultToValues(result)
  }

  fun detectInGrayMatValues(gray: Mat, markerSizeMm: Double, pixelScale: Double): List<Double>? {
    val result = detectInGrayMat(gray, markerSizeMm, pixelScale) ?: return null
    return resultToValues(result)
  }

  private fun resultToValues(result: Map<String, Any>): List<Double> {
    // Ordering is part of the JS contract — we append (markerCount,
    // multiMedianPxPerMm) to the original 6-tuple so older JS clients that
    // destructure indices [0..5] still see the legacy single-marker fields,
    // while new clients (useLiveArucoCalibration phase-2) read [6..7] for
    // multi-marker averaging.
    return listOf(
      (result["pxPerMm"] as Number).toDouble(),
      (result["markerId"] as Number).toDouble(),
      (result["confidence"] as Number).toDouble(),
      (result["observedAtMs"] as Number).toDouble(),
      (result["markerSizeMm"] as Number).toDouble(),
      (result["pixelWidth"] as Number).toDouble(),
      (result["markerCount"] as? Number)?.toDouble() ?: 1.0,
      (result["multiMedianPxPerMm"] as? Number)?.toDouble() ?: (result["pxPerMm"] as Number).toDouble(),
    )
  }

  private fun matToPoints(mat: Mat): List<Pair<Double, Double>> {
    if (mat.channels() >= 2) {
      val points = mutableListOf<Pair<Double, Double>>()
      for (row in 0 until mat.rows()) {
        for (col in 0 until mat.cols()) {
          val values = mat.get(row, col) ?: continue
          if (values.size >= 2) {
            points.add(values[0] to values[1])
            if (points.size == 4) return points
          }
        }
      }
      return points
    }

    val reshaped = if (mat.type() == CvType.CV_32FC2) mat.reshape(1, 4) else mat
    return (0 until min(4, reshaped.rows())).mapNotNull { row ->
      val x = reshaped.get(row, 0)?.firstOrNull() ?: return@mapNotNull null
      val y = reshaped.get(row, 1)?.firstOrNull() ?: return@mapNotNull null
      x to y
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
