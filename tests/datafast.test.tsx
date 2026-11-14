import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/datafast/route";
import { GOALS, cleanMetadata, isGoalName, isVisitorId } from "@/lib/analytics-goals";
import { dataFastScript } from "@/lib/analytics-script";
import CountermeasuresPanel from "@/components/CountermeasuresPanel";
import { getCountermeasures } from "@/data/countermeasures";

const analytics = vi.hoisted(() => ({
  trackCountermeasuresView: vi.fn(),
  trackCountermeasuresSourceClick: vi.fn(),
  trackCountermeasuresMethodClick: vi.fn(),
}));
vi.mock("@/lib/analytics", () => analytics);

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/datafast", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const goal = { type: "goal", name: "countermeasures_view", datafast_visitor_id: "abc123def456", metadata: { pathogen: "ebolavirus-bundibugyo", outbreak: "ebola-bundibugyo-2026" } };

describe("DataFast proxy /api/datafast", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.stubEnv("DATAFAST_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
  });

  it("returns 503 without the server key", async () => {
    vi.stubEnv("DATAFAST_API_KEY", "");
    expect((await post(goal)).status).toBe(503);
  });

  it("refuses payments, unknown goals, bad visitor ids and bad JSON", async () => {
    globalThis.fetch = vi.fn() as typeof fetch;
    expect((await post({ ...goal, type: "payment" })).status).toBe(400);
    expect((await post({ ...goal, name: "anything_else" })).status).toBe(400);
    expect((await post({ ...goal, datafast_visitor_id: "<script>" })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ ...goal, metadata: { pathogen: "x".repeat(5000) } })).status).toBe(413);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("forwards an allowed goal with the key and only its allowed metadata", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const res = await post({ ...goal, metadata: { ...goal.metadata, email: "x@example.com", page_url: "https://outbreakfiles.com/" } });
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://datafa.st/api/v1/goals");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body as string)).toEqual({
      datafast_visitor_id: "abc123def456",
      name: "countermeasures_view",
      metadata: { pathogen: "ebolavirus-bundibugyo", outbreak: "ebola-bundibugyo-2026", page_url: "https://outbreakfiles.com/" },
    });
  });

  it("reports an upstream failure as 502", async () => {
    globalThis.fetch = vi.fn(async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    expect((await post(goal)).status).toBe(502);
  });
});

describe("goal list helpers", () => {
  it("knows only the listed goals and trims metadata", () => {
    expect(Object.keys(GOALS)).toEqual(["countermeasures_view", "countermeasures_source_click", "countermeasures_method_click"]);
    expect(isGoalName("countermeasures_view")).toBe(true);
    expect(isGoalName("toString")).toBe(false);
    expect(cleanMetadata("countermeasures_source_click", { tier: "B", nested: { a: 1 }, other: "x" })).toEqual({ tier: "B" });
    expect(isVisitorId("abc123def456")).toBe(true);
    expect(isVisitorId("a b")).toBe(false);
  });

  it("loads the DataFast script only when a website id is configured", () => {
    expect(dataFastScript("")).toBeNull();
    expect(dataFastScript(undefined)).toBeNull();
    expect(dataFastScript(" site123 ")).toMatchObject({ src: "https://datafa.st/js/script.js", websiteId: "site123" });
  });
});

describe("vaccines-and-treatments box goals", () => {
  const data = getCountermeasures("ebolavirus-bundibugyo")!;
  let observed: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          observed = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderBox = () =>
    render(
      <section>
        <CountermeasuresPanel data={data} headingId="cm" outbreakSlug="ebola-bundibugyo-2026" />
      </section>,
    );

  it("records one view when the box comes into sight", () => {
    renderBox();
    observed?.([{ isIntersecting: false }]);
    expect(analytics.trackCountermeasuresView).not.toHaveBeenCalled();
    observed?.([{ isIntersecting: true }]);
    expect(analytics.trackCountermeasuresView).toHaveBeenCalledWith({ pathogen: "ebolavirus-bundibugyo", outbreak: "ebola-bundibugyo-2026" });
  });

  it("records a source click with product, tier and source kind, and the methodology click", () => {
    renderBox();
    fireEvent.click(screen.getByRole("link", { name: /NCT07842107/ }));
    expect(analytics.trackCountermeasuresSourceClick).toHaveBeenCalledWith({
      pathogen: "ebolavirus-bundibugyo",
      outbreak: "ebola-bundibugyo-2026",
      product: "tumaini",
      tier: "B",
      source_kind: "clinicaltrials.gov",
    });
    fireEvent.click(screen.getByRole("link", { name: "How this box is kept" }));
    expect(analytics.trackCountermeasuresMethodClick).toHaveBeenCalledTimes(1);
  });

  it("records nothing when no outbreak is given", () => {
    render(
      <section>
        <CountermeasuresPanel data={data} headingId="cm" />
      </section>,
    );
    fireEvent.click(screen.getByRole("link", { name: /NCT07842107/ }));
    expect(analytics.trackCountermeasuresSourceClick).not.toHaveBeenCalled();
  });
});
