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
import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
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
  jobStatus: string;
  updatedAt: string | null;
};

type Props = {
  lang: HeaderLang;
  aggs: ExperimentAggCard[];
};

function pickViewerText(
  en: string | null,
  bg: string | null,
  lang: HeaderLang,
): string | null {
  return lang === "bg" ? bg : en;
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
    <Dialog open={props.open} onClose={props.onClose} className="relative z-[100]">
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

type CardLabels = {
  promptPrefix: string;
  empty: string;
  pending: string;
  copyCard: string;
  copiedCard: string;
  noText: string;
};

function AggregationModelCard(props: {
  card: ExperimentAggCard;
  lang: HeaderLang;
  labels: CardLabels;
  copiedCardId: string | null;
  setCopiedCardId: Dispatch<SetStateAction<string | null>>;
  onOpenPrompt: (slug: string, body: string) => void;
}) {
  const { card, lang, labels } = props;
  const viewerText = pickViewerText(card.summaryTextEn, card.summaryTextBg, lang)?.trim() ?? "";
  const isPending =
    card.jobStatus === "pending" ||
    card.langStatusEn === "pending" ||
    card.langStatusBg === "pending";

  async function copyCardText() {
    const body =
      viewerText || labels.noText;
    const text = [card.modelApiId, `${labels.promptPrefix} ${card.promptSlug}`, "", body].join(
      "\n",
    );
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
    props.setCopiedCardId(card.id);
    window.setTimeout(() => {
      props.setCopiedCardId((curr) => (curr === card.id ? null : curr));
    }, 1400);
  }

  return (
    <article className="relative flex w-72 max-w-full shrink-0 snap-center snap-always flex-col rounded-2xl border border-neutral-200/90 bg-white/95 p-3 pb-11 shadow-sm">
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
            onClick={() => props.onOpenPrompt(card.promptSlug, card.summaryPromptOutput)}
            className="max-w-[55%] shrink-0 pl-2 text-right text-sm font-medium text-[#1583ca] underline-offset-2 hover:underline [overflow-wrap:anywhere]"
          >
            <span className="text-neutral-500">{labels.promptPrefix}</span> {card.promptSlug}
          </button>
        </div>
      </header>

      <div className="relative min-h-[5.5rem] min-w-0 flex-1 text-sm leading-relaxed text-neutral-900">
        {isPending ? (
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
        ) : (
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {viewerText || labels.noText}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void copyCardText()}
        className="absolute bottom-2.5 right-2.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-700 shadow-sm hover:bg-neutral-50"
        aria-label={props.copiedCardId === card.id ? labels.copiedCard : labels.copyCard}
        title={props.copiedCardId === card.id ? labels.copiedCard : labels.copyCard}
      >
        {props.copiedCardId === card.id ? (
          <CheckIcon className="h-4 w-4 text-emerald-600" aria-hidden />
        ) : (
          <ClipboardDocumentIcon className="h-4 w-4" aria-hidden />
        )}
      </button>
    </article>
  );
}

export function SummaryAggregationDeck(props: Props) {
  const [promptModal, setPromptModal] = useState<{
    slug: string;
    body: string;
  } | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);

  const labels: CardLabels = useMemo(
    () =>
      props.lang === "bg"
        ? {
            promptPrefix: "Промпт:",
            empty: "Няма карти за показване.",
            pending: "Генериране…",
            copyCard: "Копирай",
            copiedCard: "Копирано",
            noText: "Няма текст.",
          }
        : {
            promptPrefix: "Prompt:",
            empty: "No aggregation cards yet.",
            pending: "Generating…",
            copyCard: "Copy",
            copiedCard: "Copied",
            noText: "No text yet.",
          },
    [props.lang],
  );

  return (
    <section className="min-w-0 w-full max-w-full space-y-3">
      {props.aggs.length === 0 ? (
        <p className="text-sm text-neutral-600">{labels.empty}</p>
      ) : (
        <ContainedHorizontalScrollStrip>
          {props.aggs.map((card) => (
            <AggregationModelCard
              key={card.id}
              card={card}
              lang={props.lang}
              labels={labels}
              copiedCardId={copiedCardId}
              setCopiedCardId={setCopiedCardId}
              onOpenPrompt={(slug, body) => setPromptModal({ slug, body })}
            />
          ))}
        </ContainedHorizontalScrollStrip>
      )}

      <PromptBodyModal
        open={promptModal != null}
        title={promptModal ? `${labels.promptPrefix} ${promptModal.slug}` : ""}
        body={promptModal?.body ?? ""}
        lang={props.lang}
        onClose={() => setPromptModal(null)}
      />
    </section>
  );
}
