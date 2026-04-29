package com.advanceseeds.aruco

import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import org.opencv.core.CvType
import org.opencv.core.Mat

class AdvanceSeedsArucoFrameProcessorPlugin : FrameProcessorPlugin() {
  override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
    val markerSizeMm = (params?.get("markerSizeMm") as? Number)?.toDouble() ?: 50.0
    val imageProxy = frame.imageProxy
    val yPlane = imageProxy.planes.firstOrNull() ?: return null
    val width = imageProxy.width
    val height = imageProxy.height
    val gray = Mat(height, width, CvType.CV_8UC1)

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

      return ArucoDetectorBridge.detectInGrayMat(gray, markerSizeMm)
    } finally {
      gray.release()
    }
  }
}
