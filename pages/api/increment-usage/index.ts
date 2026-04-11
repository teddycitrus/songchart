import { ObjectId } from "mongodb";
import clientPromise from "../../../lib/mongodb";
import { rateLimit, getClientIp } from "../../../lib/rateLimit";
import { verifyToken, bearerFromHeader } from "../../../lib/auth";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function incrementUsage(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const ip = getClientIp(req.headers);
  const rl = rateLimit(`incuse:${ip}`, 30, 5 * 60 * 1000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec ?? 60));
    return res.status(429).json({ message: "Rate limit exceeded" });
  }

  const token = bearerFromHeader(req.headers.authorization);
  if (!verifyToken(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids array required" });
    }

    const client = await clientPromise;
    const myColl = client.db("songs").collection("music");

    await myColl.updateMany(
      { _id: { $in: ids.map((id: string) => new ObjectId(id)) } },
      { $inc: { usage_counter: 1 } }
    );

    res.status(200).json({ message: "Usage updated" });
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ message: "Failed to update usage", error: error.message });
    } else {
      res.status(500).json({ message: "Failed to update usage", error: "Unknown error" });
    }
  }
}
