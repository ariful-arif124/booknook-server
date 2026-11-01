
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../db");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

const categories = new Set([
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",
]);

router.get("/", async (req, res) => {
  try {
    const books = await getDB()
      .collection("books")
      .find({})
      .sort({ _id: -1 })
      .toArray();

    res.status(200).json(books);
  } catch (error) {
    console.error("Failed to fetch books:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch books.",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const book = await getDB()
      .collection("books")
      .findOne({
        _id: new ObjectId(id),
      });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    res.status(200).json(book);
  } catch (error) {
    console.error("Failed to fetch book:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch book details.",
    });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const data = req.body || {};

    const title =
      typeof data.title === "string"
        ? data.title.trim()
        : "";

    const author =
      typeof data.author === "string"
        ? data.author.trim()
        : "";

    const category =
      typeof data.category === "string"
        ? data.category.trim()
        : "";

    const image =
      typeof data.image === "string"
        ? data.image.trim()
        : "";

    const description =
      typeof data.description === "string"
        ? data.description.trim()
        : "";

    const rawCopies = data.totalCopies;

    const totalCopies =
      typeof rawCopies === "number" ||
      (typeof rawCopies === "string" &&
        rawCopies.trim() !== "")
        ? Number(rawCopies)
        : NaN;

    if (
      !title ||
      title.length > 200 ||
      !author ||
      author.length > 150 ||
      !categories.has(category) ||
      !image ||
      !description ||
      description.length > 2000 ||
      !Number.isSafeInteger(totalCopies) ||
      totalCopies < 1 ||
      totalCopies > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid book information.",
      });
    }

    try {
      const imageURL = new URL(image);

      if (
        imageURL.protocol !== "https:" &&
        imageURL.protocol !== "http:"
      ) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid book image URL.",
      });
    }

    const now = new Date();

    const newBook = {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
      availableCopies: totalCopies,
      addedById: req.user.id,
      addedByName: req.user.name,
      addedByEmail: req.user.email,
      dateAdded: now.toISOString().slice(0, 10),
      createdAt: now,
    };

    const result = await getDB()
      .collection("books")
      .insertOne(newBook);

    res.status(201).json({
      success: true,
      message: "Book added successfully.",
      book: {
        _id: result.insertedId,
        ...newBook,
      },
    });
  } catch (error) {
    console.error("Failed to add book:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to add book.",
    });
  }
});

module.exports = router;
