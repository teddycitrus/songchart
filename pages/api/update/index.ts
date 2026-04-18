
import { ObjectId } from "mongodb";
import clientPromise from "../../../lib/mongodb";
import { deleteFile } from "../../../lib/b2";
import { rateLimit, getClientIp } from "../../../lib/rateLimit";
import { verifyToken, bearerFromHeader } from "../../../lib/auth";
import type { NextApiRequest, NextApiResponse } from "next";


export default async function updateSong(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const ip = getClientIp(req.headers);
  const rl = rateLimit(`update:${ip}`, 60, 5 * 60 * 1000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec ?? 60));
    return res.status(429).json({ message: "Rate limit exceeded" });
  }

  const token = bearerFromHeader(req.headers.authorization);
  if (!verifyToken(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    console.log("attempting to connect to mongo")
    const client = await clientPromise;
    console.log("Connected to MongoDB");

    const db = client.db("songs");
    const myColl = db.collection("music");

    const {
      name, listen, chords, key, transpose, capo, bpm, beat,
      type, usage_counter, lyrics, chordsFile, lyricsFile, notes, _id,
    } = req.body;

    if (!_id || typeof _id !== "string") {
      return res.status(400).json({ message: "_id required" });
    }

    // Fetch existing so we know which files (if any) were just replaced.
    const existing = await myColl.findOne({ _id: new ObjectId(_id) });
    if (!existing) {
      return res.status(404).json({ message: "Song not found" });
    }

    const songToUpdate = {
      name: name,
      listen: typeof listen === "string" ? listen : "",
      chords: chords,
      key: key,
      transpose: transpose,
      capo: capo,
      bpm: bpm,
      beat: beat,
      type: Array.isArray(type) ? type : [],
      usage_counter: typeof usage_counter === "number" ? usage_counter : 0,
      lyrics: typeof lyrics === "string" ? lyrics : "",
      chordsFile: typeof chordsFile === "string" ? chordsFile : "",
      lyricsFile: typeof lyricsFile === "string" ? lyricsFile : "",
      notes: typeof notes === "string" ? notes : "",
    }

    const result = await myColl.updateOne({ _id: new ObjectId(_id) }, { $set: songToUpdate });

    // Clean up any replaced/removed B2 files *after* the Mongo write succeeds,
    // so a failed DB update never strands us without a file.
    const oldChords = typeof existing.chordsFile === "string" ? existing.chordsFile : "";
    const oldLyrics = typeof existing.lyricsFile === "string" ? existing.lyricsFile : "";
    if (oldChords && oldChords !== songToUpdate.chordsFile) {
      try { await deleteFile("chords", oldChords); }
      catch (e) { console.error("[update] failed to drop old chords file:", e); }
    }
    if (oldLyrics && oldLyrics !== songToUpdate.lyricsFile) {
      try { await deleteFile("lyrics", oldLyrics); }
      catch (e) { console.error("[update] failed to drop old lyrics file:", e); }
    }

    res.status(201).json({ message: "Song updated successfully", id: result.upsertedId });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error updating song:", error.message);
      res.status(500).json({ message: "Failed to update song", error: error.message });
    } else {
      console.error("Unexpected error:", error);
      res.status(500).json({ message: "Failed to update song", error: "An unknown error occurred" });
    }
  } finally {
    console.log("job done; connection persists ('global client')");
  }
}
