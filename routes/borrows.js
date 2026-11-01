
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB, getClient } = require("../db");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

class BorrowError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const isValidId = (id) => /^[a-fA-F0-9]{24}$/.test(id);

router.get("/", verifyToken, async (req, res) => {
  try {
    const borrows = await getDB()
      .collection("borrows")
      .find({
        userId: req.user.id,
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(borrows);
  } catch (error) {
    console.error("Failed to fetch borrows:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch borrowed books.",
    });
  }
});

router.post("/", verifyToken, async (req, res) => {
  const { bookId } = req.body || {};

  if (
    typeof bookId !== "string" ||
    !isValidId(bookId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid book ID.",
    });
  }

  const session = getClient().startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const db = getDB();
        const booksCollection = db.collection("books");
        const borrowsCollection = db.collection("borrows");

        const objectId = new ObjectId(bookId);

        const book = await booksCollection.findOne(
          { _id: objectId },
          { session }
        );

        if (!book) {
          throw new BorrowError(404, "Book not found.");
        }

        const existingBorrow =
          await borrowsCollection.findOne(
            {
              bookId: objectId,
              userId: req.user.id,
              status: "borrowed",
            },
            { session }
          );

        if (existingBorrow) {
          throw new BorrowError(
            409,
            "You have already borrowed this book."
          );
        }

        if (
          !Number.isSafeInteger(book.availableCopies) ||
          book.availableCopies < 1
        ) {
          throw new BorrowError(
            409,
            "This book is currently unavailable."
          );
        }

        const updateResult =
          await booksCollection.updateOne(
            {
              _id: objectId,
              availableCopies: { $gt: 0 },
            },
            {
              $inc: { availableCopies: -1 },
            },
            { session }
          );

        if (updateResult.modifiedCount !== 1) {
          throw new BorrowError(
            409,
            "No available copies remain."
          );
        }

        const now = new Date();

        const dueDate = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        const newBorrow = {
          bookId: objectId,
          bookTitle: book.title,
          bookImage: book.image,
          userId: req.user.id,
          userName: req.user.name,
          userEmail: req.user.email,
          borrowDate: now.toISOString().slice(0, 10),
          returnDate: dueDate.toISOString().slice(0, 10),
          status: "borrowed",
          createdAt: now,
        };

        const insertResult =
          await borrowsCollection.insertOne(
            newBorrow,
            { session }
          );

        return {
          _id: insertResult.insertedId,
          ...newBorrow,
        };
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );

    return res.status(201).json({
      success: true,
      message: "Book borrowed successfully.",
      borrow: result,
    });
  } catch (error) {
    if (error instanceof BorrowError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already borrowed this book.",
      });
    }

    console.error("Borrow failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to borrow the book.",
    });
  } finally {
    await session.endSession();
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid borrowing ID.",
    });
  }

  const session = getClient().startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const db = getDB();
        const borrowsCollection = db.collection("borrows");
        const booksCollection = db.collection("books");

        const borrow = await borrowsCollection.findOne(
          {
            _id: new ObjectId(id),
            userId: req.user.id,
          },
          { session }
        );

        if (!borrow) {
          throw new BorrowError(
            404,
            "Borrowing record not found."
          );
        }

        if (borrow.status !== "borrowed") {
          throw new BorrowError(
            409,
            "This book has already been returned."
          );
        }

        const book = await booksCollection.findOne(
          { _id: borrow.bookId },
          { session }
        );

        if (!book) {
          throw new BorrowError(
            409,
            "The borrowed book no longer exists."
          );
        }

        const now = new Date();

        const borrowUpdate =
          await borrowsCollection.updateOne(
            {
              _id: borrow._id,
              userId: req.user.id,
              status: "borrowed",
            },
            {
              $set: {
                status: "returned",
                returnedAt: now,
                actualReturnDate: now
                  .toISOString()
                  .slice(0, 10),
              },
            },
            { session }
          );

        if (borrowUpdate.modifiedCount !== 1) {
          throw new BorrowError(
            409,
            "This book has already been returned."
          );
        }

        const bookUpdate = await booksCollection.updateOne(
          {
            _id: borrow.bookId,
            totalCopies: book.totalCopies,
            availableCopies: {
              $gte: 0,
              $lt: book.totalCopies,
            },
          },
          {
            $inc: { availableCopies: 1 },
          },
          { session }
        );

        if (bookUpdate.modifiedCount !== 1) {
          throw new BorrowError(
            409,
            "Unable to restore the book inventory."
          );
        }

        return {
          ...borrow,
          status: "returned",
          returnedAt: now,
          actualReturnDate: now
            .toISOString()
            .slice(0, 10),
        };
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Book returned successfully.",
      borrow: result,
    });
  } catch (error) {
    if (error instanceof BorrowError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Return failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to return the book.",
    });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
