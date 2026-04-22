-- CreateTable
CREATE TABLE "SpaceExperimentPrompt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "SpaceExperimentPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceExperimentModel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "modelApiId" TEXT NOT NULL,

    CONSTRAINT "SpaceExperimentModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceSummaryAggregation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "experimentModelId" TEXT NOT NULL,
    "summaryText" TEXT,
    "jobStatus" TEXT NOT NULL DEFAULT 'pending',
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SpaceSummaryAggregation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpaceExperimentPrompt_spaceId_slug_key" ON "SpaceExperimentPrompt"("spaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceExperimentModel_spaceId_slug_key" ON "SpaceExperimentModel"("spaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceSummaryAggregation_promptId_experimentModelId_key" ON "SpaceSummaryAggregation"("promptId", "experimentModelId");

-- AddForeignKey
ALTER TABLE "SpaceExperimentPrompt" ADD CONSTRAINT "SpaceExperimentPrompt_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceExperimentModel" ADD CONSTRAINT "SpaceExperimentModel_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceSummaryAggregation" ADD CONSTRAINT "SpaceSummaryAggregation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceSummaryAggregation" ADD CONSTRAINT "SpaceSummaryAggregation_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "SpaceExperimentPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceSummaryAggregation" ADD CONSTRAINT "SpaceSummaryAggregation_experimentModelId_fkey" FOREIGN KEY ("experimentModelId") REFERENCES "SpaceExperimentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
