"use strict";
const form = document.getElementById("pairForm");
const code = document.getElementById("pairCode");
const button = document.getElementById("submit");
const status = document.getElementById("status");
code.addEventListener("input", () => { code.value = code.value.replace(/\D/g,"").slice(0,6); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!/^\d{6}$/.test(code.value)) return;
  button.disabled = true;
  status.textContent = "Memverifikasi kode…";
  status.className = "status";
  try {
    const res = await fetch("/api/pair/claim", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-bloks-webview": "1" },
      body: JSON.stringify({ credential: code.value, device: "Bloks Browser WebView" })
    });
    if (!res.ok) {
      status.textContent = res.status === 401
        ? "Kode tidak berlaku atau kedaluwarsa. Restart server lalu pakai kode baru."
        : "Gagal terhubung (" + res.status + "). Silakan coba lagi.";
      return;
    }
    status.className = "status ok";
    status.textContent = "Berhasil dipairing. Membuka Bloks…";
    window.location.replace("/");
  } catch {
    status.textContent = "Tidak dapat menjangkau server. Periksa koneksi Internet.";
  } finally {
    button.disabled = false;
  }
});