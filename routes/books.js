
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

const isValidId = (id) => /^[a-fA-F0-9]{24}$/.test(id);

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

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const book = await getDB()
      .collection("books")
      .findOne({ _id: new ObjectId(id) });

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
        !["https:", "http:"].includes(imageURL.protocol)
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

router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const data = req.body;

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid update data.",
      });
    }

    const allowedFields = [
      "title",
      "author",
      "category",
      "image",
      "description",
      "totalCopies",
    ];

    const keys = Object.keys(data);

    if (
      keys.length === 0 ||
      keys.some((key) => !allowedFields.includes(key))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid book update fields.",
      });
    }

    const updates = {};

    const textFields = {
      title: 200,
      author: 150,
      description: 2000,
    };

    for (const [field, maxLength] of Object.entries(
      textFields
    )) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        if (
          typeof data[field] !== "string" ||
          !data[field].trim() ||
          data[field].trim().length > maxLength
        ) {
          return res.status(400).json({
            success: false,
            message: `Invalid ${field}.`,
          });
        }

        updates[field] = data[field].trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, "category")) {
      if (!categories.has(data.category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid book category.",
        });
      }

      updates.category = data.category;
    }

    if (Object.prototype.hasOwnProperty.call(data, "image")) {
      if (
        typeof data.image !== "string" ||
        !data.image.trim() ||
        data.image.length > 2048
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid book image URL.",
        });
      }

      try {
        const imageURL = new URL(data.image.trim());

        if (
          !["https:", "http:"].includes(imageURL.protocol)
        ) {
          throw new Error("Invalid protocol");
        }

        updates.image = imageURL.toString();
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid book image URL.",
        });
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        data,
        "totalCopies"
      )
    ) {
      const rawCopies = data.totalCopies;

      const totalCopies =
        typeof rawCopies === "number" ||
        (typeof rawCopies === "string" &&
          rawCopies.trim() !== "")
          ? Number(rawCopies)
          : NaN;

      if (
        !Number.isSafeInteger(totalCopies) ||
        totalCopies < 1 ||
        totalCopies > 1000
      ) {
        return res.status(400).json({
          success: false,
          message: "Total copies must be between 1 and 1000.",
        });
      }

      updates.totalCopies = totalCopies;
    }

    const collection = getDB().collection("books");

    const book = await collection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    if (book.addedById !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own books.",
      });
    }

    if (updates.totalCopies !== undefined) {
      const borrowedCopies =
        book.totalCopies - book.availableCopies;

      if (
        !Number.isSafeInteger(borrowedCopies) ||
        borrowedCopies < 0 ||
        updates.totalCopies < borrowedCopies
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Total copies cannot be less than borrowed copies.",
        });
      }

      updates.availableCopies =
        updates.totalCopies - borrowedCopies;
    }

    updates.updatedAt = new Date();

    const result = await collection.updateOne(
      {
        _id: book._id,
        addedById: req.user.id,
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
      },
      {
        $set: updates,
      }
    );

    if (!result.matchedCount) {
      return res.status(409).json({
        success: false,
        message: "The book changed. Please try again.",
      });
    }

    const updatedBook = await collection.findOne({
      _id: book._id,
    });

    res.status(200).json({
      success: true,
      message: "Book updated successfully.",
      book: updatedBook,
    });
  } catch (error) {
    console.error("Failed to update book:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to update book.",
    });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const collection = getDB().collection("books");

    const book = await collection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    if (book.addedById !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own books.",
      });
    }

    if (book.availableCopies !== book.totalCopies) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete a book while copies are borrowed.",
      });
    }

    const result = await collection.deleteOne({
      _id: book._id,
      addedById: req.user.id,
      totalCopies: book.totalCopies,
      availableCopies: book.totalCopies,
    });

    if (!result.deletedCount) {
      return res.status(409).json({
        success: false,
        message: "The book changed. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Book deleted successfully.",
      deletedId: id,
    });
  } catch (error) {
    console.error("Failed to delete book:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to delete book.",
    });
  }
});

module.exports = router;
