// GET /api/files/[kind]/[id]
//
// Public file proxy for Backblaze B2.
//
// - kind must be "chords" or "lyrics"
// - id is the filename (uuid.pdf or uuid.docx)
// - No auth: files are viewable by anyone who has the ID
// - Rate-limited per IP to prevent bandwidth abuse
// - Content-Disposition: inline, so PDFs render in-browser

import { NextRequest, NextResponse } from "next/server";
import { downloadFile, type B2Kind } from "../../../../../lib/b2";
import { rateLimit, getClientIp } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";

// Only allow exact `uuid.pdf` / `uuid.docx` — no traversal, no extra path bits.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx)$/i;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await ctx.params;

  if (kind !== "chords" && kind !== "lyrics") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  // Generous rate limit: 120 requests / min / IP. Plenty for a human reading
  // lyrics, tight enough to throttle a script.
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`filedl:${ip}`, 120, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
    );
  }

  let result;
  try {
    result = await downloadFile(kind as B2Kind, id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Download failed";
    console.error("[files/get] B2 download failed:", msg);
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isPdf = id.toLowerCase().endsWith(".pdf");
  const contentType = isPdf
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(result.contentLength),
      "Content-Disposition": `inline; filename="${id}"`,
      // Short cache — files are effectively immutable (uuid in name) but
      // deletes should take effect quickly on replacement.
      "Cache-Control": "public, max-age=300",
    },
  });
}
