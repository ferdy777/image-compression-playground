import { createServer } from "node:http";

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const SUMMARY_KEY = process.env.SUMMARY_KEY || "";
const MAX_EVENTS = 20000;
const events = [];

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function stats(values) {
  return { p50: percentile(values, 50), p75: percentile(values, 75), p95: percentile(values, 95) };
}

function summarize() {
  const compress = events.filter((e) => e.name === "image_compress");
  const byMode = {};
  for (const mode of [true, false]) {
    const rows = compress.filter((e) => e.useWebWorker === mode);
    byMode[mode ? "worker" : "mainThread"] = {
      runs: rows.length,
      durationMs: stats(rows.map((e) => e.durationMs)),
      uiBlockedMs: stats(rows.filter((e) => e.longTasksSupported).map((e) => e.uiBlockedMs)),
      avgSavedPercent: rows.length
        ? Math.round(rows.reduce((sum, e) => sum + e.savedPercent, 0) / rows.length)
        : null,
      metSizeTargetPercent: rows.length
        ? Math.round((rows.filter((e) => e.metSizeTarget).length / rows.length) * 100)
        : null,
    };
  }
  const vitals = {};
  for (const e of events.filter((e) => e.name === "web_vital")) {
    (vitals[e.metric] ||= []).push(e.value);
  }
  return {
    totalEvents: events.length,
    sessions: new Set(events.map((e) => e.sessionId)).size,
    errors: events.filter((e) => e.name === "image_compress_error").length,
    imageCompress: byMode,
    webVitalsP75: Object.fromEntries(
      Object.entries(vitals).map(([metric, values]) => [metric, percentile(values, 75)]),
    ),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100000) {
        reject(new Error("too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/metrics") {
    try {
      const { context, events: batch } = JSON.parse(await readBody(req));
      for (const event of Array.isArray(batch) ? batch : []) {
        const row = { ...context, ...event };
        events.push(row);
        console.log(JSON.stringify(row));
      }
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
      res.writeHead(204, cors).end();
    } catch {
      res.writeHead(400, cors).end();
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/summary") {
    if (SUMMARY_KEY && url.searchParams.get("key") !== SUMMARY_KEY) {
      res.writeHead(401, cors).end();
      return;
    }
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(summarize(), null, 2));
    return;
  }

  res.writeHead(200, { ...cors, "Content-Type": "text/plain" }).end("ok");
}).listen(PORT, () => console.log(`collector listening on ${PORT}`));
