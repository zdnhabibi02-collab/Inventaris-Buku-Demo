const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://225443018_db_user:Polmansyad@cluster0.yns6u6f.mongodb.net/?appName=Cluster0";
const DB_NAME = process.env.DB_NAME || "book_inventary";

let db;
let booksCollection;

// Middleware
app.use(cors());
// Naikkan limit JSON untuk base64 cover image (maks ~2MB → ~2.7MB base64)
app.use(express.json({ limit: "4mb" }));
app.use(express.static("./"));

// ============================================================
//  MONGODB CONNECTION
// ============================================================
const mongoClient = new MongoClient(MONGODB_URI);

async function connectDB() {
  try {
    await mongoClient.connect();
    console.log("✓ Connected to MongoDB");

    db = mongoClient.db(DB_NAME);
    booksCollection = db.collection("inventaris");
  } catch (error) {
    console.error("✗ MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

// ============================================================
//  API ENDPOINTS — CRUD Operations
// ============================================================

// GET all books dengan filter
app.get("/api/books", async (req, res) => {
  try {
    const { search } = req.query;
    let query = { _id: { $type: "number" } };

    if (search) {
      query = {
        _id: { $type: "number" },
        $or: [
          { judul: { $regex: search, $options: "i" } },
          { pengarang: { $regex: search, $options: "i" } },
        ],
      };
    }

    const books = await booksCollection.find(query).toArray();
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single book by id
app.get("/api/books/:id", async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const book = await booksCollection.findOne({ _id: bookId });
    if (!book) return res.status(404).json({ error: "Buku tidak ditemukan" });
    res.json(book);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Tambah buku baru (pakai _id custom, terima cover base64 opsional)
app.post("/api/books", async (req, res) => {
  try {
    const { judul, pengarang, stok, cover } = req.body;
    if (!judul || !pengarang) {
      return res.status(400).json({ error: "Judul dan pengarang harus diisi" });
    }

    const lastBook = await booksCollection.findOne(
      { _id: { $type: "number" } },
      { sort: { _id: -1 } },
    );
    const newId = lastBook ? lastBook._id + 1 : 1;

    const addrBase = 0x8a00;
    const count = await booksCollection.countDocuments();
    const addr = "0x" + (addrBase + count * 0x40).toString(16).toUpperCase();

    const newBook = {
      _id: newId,
      judul,
      pengarang,
      stok: parseInt(stok) || 0,
      addr,
      // simpan cover sebagai base64 string jika ada, otherwise null
      cover: cover || null,
      createdAt: new Date(),
    };

    await booksCollection.insertOne(newBook);
    res.status(201).json(newBook);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update stok buku
app.put("/api/books/:id/stok", async (req, res) => {
  try {
    const { stok } = req.body;
    const bookId = parseInt(req.params.id, 10);

    if (stok === undefined || isNaN(stok) || stok < 0) {
      return res.status(400).json({ error: "Stok tidak valid" });
    }

    const updateRes = await booksCollection.updateOne(
      { _id: bookId },
      { $set: { stok: parseInt(stok), updatedAt: new Date() } },
    );
    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: "Buku tidak ditemukan" });
    }

    const updated = await booksCollection.findOne({ _id: bookId });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Hapus buku
app.delete("/api/books/:id", async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const result = await booksCollection.deleteOne({ _id: bookId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Buku tidak ditemukan" });
    }
    res.json({
      message: "Buku berhasil dihapus",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET stats
app.get("/api/stats", async (req, res) => {
  try {
    const totalBooks = await booksCollection.countDocuments({
      _id: { $type: "number" },
    });
    const totalStok = await booksCollection
      .aggregate([
        { $match: { _id: { $type: "number" } } },
        { $group: { _id: null, total: { $sum: "$stok" } } },
      ])
      .toArray();
    const lowStockCount = await booksCollection.countDocuments({
      _id: { $type: "number" },
      stok: { $lte: 3 },
    });

    res.json({
      totalBooks,
      totalStok: totalStok[0]?.total || 0,
      lowStockCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SEED DATA
app.post("/api/seed", async (req, res) => {
  try {
    await booksCollection.deleteMany({});

    const seedData = [
      {
        _id: 1,
        judul: "Pemrograman C++",
        pengarang: "Bjarne Stroustrup",
        stok: 5,
        addr: "0x8A00",
        cover: null,
      },
      {
        _id: 2,
        judul: "Clean Code",
        pengarang: "Robert C. Martin",
        stok: 3,
        addr: "0x8A40",
        cover: null,
      },
      {
        _id: 3,
        judul: "The Pragmatic Programmer",
        pengarang: "Andrew Hunt",
        stok: 7,
        addr: "0x8A80",
        cover: null,
      },
      {
        _id: 4,
        judul: "Structure & Interpretation",
        pengarang: "Abelson & Sussman",
        stok: 2,
        addr: "0x8AC0",
        cover: null,
      },
      {
        _id: 5,
        judul: "Design Patterns",
        pengarang: "Gang of Four",
        stok: 1,
        addr: "0x8B00",
        cover: null,
      },
    ];

    await booksCollection.insertMany(seedData);
    res.json({
      message: "Seed data berhasil ditambahkan",
      count: seedData.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  START SERVER
// ============================================================
async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════╗`);
    console.log(`║  LibraryOS Server Running      ║`);
    console.log(`║  Port: ${PORT}                         ║`);
    console.log(`║  DB: ${DB_NAME}               ║`);
    console.log(`║  http://localhost:${PORT}            ║`);
    console.log(`╚════════════════════════════════╝\n`);
  });
}

start().catch(console.error);

process.on("SIGINT", async () => {
  console.log("\n✓ Shutting down gracefully...");
  await mongoClient.close();
  process.exit(0);
});
