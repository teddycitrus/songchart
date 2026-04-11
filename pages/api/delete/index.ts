import { ObjectId } from "mongodb";
import clientPromise from "../../../lib/mongodb";
import { deleteFile } from "../../../lib/b2";
import { rateLimit, getClientIp } from "../../../lib/rateLimit";
import { verifyToken, bearerFromHeader } from "../../../lib/auth";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function deleteSong(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const ip = getClientIp(req.headers);
  const rl = rateLimit(`delete:${ip}`, 20, 5 * 60 * 1000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec ?? 60));
    return res.status(429).json({ message: "Rate limit exceeded" });
  }

  const token = bearerFromHeader(req.headers.authorization);
  if (!verifyToken(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const client = await clientPromise;
    const db = client.db("songs");
    const myColl = db.collection("music");

    const { _id } = req.body;
    if (!_id || typeof _id !== "string") {
      return res.status(400).json({ message: "_id required" });
    }

    // Fetch the song first so we know which B2 files to clean up.
    const existing = await myColl.findOne({ _id: new ObjectId(_id) });
    if (!existing) {
      return res.status(404).json({ message: "Song not found" });
    }

    // Delete B2 files first. If either fails, log and continue — we'd rather
    // have an orphaned B2 file than leave a dead Mongo row pointing at nothing.
    if (typeof existing.chordsFile === "string" && existing.chordsFile) {
      try { await deleteFile("chords", existing.chordsFile); }
      catch (e) { console.error("[delete] failed to drop chords file:", e); }
    }
    if (typeof existing.lyricsFile === "string" && existing.lyricsFile) {
      try { await deleteFile("lyrics", existing.lyricsFile); }
      catch (e) { console.error("[delete] failed to drop lyrics file:", e); }
    }

    await myColl.deleteOne({ _id: new ObjectId(_id) });
    res.status(200).json({ message: "Song deleted successfully" });
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ message: "Failed to delete song", error: error.message });
    } else {
      res.status(500).json({ message: "Failed to delete song", error: "Unknown error" });
    }
  }
}
