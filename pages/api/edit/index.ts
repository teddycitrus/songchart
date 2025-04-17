
import clientPromise from "../../../lib/mongodb";
import type { NextApiRequest, NextApiResponse } from "next";


export default async function addSong(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // Connect to MongoDB
    console.log("attempting to connect to mongo")
    const client = await clientPromise;
    console.log("Connected to MongoDB");

    // Select the database and collection
    console.log("attempting to connect to songs db");
    const db = client.db("songs");
    console.log("connected to songs db");
    console.log("attempting to connect to music coll");
    const myColl = db.collection("music");
    console.log("connected to music coll");

    //breakdown json object from frontend annotate page
    const { name, chords, key, transpose, capo, bpm, beat } = req.body;
    console.log("song data from frontend:", {
      name, chords, key, transpose, capo, bpm, beat
    });
    
    // add a song
    const song = {
      name: name,
      chords: chords,
      key: key,
      transpose: transpose,
      capo: capo,
      bpm: bpm,
      beat: beat
    }

    console.log("final song object:", song);

    const result = await myColl.insertOne(song);
    res.status(201).json({ message: "Song added successfully", id: result.insertedId });
  } catch (error: unknown) {
    if (error instanceof Error) {  //error is an instance of Error
      console.error("Error adding song:", error.message);
      res.status(500).json({ message: "Failed to add song", error: error.message });
    } else {
      //unexpected error types (gpt recommended it dont ask me)
      console.error("Unexpected error:", error);
      res.status(500).json({ message: "Failed to add song", error: "An unknown error occurred" });
    }
  } finally {
    console.log("job done; connection persists ('global client')");
  }
}