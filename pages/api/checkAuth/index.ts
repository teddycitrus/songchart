import type { NextApiRequest, NextApiResponse } from "next";
import { issueToken } from "../../../lib/auth";
import { rateLimit, getClientIp } from "../../../lib/rateLimit";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Tight limit to throttle brute force: 8 attempts / 10 min per IP.
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`auth:${ip}`, 8, 10 * 60 * 1000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec ?? 60));
    return res.status(429).json({ ok: false, error: "Too many attempts" });
  }

  const expected = process.env.AUTH_PASS;
  if (!expected) {
    return res.status(500).json({ ok: false, error: "Server misconfigured" });
  }

  const { password } = req.body ?? {};
  if (typeof password !== "string" || !safeEqual(password, expected)) {
    return res.status(401).json({ ok: false });
  }

  const token = issueToken();
  return res.status(200).json({ ok: true, token });
}
