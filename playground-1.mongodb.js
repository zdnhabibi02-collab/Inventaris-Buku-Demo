/* global use, db */
// MongoDB Playground for LibraryOS (_id-only model)

use("book_inventary");

db.getCollection("inventaris").deleteMany({});

db.getCollection("inventaris").insertMany([
  {
    _id: 1,
    judul: "Pemrograman C++",
    pengarang: "Bjarne Stroustrup",
    stok: 5,
    addr: "0x8A00",
  },
  {
    _id: 2,
    judul: "Clean Code",
    pengarang: "Robert C. Martin",
    stok: 3,
    addr: "0x8A40",
  },
]);

db.getCollection("inventaris").find({}, { _id: 1, judul: 1, stok: 1 });
