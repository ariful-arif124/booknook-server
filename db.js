
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

  database = client.db("booknook");

  await database.command({ ping: 1 });

  console.log("MongoDB Atlas connected successfully");

  return database;
}

function getDB() {
  if (!database) {
    throw new Error("Database is not connected");
  }

  return database;
}

module.exports = {
  connectDB,
  getDB,
};
