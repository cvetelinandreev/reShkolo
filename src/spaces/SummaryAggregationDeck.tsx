import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useState, type ReactNode } from "react";
import type { HeaderLang } from "../shared/components/JournalAppHeader";

export type ExperimentAggCard = {
  id: string;
  promptSlug: string;
  summaryPromptOutput: string;
  modelSlug: string;
  modelDisplayName: string;
  modelApiId: string;
  summaryTextEn: string | null;
  summaryTextBg: string | null;
  langStatusEn: string;
  langStatusBg: string;
  jobError: string | null;
  jobStatus: string;
  updatedAt: string | null;
};

type Props = {
  lang: HeaderLang;
  aggs: ExperimentAggCard[];
};

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

function langText(card: ExperimentAggCard, lang: HeaderLang): string | null {
  return lang === "bg" ? card.summaryTextBg : card.summaryTextEn;
}

function langStatus(card: ExperimentAggCard, lang: HeaderLang): string {
  return lang === "bg" ? card.langStatusBg : card.langStatusEn;
}

function aggregationCardFailureText(
  card: ExperimentAggCard,
  lang: HeaderLang,
  failedFallback: string,
): string {
  const fromJob = card.jobError?.trim();
  if (fromJob) return fromJob;
  const fromSummary = langText(card, lang)?.trim();
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
  const closeAria = props.lang === "bg" ? "Затвори" : "Close";
  return (
    <Dialog open={props.open} onClose={() => props.onClose()} className="relative z-[100]">
      <DialogBackdrop className="fixed inset-0 bg-black/45" transition={false} />
      <div className="fixed inset-0 flex flex-col px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3 sm:pb-3 sm:pt-3">
        <DialogPanel className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <button
            type="button"
            onClick={props.onClose}
            className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={closeAria}
          >
            <XMarkIcon className="h-5 w-5" aria-hidden />
          </button>
          <div className="sticky top-0 z-10 shrink-0 border-b border-neutral-200 bg-white px-4 py-3 pr-14">
            <DialogTitle
              className="min-w-0 truncate text-sm font-medium text-neutral-900"
              title={props.title}
            >
              {props.title}
            </DialogTitle>
          </div>
          <pre className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain whitespace-pre-wrap p-4 text-sm leading-relaxed text-neutral-800">
            {props.body}
          </pre>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export function SummaryAggregationDeck(props: Props) {
  const [promptModal, setPromptModal] = useState<{
    slug: string;
    body: string;
  } | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);

  const labels = useMemo(
    () =>
      props.lang === "bg"
        ? {
            deckTitle: "Обобщение",
            promptPrefix: "Промпт:",
            empty: "Няма карти за показване.",
            pending: "Генериране…",
            failedFallback: "Неуспех за тази комбинация.",
            copyCard: "Копирай",
            copiedCard: "Копирано",
          }
        : {
            deckTitle: "Summaries",
            promptPrefix: "Prompt:",
            empty: "No aggregation cards yet.",
            pending: "Generating…",
            failedFallback: "This combination failed.",
            copyCard: "Copy",
            copiedCard: "Copied",
          },
    [props.lang],
  );

  function cardBodyText(card: ExperimentAggCard): string {
    const st = langStatus(card, props.lang);
    const txt = langText(card, props.lang)?.trim();
    if (st === "pending") return labels.pending;
    if (st === "failed") {
      return aggregationCardFailureText(card, props.lang, labels.failedFallback);
    }
    return txt || (props.lang === "bg" ? "Няма текст." : "No text yet.");
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
      <h2 className="text-sm font-medium tracking-wide text-neutral-700">{labels.deckTitle}</h2>

      {props.aggs.length === 0 ? (
        <p className="text-sm text-neutral-600">{labels.empty}</p>
      ) : (
        <ContainedHorizontalScrollStrip>
          {props.aggs.map((card) => (
            <article
              key={card.id}
              className="relative flex w-72 max-w-full shrink-0 snap-center snap-always flex-col rounded-2xl border border-neutral-200/90 bg-white/95 p-3 pb-11 shadow-sm"
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
                      setPromptModal({
                        slug: card.promptSlug,
                        body: card.summaryPromptOutput,
                      })
                    }
                    className="max-w-[55%] shrink-0 pl-2 text-right text-sm font-medium text-[#1583ca] underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                  >
                    <span className="text-neutral-500">{labels.promptPrefix}</span>{" "}
                    {card.promptSlug}
                  </button>
                </div>
              </header>

              <div className="relative min-h-[5.5rem] min-w-0 flex-1 text-sm leading-relaxed text-neutral-900">
                {langStatus(card, props.lang) === "pending" ? (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 py-4"
                    role="status"
                    aria-live="polite"
                  >
                    <ArrowPathIcon
                      className="h-8 w-8 shrink-0 animate-spin text-[#1583ca]"
                      aria-hidden
                    />
                    <span className="text-xs text-neutral-500">{labels.pending}</span>
                  </div>
                ) : langStatus(card, props.lang) === "failed" ? (
                  <p className="whitespace-pre-wrap break-words text-sm text-red-700 [overflow-wrap:anywhere]">
                    {aggregationCardFailureText(card, props.lang, labels.failedFallback)}
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {langText(card, props.lang)?.trim() ||
                      (props.lang === "bg" ? "Няма текст." : "No text yet.")}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void copyCardText(card)}
                className="absolute bottom-2.5 right-2.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-700 shadow-sm hover:bg-neutral-50"
                aria-label={copiedCardId === card.id ? labels.copiedCard : labels.copyCard}
                title={copiedCardId === card.id ? labels.copiedCard : labels.copyCard}
              >
                {copiedCardId === card.id ? (
                  <CheckIcon className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <ClipboardDocumentIcon className="h-4 w-4" aria-hidden />
                )}
              </button>
            </article>
          ))}
        </ContainedHorizontalScrollStrip>
      )}

      <PromptBodyModal
        open={promptModal != null}
        title={
          promptModal ? `${labels.promptPrefix} ${promptModal.slug}` : ""
        }
        body={promptModal?.body ?? ""}
        lang={props.lang}
        onClose={() => setPromptModal(null)}
      />
    </section>
  );
}
