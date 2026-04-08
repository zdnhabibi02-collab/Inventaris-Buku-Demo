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
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hide');
      setTimeout(() => splash.classList.add('hide-end'), 1000); // after slide transition
    }
  }, 2500); // 2.5s after animations
}

// ============================================================

//  COVER UPLOAD — konversi file ke base64
// ============================================================
async function resizeImage(file, maxSizeKB = 1024) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
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
        canvas.toBlob((blob) => {
          if (blob.size <= maxSize || quality < 0.1) {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          } else {
            quality -= 0.1;
            compress();
          }
        }, 'image/jpeg', quality);
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
  if (!file.type.startsWith('image/')) {
    showToast("Hanya gambar JPG/PNG/WEBP!");
    event.target.value = "";
    return;
  }

  showToast('Memproses gambar...');
  
  resizeImage(file, 1024).then((resizedBase64) => {
    pendingCoverBase64 = resizedBase64;
    renderUploadPreview(resizedBase64);
    showToast('Gambar siap (dikompres otomatis)');
  }).catch(() => {
    showToast('Gagal proses gambar');
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
  const stok = parseInt(document.getElementById("f-stok").value) || 0;

  if (!judul || !pengarang) {
    showToast("Isi judul & pengarang dulu!");
    return;
  }

  // WAJIB ada cover
  if (!pendingCoverBase64) {
    showToast("Cover gambar WAJIB diisi!");
    return;
  }

  const coverToSend = pendingCoverBase64.length < 500000 ? pendingCoverBase64 : null;

  try {
    const buku = await addBook(judul, pengarang, stok, coverToSend);
    
    // Fix server tidak return cover: pakai local preview jika server skip + save ke localStorage
    if (coverToSend && (!buku.cover || buku.cover === null)) {
      buku.cover = coverToSend;
      const savedCovers = JSON.parse(localStorage.getItem('libraryos_covers') || '{}');
      savedCovers[buku._id] = coverToSend;
      localStorage.setItem('libraryos_covers', JSON.stringify(savedCovers));
      console.log('Server skip cover, saved local base64');
    }
    
    inventaris.push(buku);

    const idx = inventaris.length - 1;
    const addr = getAddr(idx);
    log(
      `<span class="log-op">tambahBuku()</span>  <span class="log-info">jumlah = ${idx} → ${idx + 1}</span>`,
    );
    log(
      `<span class="log-ptr">Buku*</span> inventaris[${idx}] <span class="log-info">allocated at</span> <span class="log-addr">${buku.addr || addr}</span>`,
    );
    log(`<span class="log-info">  ._id=${buku._id}  .stok=${buku.stok} ${coverToSend ? '(+cover)' : ''}</span>`);

    // Reset form
    document.getElementById("f-judul").value = "";
    document.getElementById("f-pengarang").value = "";
    document.getElementById("f-stok").value = "5";
    removeCoverPreview({ stopPropagation: () => {} });

    render();
    showToast(`Buku ditambahkan ✓ ${coverToSend ? '(dengan cover)' : '(tanpa cover)'}`);
  } catch (error) {
    console.error("Error adding book:", error);
    showToast(`Error: ${error.message}. Coba tanpa cover?`);
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

// ============================================================
//  updateStok() — void updateStok(Buku* buku, int stokBaru)
// ============================================================
async function updateStok() {
  if (!selectedPtr) return;
  const val = parseInt(document.getElementById("edit-stok").value);
  if (isNaN(val) || val < 0) {
    showToast("Stok tidak valid");
    return;
  }

  try {
    const old = selectedPtr.ptr.stok;
    const updated = await updateBookStok(selectedPtr.ptr._id, val);
    selectedPtr.ptr.stok = updated.stok;

    log(
      `<span class="log-op">updateStok()</span> <span class="log-ptr">buku-&gt;stok</span> <span class="log-info">@ <span class="log-addr">${selectedPtr.addr}</span></span>`,
    );
    log(
      `<span class="log-info">  ${old}</span> <span class="log-op">→</span> <span class="log-val">${updated.stok}</span>`,
    );

    render();
    selectBuku(selectedPtr.ptr._id);
    showToast("Stok diperbarui ✓");
  } catch (error) {
    console.error("Error updating book:", error);
  }
}

// ============================================================
//  hapusBuku() — menggeser array, update pointer
// ============================================================
async function hapusBuku(id) {
  const result = cariBuku(id);
  if (!result) return;

  try {
    await deleteBook(id);
    inventaris.splice(result.idx, 1);
    log(
      `<span class="log-op">hapusBuku()</span> <span class="log-info">free pointer</span> <span class="log-addr">${result.addr}</span>`,
    );
    log(`<span class="log-info">  array shift: alamat di-realokasi</span>`);

    selectedPtr = null;
    document.getElementById("detail-card").innerHTML =
      '<span style="font-family:var(--mono);font-size:11px;color:var(--muted)">← pilih buku dari tabel</span>';
    document.getElementById("detail-card").classList.add("empty");

    render();
    showToast("Buku dihapus");
  } catch (error) {
    console.error("Error deleting book:", error);
  }
}

// ============================================================
//  selectBuku() — Buku* selectedPtr = cariBuku(id)
// ============================================================
function selectBuku(id) {
  const result = cariBuku(id);
  if (!result) return;

  selectedPtr = result;

  log(
    `<span class="log-ptr">selectedPtr</span> <span class="log-op">=</span> <span class="log-addr">${result.addr}</span> <span class="log-info">(${result.ptr.judul})</span>`,
  );

  const b = result.ptr;
  const stokClass =
    b.stok === 0 ? "stok-empty" : b.stok <= 3 ? "stok-low" : "stok-ok";

  const coverHTML = b.cover
    ? `<img src="${b.cover}" class="detail-cover" alt="cover ${b.judul}" onerror="this.style.display='none'" style="background:#f0f0f0;" />`
    : "";

  document.getElementById("detail-card").classList.remove("empty");
  document.getElementById("detail-card").innerHTML = `
    ${coverHTML}
    <div class="detail-title">${b.judul}</div>
    <div class="detail-author">${b.pengarang}</div>
    <div class="detail-row">
      <span class="detail-key">ID</span>
      <span style="font-family:var(--mono);font-size:12px">#${b._id}</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Pointer addr</span>
      <span class="ptr-badge">${result.addr}</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Stok saat ini</span>
      <span class="stok-badge ${stokClass}">${b.stok}</span>
    </div>
    <div class="divider" style="margin:12px 0"></div>
    <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-bottom:8px">buku-&gt;stok = ...</div>
    <div class="stok-controls">
      <input class="edit-stk" type="number" id="edit-stok" value="${b.stok}" min="0">
      <button class="btn-sm" onclick="updateStok()">Simpan</button>
      <button class="btn-danger" onclick="hapusBuku(${b._id})">Hapus</button>
    </div>
  `;

  render();
}

// ============================================================
//  RENDER
// ============================================================
function render() {
  const query = document.getElementById("search").value.toLowerCase();
  const list = document.getElementById("book-list");

  const filtered = inventaris.filter(
    (b) =>
      b.judul.toLowerCase().includes(query) ||
      b.pengarang.toLowerCase().includes(query),
  );

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="empty-state">// tidak ada data ditemukan</div>';
  } else {
    list.innerHTML = filtered
      .map((b) => {
        const realIdx = inventaris.indexOf(b);
        const addr = getAddr(realIdx);
        const stokClass =
          b.stok === 0 ? "stok-empty" : b.stok <= 3 ? "stok-low" : "stok-ok";
        const isSelected = selectedPtr && selectedPtr.ptr._id === b._id;

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
          <span class="ptr-badge col-addr ${isSelected ? "green" : ""}">${addr}</span>
          <span class="stok-badge ${stokClass}">${b.stok}</span>
          <button class="action-btn" onclick="event.stopPropagation();selectBuku(${b._id})">Edit</button>
        </div>`;
      })
      .join("");
  }

  // Update header stats
  const totalStok = inventaris.reduce((s, b) => s + b.stok, 0);
  const lowCount = inventaris.filter((b) => b.stok <= 3).length;
  document.getElementById("total-buku").textContent = inventaris.length;
  document.getElementById("total-stok").textContent = totalStok;
  document.getElementById("stok-low-count").textContent = lowCount;
}

// ── SEARCH listener ──
document.getElementById("search").addEventListener("input", () => {
  log(
    `<span class="log-op">cariBuku()</span> <span class="log-info">filter: "${document.getElementById("search").value}"</span>`,
  );
  render();
});

// ── LOAD DATA FROM SERVER ──
async function loadBooks() {
  try {
    const books = await getAllBooks();
    
    // Fix cover hilang setelah refresh: restore local preview untuk buku yang punya cover base64 di localStorage
    const savedCovers = JSON.parse(localStorage.getItem('libraryos_covers') || '{}');
    books.forEach(buku => {
      if (!buku.cover && savedCovers[buku._id]) {
        buku.cover = savedCovers[buku._id];
      }
    });
    
    inventaris = books;

    if (books.length > 0) {
      const numericIds = books
        .map((b) => b._id)
        .filter((id) => typeof id === "number" && Number.isFinite(id));
      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
      idCounter = maxId + 1;

      log('<span class="log-info">// inventaris[] loaded from MongoDB</span>');
      log(
        `<span class="log-ptr">Buku*</span> <span class="log-info">base addr =</span> <span class="log-addr">0x${addrBase.toString(16).toUpperCase()}</span>`,
      );
      log(`<span class="log-info">// ${books.length} documents found</span>`);
    } else {
      log(
        '<span class="log-info">// inventaris[] is empty — tambahkan buku baru atau jalankan seedData()</span>',
      );
    }
  } catch (error) {
    console.error("Error loading books:", error);
    log(
      '<span class="log-info">// Failed to load from MongoDB, check server connection</span>',
    );
  }

  render();
}

// ── SIDE PANEL TOGGLE ──
function toggleSidePanel() {
  const sidePanel = document.querySelector('.side-panel');
  const toggleBtn = document.getElementById('toggle-side');
  const mainPanel = document.querySelector('.main-panel');
  
  sidePanel.classList.toggle('open');
  const isOpen = sidePanel.classList.contains('open');
  
  toggleBtn.textContent = isOpen ? '✕' : '☰';
  toggleBtn.title = isOpen ? 'Tutup panel' : 'Buka panel';
  
  mainPanel.classList.toggle('has-open-panel', isOpen);
}

// Load books when page loads
document.addEventListener("DOMContentLoaded", () => {
  hideSplash();
  loadBooks();
  
  // Close side panel by default
  document.querySelector('.side-panel').classList.remove('open');
  document.getElementById('toggle-side').textContent = '☰';
});

