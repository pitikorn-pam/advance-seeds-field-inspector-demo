# Calibration Card

Use `aruco-5cm.pdf` for real ArUco calibration testing.

- Dictionary: OpenCV `DICT_4X4_50`
- Marker ID: `0`
- Physical marker size: `50 mm`
- Print scale: `100%` / actual size

For the current iOS build, place the marker flat in the captured photo. If the marker is detected, the processing step uses its measured pixel width as `pxPerMm`; otherwise the app keeps the selected manual calibration profile.

The live frame-processor path and Android native detector are still pending.
