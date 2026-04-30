# Models

Drop the YOLO TFLite weights here as `yolo11n-seeds.tflite`.

## Generic COCO yolo11n (placeholder for pipeline validation)

```bash
pip install ultralytics
yolo export model=yolo11n.pt format=tflite imgsz=640
mv yolo11n_saved_model/yolo11n_float16.tflite \
   apps/mobile/assets/models/yolo11n-seeds.tflite
```

The runtime picker (`lib/analyzer/selectAnalyzer.ts`) gracefully falls back
to the classical analyzer when this file is absent, so the app boots fine
without it.

## Seed-trained model

When a seed-specific model is available, drop it at the same path. The
TfliteSeedAnalyzer assumes a YOLO-style anchor-free head with output shape
`[1, num_classes + 4, num_anchors]` (e.g. `[1, 84, 8400]` for COCO-80).
