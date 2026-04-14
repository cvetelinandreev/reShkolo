import crypto from "node:crypto";
import { HttpError } from "wasp/server";
import type {
  CreateSpace,
  GetSpaceSummary,
  JoinSpace,
  SubmitFeedback,
} from "wasp/server/operations";
import { classifyFeedbackText } from "./classify";
import { regenerateSpaceSummary } from "./summaryAsync";

export const TONE = {
  praise: "praise",
  constructive_criticism: "constructive_criticism",
} as const;

export const SOURCE = {
  text: "text",
  voice: "voice",
} as const;

export const JOB = {
  pending: "pending",
  ready: "ready",
  failed: "failed",
} as const;

const SHORT_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function makeShortCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += SHORT_CODE_CHARS[crypto.randomInt(SHORT_CODE_CHARS.length)]!;
  }
  return out;
}


function mapClassificationMeta(summary: {
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
}) {
  return {
    totalCount: summary.totalCount,
    positiveCount: summary.positiveCount,
    negativeCount: summary.negativeCount,
  };
}

export const createSpace: CreateSpace<
  { name?: string | null },
  {
    spaceId: string;
    shortCode: string;
    contributorHandleId: string;
  }
> = async ({ name }, context) => {
  let shortCode = "";
  for (let i = 0; i < 24; i++) {
    const candidate = makeShortCode();
    const existing = await context.entities.Space.findUnique({
      where: { shortCode: candidate },
    });
    if (!existing) {
      shortCode = candidate;
      break;
    }
  }
  if (!shortCode) {
    throw new HttpError(500, "Could not allocate a space code");
  }

  const space = await context.entities.Space.create({
    data: {
      shortCode,
      name: name?.trim() || null,
    },
  });

  const handle = await context.entities.ContributorHandle.create({
    data: {
      spaceId: space.id,
    },
  });

  await context.entities.SpaceSummary.create({
    data: {
      spaceId: space.id,
      totalCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      jobStatus: JOB.ready,
      summaryText: null,
      updatedAt: null,
    },
  });

  return {
    spaceId: space.id,
    shortCode: space.shortCode,
    contributorHandleId: handle.id,
  };
};

export const joinSpace: JoinSpace<
  { shortCode: string },
  {
    spaceId: string;
    shortCode: string;
    spaceName: string | null;
    summary: string | null;
    classificationMeta: ReturnType<typeof mapClassificationMeta>;
    updatedAt: string | null;
    contributorHandleId: string;
  }
> = async ({ shortCode }, context) => {
  const code = shortCode.trim().toUpperCase();
  const space = await context.entities.Space.findUnique({
    where: { shortCode: code },
  });
  if (!space) {
    throw new HttpError(404, "Space not found");
  }

  const handle = await context.entities.ContributorHandle.create({
    data: { spaceId: space.id },
  });

  const agg = await context.entities.SpaceSummary.findUnique({
    where: { spaceId: space.id },
  });
  if (!agg) {
    throw new HttpError(500, "Space summary missing");
  }

  return {
    spaceId: space.id,
    shortCode: space.shortCode,
    spaceName: space.name,
    summary: agg.summaryText,
    classificationMeta: mapClassificationMeta(agg),
    updatedAt: agg.updatedAt ? agg.updatedAt.toISOString() : null,
    contributorHandleId: handle.id,
  };
};

export const submitFeedback: SubmitFeedback<
  {
    spaceId: string;
    contributorHandleId: string;
    text: string;
    sourceType: "text" | "voice";
  },
  {
    accepted: boolean;
    classificationMeta: ReturnType<typeof mapClassificationMeta>;
  }
> = async ({ spaceId, contributorHandleId, text, sourceType }, context) => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new HttpError(400, "Feedback text is required");
  }

  const handle = await context.entities.ContributorHandle.findFirst({
    where: { id: contributorHandleId, spaceId },
  });
  if (!handle) {
    throw new HttpError(403, "Invalid contributor handle for this space");
  }

  const classification = await classifyFeedbackText(trimmed);
  const tone =
    classification === "praise" ? TONE.praise : TONE.constructive_criticism;

  await context.entities.FeedbackEntry.create({
    data: {
      spaceId,
      contributorHandleId,
      rawText: trimmed,
      tone,
      sourceType: sourceType === "voice" ? SOURCE.voice : SOURCE.text,
    },
  });

  const totals = await context.entities.FeedbackEntry.groupBy({
    by: ["tone"],
    where: { spaceId },
    _count: { _all: true },
  });

  let positiveCount = 0;
  let negativeCount = 0;
  for (const row of totals) {
    if (row.tone === TONE.praise) positiveCount = row._count._all;
    if (row.tone === TONE.constructive_criticism) negativeCount = row._count._all;
  }
  const totalCount = positiveCount + negativeCount;

  await context.entities.SpaceSummary.update({
    where: { spaceId },
    data: {
      totalCount,
      positiveCount,
      negativeCount,
      jobStatus: JOB.pending,
    },
  });

  void regenerateSpaceSummary(spaceId, context.entities).catch((err) => {
    console.error("regenerateSpaceSummary failed", err);
    void context.entities.SpaceSummary.update({
      where: { spaceId },
      data: { jobStatus: JOB.failed },
    });
  });

  return {
    accepted: true,
    classificationMeta: mapClassificationMeta({
      totalCount,
      positiveCount,
      negativeCount,
    }),
  };
};

export const getSpaceSummary: GetSpaceSummary<
  { spaceId: string },
  {
    summary: string | null;
    classificationMeta: ReturnType<typeof mapClassificationMeta>;
    updatedAt: string | null;
    jobStatus: string;
    spaceName: string | null;
    shortCode: string;
  }
> = async ({ spaceId }, context) => {
  const space = await context.entities.Space.findUnique({
    where: { id: spaceId },
  });
  if (!space) {
    throw new HttpError(404, "Space not found");
  }

  const agg = await context.entities.SpaceSummary.findUnique({
    where: { spaceId },
  });
  if (!agg) {
    throw new HttpError(500, "Space summary missing");
  }

  return {
    summary: agg.summaryText,
    classificationMeta: mapClassificationMeta(agg),
    updatedAt: agg.updatedAt ? agg.updatedAt.toISOString() : null,
    jobStatus: agg.jobStatus,
    spaceName: space.name,
    shortCode: space.shortCode,
  };
};
