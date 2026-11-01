
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

router.post("/", verifyToken, async (req, res) => {
  const { bookId } = req.body || {};

  if (
    typeof bookId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(bookId)
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
          {
            _id: objectId,
          },
          {
            session,
          }
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
            {
              session,
            }
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
              availableCopies: {
                $gt: 0,
              },
            },
            {
              $inc: {
                availableCopies: -1,
              },
            },
            {
              session,
            }
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
            {
              session,
            }
          );

        return {
          _id: insertResult.insertedId,
          ...newBorrow,
        };
      },
      {
        readPreference: "primary",
        readConcern: {
          level: "snapshot",
        },
        writeConcern: {
          w: "majority",
        },
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

module.exports = router;
