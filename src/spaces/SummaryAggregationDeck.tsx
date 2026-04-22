import { useCallback, useMemo, useState } from "react";
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
  jobStatus: string;
  updatedAt: string | null;
};

export type FeedbackLine = {
  rawText: string;
  tone: string;
  createdAt: string;
};

type DeckPrompt = { slug: string; body: string };
type DeckModel = { slug: string; displayName: string; modelApiId: string };

type Props = {
  lang: HeaderLang;
  spaceId: string;
  aggs: ExperimentAggCard[];
  feedbacks: FeedbackLine[];
  prompts: DeckPrompt[];
  models: DeckModel[];
  deckUpdating: boolean;
  onRefresh: () => void;
};

function toneChipClass(tone: string): string {
  if (tone === "praise") return "bg-[#A5BB4F]/25 text-neutral-900";
  return "bg-[#E68C6C]/20 text-neutral-900";
}

function PromptBodyModal(props: {
  open: boolean;
  title: string;
  body: string;
  lang: HeaderLang;
  onClose: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={props.lang === "bg" ? "Затвори" : "Close"}
        onClick={props.onClose}
      />
      <div className="relative z-10 flex max-h-[min(85vh,36rem)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 id="prompt-modal-title" className="text-sm font-medium text-neutral-900">
            {props.title}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full px-3 py-1 text-sm text-[#1583ca] hover:bg-neutral-100"
          >
            {props.lang === "bg" ? "Затвори" : "Close"}
          </button>
        </div>
        <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-4 text-sm leading-relaxed text-neutral-800">
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

  const openEditor = useCallback(() => {
    setDraftPrompts(props.prompts.map((p) => ({ ...p })));
    setDraftModels(props.models.map((m) => ({ ...m })));
    setSaveError(null);
    setEditorOpen(true);
  }, [props.prompts, props.models]);

  const labels = useMemo(
    () =>
      props.lang === "bg"
        ? {
            deckTitle: "Обобщения (модел × подсказка)",
            edit: "Подсказки и модели",
            feedbackTitle: "Всички отзиви",
            empty: "Няма карти за показване.",
            pending: "Генериране…",
            failed: "Неуспех за тази комбинация.",
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
            deckTitle: "Summaries (model × prompt)",
            edit: "Prompts & models",
            feedbackTitle: "All feedback",
            empty: "No aggregation cards yet.",
            pending: "Generating…",
            failed: "This combination failed.",
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

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-neutral-700">
          {labels.deckTitle}
        </h2>
        <button
          type="button"
          onClick={openEditor}
          disabled={props.deckUpdating || saveBusy}
          className="shrink-0 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          {labels.edit}
        </button>
      </div>

      {props.aggs.length === 0 ? (
        <p className="text-sm text-neutral-600">{labels.empty}</p>
      ) : (
        <div
          className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-2 pb-1 [scrollbar-width:thin]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {props.aggs.map((card) => (
            <article
              key={card.id}
              className="flex w-[min(90vw,22rem)] shrink-0 snap-center snap-always flex-col rounded-2xl border border-neutral-200/90 bg-white/95 p-3 shadow-sm"
            >
              <header className="mb-2 shrink-0 border-b border-neutral-100 pb-2">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {card.modelDisplayName}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setPromptModal({ slug: card.promptSlug, body: card.promptBody })
                  }
                  className="mt-0.5 text-left text-sm font-medium text-[#1583ca] underline-offset-2 hover:underline"
                >
                  {card.promptSlug}
                </button>
              </header>

              <div className="min-h-[4.5rem] shrink-0 text-sm leading-snug text-neutral-900">
                {props.deckUpdating || card.jobStatus === "pending" ? (
                  <span className="text-neutral-500">{labels.pending}</span>
                ) : card.jobStatus === "failed" ? (
                  <span className="text-red-600">{labels.failed}</span>
                ) : (
                  <p className="whitespace-pre-wrap">
                    {card.summaryText?.trim() ||
                      (props.lang === "bg" ? "Няма текст." : "No text yet.")}
                  </p>
                )}
              </div>

              <div className="mt-3 min-h-0 flex-1 border-t border-neutral-100 pt-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {labels.feedbackTitle}
                </p>
                <ul className="max-h-40 space-y-2 overflow-y-auto overscroll-y-contain pr-1 text-sm">
                  {props.feedbacks.length === 0 ? (
                    <li className="text-neutral-500">
                      {props.lang === "bg" ? "Няма отзиви." : "No feedback yet."}
                    </li>
                  ) : (
                    props.feedbacks.map((f, i) => (
                      <li
                        key={`${f.createdAt}-${i}`}
                        className={`rounded-lg px-2 py-1.5 ${toneChipClass(f.tone)}`}
                      >
                        <span className="text-[0.65rem] font-medium uppercase text-neutral-600">
                          {f.tone === "praise"
                            ? props.lang === "bg"
                              ? "похвала"
                              : "praise"
                            : props.lang === "bg"
                              ? "забележка"
                              : "remark"}
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap">{f.rawText}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}

      <PromptBodyModal
        open={promptModal != null}
        title={promptModal?.slug ?? ""}
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
