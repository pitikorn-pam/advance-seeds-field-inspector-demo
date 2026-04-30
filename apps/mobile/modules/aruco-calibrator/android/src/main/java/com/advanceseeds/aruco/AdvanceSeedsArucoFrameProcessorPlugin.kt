package com.advanceseeds.aruco

import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc

class AdvanceSeedsArucoFrameProcessorPlugin : FrameProcessorPlugin() {
  private val maxDetectionWidth = 320.0

  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    val markerSizeMm = (params?.get("markerSizeMm") as? Number)?.toDouble() ?: 50.0
    val imageProxy = frame.imageProxy
    val yPlane = imageProxy.planes.firstOrNull() ?: return null
    val width = imageProxy.width
    val height = imageProxy.height
    ArucoDetectorBridge.ensureOpenCvLoaded()
    ArucoDetectorBridge.logFrame(
      "frame callback ${width}x$height rowStride=${yPlane.rowStride} pixelStride=${yPlane.pixelStride}"
    )
    val gray = Mat(height, width, CvType.CV_8UC1)
    val detectionMat = Mat()

    try {
      val buffer = yPlane.buffer.duplicate()
      val rowStride = yPlane.rowStride
      val pixelStride = yPlane.pixelStride
      val row = ByteArray(width)

      if (pixelStride == 1 && rowStride == width) {
        val bytes = ByteArray(width * height)
        buffer.get(bytes)
        gray.put(0, 0, bytes)
      } else {
        for (y in 0 until height) {
          val rowStart = y * rowStride
          for (x in 0 until width) {
            row[x] = buffer.get(rowStart + x * pixelStride)
          }
          gray.put(y, 0, row)
        }
      }

      val scale = if (width > maxDetectionWidth) width / maxDetectionWidth else 1.0
      if (scale > 1.0) {
        val targetHeight = height / scale
        Imgproc.resize(gray, detectionMat, Size(maxDetectionWidth, targetHeight), 0.0, 0.0, Imgproc.INTER_AREA)
        return ArucoDetectorBridge.detectInGrayMatValues(detectionMat, markerSizeMm, scale)
      }

      return ArucoDetectorBridge.detectInGrayMatValues(gray, markerSizeMm)
    } finally {
      detectionMat.release()
      gray.release()
    }
  }
}
