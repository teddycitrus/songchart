import clientPromise from "../../../lib/mongodb";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function fetchSongs(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  console.log("attempting to connect to mongodb...");

  try {
    // Connect to MongoDB
    console.log("attempting to connect (but fr this time)")
    const client = await clientPromise;
    console.log("Connected to MongoDB");

    // Select the database and collection
    console.log("trying to connect to db...");
    const db = client.db("songs");
    console.log("connected to db");
    console.log("trying to connect to collection...");
    const collection = db.collection("music");
    console.log("connected to collection");

    // Fetch all songs from the collection, in case-insensitive alphabetical order by name
    const songs = await collection.find({}).collation({ locale: "en", strength: 2 }).sort({ name: 1 }).toArray();

    if (!songs || songs.length === 0) {
      return res.status(200).json({ message: "No songs found" });  // error handling ig
    }

    // Return the songs as JSON response
    res.status(200).json(songs);
    
  } catch (error) {
    console.error("Error fetching songs:", error);
    res.status(500).json({ message: "Failed to fetch songs" });
  } finally {
    console.log("job done; connection persists ('global client')");
  }
}