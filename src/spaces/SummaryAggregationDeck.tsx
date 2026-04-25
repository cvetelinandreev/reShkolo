import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, ClipboardDocumentIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { saveExperimentDeck } from "wasp/client/operations";
import type { HeaderLang } from "../shared/components/JournalAppHeader";

export type ExperimentAggCard = {
  id: string;
  promptSlug: string;
  promptBody: string;
  modelSlug: string;
  modelDisplayName: string;
  modelApiId: string;
  summaryText: string | null;
  jobError: string | null;
  jobStatus: string;
  updatedAt: string | null;
};

type DeckPrompt = { slug: string; body: string };
type DeckModel = { slug: string; displayName: string; modelApiId: string };

type Props = {
  lang: HeaderLang;
  spaceId: string;
  aggs: ExperimentAggCard[];
  prompts: DeckPrompt[];
  models: DeckModel[];
  deckUpdating: boolean;
  onRefresh: () => void;
};

/**
 * Horizontal overflow is clipped to this box (`min-w-0` + `max-w-full`), so the
 * parent column never grows wider than the viewport.
 */
/** Older failed rows stored stats copy here instead of the LLM error. */
function isLikelyStatsOnlyDeckBody(text: string | null | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return (
    t.startsWith("This space has") ||
    t.startsWith("There is ") ||
    t.startsWith("There are ") ||
    t.startsWith("До момента има") ||
    t.includes("Overall tone mix:") ||
    t.includes("Общ микс от тон:")
  );
}

function aggregationCardFailureText(
  card: ExperimentAggCard,
  failedFallback: string,
): string {
  const fromJob = card.jobError?.trim();
  if (fromJob) return fromJob;
  const fromSummary = card.summaryText?.trim();
  if (fromSummary && !isLikelyStatsOnlyDeckBody(fromSummary)) return fromSummary;
  return failedFallback;
}

function ContainedHorizontalScrollStrip({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
      <div className="flex w-max flex-nowrap items-start gap-3 pb-1 pr-0.5">{children}</div>
    </div>
  );
}

function PromptBodyModal(props: {
  open: boolean;
  title: string;
  body: string;
  lang: HeaderLang;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  if (!props.open) return null;
  const closeAria = props.lang === "bg" ? "Затвори" : "Close";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-0 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={closeAria}
        onClick={props.onClose}
      />
      <div className="relative z-10 flex max-h-[min(88dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <button
          type="button"
          onClick={props.onClose}
          className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-100 hover:text-neutral-900"
          aria-label={closeAria}
        >
          <XMarkIcon className="h-5 w-5" aria-hidden />
        </button>
        <div className="sticky top-0 z-10 shrink-0 border-b border-neutral-200 bg-white px-4 py-3 pr-14">
          <h2
            id="prompt-modal-title"
            className="min-w-0 truncate text-sm font-medium text-neutral-900"
            title={props.title}
          >
            {props.title}
          </h2>
        </div>
        <pre className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain whitespace-pre-wrap p-4 text-sm leading-relaxed text-neutral-800">
          {props.body}
        </pre>
      </div>
    </div>
  );
}

export function SummaryAggregationDeck(props: Props) {
  const [promptModal, setPromptModal] = useState<{
    slug: string;
    body: string;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftPrompts, setDraftPrompts] = useState<DeckPrompt[]>([]);
  const [draftModels, setDraftModels] = useState<DeckModel[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);

  const openEditor = useCallback(() => {
    setDraftPrompts(props.prompts.map((p) => ({ ...p })));
    setDraftModels(props.models.map((m) => ({ ...m })));
    setSaveError(null);
    setEditorOpen(true);
  }, [props.prompts, props.models]);

  const anyCardPending = props.aggs.some((c) => c.jobStatus === "pending");
  const deckBusy = props.deckUpdating || anyCardPending;

  const labels = useMemo(
    () =>
      props.lang === "bg"
        ? {
            deckTitle: "Обобщение",
            promptPrefix: "Промпт:",
            edit: "Подсказки и модели",
            empty: "Няма карти за показване.",
            pending: "Генериране…",
            failedFallback: "Неуспех за тази комбинация.",
            copyCard: "Копирай",
            copiedCard: "Копирано",
            save: "Запази",
            cancel: "Отказ",
            addPrompt: "Нова подсказка",
            addModel: "Нов модел",
            promptsBlock: "Подсказки",
            modelsBlock: "Модели",
            slug: "Кратък код",
            body: "Системна подсказка",
            display: "Име в картата",
            apiId: "Model API id",
          }
        : {
            deckTitle: "Summaries",
            promptPrefix: "Prompt:",
            edit: "Prompts & models",
            empty: "No aggregation cards yet.",
            pending: "Generating…",
            failedFallback: "This combination failed.",
            copyCard: "Copy",
            copiedCard: "Copied",
            save: "Save",
            cancel: "Cancel",
            addPrompt: "Add prompt",
            addModel: "Add model",
            promptsBlock: "Prompts",
            modelsBlock: "Models",
            slug: "Slug",
            body: "System prompt",
            display: "Card label",
            apiId: "Model API id",
          },
    [props.lang],
  );

  async function handleSaveDeck() {
    setSaveBusy(true);
    setSaveError(null);
    try {
      await saveExperimentDeck({
        spaceId: props.spaceId,
        prompts: draftPrompts.map((p) => ({
          slug: p.slug.trim().toLowerCase(),
          body: p.body,
        })),
        models: draftModels.map((m) => ({
          slug: m.slug.trim().toLowerCase(),
          displayName: m.displayName.trim(),
          modelApiId: m.modelApiId.trim(),
        })),
      });
      setEditorOpen(false);
      props.onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setSaveError(msg);
    } finally {
      setSaveBusy(false);
    }
  }

  function cardBodyText(card: ExperimentAggCard): string {
    if (card.jobStatus === "pending") return labels.pending;
    if (card.jobStatus === "failed") {
      return aggregationCardFailureText(card, labels.failedFallback);
    }
    return card.summaryText?.trim() || (props.lang === "bg" ? "Няма текст." : "No text yet.");
  }

  async function copyCardText(card: ExperimentAggCard) {
    const text = [
      card.modelApiId,
      `${labels.promptPrefix} ${card.promptSlug}`,
      "",
      cardBodyText(card),
    ].join("\n");
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    if (!copied) return;
    setCopiedCardId(card.id);
    window.setTimeout(() => {
      setCopiedCardId((curr) => (curr === card.id ? null : curr));
    }, 1400);
  }

  return (
    <section className="min-w-0 w-full max-w-full space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-neutral-700">
          {labels.deckTitle}
        </h2>
        <button
          type="button"
          onClick={openEditor}
          disabled={deckBusy || saveBusy}
          className="shrink-0 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          {labels.edit}
        </button>
      </div>

      {props.aggs.length === 0 ? (
        <p className="text-sm text-neutral-600">{labels.empty}</p>
      ) : (
        <ContainedHorizontalScrollStrip>
          {props.aggs.map((card) => (
            <article
              key={card.id}
              className="flex w-72 max-w-full shrink-0 snap-center snap-always flex-col rounded-2xl border border-neutral-200/90 bg-white/95 p-3 shadow-sm"
            >
              <header className="mb-2 shrink-0 border-b border-neutral-100 pb-2">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p
                    className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-neutral-900"
                    title={card.modelApiId}
                  >
                    {card.modelApiId}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setPromptModal({ slug: card.promptSlug, body: card.promptBody })
                    }
                    className="max-w-[55%] shrink-0 pl-2 text-right text-sm font-medium text-[#1583ca] underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                  >
                    <span className="text-neutral-500">{labels.promptPrefix}</span>{" "}
                    {card.promptSlug}
                  </button>
                </div>
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void copyCardText(card)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    aria-label={labels.copyCard}
                    title={labels.copyCard}
                  >
                    {copiedCardId === card.id ? (
                      <>
                        <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                        {labels.copiedCard}
                      </>
                    ) : (
                      <>
                        <ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden />
                        {labels.copyCard}
                      </>
                    )}
                  </button>
                </div>
              </header>

              <div className="min-w-0 flex-1 text-sm leading-relaxed text-neutral-900">
                {card.jobStatus === "pending" ? (
                  <span className="text-neutral-500">{labels.pending}</span>
                ) : card.jobStatus === "failed" ? (
                  <p className="whitespace-pre-wrap break-words text-sm text-red-700 [overflow-wrap:anywhere]">
                    {aggregationCardFailureText(card, labels.failedFallback)}
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {card.summaryText?.trim() ||
                      (props.lang === "bg" ? "Няма текст." : "No text yet.")}
                  </p>
                )}
              </div>
            </article>
          ))}
        </ContainedHorizontalScrollStrip>
      )}

      <PromptBodyModal
        open={promptModal != null}
        title={
          promptModal
            ? `${labels.promptPrefix} ${promptModal.slug}`
            : ""
        }
        body={promptModal?.body ?? ""}
        lang={props.lang}
        onClose={() => setPromptModal(null)}
      />

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={props.lang === "bg" ? "Затвори" : "Close"}
            onClick={() => !saveBusy && setEditorOpen(false)}
          />
          <div className="relative z-10 flex max-h-[min(92vh,40rem)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h2 className="text-sm font-medium">{labels.edit}</h2>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => setEditorOpen(false)}
                className="text-sm text-[#1583ca] disabled:opacity-50"
              >
                {labels.cancel}
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                  {labels.promptsBlock}
                </p>
                {draftPrompts.map((p, idx) => (
                  <div key={idx} className="mb-3 rounded-xl border border-neutral-200 p-2">
                    <label className="block text-xs text-neutral-600">{labels.slug}</label>
                    <input
                      className="mb-2 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                      value={p.slug}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftPrompts((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, slug: v } : x)),
                        );
                      }}
                    />
                    <label className="block text-xs text-neutral-600">{labels.body}</label>
                    <textarea
                      rows={5}
                      className="w-full rounded-lg border border-neutral-300 px-2 py-1 font-mono text-xs"
                      value={p.body}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftPrompts((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, body: v } : x)),
                        );
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm text-[#1583ca]"
                  onClick={() =>
                    setDraftPrompts((prev) => [
                      ...prev,
                      { slug: `prompt-${prev.length + 1}`, body: "" },
                    ])
                  }
                >
                  + {labels.addPrompt}
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                  {labels.modelsBlock}
                </p>
                {draftModels.map((m, idx) => (
                  <div key={idx} className="mb-3 rounded-xl border border-neutral-200 p-2">
                    <label className="block text-xs text-neutral-600">{labels.slug}</label>
                    <input
                      className="mb-2 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                      value={m.slug}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftModels((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, slug: v } : x)),
                        );
                      }}
                    />
                    <label className="block text-xs text-neutral-600">{labels.display}</label>
                    <input
                      className="mb-2 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                      value={m.displayName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftModels((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, displayName: v } : x)),
                        );
                      }}
                    />
                    <label className="block text-xs text-neutral-600">{labels.apiId}</label>
                    <input
                      className="w-full rounded-lg border border-neutral-300 px-2 py-1 font-mono text-xs"
                      value={m.modelApiId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftModels((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, modelApiId: v } : x)),
                        );
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm text-[#1583ca]"
                  onClick={() =>
                    setDraftModels((prev) => [
                      ...prev,
                      {
                        slug: `model-${prev.length + 1}`,
                        displayName: "",
                        modelApiId: "",
                      },
                    ])
                  }
                >
                  + {labels.addModel}
                </button>
              </div>

              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>
            <div className="border-t border-neutral-200 p-3">
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void handleSaveDeck()}
                className="w-full rounded-full bg-[#1583ca] py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#1478b8] disabled:opacity-50"
              >
                {labels.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
