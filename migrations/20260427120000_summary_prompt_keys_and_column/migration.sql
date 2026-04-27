-- AppSetting: consolidate old *experiment* keys into final names (safe if both exist).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AppSetting" WHERE key = 'summary_experiment_prompt_input') THEN
    IF EXISTS (SELECT 1 FROM "AppSetting" WHERE key = 'summary_prompt_input') THEN
      DELETE FROM "AppSetting" WHERE key = 'summary_experiment_prompt_input';
    ELSE
      UPDATE "AppSetting" SET key = 'summary_prompt_input' WHERE key = 'summary_experiment_prompt_input';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AppSetting" WHERE key = 'default_summary_experiment_output') THEN
    IF EXISTS (SELECT 1 FROM "AppSetting" WHERE key = 'default_summary_prompt_output') THEN
      DELETE FROM "AppSetting" WHERE key = 'default_summary_experiment_output';
    ELSE
      UPDATE "AppSetting" SET key = 'default_summary_prompt_output' WHERE key = 'default_summary_experiment_output';
    END IF;
  END IF;
END $$;

-- Column: rename legacy Prisma column name to summary_prompt_output
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SpaceExperimentPrompt' AND column_name = 'outputBody'
  ) THEN
    ALTER TABLE "SpaceExperimentPrompt" RENAME COLUMN "outputBody" TO "summary_prompt_output";
  END IF;
END $$;
