const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();
const multer = require("multer");
const fs = require("fs");
const path = require("path");

// ============================================================
//  FILE UPLOAD CONFIG - Multer untuk ebook
// ============================================================
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${baseName}-${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".epub", ".mobi", ".txt", ".zip"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Format file tidak didukung. Gunakan: PDF, EPUB, MOBI, TXT, ZIP",
        ),
      );
    }
  },
});

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://syaad:Polmansyad@projectstrukdat.ivd89po.mongodb.net/?appName=projectstrukdat";
const DB_NAME = process.env.DB_NAME || "book_inventary";

let db;
let booksCollection;

// Middleware
app.use(cors());
app.use(express.json({ limit: "20mb" }));
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
    let query = {};

    if (search) {
      query = {
        $or: [
          { judul: { $regex: search, $options: "i" } },
          { pengarang: { $regex: search, $options: "i" } },
          { sinopsis: { $regex: search, $options: "i" } },
          { kategori: { $regex: search, $options: "i" } },
        ],
      };
    }

    const books = await booksCollection.find(query).toArray();
    const normalizedBooks = books.map((b) => ({
      ...b,
      cover: b.cover || b.gambar || "",
    }));
    res.json(normalizedBooks);
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
    res.json({ ...book, cover: book.cover || book.gambar || "" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Tambah buku baru (pakai _id custom)
app.post("/api/books", async (req, res) => {
  try {
    const {
      judul,
      pengarang,
      sinopsis,
      kategori,
      cover,
      gambar,
      ebookPath,
      ebookName,
      ebookSize,
      ebookUploadedAt,
    } = req.body;
    if (!judul || !pengarang || !sinopsis) {
      return res
        .status(400)
        .json({ error: "Judul, pengarang, dan sinopsis harus diisi" });
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
      sinopsis,
      kategori: kategori || "",
      addr,
      cover: cover || gambar || "",
      ebookPath: ebookPath || "",
      ebookName: ebookName || "",
      ebookSize: ebookSize || 0,
      ebookUploadedAt: ebookUploadedAt || null,
      createdAt: new Date(),
    };

    await booksCollection.insertOne(newBook);
    res.status(201).json(newBook);
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

    // Reindex agar _id tetap berurutan setelah penghapusan.
    const remaining = await booksCollection
      .find({ _id: { $type: "number" } })
      .sort({ _id: 1 })
      .toArray();

    const addrBase = 0x8a00;
    const reindexed = remaining.map((book, index) => ({
      ...book,
      _id: index + 1,
      addr: "0x" + (addrBase + index * 0x40).toString(16).toUpperCase(),
    }));

    await booksCollection.deleteMany({ _id: { $type: "number" } });
    if (reindexed.length > 0) {
      await booksCollection.insertMany(reindexed);
    }

    res.json({
      message: "Buku berhasil dihapus dan ID dirapikan",
      deletedCount: result.deletedCount,
      totalBooks: reindexed.length,
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

    res.json({ totalBooks });
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
        sinopsis:
          "Pengantar praktis pemrograman C++ dari konsep dasar hingga OOP dan STL.",
        addr: "0x8A00",
        cover: "",
      },
      {
        _id: 2,
        judul: "Clean Code",
        pengarang: "Robert C. Martin",
        sinopsis:
          "Prinsip menulis kode yang bersih, mudah dibaca, dan mudah dirawat dalam tim.",
        addr: "0x8A40",
        cover: "",
      },
      {
        _id: 3,
        judul: "The Pragmatic Programmer",
        pengarang: "Andrew Hunt",
        sinopsis:
          "Kumpulan praktik terbaik untuk menjadi programmer efektif di berbagai bahasa dan proyek.",
        addr: "0x8A80",
        cover: "",
      },
      {
        _id: 4,
        judul: "Structure & Interpretation",
        pengarang: "Abelson & Sussman",
        sinopsis:
          "Membahas fondasi ilmu komputer melalui pendekatan pemrograman fungsional dan abstraksi.",
        addr: "0x8AC0",
        cover: "",
      },
      {
        _id: 5,
        judul: "Design Patterns",
        pengarang: "Gang of Four",
        sinopsis:
          "Referensi pola desain berorientasi objek untuk menyelesaikan masalah desain perangkat lunak.",
        addr: "0x8B00",
        cover: "",
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

  // Endpoint untuk sinkronisasi ulang seluruh ID
  app.post("/api/books/sync", async (req, res) => {
    try {
      const { data } = req.body;
      console.log("Memulai Sinkronisasi...");

      // 1. Hapus SEMUA data secara total
      await booksCollection.deleteMany({});

      // 2. Masukkan data baru HANYA jika array tidak kosong
      if (data && data.length > 0) {
        await booksCollection.insertMany(data);
      }

      console.log("Sinkronisasi Berhasil!");
      res.json({ message: "Sync Berhasil" });
    } catch (error) {
      console.error("Kesalahan Server:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // POST - Upload ebook untuk book tertentu
  app.post("/api/books/:id/ebook", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Tidak ada file yang diupload" });
      }

      const bookId = parseInt(req.params.id, 10);
      const filePath = `uploads/${req.file.filename}`;
      const fileSize = req.file.size;

      const updateRes = await booksCollection.updateOne(
        { _id: bookId },
        {
          $set: {
            ebookPath: filePath,
            ebookSize: fileSize,
            ebookName: req.file.originalname,
            ebookUploadedAt: new Date(),
          },
        },
      );

      if (updateRes.matchedCount === 0) {
        fs.unlinkSync(req.file.path); // Hapus file jika book tidak ditemukan
        return res.status(404).json({ error: "Buku tidak ditemukan" });
      }

      console.log(
        `✓ Ebook uploaded untuk book #${bookId}: ${req.file.filename}`,
      );

      res.json({
        message: "Ebook berhasil diupload",
        path: filePath,
        size: fileSize,
        name: req.file.originalname,
      });
    } catch (error) {
      console.error("Upload error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // GET - Download ebook
  app.get("/api/books/:id/download", async (req, res) => {
    try {
      const bookId = parseInt(req.params.id, 10);
      const book = await booksCollection.findOne({ _id: bookId });

      if (!book || !book.ebookPath) {
        return res
          .status(404)
          .json({ error: "Ebook tidak ditemukan untuk buku ini" });
      }

      const resolvedPath = path.resolve(__dirname, book.ebookPath);

      // Cek file exists
      if (!fs.existsSync(resolvedPath)) {
        return res
          .status(404)
          .json({ error: "File ebook hilang dari storage" });
      }

      res.download(resolvedPath, book.ebookName || "ebook");
    } catch (error) {
      console.error("Download error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

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

// trigger redeploy
