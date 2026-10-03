import { describe, it, expect } from "vitest";
import { updateSignalLedger } from "../scripts/lib/signals.mjs";
import { classifySignals, type LedgerSignal } from "@/lib/signals";
import type { MonitoringEntry } from "@/data/outbreaks";

const NOW = "2026-10-02T12:00:00.000Z";

const cand = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  iso: "RW",
  country: "Rwanda",
  flag: "🇷🇼",
  casesMentioned: 2,
  deathsMentioned: null,
  sourceTitle: "Rwanda reports suspected cases",
  sourceUrl: "https://example.org/a1",
  sourceName: "News",
  date: "2026-09-20T08:00:00Z",
  ...over,
});

describe("updateSignalLedger", () => {
  it("creates a row with the first article as the source", () => {
    const out = updateSignalLedger({ lastUpdated: "", signals: [] }, [cand()], NOW);
    expect(out.lastUpdated).toBe(NOW);
    expect(out.signals).toHaveLength(1);
    expect(out.signals[0]).toMatchObject({
      iso: "RW",
      firstSeen: "2026-09-20",
      lastSeen: "2026-09-20",
      firstSourceUrl: "https://example.org/a1",
      mentions: 1,
      maxCasesMentioned: 2,
      maxDeathsMentioned: null,
    });
  });

  it("is idempotent for an article it has already counted", () => {
    const once = updateSignalLedger({ lastUpdated: "", signals: [] }, [cand()], NOW);
    const twice = updateSignalLedger(once, [cand()], NOW);
    expect(twice.signals).toEqual(once.signals);
  });

  it("counts new articles and keeps the earliest as the first source", () => {
    let ledger = updateSignalLedger({ lastUpdated: "", signals: [] }, [cand()], NOW);
    ledger = updateSignalLedger(
      ledger,
      [
        cand({ id: "a2", date: "2026-09-25T00:00:00Z", casesMentioned: 5, deathsMentioned: 1, sourceUrl: "https://example.org/a2" }),
        cand({ id: "a0", date: "2026-09-18T00:00:00Z", casesMentioned: null, sourceUrl: "https://example.org/a0" }),
      ],
      NOW,
    );
    const [s] = ledger.signals;
    expect(s.mentions).toBe(3);
    expect(s.firstSeen).toBe("2026-09-18");
    expect(s.firstSourceUrl).toBe("https://example.org/a0");
    expect(s.lastSeen).toBe("2026-09-25");
    expect(s.maxCasesMentioned).toBe(5);
    expect(s.maxDeathsMentioned).toBe(1);
  });

  it("keeps countries sorted by when they were first seen and ignores unusable candidates", () => {
    const out = updateSignalLedger(
      { lastUpdated: "", signals: [] },
      [
        cand({ id: "b", iso: "BI", country: "Burundi", date: "2026-09-10" }),
        cand({ id: "c", date: "not a date" }),
        cand({ id: "", iso: "KE" }),
        cand(),
      ],
      NOW,
    );
    expect(out.signals.map((s: LedgerSignal) => s.iso)).toEqual(["BI", "RW"]);
  });

  it("does not mutate the ledger it is given", () => {
    const base = updateSignalLedger({ lastUpdated: "", signals: [] }, [cand()], NOW);
    const frozen = JSON.parse(JSON.stringify(base));
    updateSignalLedger(base, [cand({ id: "a9" })], NOW);
    expect(base).toEqual(frozen);
  });
});

const row = (over: Partial<MonitoringEntry>): MonitoringEntry => ({
  country: "Rwanda",
  flag: "🇷🇼",
  iso: "RW",
  confirmed: 0,
  deaths: 0,
  status: "",
  detail: "",
  source: "",
  asOf: "2026-10-01",
  ...over,
});

const signal = (over: Partial<LedgerSignal> = {}): LedgerSignal => ({
  iso: "RW",
  country: "Rwanda",
  flag: "🇷🇼",
  firstSeen: "2026-09-20",
  lastSeen: "2026-09-25",
  firstSourceTitle: "t",
  firstSourceUrl: "u",
  firstSourceName: "n",
  mentions: 2,
  maxCasesMentioned: null,
  maxDeathsMentioned: null,
  ...over,
});

describe("classifySignals", () => {
  it("leaves a signal unverified when the country has no confirmed cases in the table", () => {
    expect(classifySignals([signal()], [])[0]).toMatchObject({ status: "unverified", confirmedOn: null, leadDays: null });
    expect(classifySignals([signal()], [row({ confirmed: 0 })])[0].status).toBe("unverified");
  });

  it("marks it confirmed without a lead time when no confirmation date is recorded", () => {
    expect(classifySignals([signal()], [row({ confirmed: 1 })])[0]).toMatchObject({
      status: "confirmed",
      confirmedOn: null,
      leadDays: null,
    });
  });

  it("computes the lead time in days from first sighting to confirmation", () => {
    const out = classifySignals([signal()], [row({ confirmed: 1, firstConfirmed: "2026-09-27" })]);
    expect(out[0]).toMatchObject({ status: "confirmed", confirmedOn: "2026-09-27", leadDays: 7 });
  });

  it("reports a negative lead when the news came after the confirmation", () => {
    const out = classifySignals([signal()], [row({ confirmed: 1, firstConfirmed: "2026-09-15" })]);
    expect(out[0].leadDays).toBe(-5);
  });

  it("ignores province sub-rows", () => {
    const out = classifySignals([signal({ iso: "CD-IT" })], [row({ iso: "CD-IT", parentIso: "CD", confirmed: 10 })]);
    expect(out[0].status).toBe("unverified");
  });
});
