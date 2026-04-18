
import clientPromise from "../../../lib/mongodb";
import { rateLimit, getClientIp } from "../../../lib/rateLimit";
import { verifyToken, bearerFromHeader } from "../../../lib/auth";
import type { NextApiRequest, NextApiResponse } from "next";


export default async function addSong(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const ip = getClientIp(req.headers);
  const rl = rateLimit(`edit:${ip}`, 60, 5 * 60 * 1000);
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
      type, usage_counter, lyrics, chordsFile, lyricsFile, notes,
    } = req.body;

    // add a song
    const song = {
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

    const result = await myColl.insertOne(song);
    res.status(201).json({ message: "Song added successfully", id: result.insertedId });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error adding song:", error.message);
      res.status(500).json({ message: "Failed to add song", error: error.message });
    } else {
      console.error("Unexpected error:", error);
      res.status(500).json({ message: "Failed to add song", error: "An unknown error occurred" });
    }
  } finally {
    console.log("job done; connection persists ('global client')");
  }
}
