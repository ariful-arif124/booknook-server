
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../db");

const router = express.Router();

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

module.exports = router;
