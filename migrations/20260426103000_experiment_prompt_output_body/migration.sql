-- Split SpaceExperimentPrompt: technical INPUT lives in AppSetting; per-space column holds OUTPUT rules only.

ALTER TABLE "SpaceExperimentPrompt" ADD COLUMN "outputBody" TEXT;

UPDATE "SpaceExperimentPrompt" AS p
SET "outputBody" = TRIM(
  SUBSTRING(
    nb
    FROM CASE
      WHEN pos > 0 THEN pos + char_length(E'\nOUTPUT\n')
      ELSE 1
    END
  )
)
FROM (
  SELECT
    id,
    REPLACE(REPLACE("body", E'\r\n', E'\n'), E'\r', E'\n') AS nb,
    POSITION(E'\nOUTPUT\n' IN REPLACE(REPLACE("body", E'\r\n', E'\n'), E'\r', E'\n')) AS pos
  FROM "SpaceExperimentPrompt"
) AS s
WHERE p.id = s.id;

ALTER TABLE "SpaceExperimentPrompt" DROP COLUMN "body";

ALTER TABLE "SpaceExperimentPrompt" ALTER COLUMN "outputBody" SET NOT NULL;
