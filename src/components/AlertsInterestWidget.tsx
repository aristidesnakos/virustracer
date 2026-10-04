"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Bell, X } from "lucide-react";
import {
  ALERT_CHANNELS,
  ALERT_EVENTS,
  ALERT_ROLES,
  isPlausibleEmail,
  type AlertChannelId,
  type AlertEventId,
} from "@/lib/alert-interest";

// Demand test for outbreak alerts. Alerts do not exist yet, and the copy says so.
// A bottom-right pill opens a small non-modal panel; the answers go to
// /api/alert-interest.

const STORAGE_KEY = "outbreak-alerts-interest-submitted";
const STORAGE_EVENT = "alerts-interest-submitted";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
}

// Browser storage can be blocked or throw (private windows, cleared site data).
function readSubmitted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSubmitted() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* the panel still shows its thank-you for this visit */
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

type Status = "idle" | "sending" | "done";

const FIELD =
  "w-full rounded-lg border border-rule-strong bg-paper px-3 py-2 text-[0.9375rem] text-ink placeholder:text-ink-faint";
const LEGEND = "mb-1.5 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted";

export default function AlertsInterestWidget() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [events, setEvents] = useState<AlertEventId[]>([]);
  const [channel, setChannel] = useState<AlertChannelId | "">("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState("");

  const alreadySubmitted = useSyncExternalStore(subscribe, readSubmitted, () => false);
  const reportedOpen = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Move focus into the panel when it opens; hand it back to the pill on close.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("input, select") ?? panel?.querySelector<HTMLElement>("button"))?.focus();
  }, [open]);

  function openPanel() {
    setOpen(true);
    if (!reportedOpen.current) {
      reportedOpen.current = true;
      // Lets us compare opens with sign-ups. Carries no personal data.
      fetch("/api/alert-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "open" }),
        keepalive: true,
      }).catch(() => {});
    }
  }

  function closePanel() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function toggleEvent(id: AlertEventId) {
    setEvents((cur) => (cur.includes(id) ? cur.filter((e) => e !== id) : [...cur, id]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (events.length === 0) return setError("Pick at least one alert you would want.");
    if (!channel) return setError("Pick how you would want to be alerted.");
    if (email.trim() && !isPlausibleEmail(email.trim())) return setError("That email address does not look right.");

    setError("");
    setStatus("sending");
    try {
      const res = await fetch("/api/alert-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "submit", events, channel, role, email: email.trim(), website }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      rememberSubmitted();
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  // After signing up, drop the pill on later visits instead of nagging.
  if (alreadySubmitted && status !== "done" && !open) return null;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex flex-col items-end gap-3">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onKeyDown={(e) => {
            if (e.key === "Escape") closePanel();
          }}
          className="max-h-[min(36rem,calc(100dvh-6rem))] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-rule-strong bg-panel p-5 shadow-[0_8px_30px_oklch(0.24_0.03_255/0.18)]"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="font-journal text-lg font-semibold leading-snug text-ink">
              Want outbreak alerts?
            </h2>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded-md p-1.5 text-ink-muted hover:bg-sunk hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          {status === "done" ? (
            <div className="pt-2">
              <p className="text-[0.9375rem] leading-relaxed text-ink">
                Thank you, that helps decide what to build.
                {email.trim() ? " We will write to you once, if and when alerts launch." : ""}
              </p>
              <button
                type="button"
                onClick={closePanel}
                className="mt-4 rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-semibold text-primary-foreground hover:opacity-90"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-1 space-y-4">
              <p id={descId} className="text-[0.9375rem] leading-relaxed text-ink-muted">
                Alerts are not built yet. Tell us what you would find useful and we will use it to decide whether to
                build them.
              </p>

              <fieldset>
                <legend className={LEGEND}>Alert me when</legend>
                <div className="space-y-1.5">
                  {ALERT_EVENTS.map((ev) => (
                    <label key={ev.id} className="flex items-start gap-2.5 text-[0.9375rem] text-ink">
                      <input
                        type="checkbox"
                        checked={events.includes(ev.id)}
                        onChange={() => toggleEvent(ev.id)}
                        className="mt-1 size-4 accent-[var(--accent)]"
                      />
                      <span>{ev.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className={LEGEND}>Best way to reach me</legend>
                <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[420px]:grid-cols-2">
                  {ALERT_CHANNELS.map((c) => (
                    <label key={c.id} className="flex items-start gap-2.5 text-[0.9375rem] text-ink">
                      <input
                        type="radio"
                        name="alert-channel"
                        checked={channel === c.id}
                        onChange={() => setChannel(c.id)}
                        className="mt-1 size-4 accent-[var(--accent)]"
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor={`${titleId}-role`} className={`${LEGEND} block`}>
                  I am (optional)
                </label>
                <select id={`${titleId}-role`} value={role} onChange={(e) => setRole(e.target.value)} className={FIELD}>
                  <option value="">Prefer not to say</option>
                  {ALERT_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${titleId}-email`} className={`${LEGEND} block`}>
                  Email (optional)
                </label>
                <input
                  id={`${titleId}-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={120}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.org"
                  aria-describedby={`${titleId}-email-note`}
                  className={FIELD}
                />
                <p id={`${titleId}-email-note`} className="mt-1 text-[0.8125rem] leading-snug text-ink-faint">
                  Only used to tell you once if alerts launch. Leave it blank to answer anonymously.
                </p>
              </div>

              {/* Honeypot: hidden from people, tempting to bots. */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              {error && (
                <p role="alert" className="text-[0.9375rem] font-medium text-death">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-full border border-ink bg-ink px-4 py-2.5 text-[0.9375rem] font-semibold text-paper shadow-[0_4px_16px_oklch(0.24_0.03_255/0.25)] hover:bg-ink-muted"
      >
        <Bell className="size-4" aria-hidden />
        Get alerts
      </button>
    </div>
  );
}
