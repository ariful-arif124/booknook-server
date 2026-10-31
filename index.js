
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
  })
);

app.use(express.json());

app.get("/books", (req, res) => {
  res.status(200).json([]);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`BookNook API running on http://localhost:${PORT}`);
});
