import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Please define the MONGODB_URI environment variable");

// extend global object with custom type
declare global {
  //interface to declare the type
  namespace NodeJS {
    interface Global {
      _mongoClientPromise?: Promise<MongoClient>;
    }
  }
}

const globalForMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

if (!globalForMongo._mongoClientPromise) {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  globalForMongo._mongoClientPromise = client.connect();
}

const clientPromise = globalForMongo._mongoClientPromise!;

export default clientPromise;