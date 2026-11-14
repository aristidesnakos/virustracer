import type { GoalName } from "./analytics-goals";

// DataFast conversion tracking (from the datafast-goal-tracking skill template).
//
// Goal names and their allowed metadata live in ./analytics-goals.ts, shared with the proxy. Goals are POSTed to a same-origin proxy (app/api/datafast) which
// forwards them to DataFast's server API with the secret key — the browser never
// sees the key. The DataFast browser script (loaded in the root layout) sets a
// `datafast_visitor_id` cookie; every goal must carry that id. Because the script
// loads deferred, the cookie can be missing on very early clicks, so we poll briefly
// before dropping a goal (this is what keeps conversion rates from reading
// artificially low). Read goals + funnels in the DataFast dashboard's Goal/Funnel
// tab — don't also route these through another analytics tool, or you'll double-count.

export interface ConversionEvent {
  name: string;
  properties?: Record<string, unknown>;
  visitor_id?: string;
}

// Read the visitor id the DataFast browser script stored in a cookie.
export function getDataFastVisitorId(): string {
  if (typeof document === "undefined") return "";
  try {
    for (const cookie of document.cookie.split(";")) {
      const [name, value] = cookie.trim().split("=");
      if (name === "datafast_visitor_id") return decodeURIComponent(value ?? "");
    }
  } catch (error) {
    console.error("DataFast: error reading visitor id", error);
  }
  return "";
}

// The DataFast script loads `defer`, so its cookie is set after the page parses. A
// goal fired in the first moments on a page would read an empty cookie and be
// dropped — biasing every conversion rate downward. Poll briefly for the cookie.
async function waitForVisitorId(timeoutMs = 5000, intervalMs = 250): Promise<string> {
  let id = getDataFastVisitorId();
  const deadline = Date.now() + timeoutMs;
  while (!id && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    id = getDataFastVisitorId();
  }
  return id;
}

// POST one goal to the same-origin proxy. `keepalive` lets the request survive a
// page navigation that often immediately follows a CTA / outbound-link click.
async function sendGoal(visitorId: string, event: ConversionEvent): Promise<void> {
  await fetch("/api/datafast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      type: "goal",
      datafast_visitor_id: visitorId,
      name: event.name,
      metadata: {
        ...event.properties,
        page_url: window.location.href,
        page_title: document.title,
        timestamp: new Date().toISOString(),
      },
    }),
  });
}

// Fire a DataFast goal. Fast path when the cookie is already set (await delivery,
// useful right before a navigation); otherwise resolve immediately and retry in the
// background so click handlers — including external target="_blank" CTAs — never
// hang waiting for the deferred script.
export async function trackConversion(event: ConversionEvent): Promise<void> {
  if (typeof window === "undefined") return;

  const immediateId = event.visitor_id || getDataFastVisitorId();
  if (immediateId) {
    try {
      await sendGoal(immediateId, event);
    } catch (error) {
      console.error("DataFast: error tracking conversion", error);
    }
    return;
  }

  void (async () => {
    try {
      const visitorId = await waitForVisitorId();
      if (!visitorId) {
        // Cookie never appeared (ad-blocker, privacy browser, blocked script).
        // Warn distinctly so genuine drops are countable, not confused with timing.
        console.warn(`DataFast goal "${event.name}" dropped: no visitor id after wait`);
        return;
      }
      await sendGoal(visitorId, event);
    } catch (error) {
      console.error("DataFast: error tracking conversion (deferred)", error);
    }
  })();
}

// Generic passthrough so call sites use typed helpers, not raw goal strings.
export async function trackGoal(
  name: GoalName,
  properties?: Record<string, string>
): Promise<void> {
  await trackConversion({ name, properties });
}

// ── Goals for this site ──────────────────────────────────────────────────────

interface BoxContext {
  pathogen: string;
  outbreak: string;
}

export async function trackCountermeasuresView(props: BoxContext) {
  await trackGoal("countermeasures_view", { ...props });
}

export async function trackCountermeasuresSourceClick(
  props: BoxContext & { product: string; tier: string; source_kind: string },
) {
  await trackGoal("countermeasures_source_click", { ...props });
}

export async function trackCountermeasuresMethodClick(props: BoxContext) {
  await trackGoal("countermeasures_method_click", { ...props });
}
