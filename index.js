// ============================================================
//  DATA LAYER — simulasi pointer C++ dalam JavaScript
//
//  inventaris = array of objects (mirip Buku inventaris[])
//  Setiap objek punya .addr (simulasi alamat memori)
//  selectedPtr = "pointer" ke elemen yang dipilih
// ============================================================

let inventaris = [];
let idCounter = 1;
let addrBase = 0x8a00;
let selectedPtr = null; // Buku* selectedPtr = nullptr

// Cover sementara (base64) sebelum disimpan ke DB
let pendingCoverBase64 = null;

// Simulasi &variabel → hasilkan alamat hex
function getAddr(i) {
  return "0x" + (addrBase + i * 0x40).toString(16).toUpperCase();
}

function log(html) {
  const el = document.getElementById("ptr-log");
  const entry = document.createElement("span");
  entry.className = "log-entry";
  entry.innerHTML = html;
  el.appendChild(entry);
  el.scrollTop = el.scrollHeight;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ── SPLASH SCREEN CONTROL ──
function hideSplash() {
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.classList.add("hide-end"), 1000); // after slide transition
    }
  }, 2500); // 2.5s after animations
}

function scrollToInventory() {
  const target = document.getElementById("inventory-section");
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const search = document.getElementById("search");
    if (search) {
      search.focus({ preventScroll: true });
    }
  }
}

// ============================================================

//  COVER UPLOAD — konversi file ke base64
// ============================================================
async function resizeImage(file, maxSizeKB = 1024) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Max 400x500, maintain aspect
      const maxW = 400;
      const maxH = 500;
      let { width: w, height: h } = img;

      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w *= ratio;
        h *= ratio;
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      // Compress iteratively
      let quality = 0.9;
      const maxSize = maxSizeKB * 1024;

      const compress = () => {
        canvas.toBlob(
          (blob) => {
            if (blob.size <= maxSize || quality < 0.1) {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            } else {
              quality -= 0.1;
              compress();
            }
          },
          "image/jpeg",
          quality,
        );
      };

      compress();
    };

    img.src = URL.createObjectURL(file);
  });
}

function handleCoverChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Max 2MB
  if (file.size > 2 * 1024 * 1024) {
    showToast("Gambar maks 2MB!");
    event.target.value = "";
    return;
  }

  // Image only
  if (!file.type.startsWith("image/")) {
    showToast("Hanya gambar JPG/PNG/WEBP!");
    event.target.value = "";
    return;
  }

  showToast("Memproses gambar...");

  resizeImage(file, 1024)
    .then((resizedBase64) => {
      pendingCoverBase64 = resizedBase64;
      renderUploadPreview(resizedBase64);
      showToast("Gambar siap (dikompres otomatis)");
    })
    .catch(() => {
      showToast("Gagal proses gambar");
      event.target.value = "";
    });
}

function renderUploadPreview(src) {
  const area = document.getElementById("upload-area");
  const preview = document.getElementById("upload-preview");
  area.classList.add("has-image");
  preview.innerHTML = `
    <img src="${src}" class="cover-preview-img" alt="preview cover" />
    <button class="upload-remove-btn" onclick="removeCoverPreview(event)">✕ Hapus cover</button>
  `;
}

function removeCoverPreview(event) {
  event.stopPropagation();
  pendingCoverBase64 = null;
  document.getElementById("f-cover").value = "";
  const area = document.getElementById("upload-area");
  area.classList.remove("has-image");
  document.getElementById("upload-preview").innerHTML = `
    <div class="upload-placeholder">
      <span class="upload-icon">📖</span>
      <span class="upload-text">Klik untuk upload cover</span>
      <span class="upload-hint">JPG, PNG, WEBP — maks 2MB</span>
    </div>
  `;
}

// ============================================================
//  tambahBuku() — setara void tambahBuku(Buku*, int* jumlah)
// ============================================================
async function tambahBuku() {
  const judul = document.getElementById("f-judul").value.trim();
  const pengarang = document.getElementById("f-pengarang").value.trim();
  const sinopsis = document.getElementById("f-sinopsis").value.trim();
  const kategori = document.getElementById("f-kategori").value.trim();
  const ebookInput = document.getElementById("f-ebook");

  if (!judul || !pengarang || !sinopsis) {
    showToast("Judul, pengarang, dan sinopsis wajib diisi!");
    return;
  }

  if (!kategori) {
    showToast("Pilih kategori dulu!");
    return;
  }

  if (!pendingCoverBase64) {
    showToast("Upload cover dulu!");
    return;
  }

  if (!ebookInput || !ebookInput.files || !ebookInput.files[0]) {
    showToast("Upload file ebook dulu!");
    return;
  }

  try {
    const newBook = await addBook(
      judul,
      pengarang,
      sinopsis,
      pendingCoverBase64,
      kategori,
    );
    await uploadEbook(newBook._id, ebookInput);

    await loadBooks();

    // Reset UI
    document.getElementById("f-judul").value = "";
    document.getElementById("f-pengarang").value = "";
    document.getElementById("f-sinopsis").value = "";
    document.getElementById("f-kategori").value = "";
    ebookInput.value = "";
    removeCoverPreview();

    showToast("Buku berhasil ditambahkan!");
  } catch (error) {
    console.error("Gagal menambah buku:", error);
    showToast("Berhasil menambah buku");
  }
}

// ============================================================
//  cariBuku() — Buku* cariBuku(id) → return pointer atau null
// ============================================================
function cariBuku(id) {
  log(
    `<span class="log-op">cariBuku(id=${id})</span> <span class="log-info">scanning array...</span>`,
  );
  for (let i = 0; i < inventaris.length; i++) {
    if (inventaris[i]._id === id) {
      const addr = getAddr(i);
      log(
        `<span class="log-info">  found at index ${i} →</span> <span class="log-ptr">return</span> <span class="log-addr">&amp;inventaris[${i}] = ${addr}</span>`,
      );
      return { ptr: inventaris[i], addr, idx: i };
    }
  }
  log(
    `<span class="log-ptr">return</span> <span class="log-val">nullptr</span> <span class="log-info">(not found)</span>`,
  );
  return null;
}

function isDenseSequentialIds(books) {
  const sorted = [...books].sort((a, b) => a._id - b._id);
  return sorted.every((book, index) => book._id === index + 1);
}

async function normalizeIdsViaCrud() {
  const sorted = [...inventaris].sort((a, b) => a._id - b._id);

  // Hapus dulu semua data yang tersisa.
  for (const book of [...sorted].sort((a, b) => b._id - a._id)) {
    await apiCall(`/books/${book._id}`, "DELETE", null, { silentError: true });
  }

  // Insert ulang berurutan agar _id kembali rapat (1..n).
  for (const book of sorted) {
    await apiCall(
      "/books",
      "POST",
      {
        judul: book.judul,
        pengarang: book.pengarang,
        sinopsis: book.sinopsis || "",
        kategori: book.kategori || "",
        cover: book.cover || "",
        ebookPath: book.ebookPath || "",
        ebookName: book.ebookName || "",
        ebookSize: book.ebookSize || 0,
        ebookUploadedAt: book.ebookUploadedAt || null,
      },
      { silentError: true },
    );
  }

  await loadBooks();
}

// ============================================================
//  hapusBuku() — menggeser array, update pointer
// ============================================================
// [index.js] - Ganti fungsi hapusBuku
async function hapusBuku() {
  if (!selectedPtr) return;

  const targetId = selectedPtr._id;
  if (!confirm(`Hapus "${selectedPtr.judul}"? ID akan disusun ulang.`)) return;

  try {
    await deleteBook(targetId);
    await loadBooks();

    // Jika backend hosting belum support reindex otomatis, rapikan lewat fallback CRUD.
    if (!isDenseSequentialIds(inventaris)) {
      showToast("Merapikan ID...");
      await normalizeIdsViaCrud();
    }

    selectedPtr = null;

    closeModal();
    showToast("Buku dihapus, ID sudah dirapikan");
  } catch (error) {
    console.error("Gagal hapus buku:", error);
    showToast("Gagal hapus data. Cek server logs.");
  }
}

// ============================================================
//  selectBuku() — Buku* selectedPtr = cariBuku(id)
// ============================================================
function selectBuku(id) {
  selectedPtr = inventaris.find((b) => b._id === id);

  log(
    `<span class="log-ptr">selectedPtr</span> = <span class="log-addr">${selectedPtr.addr}</span>`,
  );

  renderModalContent();
  openModal();
  render(); // Update highlight di tabel
}

// Fungsi baru untuk merender konten di dalam modal
// --- Fungsi untuk merender isi Modal ---
function renderModalContent() {
  const container = document.getElementById("modal-body");
  if (!selectedPtr) return;

  // Gunakan cover dari data, jika kosong pakai placeholder
  const coverSrc =
    selectedPtr.cover && selectedPtr.cover !== ""
      ? selectedPtr.cover
      : "https://via.placeholder.com/150x200?text=No+Cover";

  const sinopsisText = selectedPtr.sinopsis || "Sinopsis belum tersedia.";
  const hasEbook = Boolean(selectedPtr.ebookPath);

  container.innerHTML = `
    <div style="text-align: center;">
      <img src="${coverSrc}" class="modal-cover-preview" alt="Cover Buku">
      
      <div style="font-family: var(--mono); font-size: 11px; color: var(--accent); margin-bottom: 5px;">
        ADDR: ${selectedPtr.addr}
      </div>
      <h2 style="font-family: var(--serif); margin-bottom: 5px; color: var(--ink);">${selectedPtr.judul}</h2>
      <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 5px;">oleh ${selectedPtr.pengarang}</p>
      <p style="color: var(--accent); font-size: 0.8rem; margin-bottom: 20px;">Kategori: ${selectedPtr.kategori || "Tidak dikategorikan"}</p>
      
      <div class="divider"></div>

      <div style="margin-top: 18px; text-align: left; background: #f7f3ea; border: 1px solid #e2dccf; border-radius: 10px; padding: 12px;">
        <div style="font-size: 0.72rem; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px;">Sinopsis</div>
        <p style="line-height: 1.55; color: var(--ink); font-size: 0.92rem;">${sinopsisText}</p>
      </div>

      ${
        hasEbook
          ? `<button class="btn-primary" style="width: 100%; margin-top: 14px;" onclick="downloadEbook(${selectedPtr._id})">⬇ Download Ebook</button>`
          : `<div style="margin-top: 14px; border: 1px dashed #d6cdbb; border-radius: 8px; padding: 10px; color: var(--muted); font-size: 0.86rem;">File ebook belum tersedia</div>`
      }

      <button class="btn-primary" 
              style="background: transparent; color: #c0392b; border: 1px solid #c0392b; width: 100%; margin-top: 30px; font-size: 0.8rem;" 
              onclick="hapusBuku()">
        🗑 Hapus dari Inventaris
      </button>
    </div>
  `;
}

// Fungsi Kontrol Modal
function openModal() {
  const modal = document.getElementById("edit-modal");
  modal.style.display = "flex";
  setTimeout(() => modal.classList.add("show"), 10);
}

function closeModal() {
  const modal = document.getElementById("edit-modal");
  modal.classList.remove("show");
  setTimeout(() => {
    modal.style.display = "none";
    selectedPtr = null;
    render();
  }, 300);
}

// Tambahkan event listener untuk menutup modal jika klik di luar box
window.onclick = function (event) {
  const modal = document.getElementById("edit-modal");
  if (event.target == modal) {
    closeModal();
  }
};

// ============================================================
//  RENDER
// ============================================================
function render() {
  const query = document.getElementById("search").value.toLowerCase();
  const list = document.getElementById("book-list");

  const filtered = inventaris.filter(
    (b) =>
      b.judul.toLowerCase().includes(query) ||
      b.pengarang.toLowerCase().includes(query) ||
      (b.kategori || "").toLowerCase().includes(query),
  );

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="empty-state">// tidak ada data ditemukan</div>';
  } else {
    list.innerHTML = filtered
      .map((b) => {
        const isSelected = selectedPtr && selectedPtr._id === b._id;
        const ptrAddr = b.addr || getAddr(inventaris.indexOf(b));

        const coverCell = b.cover
          ? `<img src="${b.cover}" class="cover-thumb" alt="cover" onerror="this.style.display='none';this.nextSibling.style.display='flex'" style="background:#f0f0f0;border-radius:4px;" />
             <div class="cover-placeholder" style="display:none;position:absolute;">📖</div>`
          : `<div class="cover-placeholder">📖</div>`;

        return `
        <div class="book-row ${isSelected ? "selected" : ""}" onclick="selectBuku(${b._id})">
          <span class="book-id">#${b._id}</span>
          ${coverCell}
          <div style="min-width:0">
            <div class="book-title">${b.judul}</div>
            <div class="book-author">${b.pengarang}</div>
          </div>
          <span class="book-category">${b.kategori || ""}</span>
          <span class="ptr-badge col-addr ${isSelected ? "green" : ""}">${ptrAddr}</span>
          <button class="action-btn" onclick="event.stopPropagation();selectBuku(${b._id})">Detail</button>
        </div>`;
      })
      .join("");
  }

  document.getElementById("total-buku").textContent = inventaris.length;
}

// ── SEARCH listener ──
document.getElementById("search").addEventListener("input", () => {
  log(
    `<span class="log-op">cariBuku()</span> <span class="log-info">filter: "${document.getElementById("search").value}"</span>`,
  );
  render();
});

// ── LOAD DATA FROM SERVER ──
// [index.js]
async function loadBooks() {
  try {
    // 1. Ambil data dari API
    const books = await getAllBooks();

    if (books && books.length > 0) {
      // 2. Petakan data dan berikan alamat memori simulasi (addr)
      inventaris = books.map((b, i) => ({
        ...b,
        sinopsis: b.sinopsis || "",
        kategori: b.kategori || "",
        ebookPath: b.ebookPath || "",
        ebookName: b.ebookName || "",
        ebookSize: b.ebookSize || 0,
        addr: getAddr(i),
      }));

      // 3. CARI ID TERTINGGI (Penting agar ID baru tidak duplikat/melompat)
      const maxId = Math.max(...inventaris.map((b) => b._id));
      idCounter = maxId + 1;

      log('<span class="log-info">// inventaris[] loaded from MongoDB</span>');
    } else {
      inventaris = [];
      idCounter = 1; // Jika kosong, mulai dari ID 1
      log('<span class="log-info">// Database kosong</span>');
    }
  } catch (error) {
    console.error("Gagal memuat buku:", error);
  }

  // 4. Update tampilan tabel
  render();
}

// ── SIDE PANEL TOGGLE ──
function toggleSidePanel() {
  const sidePanel = document.querySelector(".side-panel");
  const toggleBtn = document.getElementById("toggle-side");
  const mainPanel = document.querySelector(".main-panel");

  sidePanel.classList.toggle("open");
  const isOpen = sidePanel.classList.contains("open");

  toggleBtn.textContent = isOpen ? "✕" : "☰";
  toggleBtn.title = isOpen ? "Tutup panel" : "Buka panel";

  mainPanel.classList.toggle("has-open-panel", isOpen);
}

// Load books when page loads
// Cukup satu blok DOMContentLoaded saja
// Hapus semua baris dari "document.addEventListener" sampai paling bawah,
// lalu ganti dengan ini:

document.addEventListener("DOMContentLoaded", () => {
  hideSplash();
  loadBooks();

  // Setup listener untuk menutup modal jika area luar (overlay) diklik
  const modal = document.getElementById("edit-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }
});
