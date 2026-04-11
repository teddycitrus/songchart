// Minimal HMAC-signed session token.
//
// Token format: `${expiresAt}.${hmac_sha256}` where the hmac is over
// `${expiresAt}` using SECRET as the key.
//
// SECRET is derived from AUTH_PASS if SESSION_SECRET is not set. Both are
// fine for the scale of this app; for a real deployment set SESSION_SECRET
// to a separate random 32-byte value so rotating the password doesn't
// invalidate keys you might use for other things.

import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.AUTH_PASS;
  if (!s) throw new Error("Missing AUTH_PASS / SESSION_SECRET");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function issueToken(ttlMs: number = DEFAULT_TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);

  const expected = sign(payload);
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;

  return true;
}

/** Extract `Bearer <token>` from an Authorization header value. */
export function bearerFromHeader(header: string | string[] | null | undefined): string | null {
  const h = Array.isArray(header) ? header[0] : header;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
