-- Product defaults: empty owner name, always ask for photos, 08:00–17:00 hours,
-- and no pre-seeded job types (owners add their own).

ALTER TABLE business_profile
  ALTER COLUMN name SET DEFAULT '';

UPDATE business_profile
SET name = ''
WHERE trim(name) = ''
   OR lower(trim(name)) IN ('dobby', 'barberai demo');

ALTER TABLE business_profile
  ALTER COLUMN photo_policy SET DEFAULT 'always';

UPDATE business_profile
SET photo_policy = 'always'
WHERE photo_policy = 'if_helpful';

ALTER TABLE business_hours
  ALTER COLUMN intervals SET DEFAULT '[{"open":"08:00","close":"17:00"}]'::jsonb;

UPDATE business_hours
SET intervals = '[{"open":"08:00","close":"17:00"}]'::jsonb
WHERE intervals = '[{"open":"09:00","close":"20:00"}]'::jsonb;

-- Clear catalog so סוגי קריאות starts empty
DELETE FROM services;
