import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  createSpace,
  getSpaceSummary,
  joinSpace,
  submitFeedback,
} from "wasp/client/operations";
import { Button } from "../shared/components/Button";
import { Snackbar } from "../shared/components/Snackbar";
import { OpenBookIcon } from "../shared/components/icons/OpenBookIcon";
import {
  JournalAppHeader,
  persistHeaderLang,
  readStoredHeaderLang,
  type HeaderLang,
  type HeaderSpaceOption,
} from "../shared/components/JournalAppHeader";

const STORAGE_KEY = "reshkolo_spaces_v1";

type LocalSpace = {
  spaceId: string;
  shortCode: string;
  name: string | null;
  contributorHandleId: string;
};

function loadSpaces(): LocalSpace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalSpace[]) : [];
  } catch {
    return [];
  }
}

function saveSpaces(spaces: LocalSpace[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces));
}

function displayNameForSpace(s: LocalSpace): string {
  const n = s.name?.trim();
  if (n) return n;
  return s.shortCode;
}

function formatCreateSpaceFailure(error: unknown, lang: HeaderLang): string {
  const base =
    lang === "bg"
      ? "Неуспешно създаване на пространство."
      : "Could not create space.";
  const lanHint =
    lang === "bg"
      ? " Ако ползвате телефон или друг компютър: в `.env.client` задайте REACT_APP_API_URL=http://<IP-на-Mac>:3001 и рестартирайте wasp start."
      : " If you use a phone or another PC: set `REACT_APP_API_URL=http://<YOUR_MAC_LAN_IP>:3001` in `.env.client`, then restart `wasp start` (see `.env.client.example`).";

  const msg = error instanceof Error ? error.message : "";

  const looksUnreachable =
    /network|fetch failed|load failed|failed to fetch|ECONNREFUSED|ERR_NETWORK|Network Error/i.test(
      msg,
    );

  if (looksUnreachable) {
    return base + lanHint;
  }

  if (msg && msg !== "Network Error") {
    return `${base} (${msg})`;
  }

  return base;
}

export function SpacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ slug?: string; shortCode?: string }>();

  const [spaces, setSpaces] = useState<LocalSpace[]>(() => loadSpaces());
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newNameDraft, setNewNameDraft] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [lang, setLang] = useState<HeaderLang>(() => readStoredHeaderLang());

  const [summaryPayload, setSummaryPayload] = useState<Awaited<
    ReturnType<typeof getSpaceSummary>
  > | null>(null);

  const slugResolveGen = useRef(0);

  const isNewRoute = location.pathname === "/new";
  const legacyShortCode = params.shortCode;
  const pathSlug = params.slug;

  useEffect(() => {
    persistHeaderLang(lang);
  }, [lang]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function showToast(message: string, durationMs = 4800) {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, durationMs);
  }

  useEffect(() => {
    saveSpaces(spaces);
  }, [spaces]);

  useEffect(() => {
    if (location.pathname !== "/") return;
    navigate("/new", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    setSlugError(null);
  }, [pathSlug]);

  useEffect(() => {
    if (!legacyShortCode) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setJoinError(null);
      try {
        const res = await joinSpace({ shortCode: legacyShortCode });
        if (cancelled) return;
        setSpaces((prev) => {
          const without = prev.filter((s) => s.spaceId !== res.spaceId);
          return [
            ...without,
            {
              spaceId: res.spaceId,
              shortCode: res.shortCode,
              name: res.spaceName,
              contributorHandleId: res.contributorHandleId,
            },
          ];
        });
        setActiveSpaceId(res.spaceId);
        navigate(`/${res.shortCode}`, { replace: true });
      } catch {
        if (!cancelled) setJoinError("Could not join this space. Check the code.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [legacyShortCode, navigate]);

  useEffect(() => {
    if (isNewRoute || legacyShortCode) {
      return;
    }
    if (!pathSlug) {
      return;
    }
    const code = pathSlug.toUpperCase();
    const local = spaces.find((s) => s.shortCode === code);
    if (local) {
      setActiveSpaceId(local.spaceId);
      setSlugError(null);
      return;
    }

    const myGen = ++slugResolveGen.current;
    let cancelled = false;

    void (async () => {
      setBusy(true);
      setSlugError(null);
      try {
        const res = await joinSpace({ shortCode: code });
        if (cancelled || myGen !== slugResolveGen.current) return;
        setSpaces((prev) => {
          const without = prev.filter((s) => s.spaceId !== res.spaceId);
          return [
            ...without,
            {
              spaceId: res.spaceId,
              shortCode: res.shortCode,
              name: res.spaceName,
              contributorHandleId: res.contributorHandleId,
            },
          ];
        });
        setActiveSpaceId(res.spaceId);
      } catch {
        if (!cancelled && myGen === slugResolveGen.current) {
          setSlugError("Unknown or invalid space link.");
        }
      } finally {
        if (!cancelled && myGen === slugResolveGen.current) {
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNewRoute, legacyShortCode, pathSlug, spaces]);

  useEffect(() => {
    if (isNewRoute) {
      setActiveSpaceId(null);
    }
  }, [isNewRoute]);

  const activeSpace = useMemo(
    () => spaces.find((s) => s.spaceId === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );

  const headerSpaces: HeaderSpaceOption[] = useMemo(
    () =>
      spaces.map((s) => ({
        spaceId: s.spaceId,
        shortCode: s.shortCode,
        displayName: displayNameForSpace(s),
      })),
    [spaces],
  );

  const activeHeaderSpace: HeaderSpaceOption | null = activeSpace
    ? {
        spaceId: activeSpace.spaceId,
        shortCode: activeSpace.shortCode,
        displayName: displayNameForSpace(activeSpace),
      }
    : null;

  const praiseCount = summaryPayload?.classificationMeta.positiveCount ?? 0;
  const remarksCount = summaryPayload?.classificationMeta.negativeCount ?? 0;

  useEffect(() => {
    if (!activeSpaceId) {
      setSummaryPayload(null);
      return;
    }
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const data = await getSpaceSummary({ spaceId: activeSpaceId });
        if (!cancelled) setSummaryPayload(data);
      } catch {
        if (!cancelled) setSummaryPayload(null);
      }
    };

    void fetchOnce();
    const id = window.setInterval(() => {
      void fetchOnce();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeSpaceId]);

  async function handleCreateSpace() {
    const name = newNameDraft.trim();
    if (!name) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await createSpace({ name });
      const entry: LocalSpace = {
        spaceId: res.spaceId,
        shortCode: res.shortCode,
        name: name || null,
        contributorHandleId: res.contributorHandleId,
      };
      setSpaces((prev) => [...prev.filter((s) => s.spaceId !== entry.spaceId), entry]);
      setActiveSpaceId(entry.spaceId);
      setNewNameDraft("");
      setStatus(null);
      navigate(`/${res.shortCode}`, { replace: true });
    } catch (e) {
      setStatus(formatCreateSpaceFailure(e, lang));
    } finally {
      setBusy(false);
    }
  }

  function handleSelectSpace(spaceId: string) {
    const s = spaces.find((x) => x.spaceId === spaceId);
    if (!s) return;
    setActiveSpaceId(spaceId);
    navigate(`/${s.shortCode}`);
  }

  async function handleSubmitFeedback() {
    if (!activeSpace || !feedbackText.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await submitFeedback({
        spaceId: activeSpace.spaceId,
        contributorHandleId: activeSpace.contributorHandleId,
        text: feedbackText,
        sourceType: "text",
      });
      setFeedbackText("");
      setStatus("Feedback submitted.");
      const data = await getSpaceSummary({ spaceId: activeSpace.spaceId });
      setSummaryPayload(data);
    } catch {
      setStatus("Submit failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyTextWithFallback(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Continue to legacy fallback below.
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function handleHeaderShare() {
    if (!activeSpace) return;
    const url = `${window.location.origin}/${activeSpace.shortCode}`;
    const title = "reShkolo";
    const text =
      lang === "bg"
        ? `Пространство (${activeSpace.shortCode})`
        : `Space (${activeSpace.shortCode})`;

    try {
      if (typeof navigator.share === "function") {
        // Prefer a minimal payload for best iOS/Safari compatibility.
        await navigator.share({ url, title, text });
        return;
      }

      const copied = await copyTextWithFallback(url);
      if (copied) {
        showToast(
          lang === "bg"
            ? "Връзката е копирана. Можете да я споделите в съобщение."
            : "The link has been copied. You can share it in a message.",
        );
      } else {
        showToast(
          lang === "bg"
            ? "Копирането на връзката за споделяне не успя. Можете да споделите адресът на страницата с браузъра си."
            : "Copying the share link failed. You can share the page address using your browser.",
        );
      }
    } catch (err) {
      // User canceled the native share sheet -> don't show an error.
      if (err instanceof DOMException && err.name === "AbortError") return;

      const copied = await copyTextWithFallback(url);
      if (copied) {
        showToast(
          lang === "bg" ? "Връзката е копирана." : "The link has been copied.",
        );
      } else {
        showToast(
          lang === "bg"
            ? "Неуспешно споделяне на връзката."
            : "Could not share the link.",
        );
      }
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-50">
      <JournalAppHeader
        lang={lang}
        onLangChange={setLang}
        isNewSpaceRoute={isNewRoute}
        newNameDraft={newNameDraft}
        onNewNameChange={setNewNameDraft}
        onCreateSpace={handleCreateSpace}
        createBusy={busy}
        activeSpace={activeHeaderSpace}
        spaces={headerSpaces}
        onSelectSpace={handleSelectSpace}
        onNavigateNew={() => navigate("/new")}
        onShareSpace={() => void handleHeaderShare()}
        shareDisabled={!activeSpace}
      />

      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-lg flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-10 pt-3 font-light">
        {(joinError || slugError) && (
          <p className="text-sm text-red-600">{joinError ?? slugError}</p>
        )}

        {isNewRoute && (
          <p className="text-sm text-neutral-600">
            {lang === "bg"
              ? "Въведете име в полето „Отзиви за“, натиснете Създай или Enter, след което споделете линка."
              : "Type a name in “Feedback for”, press Create or Enter, then share the link."}
          </p>
        )}

        {activeSpace && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <OpenBookIcon className="h-6 w-6 shrink-0 object-contain" />
              <h1 className="text-xl font-medium tracking-wide text-neutral-900">
                {lang === "bg" ? "ОБЩО" : "OVERVIEW"}
              </h1>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2 text-lg"
              style={{ color: "#9C9C9C" }}
            >
              <div className="flex items-center gap-2">
                <span>{lang === "bg" ? "Похвали" : "Praise"}</span>
                <span
                  className="inline-flex aspect-square min-h-[2.1em] min-w-[2.1em] items-center justify-center rounded-full text-base font-normal tabular-nums text-white"
                  style={{ backgroundColor: "#A5BB4F" }}
                >
                  {praiseCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>{lang === "bg" ? "Забележки" : "Remarks"}</span>
                <span
                  className="inline-flex aspect-square min-h-[2.1em] min-w-[2.1em] items-center justify-center rounded-full text-base font-normal tabular-nums text-white"
                  style={{ backgroundColor: "#E68C6C" }}
                >
                  {remarksCount}
                </span>
              </div>
              {summaryPayload?.jobStatus === "pending" ? (
                <span>{lang === "bg" ? "обновяване…" : "updating…"}</span>
              ) : null}
            </div>

            {!summaryPayload && <p className="text-sm text-neutral-600">…</p>}
            {summaryPayload && (
              <div className="space-y-3 text-sm">
                <div className="whitespace-pre-wrap text-neutral-900">
                  {summaryPayload.summary ?? (lang === "bg" ? "Още няма обобщение." : "No summary yet.")}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h2 className="text-base font-medium text-neutral-900">
                {lang === "bg" ? "Вашият отзив" : "Your feedback"}
              </h2>
              <textarea
                className="w-full min-h-32 rounded-md border border-neutral-300 bg-white px-3 py-2 text-base font-light text-neutral-900"
                placeholder={lang === "bg" ? "Напишете отзив…" : "Write feedback…"}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              />
              <div>
                <Button onClick={handleSubmitFeedback} disabled={busy || !feedbackText.trim()}>
                  {lang === "bg" ? "Изпрати" : "Submit"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {status && <p className="text-sm text-neutral-700">{status}</p>}
      </div>

      <Snackbar open={toast != null}>
        <span className="block whitespace-pre-wrap">{toast}</span>
      </Snackbar>
    </div>
  );
}
