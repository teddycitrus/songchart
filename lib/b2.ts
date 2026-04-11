// Minimal Backblaze B2 client.
//
// Design notes:
// - One "bucket channel" per logical kind ("chords" | "lyrics"), each with
//   its own bucket-scoped application key pair (keyId, appKey) from .env.
// - Auth tokens last up to 24h; we cache per-bucket with a ~23h TTL.
// - Upload URLs are single-use in B2, so we request a fresh one every upload.
// - Bucket name is derived from the `allowed` block of authorize_account, so
//   callers never have to know it — but that means keys MUST be bucket-scoped.

import { createHash } from "crypto";

export type B2Kind = "chords" | "lyrics";

type B2Auth = {
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
  bucketId: string;
  bucketName: string;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var _b2AuthCache: Record<B2Kind, B2Auth | undefined> | undefined;
}

const AUTH_CACHE: Record<B2Kind, B2Auth | undefined> =
  global._b2AuthCache ?? (global._b2AuthCache = { chords: undefined, lyrics: undefined });

const AUTH_TTL_MS = 23 * 60 * 60 * 1000; // 23h (tokens valid 24h)

function credsFor(kind: B2Kind): { keyId: string; appKey: string } {
  const keyId = kind === "chords" ? process.env.SACM_CHORDS_ID : process.env.SACM_LYRICS_ID;
  const appKey = kind === "chords" ? process.env.SACM_CHORDS_KEY : process.env.SACM_LYRICS_KEY;
  if (!keyId || !appKey) {
    throw new Error(`Missing B2 credentials for ${kind}. Set SACM_${kind.toUpperCase()}_ID and SACM_${kind.toUpperCase()}_KEY in .env`);
  }
  return { keyId, appKey };
}

async function authorize(kind: B2Kind): Promise<B2Auth> {
  const cached = AUTH_CACHE[kind];
  if (cached && cached.expiresAt > Date.now()) return cached;

  const { keyId, appKey } = credsFor(kind);
  const basic = Buffer.from(`${keyId}:${appKey}`).toString("base64");

  const res = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    throw new Error(`B2 authorize failed (${kind}): ${res.status} ${await res.text()}`);
  }
  const data = await res.json() as {
    apiInfo: { storageApi: { apiUrl: string; downloadUrl: string; bucketId?: string; bucketName?: string } };
    authorizationToken: string;
  };

  const { apiUrl, downloadUrl, bucketId, bucketName } = data.apiInfo.storageApi;
  if (!bucketId || !bucketName) {
    throw new Error(`B2 key for ${kind} is not bucket-scoped. Create a key restricted to a single bucket in the B2 console.`);
  }

  const auth: B2Auth = {
    authorizationToken: data.authorizationToken,
    apiUrl,
    downloadUrl,
    bucketId,
    bucketName,
    expiresAt: Date.now() + AUTH_TTL_MS,
  };
  AUTH_CACHE[kind] = auth;
  return auth;
}

/** Drop the cached auth for a bucket — used when a call fails with 401. */
function invalidate(kind: B2Kind) {
  AUTH_CACHE[kind] = undefined;
}

async function getUploadUrl(kind: B2Kind): Promise<{ uploadUrl: string; authorizationToken: string }> {
  const auth = await authorize(kind);
  const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: "POST",
    headers: {
      Authorization: auth.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucketId: auth.bucketId }),
  });
  if (res.status === 401) {
    invalidate(kind);
    throw new Error("B2 auth expired; retry");
  }
  if (!res.ok) {
    throw new Error(`B2 get_upload_url failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

/**
 * Upload a file to the bucket. Replaces any existing file with the same name
 * by first uploading the new version, then deleting any older versions.
 */
export async function uploadFile(
  kind: B2Kind,
  fileName: string,
  contentType: string,
  body: Buffer,
): Promise<void> {
  const { uploadUrl, authorizationToken } = await getUploadUrl(kind);
  const sha1 = createHash("sha1").update(body).digest("hex");

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(fileName),
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "X-Bz-Content-Sha1": sha1,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`B2 upload failed: ${res.status} ${await res.text()}`);
  }

  // Clean up any older versions of this filename so we don't bleed storage.
  await deleteOldVersions(kind, fileName);
}

/** Fetch the file from B2 as a stream-friendly Response. */
export async function downloadFile(
  kind: B2Kind,
  fileName: string,
): Promise<{ body: ArrayBuffer; contentType: string; contentLength: number } | null> {
  const auth = await authorize(kind);
  const url = `${auth.downloadUrl}/file/${encodeURIComponent(auth.bucketName)}/${encodeURIComponent(fileName)}`;
  const res = await fetch(url, {
    headers: { Authorization: auth.authorizationToken },
  });
  if (res.status === 404) return null;
  if (res.status === 401) {
    invalidate(kind);
    throw new Error("B2 auth expired; retry");
  }
  if (!res.ok) {
    throw new Error(`B2 download failed: ${res.status} ${await res.text()}`);
  }
  const buf = await res.arrayBuffer();
  return {
    body: buf,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    contentLength: buf.byteLength,
  };
}

type B2FileVersion = { fileId: string; fileName: string; uploadTimestamp: number };

async function listVersions(kind: B2Kind, fileName: string): Promise<B2FileVersion[]> {
  const auth = await authorize(kind);
  const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_versions`, {
    method: "POST",
    headers: {
      Authorization: auth.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketId: auth.bucketId,
      startFileName: fileName,
      prefix: fileName,
      maxFileCount: 100,
    }),
  });
  if (!res.ok) {
    throw new Error(`B2 list_file_versions failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json() as { files: B2FileVersion[] };
  // B2 prefix matching is "startsWith", so filter to exact filename.
  return data.files.filter(f => f.fileName === fileName);
}

async function deleteVersion(kind: B2Kind, fileId: string, fileName: string): Promise<void> {
  const auth = await authorize(kind);
  const res = await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
    method: "POST",
    headers: {
      Authorization: auth.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fileId, fileName }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`B2 delete_file_version failed: ${res.status} ${await res.text()}`);
  }
}

/** Keep the newest version of a file; delete every older version. */
async function deleteOldVersions(kind: B2Kind, fileName: string): Promise<void> {
  const versions = await listVersions(kind, fileName);
  if (versions.length <= 1) return;
  // Sort newest-first and drop [0]; delete the rest.
  versions.sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);
  for (const v of versions.slice(1)) {
    await deleteVersion(kind, v.fileId, v.fileName);
  }
}

/** Delete ALL versions of a file. Idempotent — no error if the file is already gone. */
export async function deleteFile(kind: B2Kind, fileName: string): Promise<void> {
  const versions = await listVersions(kind, fileName);
  for (const v of versions) {
    await deleteVersion(kind, v.fileId, v.fileName);
  }
}
