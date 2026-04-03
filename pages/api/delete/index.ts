import { ObjectId } from "mongodb";
import clientPromise from "../../../lib/mongodb";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function deleteSong(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const client = await clientPromise;
    const db = client.db("songs");
    const myColl = db.collection("music");

    const { _id } = req.body;
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
