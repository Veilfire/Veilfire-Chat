import { MongoClient, type MongoClientOptions } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options: MongoClientOptions = {};

const mongoAuthFlag = process.env.MONGO_AUTH ?? process.env.mongo_auth;
if (mongoAuthFlag && mongoAuthFlag.toLowerCase() === "true") {
  const username = process.env.MONGO_USER ?? process.env.mongo_user;
  const password = process.env.MONGO_PASS ?? process.env.mongo_pass;
  if (username && password) {
    options.auth = { username, password };
  }
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
