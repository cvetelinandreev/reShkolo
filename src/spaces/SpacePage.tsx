import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  createSpace,
  getSpaceSummary,
  joinSpace,
  submitFeedback,
} from "wasp/client/operations";
import { SummaryAggregationDeck } from "./SummaryAggregationDeck";
import { Snackbar } from "../shared/components/Snackbar";
import { OpenBookIcon } from "../shared/components/icons/OpenBookIcon";
import { PaperPlaneIcon } from "../shared/components/icons/PaperPlaneIcon";
import {
  JournalAppHeader,
  persistHeaderLang,
  readStoredHeaderLang,
  type HeaderLang,
  type HeaderSpaceOption,
} from "../shared/components/JournalAppHeader";
import {
  isAppFeedbackSpaceShortCode,
  joinAppFeedbackSpace,
} from "./appFeedbackSpace";

const STORAGE_KEY = "reshkolo_spaces_v1";

type SpaceSummaryPayload = Awaited<ReturnType<typeof getSpaceSummary>>;

/** True when space job finished and every card has finished the viewer's language (ready or failed). */
function summariesReadyForDisplayLang(
  data: SpaceSummaryPayload,
  lang: HeaderLang,
): boolean {
  if (data.jobStatus === "pending") return false;
  for (const a of data.experimentAggregations) {
    const st = lang === "bg" ? a.langStatusBg : a.langStatusEn;
    if (st === "pending") return false;
  }
  return true;
}

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

function isWaspHttpError(
  err: unknown,
): err is { statusCode: number; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  );
}

function isLikelyNetworkFailure(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  return (
    /network|fetch failed|load failed|ECONNREFUSED|ERR_NETWORK|timed out|timeout/i.test(
      msg,
    ) || msg === "Network Error"
  );
}

let lastGetSpaceSummaryConsoleLogAt = 0;

function logGetSpaceSummaryFailureThrottled(err: unknown) {
  const now = Date.now();
  if (now - lastGetSpaceSummaryConsoleLogAt < 5000) return;
  lastGetSpaceSummaryConsoleLogAt = now;
  console.error("[SpacePage] getSpaceSummary failed", err);
}

/** Maps Wasp client / axios failures to user-visible copy (and logs for debugging). */
function formatSummaryLoadFailure(lang: HeaderLang, err: unknown): string {
  logGetSpaceSummaryFailureThrottled(err);

  if (isWaspHttpError(err)) {
    const { statusCode, message } = err;
    const detail =
      message && message.length > 0 && message.length < 220 ? ` — ${message}` : "";

    if (statusCode === 404) {
      return lang === "bg"
        ? "Пространството не е намерено на сървъра (възможно е нулирана базата или остарял идентификатор в браузъра). Отворете отново поканата или създайте ново пространство."
        : "Space not found on the server (the database may have been reset, or this browser still has an old space id). Open a fresh invite link or create a new space.";
    }

    if (statusCode === 500 && /summary missing/i.test(message)) {
      return lang === "bg"
        ? "Липсват записи за обобщение за това пространство (несъответствие в базата). Изпълнете миграции: wasp db migrate-dev"
        : "Summary records are missing for this space (database mismatch). Run: wasp db migrate-dev";
    }

    return (
      (lang === "bg"
        ? "Неуспешно зареждане на обобщенията от сървъра."
        : "The server could not return summaries.") +
      ` (HTTP ${statusCode})` +
      detail
    );
  }

  if (isLikelyNetworkFailure(err)) {
    return lang === "bg"
      ? "Няма връзка с API сървъра. Пуснете wasp start на машината с проекта. От телефон задайте REACT_APP_API_URL=http://<IP-на-Mac>:3001 в .env.client и рестартирайте wasp start."
      : "Cannot reach the API server. Run wasp start on the dev machine. From a phone, set REACT_APP_API_URL=http://<YOUR_MAC_LAN_IP>:3001 in .env.client and restart wasp start.";
  }

  const fallback =
    err instanceof Error && err.message.trim().length > 0 && err.message.length < 160
      ? ` (${err.message.trim()})`
      : "";
  return (
    (lang === "bg"
      ? "Неуспешно зареждане на обобщенията. Вижте конзолата на браузъра (F12) за подробности."
      : "Could not load summaries. See the browser console (F12) for details.") + fallback
  );
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

  const [summaryPayload, setSummaryPayload] = useState<SpaceSummaryPayload | null>(
    null,
  );
  const [summaryLoadError, setSummaryLoadError] = useState<string | null>(null);
  /** >0 only after this client submits feedback; drives polling until summaries catch up. */
  const [summaryPollNonce, setSummaryPollNonce] = useState(0);

  const slugResolveGen = useRef(0);
  const appFeedbackJoinStoppedRef = useRef(false);
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

  function dismissToast() {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
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
        const res = await joinSpace({
          shortCode: legacyShortCode,
          displayLang: lang,
        });
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
  }, [legacyShortCode, navigate, lang]);

  useEffect(() => {
    if (isNewRoute || legacyShortCode) {
      return;
    }
    if (!pathSlug) {
      return;
    }
    const code = pathSlug.trim().toLowerCase();
    const local = spaces.find((s) => s.shortCode.trim().toLowerCase() === code);
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
        const res = await joinSpace({ shortCode: code, displayLang: lang });
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
  }, [isNewRoute, legacyShortCode, pathSlug, spaces, lang]);

  useEffect(() => {
    if (isNewRoute) {
      setActiveSpaceId(null);
    }
  }, [isNewRoute]);

  const activeSpace = useMemo(
    () => spaces.find((s) => s.spaceId === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );

  const userSpaces = useMemo(
    () => spaces.filter((s) => !isAppFeedbackSpaceShortCode(s.shortCode)),
    [spaces],
  );

  const appFeedbackLocalSpace = useMemo(
    () => spaces.find((s) => isAppFeedbackSpaceShortCode(s.shortCode)) ?? null,
    [spaces],
  );

  useEffect(() => {
    if (appFeedbackLocalSpace || appFeedbackJoinStoppedRef.current) return;

    void joinAppFeedbackSpace(lang).then((res) => {
      if (!res) {
        appFeedbackJoinStoppedRef.current = true;
        return;
      }
      setSpaces((prev) => {
        if (prev.some((s) => isAppFeedbackSpaceShortCode(s.shortCode))) {
          return prev;
        }
        const withoutSameId = prev.filter((s) => s.spaceId !== res.spaceId);
        return [
          ...withoutSameId,
          {
            spaceId: res.spaceId,
            shortCode: res.shortCode,
            name: res.spaceName,
            contributorHandleId: res.contributorHandleId,
          },
        ];
      });
    });
  }, [lang, appFeedbackLocalSpace]);

  const headerSpaces: HeaderSpaceOption[] = useMemo(() => {
    const userOpts = userSpaces.map((s) => ({
      spaceId: s.spaceId,
      shortCode: s.shortCode,
      displayName: displayNameForSpace(s),
    }));
    if (!appFeedbackLocalSpace) return userOpts;
    return [
      ...userOpts,
      {
        spaceId: appFeedbackLocalSpace.spaceId,
        shortCode: appFeedbackLocalSpace.shortCode,
        displayName: displayNameForSpace(appFeedbackLocalSpace),
      },
    ];
  }, [userSpaces, appFeedbackLocalSpace]);

  const activeHeaderSpace: HeaderSpaceOption | null = activeSpace
    ? {
        spaceId: activeSpace.spaceId,
        shortCode: activeSpace.shortCode,
        displayName: displayNameForSpace(activeSpace),
      }
    : null;

  const praiseCount = summaryPayload?.classificationMeta.positiveCount ?? 0;
  const remarksCount = summaryPayload?.classificationMeta.negativeCount ?? 0;

  const retryLoadSummaries = useCallback(async () => {
    if (!activeSpaceId) return;
    setSummaryLoadError(null);
    try {
      const data = await getSpaceSummary({
        spaceId: activeSpaceId,
        displayLang: lang,
      });
      setSummaryPayload(data);
    } catch (err) {
      setSummaryPayload(null);
      setSummaryLoadError(formatSummaryLoadFailure(lang, err));
    }
  }, [activeSpaceId, lang]);

  useEffect(() => {
    if (!activeSpaceId) {
      setSummaryPayload(null);
      setSummaryLoadError(null);
      setSummaryPollNonce(0);
      return;
    }
    setSummaryPollNonce(0);
    setSummaryLoadError(null);
    let cancelled = false;

    void (async () => {
      try {
        const data = await getSpaceSummary({
          spaceId: activeSpaceId,
          displayLang: lang,
        });
        if (!cancelled) {
          setSummaryPayload(data);
          setSummaryLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSummaryPayload(null);
          setSummaryLoadError(formatSummaryLoadFailure(lang, err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSpaceId, lang]);

  useEffect(() => {
    if (!activeSpaceId || summaryPollNonce === 0) return;

    const nonceAtStart = summaryPollNonce;
    let cancelled = false;
    let intervalId: number | null = null;

    const tick = async () => {
      try {
        const data = await getSpaceSummary({
          spaceId: activeSpaceId,
          displayLang: lang,
        });
        if (cancelled) return;
        setSummaryPayload(data);
        setSummaryLoadError(null);
        if (summariesReadyForDisplayLang(data, lang)) {
          if (intervalId != null) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
          setSummaryPollNonce((n) => (n === nonceAtStart ? 0 : n));
        }
      } catch (err) {
        if (!cancelled) {
          setSummaryLoadError(formatSummaryLoadFailure(lang, err));
        }
      }
    };

    intervalId = window.setInterval(() => {
      void tick();
    }, 800);
    void tick();

    return () => {
      cancelled = true;
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [activeSpaceId, lang, summaryPollNonce]);

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

  function handleDeleteSpace(spaceId: string) {
    const removingActive = activeSpaceId === spaceId;
    setSpaces((prev) => prev.filter((s) => s.spaceId !== spaceId));
    if (removingActive) {
      setActiveSpaceId(null);
      setSummaryPayload(null);
      setSummaryLoadError(null);
      navigate("/new");
    }
  }

  async function handleSubmitFeedback() {
    if (!activeSpace || !feedbackText.trim()) return;
    setBusy(true);
    try {
      const res = await submitFeedback({
        spaceId: activeSpace.spaceId,
        contributorHandleId: activeSpace.contributorHandleId,
        text: feedbackText,
        sourceType: "text",
      });
      setFeedbackText("");
      setSummaryPayload((prev) =>
        prev && prev.shortCode === activeSpace.shortCode
          ? {
              ...prev,
              classificationMeta: res.classificationMeta,
              jobStatus: "pending",
            }
          : prev,
      );
      setSummaryPollNonce((n) => n + 1);
    } catch {
      showToast(lang === "bg" ? "Неуспех. Опитайте отново." : "Submit failed.");
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

  const canSendFeedback = feedbackText.trim().length > 0;

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-neutral-50">
      <JournalAppHeader
        lang={lang}
        onLangChange={setLang}
        isNewSpaceRoute={isNewRoute}
        newNameDraft={newNameDraft}
        onNewNameChange={setNewNameDraft}
        onCreateSpace={handleCreateSpace}
        activeSpace={activeHeaderSpace}
        spaces={headerSpaces}
        userSpaceCount={userSpaces.length}
        onSelectSpace={handleSelectSpace}
        onDeleteSpace={handleDeleteSpace}
        onNavigateNew={() => navigate("/new")}
        onShareSpace={() => void handleHeaderShare()}
        shareDisabled={!activeSpace}
      />

      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 pt-3 font-light [-webkit-overflow-scrolling:touch]">
        {(joinError || slugError) && (
          <p className="shrink-0 text-sm text-red-600">{joinError ?? slugError}</p>
        )}

        {isNewRoute && !activeSpace && (
          <div className="shrink-0 space-y-2 text-sm text-neutral-600">
            <p>
              {lang === "bg"
                ? "Въведете име в полето, натиснете Готово и след това споделете линка."
                : "Enter the name in the field, then press Done, and then share the link."}
            </p>
            {userSpaces.length === 0 && appFeedbackLocalSpace && (
              <p>
                <button
                  type="button"
                  className="text-left font-medium text-[#1583ca] underline decoration-[#1583ca]/40 underline-offset-2 hover:decoration-[#1583ca]"
                  onClick={() => handleSelectSpace(appFeedbackLocalSpace.spaceId)}
                >
                  {lang === "bg"
                    ? "Или дайте отзив за самото приложение reShkolo."
                    : "Or send feedback about the reShkolo app itself."}
                </button>
              </p>
            )}
          </div>
        )}

        {status && !activeSpace && (
          <p className="mt-2 shrink-0 text-sm text-neutral-700">{status}</p>
        )}

        {activeSpace && (
          <div className="flex min-w-0 flex-col gap-3 pt-1">
            <div className="flex shrink-0 flex-col gap-3">
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
              </div>
            </div>

            <div className="min-w-0 overflow-x-hidden">
              {summaryLoadError && (
                <div className="space-y-2">
                  <p className="text-sm text-red-600">{summaryLoadError}</p>
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-[#1583ca] underline decoration-[#1583ca]/40 underline-offset-2 hover:decoration-[#1583ca]"
                    onClick={() => void retryLoadSummaries()}
                  >
                    {lang === "bg" ? "Опитайте отново" : "Try again"}
                  </button>
                </div>
              )}
              {!summaryPayload && !summaryLoadError && (
                <p className="text-sm text-neutral-600">
                  {lang === "bg" ? "Зареждане на обобщенията…" : "Loading summaries…"}
                </p>
              )}
              {summaryPayload && activeSpace && (
                <SummaryAggregationDeck
                  lang={lang}
                  aggs={summaryPayload.experimentAggregations}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {activeSpace && (
        <div className="shrink-0 border-t border-neutral-200/90 bg-neutral-50 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2">
          <form
            className="w-full"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              if (feedbackText.trim()) void handleSubmitFeedback();
            }}
          >
            <div className="flex items-center gap-2">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey || !feedbackText.trim()) return;
                  e.preventDefault();
                  void handleSubmitFeedback();
                }}
                rows={2}
                placeholder={
                  lang === "bg" ? "Напишете отзив…" : "Write feedback…"
                }
                className="min-h-[3rem] min-w-0 flex-1 resize-none rounded-3xl border border-neutral-300 bg-white px-3 py-2 text-base font-light leading-snug text-neutral-900 shadow-sm outline-none ring-[#1583ca]/35 placeholder:text-neutral-400 focus:ring-2 focus:ring-[#1583ca]/40"
                disabled={busy}
                aria-label={lang === "bg" ? "Отзив" : "Feedback"}
              />

              <button
                type="button"
                disabled={busy || !canSendFeedback}
                onClick={() => void handleSubmitFeedback()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1583ca] text-white shadow-sm hover:bg-[#1478b8] active:bg-[#126da9] disabled:opacity-50"
                aria-label={lang === "bg" ? "Прати отзива" : "Submit feedback"}
              >
                <PaperPlaneIcon className="h-5 w-5 text-white" />
              </button>
            </div>
          </form>
        </div>
      )}

      <Snackbar open={toast != null} onClose={dismissToast}>
        <span className="block whitespace-pre-wrap">{toast}</span>
      </Snackbar>
    </div>
  );
}
