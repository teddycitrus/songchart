// In-memory per-IP sliding-window rate limiter.
//
// Caveats:
// - Resets on serverless cold starts; fine for casual abuse prevention,
//   not for adversarial traffic. For anything serious, swap in Upstash
//   Redis or a durable store.
// - Globally cached so hot reloads in dev don't wipe state.

declare global {
  // eslint-disable-next-line no-var
  var _rateLimitBuckets: Map<string, number[]> | undefined;
}

const BUCKETS: Map<string, number[]> =
  global._rateLimitBuckets ?? (global._rateLimitBuckets = new Map());

export type RateLimitResult = { allowed: boolean; retryAfterSec?: number };

/**
 * Returns { allowed: true } if this hit is within the limit, or
 * { allowed: false, retryAfterSec } if it should be rejected.
 *
 * @param key    Unique bucket key. Typically `${route}:${ip}`.
 * @param limit  Max hits within the window.
 * @param windowMs Window size in milliseconds.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const arr = BUCKETS.get(key) ?? [];
  // Drop timestamps outside the window.
  const recent = arr.filter(t => now - t < windowMs);

  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    // Don't push — rejected hits don't count toward the window.
    BUCKETS.set(key, recent);
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  BUCKETS.set(key, recent);

  // Periodic light cleanup: if the map gets big, drop empty buckets.
  if (BUCKETS.size > 5000) {
    for (const [k, v] of BUCKETS) {
      if (v.length === 0 || now - v[v.length - 1] > windowMs) BUCKETS.delete(k);
    }
  }

  return { allowed: true };
}

/** Pull a best-effort client IP from a Next.js request or Fetch Request. */
export function getClientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
  const getHeader = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const v = headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  const xff = getHeader("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = getHeader("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
