type Call = { ts: number; path: string };
const calls: Call[] = [];
const ONE_HOUR = 60 * 60 * 1000;
function prune() { const cutoff = Date.now() - ONE_HOUR; while (calls.length && calls[0].ts < cutoff) calls.shift(); }
export function recordApiCall(path: string) { calls.push({ ts: Date.now(), path }); prune(); }
export function getApiCallStats(): { lastHour: number; byPath: Record<string, number> } {
  prune();
  const byPath: Record<string, number> = {};
  for (const c of calls) byPath[c.path] = (byPath[c.path] ?? 0) + 1;
  return { lastHour: calls.length, byPath };
}
let started = false;
export function startApiMonitorLogger() {
  if (started) return;
  started = true;
  setInterval(() => { console.log("[api-monitor] calls last hour:", getApiCallStats()); }, ONE_HOUR);
}
