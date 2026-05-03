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
} from "@heroicons/react/24/outline";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { saveSpaceSummaryPrompt } from "wasp/client/operations";
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
  spaceId: string;
  contributorHandleId: string;
  isPromptOwner: boolean;
  onPromptSaved: () => void | Promise<void>;
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

function PromptEditorModal(props: {
  open: boolean;
  title: string;
  slug: string;
  initialBody: string;
  lang: HeaderLang;
  isOwner: boolean;
  spaceId: string;
  contributorHandleId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(props.initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!props.open) return;
    setDraft(props.initialBody);
    setError(null);
  }, [props.open, props.initialBody]);

  useEffect(() => {
    if (!props.open) {
      setKeyboardInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    function measure() {
      const v = window.visualViewport;
      if (!v) return;
      const obscured = Math.max(0, window.innerHeight - v.offsetTop - v.height);
      setKeyboardInset(obscured);
    }

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [props.open]);

  const discardLabel = props.lang === "bg" ? "Откажи" : "Discard";
  const displayLang = props.lang === "bg" ? "bg" : "en";
  const saveDisabled = !props.isOwner || saving;

  async function handleSave() {
    if (saveDisabled) return;
    const body = draft.trimEnd();
    setSaving(true);
    setError(null);
    try {
      await saveSpaceSummaryPrompt({
        spaceId: props.spaceId,
        contributorHandleId: props.contributorHandleId,
        promptSlug: props.slug,
        summaryPromptOutput: body,
        displayLang,
      });
      props.onClose();
      await props.onSaved();
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim().length > 0
          ? e.message
          : props.lang === "bg"
            ? "Неуспешно записване."
            : "Could not save.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = props.lang === "bg" ? "Запази" : "Save";
  const savingLabel = props.lang === "bg" ? "Записване…" : "Saving…";

  const outerPadBottomStyle =
    keyboardInset > 0 ? ({ paddingBottom: keyboardInset } as const) : undefined;
  const outerPadBottomClass =
    keyboardInset === 0 ? "pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "";

  return (
    <Dialog open={props.open} onClose={props.onClose} className="relative z-[100]">
      <DialogBackdrop className="fixed inset-0 bg-black/45" transition={false} />
      <div
        className={`fixed inset-0 flex flex-col pt-[max(0.5rem,env(safe-area-inset-top))] ${outerPadBottomClass}`}
        style={outerPadBottomStyle}
      >
        <DialogPanel className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white shadow-none ring-0">
          <DialogTitle className="sr-only">{props.title}</DialogTitle>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <textarea
                value={draft}
                readOnly={!props.isOwner}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                aria-label={props.title}
                autoCapitalize="none"
                autoCorrect="off"
                className={`touch-manipulation box-border min-h-0 w-full flex-1 resize-none overflow-y-auto overscroll-y-contain border-0 bg-transparent px-4 py-3 text-[16px] leading-relaxed outline-none ring-0 focus:outline-none focus:ring-2 focus:ring-[#1583ca]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1583ca]/30 ${
                  props.isOwner ? "text-neutral-800" : "cursor-default bg-neutral-50 text-neutral-700"
                }`}
              />
            </div>

            {error ? (
              <div className="shrink-0 px-4 py-2 text-center">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            ) : null}

            <div className="flex w-full shrink-0 items-center justify-end gap-3 border-t border-neutral-200 bg-white px-4 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose();
                }}
                className="inline-flex h-11 min-w-[5.5rem] shrink-0 items-center justify-center rounded-xl px-4 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {discardLabel}
              </button>
              <button
                type="button"
                disabled={saveDisabled}
                onClick={() => void handleSave()}
                className="inline-flex h-11 min-w-[5.5rem] shrink-0 items-center justify-center rounded-xl bg-[#1583ca] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#1478b8] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? savingLabel : saveLabel}
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

type DeckMode = "experimental" | "fixed";

const FIXED_MODE_PROVIDER_SLUG = "anthropic";

function readDeckMode(): DeckMode {
  const raw = import.meta.env.REACT_APP_DECK_MODE;
  return typeof raw === "string" && raw.trim().toLowerCase() === "fixed"
    ? "fixed"
    : "experimental";
}

type CardLabels = {
  promptLinkLabel: string;
  promptModalTitle: string;
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
    lang === "bg" ? card.langStatusBg === "pending" : card.langStatusEn === "pending";

  async function copyCardText() {
    const body = viewerText || labels.noText;
    const text = [card.modelApiId, `${labels.promptLinkLabel} (${card.promptSlug})`, "", body].join(
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
            className="shrink-0 pl-2 text-right text-sm font-medium lowercase text-[#1583ca] underline-offset-2 hover:underline [overflow-wrap:anywhere]"
          >
            {labels.promptLinkLabel}
          </button>
        </div>
      </header>

      <div className="relative min-h-[5.5rem] min-w-0 flex-1 text-sm leading-relaxed text-neutral-900">
        {isPending ? (
          <div
            className="absolute inset-0 flex items-center justify-center py-4"
            role="status"
            aria-live="polite"
            aria-label={labels.pending}
          >
            <ArrowPathIcon
              className="h-8 w-8 shrink-0 animate-spin text-[#1583ca]"
              aria-hidden
            />
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

function FixedModeSummary(props: {
  card: ExperimentAggCard;
  lang: HeaderLang;
  labels: CardLabels;
  onOpenPrompt: (slug: string, body: string) => void;
}) {
  const { card, lang, labels } = props;
  const viewerText = pickViewerText(card.summaryTextEn, card.summaryTextBg, lang)?.trim() ?? "";
  const isPending =
    lang === "bg" ? card.langStatusBg === "pending" : card.langStatusEn === "pending";

  return (
    <div className="min-w-0 w-full">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => props.onOpenPrompt(card.promptSlug, card.summaryPromptOutput)}
          className="text-sm font-medium lowercase text-[#1583ca] underline-offset-2 hover:underline"
        >
          {labels.promptLinkLabel}
        </button>
      </div>
      {isPending ? (
        <div
          className="flex items-center justify-center py-4"
          role="status"
          aria-live="polite"
          aria-label={labels.pending}
        >
          <ArrowPathIcon
            className="h-8 w-8 shrink-0 animate-spin text-[#1583ca]"
            aria-hidden
          />
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-900 [overflow-wrap:anywhere]">
          {viewerText || labels.noText}
        </p>
      )}
    </div>
  );
}

export function SummaryAggregationDeck(props: Props) {
  const [promptModal, setPromptModal] = useState<{
    slug: string;
    body: string;
  } | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const mode = useMemo<DeckMode>(() => readDeckMode(), []);

  const labels: CardLabels = useMemo(
    () =>
      props.lang === "bg"
        ? {
            promptLinkLabel: "промпт",
            promptModalTitle: "Промпт",
            empty: "Няма карти за показване.",
            pending: "Генериране…",
            copyCard: "Копирай",
            copiedCard: "Копирано",
            noText: "Няма текст.",
          }
        : {
            promptLinkLabel: "prompt",
            promptModalTitle: "Prompt",
            empty: "No aggregation cards yet.",
            pending: "Generating…",
            copyCard: "Copy",
            copiedCard: "Copied",
            noText: "No text yet.",
          },
    [props.lang],
  );

  const fixedCard =
    mode === "fixed"
      ? props.aggs.find((c) => c.modelSlug === FIXED_MODE_PROVIDER_SLUG) ?? null
      : null;

  return (
    <section className="min-w-0 w-full max-w-full space-y-3">
      {mode === "fixed" ? (
        fixedCard ? (
          <FixedModeSummary
            card={fixedCard}
            lang={props.lang}
            labels={labels}
            onOpenPrompt={(slug, body) => setPromptModal({ slug, body })}
          />
        ) : (
          <p className="text-sm text-neutral-600">{labels.empty}</p>
        )
      ) : props.aggs.length === 0 ? (
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

      <PromptEditorModal
        open={promptModal != null}
        title={promptModal ? labels.promptModalTitle : ""}
        slug={promptModal?.slug ?? ""}
        initialBody={promptModal?.body ?? ""}
        lang={props.lang}
        isOwner={props.isPromptOwner}
        spaceId={props.spaceId}
        contributorHandleId={props.contributorHandleId}
        onClose={() => setPromptModal(null)}
        onSaved={props.onPromptSaved}
      />
    </section>
  );
}
