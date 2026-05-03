-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_contributor_handle_id" TEXT,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpacePrompt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary_prompt_output" TEXT NOT NULL,

    CONSTRAINT "SpacePrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceSummary" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "modelSlug" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "summaryText" TEXT,
    "jobStatus" TEXT NOT NULL DEFAULT 'pending',
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SpaceSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributorHandle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,

    CONSTRAINT "ContributorHandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawText" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "contributorHandleId" TEXT NOT NULL,

    CONSTRAINT "FeedbackEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Space_shortCode_key" ON "Space"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "Space_owner_contributor_handle_id_key" ON "Space"("owner_contributor_handle_id");

-- CreateIndex
CREATE UNIQUE INDEX "SpacePrompt_spaceId_slug_key" ON "SpacePrompt"("spaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceSummary_promptId_modelSlug_language_key" ON "SpaceSummary"("promptId", "modelSlug", "language");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_owner_contributor_handle_id_fkey" FOREIGN KEY ("owner_contributor_handle_id") REFERENCES "ContributorHandle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacePrompt" ADD CONSTRAINT "SpacePrompt_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceSummary" ADD CONSTRAINT "SpaceSummary_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceSummary" ADD CONSTRAINT "SpaceSummary_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "SpacePrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorHandle" ADD CONSTRAINT "ContributorHandle_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEntry" ADD CONSTRAINT "FeedbackEntry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEntry" ADD CONSTRAINT "FeedbackEntry_contributorHandleId_fkey" FOREIGN KEY ("contributorHandleId") REFERENCES "ContributorHandle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
