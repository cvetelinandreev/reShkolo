import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  ArrowPathIcon,
  CheckIcon,
  ChevronDownIcon,
  ShareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/** Syncs with `useLayoutEffect` below — fixed picker panels sit flush under the header. */
const HEADER_BOTTOM_VAR = "--journal-header-bottom";

const pickerPanelClass =
  "fixed inset-x-0 z-40 max-h-[min(24rem,55vh)] overflow-y-auto overflow-x-hidden border-b border-neutral-200 bg-white shadow-md";
import { MedalIcon } from "./icons/MedalIcon";
import { NotebookIcon } from "./icons/NotebookIcon";
import { PersonIcon } from "./icons/PersonIcon";

const LANG_STORAGE_KEY = "reshkolo_ui_lang_v1";

/** Sentinel for the “New space” row inside the space Combobox (not a real space id). */
const NAV_NEW_SPACE = "__reshkolo_nav_new__";

export type HeaderLang = "bg" | "en";

export const headerCopy: Record<
  HeaderLang,
  {
    journal: string;
    feedbackFor: string;
    nameSpacePlaceholder: string;
    createSpace: string;
    newSpaceInList: string;
    shareSpace: string;
  }
> = {
  bg: {
    journal: "Дневник",
    feedbackFor: "Отзиви за",
    nameSpacePlaceholder: "Име...",
    createSpace: "Създай",
    newSpaceInList: "Добави",
    shareSpace: "Сподели връзката",
  },
  en: {
    journal: "Journal",
    feedbackFor: "Feedback for",
    nameSpacePlaceholder: "Name...",
    createSpace: "Create",
    newSpaceInList: "Add",
    shareSpace: "Share link",
  },
};

export type HeaderSpaceOption = {
  spaceId: string;
  shortCode: string;
  displayName: string;
};

type JournalAppHeaderProps = {
  lang: HeaderLang;
  onLangChange: (lang: HeaderLang) => void;
  /** URL is /new */
  isNewSpaceRoute: boolean;
  /** Draft name on /new */
  newNameDraft: string;
  onNewNameChange: (value: string) => void;
  onCreateSpace: () => void;
  createBusy: boolean;
  /** Current space when URL is /:slug */
  activeSpace: HeaderSpaceOption | null;
  spaces: HeaderSpaceOption[];
  onSelectSpace: (spaceId: string) => void;
  onNavigateNew: () => void;
  onShareSpace?: () => void;
  shareDisabled?: boolean;
};

const ROW_H = "h-11"; /* 2.75rem — medal box and control same height */

const pickerBorderClass = `flex w-full ${ROW_H} items-stretch gap-1 rounded-md border border-white/85 bg-transparent px-1 outline-none ring-offset-2 ring-offset-[#1583ca] focus-within:ring-2 focus-within:ring-white/70`;

/** Matches chevron / create icon buttons inside the space picker row. */
const pickerSlotBtnClass =
  "flex w-9 shrink-0 items-center justify-center rounded-sm text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-35";

/** `text-base` (16px) avoids iOS Safari zooming the viewport on focus. */
const inputLikeBaseClass =
  "min-w-0 flex-1 bg-transparent px-1.5 text-left text-base font-medium text-white outline-none";

const inputLikeClass = `${inputLikeBaseClass} placeholder:text-white/50`;

/** Stronger placeholder contrast — iOS Safari often washes out low-opacity placeholders. */
const newNameInputClass = `${inputLikeBaseClass} placeholder:text-white/90 placeholder:opacity-100 placeholder:font-normal`;

const fixedPanelStyle = { top: `var(${HEADER_BOTTOM_VAR})` } as const;

function useHeaderBottomCssVar(headerRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty(
        HEADER_BOTTOM_VAR,
        `${el.getBoundingClientRect().bottom}px`,
      );
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      root.style.removeProperty(HEADER_BOTTOM_VAR);
    };
  }, [headerRef]);
}

function useOutsideClick(
  enabled: boolean,
  panelRef: RefObject<HTMLElement | null>,
  triggerAreaRef: RefObject<HTMLElement | null>,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!enabled) return;

    function onDocMouseDown(e: MouseEvent) {
      const panel = panelRef.current;
      const triggerArea = triggerAreaRef.current;
      if (!panel || !triggerArea) return;
      const t = e.target as Node;
      if (panel.contains(t) || triggerArea.contains(t)) return;
      onOutside();
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [enabled, panelRef, triggerAreaRef, onOutside]);
}

function NewSpaceTrailingControl({
  createBusy,
  hasName,
  listOpen,
  hasSpaces,
  listId,
  createLabel,
  onClearName,
  onToggleList,
}: {
  createBusy: boolean;
  hasName: boolean;
  listOpen: boolean;
  hasSpaces: boolean;
  listId: string;
  createLabel: string;
  onClearName: () => void;
  onToggleList: () => void;
}) {
  if (createBusy) {
    return (
      <button
        type="button"
        disabled
        aria-label={createLabel}
        title={createLabel}
        aria-busy="true"
        className={pickerSlotBtnClass}
      >
        <ArrowPathIcon className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      </button>
    );
  }

  if (hasName) {
    return (
      <button
        type="button"
        className={pickerSlotBtnClass}
        aria-label="Clear name"
        title="Clear name"
        onClick={onClearName}
      >
        <XMarkIcon className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  if (!hasSpaces) return null;

  return (
    <button
      type="button"
      id={listId + "-trigger"}
      className={pickerSlotBtnClass}
      aria-expanded={listOpen}
      aria-haspopup="listbox"
      aria-controls={listOpen ? listId + "-listbox" : undefined}
      onClick={onToggleList}
    >
      <ChevronDownIcon
        className={`h-4 w-4 transition-transform ${listOpen ? "rotate-180" : ""}`}
        aria-hidden
      />
    </button>
  );
}

export function JournalAppHeader({
  lang,
  onLangChange,
  isNewSpaceRoute,
  newNameDraft,
  onNewNameChange,
  onCreateSpace,
  createBusy,
  activeSpace,
  spaces,
  onSelectSpace,
  onNavigateNew,
  onShareSpace,
  shareDisabled = false,
}: JournalAppHeaderProps) {
  const t = headerCopy[lang];
  const listId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const newPickerRootRef = useRef<HTMLDivElement>(null);
  const newPanelRef = useRef<HTMLDivElement>(null);
  const [newPickerListOpen, setNewPickerListOpen] = useState(false);

  useHeaderBottomCssVar(headerRef);

  useEffect(() => {
    if (!isNewSpaceRoute) setNewPickerListOpen(false);
  }, [isNewSpaceRoute]);

  useEffect(() => {
    if (spaces.length === 0) setNewPickerListOpen(false);
  }, [spaces.length]);

  useOutsideClick(
    newPickerListOpen,
    newPanelRef,
    newPickerRootRef,
    () => setNewPickerListOpen(false),
  );

  return (
    <header
      ref={headerRef}
      className="relative z-10 w-full shrink-0 bg-[#1583ca] text-white shadow-sm"
      role="banner"
    >
      <div className="w-full px-2 pb-3 pt-2">
        <div className="relative flex items-center justify-center py-1">
          <div className="absolute left-0 top-1/2 z-10 -translate-y-1/2">
            <LanguageSwitch lang={lang} onChange={onLangChange} />
          </div>
          <div className="flex items-center gap-2.5">
            <NotebookIcon className="h-7 w-7 shrink-0 text-white" />
            <span className="text-[17px] font-normal leading-tight tracking-tight">
              {t.journal}
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-stretch gap-1">
          <div
            className={`flex ${ROW_H} w-6 shrink-0 items-center justify-center text-white`}
            aria-hidden
          >
            <MedalIcon className="h-[18px] w-[18px] text-white" />
          </div>

          <span
            className={`flex ${ROW_H} shrink-0 items-center text-[15px] font-medium leading-tight`}
          >
            {t.feedbackFor}
          </span>

          <div className="min-w-0 flex-1">
            {isNewSpaceRoute ? (
              <NewSpaceNamePicker
                listId={listId}
                rootRef={newPickerRootRef}
                listOpen={newPickerListOpen}
                onListOpenChange={setNewPickerListOpen}
                t={t}
                newNameDraft={newNameDraft}
                onNewNameChange={onNewNameChange}
                onCreateSpace={onCreateSpace}
                createBusy={createBusy}
                spaces={spaces}
                pickerBorderClass={pickerBorderClass}
              />
            ) : (
              <ExistingSpaceCombobox
                listId={listId}
                t={t}
                activeSpace={activeSpace}
                spaces={spaces}
                onSelectSpace={onSelectSpace}
                onNavigateNew={onNavigateNew}
                pickerBorderClass={pickerBorderClass}
                inputLikeClass={inputLikeClass}
              />
            )}
          </div>

          <button
            type="button"
            disabled={shareDisabled || !onShareSpace}
            onClick={() => onShareSpace?.()}
            className={`flex ${ROW_H} w-9 shrink-0 items-center justify-center rounded-md text-white outline-none ring-offset-2 ring-offset-[#1583ca] transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-35`}
            aria-label={t.shareSpace}
          >
            <ShareIcon className="h-6 w-6" aria-hidden />
          </button>
        </div>
      </div>

      {isNewSpaceRoute && newPickerListOpen && spaces.length > 0 && (
        <div
          ref={newPanelRef}
          id={listId + "-listbox"}
          className={pickerPanelClass}
          style={fixedPanelStyle}
          role="listbox"
          aria-label={t.feedbackFor}
        >
          <SpaceListPanel
            t={t}
            spaces={spaces}
            activeSpaceId={null}
            showNewSpaceRow={false}
            onPick={(id) => {
              onSelectSpace(id);
              setNewPickerListOpen(false);
            }}
            onNew={() => setNewPickerListOpen(false)}
          />
        </div>
      )}
    </header>
  );
}

function NewSpaceNamePicker({
  listId,
  rootRef,
  listOpen,
  onListOpenChange,
  t,
  newNameDraft,
  onNewNameChange,
  onCreateSpace,
  createBusy,
  spaces,
  pickerBorderClass,
}: {
  listId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  t: (typeof headerCopy)["bg"];
  newNameDraft: string;
  onNewNameChange: (v: string) => void;
  onCreateSpace: () => void;
  createBusy: boolean;
  spaces: HeaderSpaceOption[];
  pickerBorderClass: string;
}) {
  const hasName = newNameDraft.trim().length > 0;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // `autoFocus` alone can be flaky when routing/redirecting to `/new`.
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={rootRef} className="w-full">
      <div className={pickerBorderClass}>
        <input
          ref={inputRef}
          id={listId + "-name"}
          type="text"
          autoFocus
          value={newNameDraft}
          onChange={(e) => onNewNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onCreateSpace();
            }
          }}
          placeholder={t.nameSpacePlaceholder}
          className={newNameInputClass}
          aria-label={t.feedbackFor}
          autoComplete="off"
          enterKeyHint="done"
        />
        <NewSpaceTrailingControl
          createBusy={createBusy}
          hasName={hasName}
          listOpen={listOpen}
          hasSpaces={spaces.length > 0}
          listId={listId}
          createLabel={t.createSpace}
          onClearName={() => {
            onNewNameChange("");
            onListOpenChange(false);
          }}
          onToggleList={() => onListOpenChange(!listOpen)}
        />
      </div>
    </div>
  );
}

function ExistingSpaceCombobox({
  listId,
  t,
  activeSpace,
  spaces,
  onSelectSpace,
  onNavigateNew,
  pickerBorderClass,
  inputLikeClass,
}: {
  listId: string;
  t: (typeof headerCopy)["bg"];
  activeSpace: HeaderSpaceOption | null;
  spaces: HeaderSpaceOption[];
  onSelectSpace: (spaceId: string) => void;
  onNavigateNew: () => void;
  pickerBorderClass: string;
  inputLikeClass: string;
}) {
  const selectedId = activeSpace?.spaceId ?? null;

  return (
    <Combobox
      value={selectedId}
      onChange={(id) => {
        if (id === NAV_NEW_SPACE) {
          onNavigateNew();
        } else if (id) {
          onSelectSpace(id);
        }
      }}
    >
      {({ open }) => (
        <div className="w-full">
          <div className={pickerBorderClass}>
            <ComboboxInput
              id={listId + "-input"}
              readOnly
              autoComplete="off"
              className={`${inputLikeClass} cursor-default select-none read-only:cursor-default`}
              aria-label={t.feedbackFor}
              displayValue={(id) =>
                id == null
                  ? ""
                  : (spaces.find((s) => s.spaceId === id)?.displayName ?? "")
              }
            />
            {spaces.length > 0 && (
              <ComboboxButton
                className={`${pickerSlotBtnClass} data-focus:bg-white/10`}
              >
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </ComboboxButton>
            )}
          </div>
          <ComboboxOptions
            modal={false}
            portal
            className={`${pickerPanelClass} empty:invisible`}
            style={fixedPanelStyle}
          >
            {spaces.map((s) => (
              <ComboboxOption
                key={s.spaceId}
                value={s.spaceId}
                className="flex cursor-pointer items-center gap-2 border-b border-neutral-100 px-3 py-2.5 text-left text-[15px] text-neutral-800 last:border-b-0 data-focus:bg-blue-50 data-selected:font-semibold data-selected:text-[#1583ca]"
              >
                <PersonIcon className="h-4 w-4 shrink-0" />
                {s.displayName}
              </ComboboxOption>
            ))}
            <ComboboxOption
              value={NAV_NEW_SPACE}
              className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-[15px] text-[#1583ca] data-focus:bg-blue-50"
            >
              + {t.newSpaceInList}
            </ComboboxOption>
          </ComboboxOptions>
        </div>
      )}
    </Combobox>
  );
}

function SpaceListPanel({
  t,
  spaces,
  activeSpaceId,
  onPick,
  onNew,
  showNewSpaceRow,
}: {
  t: (typeof headerCopy)["bg"];
  spaces: HeaderSpaceOption[];
  activeSpaceId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  showNewSpaceRow: boolean;
}) {
  return (
    <ul className="max-h-56 overflow-y-auto">
      {spaces.map((s) => (
        <li key={s.spaceId} className="border-b border-neutral-100 last:border-b-0">
          <button
            type="button"
            role="option"
            onClick={() => onPick(s.spaceId)}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] ${
              s.spaceId === activeSpaceId
                ? "font-semibold text-[#1583ca]"
                : "text-neutral-800 hover:bg-blue-50"
            }`}
          >
            <PersonIcon className="h-4 w-4 shrink-0" />
            {s.displayName}
          </button>
        </li>
      ))}
      {showNewSpaceRow && (
        <li>
          <button
            type="button"
            role="option"
            onClick={onNew}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] text-[#1583ca] hover:bg-blue-50"
          >
            + {t.newSpaceInList}
          </button>
        </li>
      )}
    </ul>
  );
}

export function readStoredHeaderLang(): HeaderLang {
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    if (raw === "en" || raw === "bg") return raw;
  } catch {
    /* ignore */
  }
  return "bg";
}

export function persistHeaderLang(lang: HeaderLang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

function LanguageSwitch({
  lang,
  onChange,
}: {
  lang: HeaderLang;
  onChange: (next: HeaderLang) => void;
}) {
  return (
    <div
      className="flex rounded-md border border-white/50 bg-white/10 p-0.5 text-[11px] font-medium"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => onChange("bg")}
        className={`rounded px-2 py-1 transition-colors ${
          lang === "bg"
            ? "bg-white text-[#1583ca]"
            : "text-white/90 hover:bg-white/15"
        }`}
      >
        БГ
      </button>
      <button
        type="button"
        onClick={() => onChange("en")}
        className={`rounded px-2 py-1 transition-colors ${
          lang === "en"
            ? "bg-white text-[#1583ca]"
            : "text-white/90 hover:bg-white/15"
        }`}
      >
        EN
      </button>
    </div>
  );
}
