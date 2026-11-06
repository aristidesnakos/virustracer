// One outbreak's feed update, with every side effect injected (HTTP fetch, model client, the
// store that reads/writes the JSON files, the clock) so tests run it on fake RSS and a fake
// model. Used by scripts/fetch-feeds.mjs. Unit-tested in tests/feed-run.test.ts.
//
// Order of work: fetch the outbreak's feeds concurrently, decide which items are new, then run
// the model calls for them (and for stored items never checked) through a small pool. Progress
// is persisted after EVERY finished item, so a run killed by a timeout loses at most the items
// in flight. Stored output is sorted (date, then id) and written in plan order, never in
// completion order, so a rerun on the same input writes the same bytes.
import {
  parseRSSItems,
  isOutbreakRelated,
  isoDate,
  classifyFeedItems,
  pickSummaryIds,
  mergeRecentItems,
  mergeIdList,
  mergeCandidates,
  titleKey as titleKeyOf,
  MAX_NEW_PER_FEED,
  PROCESSED_IDS_KEEP,
  CHECKED_IDS_KEEP,
  RECENT_ITEMS_KEEP,
} from "./feed-items.mjs";
import { extractCandidate as defaultExtractCandidate, extractSummary as defaultExtractSummary } from "./feed-model.mjs";
import { mapPool } from "./pool.mjs";
import { updateSignalLedger } from "./signals.mjs";

/**
 * @typedef {Object} Store
 * @property {() => any} readLive
 * @property {() => any} readCandidates
 * @property {() => any} readLedger
 * @property {(live: any) => void} writeLive
 * @property {(candidates: any) => void} writeCandidates
 * @property {(ledger: any) => void} writeLedger
 */

/**
 * @param {{
 *   outbreak: {slug: string, disease: string, feed: any},
 *   client: any,
 *   fetchText: (url: string, o: {userAgent: string}) => Promise<string>,
 *   store: Store,
 *   now?: () => Date,
 *   concurrency?: number,
 *   feedConcurrency?: number,
 *   retryOptions?: object,
 *   maxNewPerFeed?: number,
 *   log?: {log: Function, warn: Function},
 *   models?: {extractCandidate: Function, extractSummary: Function},
 * }} o
 */
export async function runOutbreakFeeds(o) {
  const {
    outbreak,
    client,
    fetchText,
    store,
    now = () => new Date(),
    concurrency = 4,
    feedConcurrency = 4,
    retryOptions = {},
    maxNewPerFeed = MAX_NEW_PER_FEED,
    log = console,
    models = { extractCandidate: defaultExtractCandidate, extractSummary: defaultExtractSummary },
  } = o;
  const feedConfig = outbreak.feed;

  const live = store.readLive() ?? { lastFetched: "", processedIds: [], recentItems: [] };
  const candStore = store.readCandidates() ?? { lastExtracted: "", candidates: [] };
  const storedLedger = store.readLedger(); // null when the file does not exist yet
  const ledger = storedLedger ?? { lastUpdated: "", signals: [] };
  let ledgerSig = storedLedger ? JSON.stringify(ledger.signals ?? []) : null;
  const baseProcessed = live.processedIds ?? [];
  const baseRecent = live.recentItems ?? [];
  const baseCandidates = candStore.candidates ?? [];
  const baseChecked = candStore.checkedIds ?? [];
  // Checked = the model has already been asked: a stored candidate OR a remembered "nothing there".
  const checkedSet = new Set([...baseChecked, ...baseCandidates.map((c) => c.id)]);

  // 1. Fetch the feeds concurrently (results keep feed order).
  const userAgent = `virustracer/1.0 (${outbreak.disease} outbreak tracker; public health surveillance)`;
  const fetched = await mapPool(feedConfig.sources, feedConcurrency, async (feed) => {
    log.log(`Fetching ${feed.name}…`);
    const xml = await fetchText(feed.url, { userAgent });
    const items = parseRSSItems(xml);
    const relevant = items.filter((it) => isOutbreakRelated(it, feedConfig));
    // Newest first, so the per-feed cap keeps the most recent articles.
    relevant.sort((a, b) => isoDate(b.pubDate).localeCompare(isoDate(a.pubDate)));
    log.log(`  ${feed.name}: ${items.length} items parsed, ${relevant.length} outbreak-related`);
    return relevant;
  });

  // 2. Decide what is new (sequential: the headline dedupe is shared across feeds, in feed order).
  const processedSet = new Set(baseProcessed);
  const seenTitles = new Set(baseRecent.map((i) => titleKeyOf(i.title)));
  const backlog = [];
  /** @type {Array<{kind: "new"|"backfill", id: string, title: string, description: string, url: string, source: string, date: string}>} */
  const tasks = [];
  let feedsFailed = 0;
  feedConfig.sources.forEach((feed, idx) => {
    const r = fetched[idx];
    if (r.status === "rejected") {
      feedsFailed++;
      log.warn(`  ${feed.name} fetch failed: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
      return;
    }
    const c = classifyFeedItems(r.value, { feedSource: feed.source, processed: processedSet, seenTitles, maxNew: maxNewPerFeed });
    backlog.push(...c.markProcessed);
    for (const f of c.fresh) {
      tasks.push({
        kind: "new",
        id: f.id,
        title: f.item.title,
        description: f.item.description,
        url: f.item.link,
        source: feed.name,
        date: f.date,
      });
    }
    log.log(`  ${feed.name}: ${c.fresh.length} new, ${c.skippedProcessed} already processed, ${c.duplicates} duplicate headlines`);
  });

  // Nothing was read, so claim nothing: leave the files (and their lastFetched) as they are.
  if (feedConfig.sources.length > 0 && feedsFailed === feedConfig.sources.length) {
    throw new Error("every feed failed to download");
  }

  // Only new items that will survive in the newest-20 list are worth a summary.
  const summaryIds = pickSummaryIds(tasks, baseRecent, RECENT_ITEMS_KEEP);

  // Stored items the model never looked at (the backfill). Each is asked once, ever.
  if (client) {
    const newIds = new Set(tasks.map((t) => t.id));
    for (const it of baseRecent) {
      if (checkedSet.has(it.id) || newIds.has(it.id)) continue;
      tasks.push({
        kind: "backfill",
        id: it.id,
        title: it.title,
        description: it.summary ?? "",
        url: it.url,
        source: it.source,
        date: it.date,
      });
    }
  }

  // 3. Persistence: rebuilt from `done` (plan order) after every finished task.
  const done = new Array(tasks.length).fill(null);
  const stats = { newItems: 0, summaries: 0, candidatesChecked: 0, newCandidates: 0, modelCalls: 0, modelFailures: 0, feedsFailed };
  const byKind = { summary: { calls: 0, failures: 0 }, candidate: { calls: 0, failures: 0 } };
  let lastBody = JSON.stringify({ c: candStore.candidates ?? [], k: baseChecked });
  const fetchedAt = now().toISOString();

  function persist() {
    const completed = done.filter(Boolean);
    const newItems = completed.filter((d) => d.item).map((d) => d.item);
    const newCandidates = completed.filter((d) => d.candidate).map((d) => d.candidate);
    const checkedNow = completed.filter((d) => d.checked).map((d) => d.id);
    const processedNow = completed.filter((d) => d.task.kind === "new" && d.markProcessed).map((d) => d.id);

    store.writeLive({
      ...live,
      lastFetched: fetchedAt,
      processedIds: mergeIdList(baseProcessed, [...backlog, ...processedNow], PROCESSED_IDS_KEEP),
      recentItems: mergeRecentItems(newItems, baseRecent, RECENT_ITEMS_KEEP),
    });

    const candidates = mergeCandidates(newCandidates, baseCandidates, now().getTime());
    const checkedIds = mergeIdList(baseChecked, checkedNow, CHECKED_IDS_KEEP);
    const body = JSON.stringify({ c: candidates, k: checkedIds });
    // Skip the write when nothing changed, so a quiet run does not touch the file.
    if (body !== lastBody) {
      store.writeCandidates({ lastExtracted: now().toISOString(), candidates, checkedIds });
      lastBody = body;
    }

    const next = updateSignalLedger(ledger, candidates, now().toISOString());
    const sig = JSON.stringify(next.signals);
    // Only write when something changed (or the file is missing), so a quiet run makes no commit.
    if (sig !== ledgerSig) {
      store.writeLedger(next);
      ledgerSig = sig;
    }
    return { candidates, newCandidates, newItems };
  }

  function modelCall(kind, fn) {
    stats.modelCalls++;
    byKind[kind].calls++;
    return fn().catch((err) => {
      stats.modelFailures++;
      byKind[kind].failures++;
      log.warn(`  model call failed: ${err instanceof Error ? err.message : err}`);
      throw err;
    });
  }

  // 4. Run the tasks, a few at a time, the two calls of an item in parallel.
  const settled = await mapPool(tasks, concurrency, async (task, i) => {
    const needSummary = task.kind === "new" && summaryIds.has(task.id);
    const needCandidate = Boolean(client) && !checkedSet.has(task.id);
    const [sum, cand] = await Promise.allSettled([
      needSummary && client
        ? modelCall("summary", () => models.extractSummary(client, feedConfig, task.title, task.description, retryOptions))
        : Promise.resolve(null),
      needCandidate
        ? modelCall("candidate", () => models.extractCandidate(client, feedConfig, task.title, task.description, retryOptions))
        : Promise.resolve(null),
    ]);
    const candidateOk = !needCandidate || cand.status === "fulfilled";
    const summary = needSummary
      ? sum.status === "fulfilled" && sum.value
        ? sum.value
        : task.description.slice(0, 200)
      : null;
    if (needSummary && client && sum.status === "fulfilled") stats.summaries++;
    const found = cand.status === "fulfilled" ? cand.value : null;
    const entry = {
      id: task.id,
      task,
      item: needSummary
        ? { id: task.id, title: task.title, url: task.url, date: task.date, source: task.source, summary }
        : null,
      candidate: found
        ? {
            id: task.id,
            ...found,
            sourceTitle: task.title,
            sourceUrl: task.url,
            sourceName: task.source,
            date: task.date,
            extractedAt: now().toISOString(),
          }
        : null,
      checked: needCandidate && candidateOk,
      // A dropped (not-kept) item whose candidate call failed stays unprocessed so a later run
      // retries it; kept items are retried by the backfill instead.
      markProcessed: candidateOk || needSummary,
    };
    done[i] = entry;
    if (task.kind === "new") stats.newItems++;
    if (needCandidate && candidateOk) stats.candidatesChecked++;
    if (found) {
      stats.newCandidates++;
      log.log(`    → candidate: ${found.country} (${found.casesMentioned ?? "?"} cases) — ${task.title.slice(0, 60)}`);
    }
    persist();
  });

  const final = persist();
  // Model errors are handled inside the task; a rejection here is a real bug or a failed write.
  const crashed = settled.find((r) => r.status === "rejected");
  if (crashed) throw crashed.reason;
  log.log(
    `${outbreak.slug}: ${stats.newItems} new items (${stats.summaries} summarised), ` +
      `${stats.candidatesChecked} checked for candidates, ${stats.newCandidates} new candidate signals, ` +
      `${stats.modelFailures}/${stats.modelCalls} model calls failed.`,
  );
  // A kind of call that failed every single time is an outage (or a bad key), not flakiness.
  for (const [kind, k] of Object.entries(byKind)) {
    if (k.calls >= 3 && k.failures === k.calls) {
      throw new Error(`every model call failed (${k.calls} ${kind} calls); progress was saved`);
    }
  }
  return { stats, candidates: final.candidates.length };
}
