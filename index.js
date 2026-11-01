
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDB, getDB } = require("./db");
const booksRouter = require("./routes/books");
const borrowsRouter = require("./routes/borrows");

const app = express();

const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "BookNook API is running",
  });
});

app.get("/health", async (req, res) => {
  try {
    await getDB().command({ ping: 1 });

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.use("/books", booksRouter);
app.use("/borrows", borrowsRouter);

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `BookNook server running on http://localhost:${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error(
      "Database connection failed:",
      error.message
    );

    process.exit(1);
  });
