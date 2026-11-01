
const express = require("express");
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

module.exports = router;
