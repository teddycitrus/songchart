import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Please define the MONGODB_URI environment variable");

// augment global NodeJS.Global interface (ES2015)
declare module globalThis {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (!globalThis._mongoClientPromise) {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  globalThis._mongoClientPromise = client.connect();
}

const clientPromise = globalThis._mongoClientPromise!;

export default clientPromise;
