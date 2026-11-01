
require("dotenv").config();

const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not defined");
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
});

let database;

async function connectDB() {
  await client.connect();

  const db = client.db("booknook");

  await db.command({ ping: 1 });

  await db.collection("borrows").createIndex(
    {
      userId: 1,
      bookId: 1,
    },
    {
      unique: true,
      partialFilterExpression: {
        status: "borrowed",
      },
      name: "unique_active_book_borrow",
    }
  );

  database = db;

  console.log("MongoDB Atlas connected successfully");

  return database;
}

function getDB() {
  if (!database) {
    throw new Error("Database is not connected");
  }

  return database;
}

function getClient() {
  if (!database) {
    throw new Error("Database is not connected");
  }

  return client;
}

module.exports = {
  connectDB,
  getDB,
  getClient,
};
