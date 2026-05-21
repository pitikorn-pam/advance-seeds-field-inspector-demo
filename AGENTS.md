# AGENTS.md

@/Users/pitikorn/.codex/RTK.md

ไฟล์นี้เป็นคำสั่งสำหรับ Codex ใน repo
`advance-seeds-field-inspector-demo` อ่านร่วมกับ `CLAUDE.md` เมื่อต้องการ
handoff รายละเอียดลึก

## ภาพรวม repo

repo นี้เป็น customer-facing presale demo ของ Advance Seeds Field Inspector:
แอป native mobile สำหรับ field inspector บน Expo/React Native ที่เก็บภาพและวิดีโอ
ผลไม้/เมล็ด ทำ on-device instance segmentation วัดผลในหน่วย millimeter หลัง
calibration และ sync inspection เข้า Supabase

ขอบเขตหลัก:

- `apps/mobile/` คือแอป Expo + React Native + `expo-router`
- `packages/types/` คือ shared type contract รวม `SeedAnalyzer`
- `packages/tokens/` คือ design token layer
- `packages/i18n/` คือ resource `en` และ `th`
- `supabase/` คือ migrations, seed scripts, generated-type workflow และ RLS smoke
  checks ของแอป demo
- `openspec/` คือ spec และ change workflow ของ repo นี้

ฝั่ง training/export model ไม่ได้อยู่ repo นี้ ให้ route ไป
`../advance-seeds-field-inspector-ml/` เมื่อโจทย์เกี่ยวกับ dataset, training,
registry, R2, Modal หรือ export contract

## จุดที่ต้องรู้ก่อนแก้โค้ด

- runtime seam ของ inference คือ `SeedAnalyzer` ใน `packages/types`; อย่าเรียก
  TFLite/Core ML ตรงจาก screen ถ้าไม่ได้ออกแบบ change ข้าม seam นี้
- model artifact ใน `apps/mobile/assets/models/` มาจาก ML repo และชื่อ
  `yolo11n-seeds.tflite` เป็น frozen alias ห้าม rename ฝั่งแอปโดยไม่ประสาน ML
  repo และ OpenSpec
- data access ของ Supabase ฝั่งแอปควรผ่าน hook ใน
  `apps/mobile/lib/queries.ts`; อย่ากระจาย `supabase.from(...)` ไปตาม screen
- auth/session bootstrap อยู่ใน `apps/mobile/lib/supabase.ts` และ
  `apps/mobile/lib/auth.tsx`; role/permission gating อยู่ใน
  `apps/mobile/lib/access.ts`
- schema อยู่ใน `supabase/migrations/`; หลัง migration ให้ regenerate
  `packages/types/src/supabase.gen.ts` ด้วย `pnpm supabase:types`
- ถ้าแก้ RLS policy ให้เพิ่ม/ปรับ smoke coverage ใน `supabase/scripts/` และรัน
  `pnpm supabase:smoke`

## UI, design และภาษา

- ก่อนทำ UI ให้อ่าน `DESIGN.md`
- ห้ามใส่ raw hex หรือ spacing ใหม่ใน component code โดยไม่ผ่าน token layer;
  source token อยู่ที่ `docs/handoff/design-tokens.json` และถูกใช้โดย
  `packages/tokens/`
- UI string ต้องผ่าน `t()` จาก `react-i18next`; รักษา parity ของ resource
  `en` และ `th` ใน `packages/i18n/`
- button หลักใช้ทรง rectangular radius 8px ตาม design discipline; pill เก็บไว้
  สำหรับ status badge, role chip และ segmented filter

## โครงงานที่เจอบ่อย

- route และ screen อยู่ใน `apps/mobile/app/`
- reusable UI อยู่ใน `apps/mobile/components/`
- app glue อยู่ใน `apps/mobile/lib/`
- native module เฉพาะ repo อยู่ใน `apps/mobile/modules/` เช่น
  `aruco-calibrator`, `lidar-calibrator`, `coreml-runner`,
  `roi-video-exporter`
- Expo config plugins อยู่ใน `apps/mobile/plugins/`

แอปนี้ใช้ native modules จริง จึงรันด้วย Expo Go ไม่ได้ ให้ใช้ custom dev client
เมื่อทดสอบ camera, calibration หรือ inference flow

## คำสั่งหลัก

รันจาก root repo:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
pnpm supabase:start
pnpm supabase:types
pnpm supabase:seed-users
pnpm supabase:seed-all
pnpm supabase:smoke
```

รัน mobile dev server จาก root:

```bash
pnpm -F @advance-seeds/mobile start
```

รันจาก `apps/mobile/` เมื่อทำงานเฉพาะแอป:

```bash
pnpm lint
pnpm typecheck
pnpm android
pnpm ios
pnpm build:preview:android
pnpm build:preview:ios
```

`pnpm android` และ `pnpm ios` เป็น native path; ถ้าโจทย์ไม่ต้อง rebuild native
ให้หลีกเลี่ยงการรันโดยไม่จำเป็น

## OpenSpec และการตรวจงาน

- งาน non-trivial ต้องเริ่มจาก `openspec/changes/` หรือ change ที่มีอยู่ใน repo
  นี้
- ตรวจ active change และ specs ก่อนด้วย `openspec list` และ
  `openspec list --specs`
- validate change ด้วย `openspec validate <change>` หรือ
  `openspec validate --all --strict` ตามขอบเขตงาน
- ให้เลือก verification ตาม blast radius:
  - UI/data-flow ปกติ: `pnpm lint` และ `pnpm typecheck`
  - migration/generated types: `pnpm supabase:types` แล้ว typecheck
  - RLS/policy: `pnpm supabase:smoke`
  - native/camera/model path: บอกข้อจำกัดของ device/EAS/dev-client ชัดเจนถ้ายัง
    verify บนอุปกรณ์ไม่ได้

## ระวัง

- อย่า commit secret หรือ env จริง
- อย่าข้าม generated types หลังแก้ migration
- อย่าทำ cross-repo model change ใน repo demo ฝั่งเดียว
- อย่าลบหรือย้อนงานใน worktree ที่ไม่เกี่ยวกับโจทย์ โดยเฉพาะ docs handoff และ
  OpenSpec ที่อาจกำลัง active อยู่
