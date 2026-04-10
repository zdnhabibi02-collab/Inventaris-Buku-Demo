// ============================================================
//  API CLIENT — komunikasi dengan backend server
// ============================================================

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "https://testing-production-298b.up.railway.app/api";

async function apiCall(endpoint, method = "GET", data = null, config = {}) {
  const { silentError = false } = config;
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    let payload;
    if (isJson) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      const errorMessage =
        isJson && payload && payload.error
          ? payload.error
          : `HTTP ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    if (!isJson) {
      throw new Error(
        `API mengembalikan format non-JSON (${response.status}). Cek endpoint/back-end deploy.`,
      );
    }

    return payload;
  } catch (error) {
    console.error(`API Error (${method} ${endpoint}):`, error.message);
    if (!silentError) {
      showToast(`Error: ${error.message}`);
    }
    throw error;
  }
}

// GET all books
async function getAllBooks(search = "") {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiCall(`/books${query}`);
}

// GET single book
async function getBook(id) {
  return apiCall(`/books/${id}`);
}

// POST tambah buku
async function addBook(judul, pengarang, sinopsis, cover = "", kategori = "") {
  return apiCall("/books", "POST", { judul, pengarang, sinopsis, cover, kategori });
}

// DELETE hapus buku
async function deleteBook(id) {
  return apiCall(`/books/${id}`, "DELETE");
}

// GET stats
async function getStats() {
  return apiCall("/stats");
}

// SEED data
async function seedData() {
  return apiCall("/seed", "POST");
}

// Upload ebook untuk book tertentu
async function uploadEbook(bookId, fileInput) {
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    throw new Error("Tidak ada file dipilih");
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  try {
    const response = await fetch(`${API_URL}/books/${bookId}/ebook`, {
      method: "POST",
      body: formData,
      // JANGAN set Content-Type header, browser otomatis set multipart/form-data
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Upload ebook gagal");
    }

    return await response.json();
  } catch (error) {
    console.error(`Upload Error (book ${bookId}):`, error.message);
    showToast(`Error: ${error.message}`);
    throw error;
  }
}

// Download ebook
function downloadEbook(bookId, fileName = "ebook") {
  const link = document.createElement("a");
  link.href = `${API_URL}/books/${bookId}/download`;
  link.download = fileName || "ebook";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
