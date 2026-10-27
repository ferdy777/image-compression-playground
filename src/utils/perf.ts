export interface LongTaskStats {
  supported: boolean;
  
  blockedMs: number;
  longestTaskMs: number;
}

export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  performance.mark(`${name}:start`);
  try {
    const result = await fn();
    return { result, durationMs: endMeasure(name) };
  } catch (error) {
    endMeasure(name);
    throw error;
  }
}

function endMeasure(name: string): number {
  performance.mark(`${name}:end`);
  const entry = performance.measure(name, `${name}:start`, `${name}:end`);
  performance.clearMarks(`${name}:start`);
  performance.clearMarks(`${name}:end`);
  performance.clearMeasures(name);
  return entry.duration;
}

export function startLongTaskTracker(): { stop: () => LongTaskStats } {
  const supported =
    typeof PerformanceObserver !== "undefined" &&
    (PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false);

  if (!supported) {
    return { stop: () => ({ supported: false, blockedMs: 0, longestTaskMs: 0 }) };
  }

  let blockedMs = 0;
  let longestTaskMs = 0;

  const record = (entries: PerformanceEntryList) => {
    for (const entry of entries) {
      blockedMs += Math.max(0, entry.duration - 50);
      longestTaskMs = Math.max(longestTaskMs, entry.duration);
    }
  };

  const observer = new PerformanceObserver((list) => record(list.getEntries()));
  observer.observe({ type: "longtask" });

  return {
    stop: () => {
      record(observer.takeRecords());
      observer.disconnect();
      return {
        supported: true,
        blockedMs: Math.round(blockedMs),
        longestTaskMs: Math.round(longestTaskMs),
      };
    },
  };
}

const METRICS_URL = import.meta.env.VITE_METRICS_URL;
const SAMPLE_RATE = Number(import.meta.env.VITE_METRICS_SAMPLE ?? 1);
const sampled = Math.random() < SAMPLE_RATE;
const sessionId = crypto.randomUUID();
const queue: Record<string, unknown>[] = [];
let flushTimer: number | undefined;

function getContext() {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string };
  };
  return {
    sessionId,
    release: __RELEASE__,
    cpuCores: nav.hardwareConcurrency,
    deviceMemoryGB: nav.deviceMemory,
    network: nav.connection?.effectiveType,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

export function flushMetrics(): void {
  window.clearTimeout(flushTimer);
  flushTimer = undefined;
  if (!METRICS_URL || queue.length === 0) return;

  const body = JSON.stringify({ context: getContext(), events: queue.splice(0) });
  const payload = new Blob([body], { type: "text/plain" });
  const queued = navigator.sendBeacon?.(METRICS_URL, payload) ?? false;
  if (!queued) {
    void fetch(METRICS_URL, { method: "POST", body, keepalive: true }).catch(() => undefined);
  }
}

if (METRICS_URL) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushMetrics();
  });
  window.addEventListener("pagehide", flushMetrics);
}

export function reportMetric(name: string, data: Record<string, unknown>): void {
  if (import.meta.env.DEV || !METRICS_URL) {
    console.log(`[metric] ${name}`, data);
    return;
  }
  if (!sampled) return;

  queue.push({ name, ...data, at: Date.now() });
  if (queue.length >= 10) {
    flushMetrics();
  } else if (flushTimer === undefined) {
    flushTimer = window.setTimeout(flushMetrics, 3000);
  }
}
