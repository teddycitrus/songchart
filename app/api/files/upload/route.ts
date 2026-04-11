// POST /api/files/upload
//
// Authenticated file upload to Backblaze B2.
// Body: multipart/form-data with fields:
//   - kind: "chords" | "lyrics"
//   - file: the file (PDF or DOCX, strictly verified)
// Returns: { fileName: string } — caller includes this in the song payload.
//
// Strict validation:
// - Size limit (10 MB)
// - Extension whitelist (.pdf, .docx)
// - Content-Type whitelist
// - Magic-byte sniff (PDF starts with `%PDF-`, DOCX is a ZIP starting with `PK\x03\x04`)
// - All three must agree on the type

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { uploadFile, type B2Kind } from "../../../../lib/b2";
import { rateLimit, getClientIp } from "../../../../lib/rateLimit";
import { verifyToken, bearerFromHeader } from "../../../../lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

type FileKind = "pdf" | "docx";

const ALLOWED: Record<FileKind, { ext: string; mime: string[]; magic: (b: Buffer) => boolean }> = {
  pdf: {
    ext: ".pdf",
    mime: ["application/pdf"],
    magic: b => b.length >= 5 && b.slice(0, 5).toString("ascii") === "%PDF-",
  },
  docx: {
    ext: ".docx",
    mime: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream", // some browsers mislabel; mitigated by magic check below
    ],
    // DOCX is a ZIP container: starts with local file header signature PK\x03\x04
    magic: b => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
};

function detectKind(fileName: string, mime: string, body: Buffer): FileKind | null {
  const lower = fileName.toLowerCase();
  let claimed: FileKind | null = null;
  if (lower.endsWith(".pdf")) claimed = "pdf";
  else if (lower.endsWith(".docx")) claimed = "docx";
  if (!claimed) return null;

  const spec = ALLOWED[claimed];
  if (!spec.mime.includes(mime)) return null;
  if (!spec.magic(body)) return null;

  // Extra cross-check: PDF magic must NOT match a docx file, and vice versa.
  if (claimed === "pdf" && ALLOWED.docx.magic(body)) return null;
  if (claimed === "docx" && ALLOWED.pdf.magic(body)) return null;

  return claimed;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  // Rate limit: 20 uploads / 5 min per IP.
  const rl = rateLimit(`upload:${ip}`, 20, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
    );
  }

  // Auth
  const token = bearerFromHeader(req.headers.get("authorization"));
  if (!verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const kindField = form.get("kind");
  const fileField = form.get("file");
  if (kindField !== "chords" && kindField !== "lyrics") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (fileField.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (fileField.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_BYTES} bytes` }, { status: 413 });
  }

  const buf = Buffer.from(await fileField.arrayBuffer());
  const kind = detectKind(fileField.name, fileField.type, buf);
  if (!kind) {
    return NextResponse.json(
      { error: "File must be a valid .pdf or .docx" },
      { status: 415 },
    );
  }

  const bucket: B2Kind = kindField;
  const fileName = `${randomUUID()}.${kind}`;
  const contentType = kind === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  try {
    await uploadFile(bucket, fileName, contentType, buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    console.error("[files/upload] B2 upload failed:", msg);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  return NextResponse.json({ fileName });
}
