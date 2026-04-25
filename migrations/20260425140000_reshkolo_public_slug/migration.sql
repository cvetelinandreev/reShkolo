-- Join link /reshkolo (stored as RESHKOLO). Renames seeded app space if it still uses the old code.
UPDATE "Space"
SET "shortCode" = 'RESHKOLO'
WHERE "id" = 'a1b2c3d4-0000-4000-8000-000000000001'
  AND "shortCode" = 'RESHKAPP';
