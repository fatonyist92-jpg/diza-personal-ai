"use strict";
const byId = (id) => document.getElementById(id);
let pending = false;
async function request(path, method = "GET") {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    location.replace("/pair.html");
    throw new Error("Perangkat perlu pairing ulang");
  }
  if (!response.ok) throw new Error("Server error " + response.status);
  return response.json();
}
function render(data) {
  const connected = data.authenticated === true;
  byId("state").textContent = connected ? "Codex terhubung ke akun ChatGPT"
    : data.state === "starting" ? "Sedang menyiapkan kode..."
    : data.state === "waiting" ? "Menunggu otorisasi di halaman OpenAI..."
    : data.state === "error" ? "Belum berhasil terhubung" : "Codex terpasang, tetapi belum masuk akun";
  byId("start").disabled = pending || connected || data.state === "waiting" || data.state === "starting";
  byId("start").textContent = connected ? "Codex sudah aktif" : "Buat kode perangkat";
  byId("authorization").hidden = !data.code || connected;
  byId("code").textContent = data.code || "";
  byId("problem").textContent = data.problem || (connected ? "Kembali ke Bloks dan pilih Codex sebagai engine." : "");
}
async function refresh() {
  try { render(await request("/api/bloks-codex/status")); }
  catch (error) { byId("problem").textContent = error.message; }
}
byId("start").addEventListener("click", async () => {
  pending = true;
  byId("start").disabled = true;
  try { render(await request("/api/bloks-codex/start", "POST")); }
  catch (error) { byId("problem").textContent = error.message; }
  finally { pending = false; await refresh(); }
});
byId("refresh").addEventListener("click", refresh);
byId("copy").addEventListener("click", async () => {
  const code = byId("code").textContent.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    byId("copy").textContent = "Kode tersalin ✓";
  } catch {
    // Some embedded Android WebViews deny clipboard writes: select for manual copy.
    const range = document.createRange();
    range.selectNodeContents(byId("code"));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    byId("problem").textContent = "Kode disorot. Tekan dan tahan untuk menyalin.";
  }
});
refresh();
setInterval(refresh, 5000);