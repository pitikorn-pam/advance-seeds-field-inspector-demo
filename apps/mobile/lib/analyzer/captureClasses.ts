// Default produce demo classes used when the runtime model is generic
// COCO-trained yolo*.tflite. These ride along with the real `varieties`
// table (column `coco_class_id`) — the table is the source of truth, this
// list is only a documented fallback for offline / first-run scenarios.

export interface CaptureClass {
  /** Display name shown in dropdowns + KPI strip. */
  name: string;
  /** Index in the COCO 80-class label set (matches the bundled tflite). */
  cocoClassId: number;
}

export const DEFAULT_CAPTURE_CLASSES: readonly CaptureClass[] = [
  { name: "Banana", cocoClassId: 46 },
  { name: "Apple", cocoClassId: 47 },
  { name: "Orange", cocoClassId: 49 },
  { name: "Broccoli", cocoClassId: 50 },
  { name: "Carrot", cocoClassId: 51 },
];

export const DEFAULT_CAPTURE_CLASS_IDS: readonly number[] = DEFAULT_CAPTURE_CLASSES.map(
  (c) => c.cocoClassId,
);
