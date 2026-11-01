
import "dotenv/config";
import { MongoClient } from "mongodb";
import * as frontendData from "../client/src/data/books.ts";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not defined");
}

const collections = Object.values(frontendData)
  .filter(
    (value) =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) =>
          item &&
          typeof item.title === "string" &&
          typeof item.author === "string"
      )
  )
  .sort((a, b) => b.length - a.length);

const books = collections[0];

if (!books) {
  throw new Error(
    "No exported books array was found in client/src/data/books.ts"
  );
}

const client = new MongoClient(uri);

async function seedBooks() {
  try {
    await client.connect();

    const collection = client.db("booknook").collection("books");

    const operations = books.map((book, index) => {
      const { id, _id, ...fields } = book;

      const totalCopies =
        Number.isInteger(book.totalCopies) &&
        book.totalCopies > 0
          ? book.totalCopies
          : 3;

      const availableCopies =
        Number.isInteger(book.availableCopies)
          ? Math.max(
              0,
              Math.min(book.availableCopies, totalCopies)
            )
          : totalCopies;

      const seedKey = `frontend:${String(id ?? index + 1)}`;

      return {
        updateOne: {
          filter: { seedKey },
          update: {
            $setOnInsert: {
              ...fields,
              image: book.image ?? book.imageUrl ?? "",
              description: book.description ?? "",
              totalCopies,
              availableCopies,
              addedByName: "BookNook Library",
              addedByEmail: null,
              dateAdded:
                book.dateAdded ??
                new Date().toISOString().slice(0, 10),
              createdAt: new Date(
                Date.now() - (books.length - index) * 60000
              ),
              seedKey,
            },
          },
          upsert: true,
        },
      };
    });

    const result = await collection.bulkWrite(operations);

    const total = await collection.countDocuments();

    console.log(`Source books: ${books.length}`);
    console.log(`New books inserted: ${result.upsertedCount}`);
    console.log(`Existing seed books: ${result.matchedCount}`);
    console.log(`Total database books: ${total}`);
    console.log("BookNook seed completed successfully");
  } finally {
    await client.close();
  }
}

seedBooks().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
});
