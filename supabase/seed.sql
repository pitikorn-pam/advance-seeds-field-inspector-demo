-- Reference data seed. Run after migrations apply.
-- Idempotent: re-running this file does not duplicate rows.
--
-- Users (Jane + Alex) and inspections+seeds are seeded by TS scripts in
-- supabase/scripts/ because they require the Supabase Auth Admin API
-- (service_role key) and image uploads to storage.

-- ============================================================================
-- Varieties — six grain/legume crops common in Thailand
-- ============================================================================

insert into public.varieties (name, scientific_name, description, image_url, color_key)
values
  ('Rice — Hom Mali',     'Oryza sativa',         'Premium Thai jasmine rice. Aromatic long grain.',          'https://images.pexels.com/photos/4110251/pexels-photo-4110251.jpeg', 'rice'),
  ('Rice — Riceberry',    'Oryza sativa',         'Anthocyanin-rich purple rice. Smaller grain, high yield.', 'https://images.pexels.com/photos/4110252/pexels-photo-4110252.jpeg', 'rice'),
  ('Corn — Sweet Hybrid', 'Zea mays saccharata',  'F1 hybrid sweet corn for fresh market.',                   'https://images.pexels.com/photos/547263/pexels-photo-547263.jpeg',   'corn'),
  ('Soybean — Chiang Mai 60', 'Glycine max',      'High-protein cultivar bred for upland conditions.',         'https://images.pexels.com/photos/4110249/pexels-photo-4110249.jpeg', 'legume'),
  ('Mung bean — KU#2',    'Vigna radiata',        'Short-season summer crop. Used for sprouts and dessert.',  'https://images.pexels.com/photos/4110248/pexels-photo-4110248.jpeg', 'mungbean'),
  ('Sunflower — Pacific 88', 'Helianthus annuus', 'Oilseed and ornamental dual-use cultivar.',                 'https://images.pexels.com/photos/4110247/pexels-photo-4110247.jpeg', 'rice')
on conflict (name) do update
  set scientific_name = excluded.scientific_name,
      description     = excluded.description,
      image_url       = excluded.image_url,
      color_key       = excluded.color_key;

-- ============================================================================
-- Batches — four lots from this season
-- ============================================================================

insert into public.batches (code, location, sown_at, notes)
values
  ('BATCH-2026-01', 'Chiang Rai trial plot A', '2025-12-04', 'Wet season pilot — drip irrigated.'),
  ('BATCH-2026-02', 'Chiang Mai test field 3', '2026-01-08', 'Dry season comparison block.'),
  ('BATCH-2026-03', 'Khon Kaen partner farm',  '2026-02-14', 'Smallholder cooperative; 12 farmers participated.'),
  ('BATCH-2026-04', 'Suphan Buri R&D plot',    '2026-03-22', 'Indoor germination trial. Sensor-instrumented.')
on conflict (code) do update
  set location = excluded.location,
      sown_at  = excluded.sown_at,
      notes    = excluded.notes;

-- ============================================================================
-- Calibration profiles — one LiDAR-based, one ArUco-based
-- ============================================================================

insert into public.calibration_profiles (name, px_per_mm, source)
values
  ('Default — iPhone 15 Pro LiDAR',        38.4, 'lidar'),
  ('ArUco card 5 cm — bench setup',        62.1, 'aruco')
on conflict (name) do update
  set px_per_mm = excluded.px_per_mm,
      source    = excluded.source;
