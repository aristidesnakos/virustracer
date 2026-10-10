"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MAX_EMAIL_LENGTH, isPlausibleEmail } from "@/lib/alert-interest";
import { BUYER_SEGMENTS, MAX_USE_LENGTH, PILOT_PRICE_USD_PER_MONTH } from "@/lib/commercial";

// The /commercial-data sign-up. The button under the price reveals the form, and
// the first click is reported, so we can compare people who saw the price and
// asked with people who then left an address. The feed is not built; the copy
// around this form says so.

type Status = "closed" | "open" | "sending" | "done";

const FIELD =
  "w-full rounded-lg border border-rule-strong bg-paper px-3 py-2 text-[0.9375rem] text-ink placeholder:text-ink-faint";
const LABEL = "mb-1 block text-[0.9375rem] font-semibold text-ink";
const BUTTON =
  "rounded-lg bg-accent px-5 py-2.5 text-[0.9375rem] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60";

export default function CommercialInterestForm() {
  const [status, setStatus] = useState<Status>("closed");
  const [email, setEmail] = useState("");
  const [segment, setSegment] = useState("");
  const [use, setUse] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();

  useEffect(() => {
    if (status === "open") formRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, [status]);

  function openForm() {
    setStatus("open");
    // Carries no personal data.
    fetch("/api/alert-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "commercial-open" }),
      keepalive: true,
    }).catch(() => {});
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isPlausibleEmail(email.trim())) return setError("That email address does not look right.");
    if (!segment) return setError("Please choose what describes you best.");

    setError("");
    setStatus("sending");
    try {
      const res = await fetch("/api/alert-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "commercial", email: email.trim(), segment, use, website }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("open");
    }
  }

  if (status === "closed") {
    return (
      <button type="button" onClick={openForm} className={BUTTON}>
        Join the pilot list at ${PILOT_PRICE_USD_PER_MONTH}/month
      </button>
    );
  }

  if (status === "done") {
    return (
      <p role="status" className="max-w-[40rem] text-[0.9375rem] leading-relaxed text-ink">
        Thank you. We will email you to ask a few questions about how you buy. Nothing is charged, and you decide
        later whether to take part.
      </p>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="max-w-[32rem] space-y-4">
      <div>
        <label htmlFor={`${id}-email`} className={LABEL}>
          Work email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={MAX_EMAIL_LENGTH}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor={`${id}-segment`} className={LABEL}>
          What describes you best?
        </label>
        <select
          id={`${id}-segment`}
          required
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className={FIELD}
        >
          <option value="" disabled>
            Choose one
          </option>
          {BUYER_SEGMENTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${id}-use`} className={LABEL}>
          What decision would this help you make? <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <textarea
          id={`${id}-use`}
          rows={3}
          maxLength={MAX_USE_LENGTH}
          value={use}
          onChange={(e) => setUse(e.target.value)}
          placeholder="For example: when to buy forward on eggs, or which suppliers to back up"
          className={FIELD}
        />
      </div>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-[0.9375rem] font-medium text-death">
          {error}
        </p>
      )}

      <button type="submit" disabled={status === "sending"} className={BUTTON}>
        {status === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
