/* =====================================================================
   WEBGIS PETA SEBARAN LEMBAGA ANGGOTA FPRB JAWA TIMUR (v2)
   Sumber data: Google Spreadsheet (published / GViz CSV)
   ADMIN CUKUP MENGUBAH: SHEET_ID dan SHEET_NAME di bawah ini.
   ===================================================================== */
const CONFIG = {
  SHEET_ID: "1SjG6cJeC7JIRRIMddI5gaeGxs-hxSbzztsG6TRJd99w",
  SHEET_NAME: "Data Anggota",
  AUTO_REFRESH: false,
  REFRESH_INTERVAL: 300000, // 5 menit
  // Mode uji lokal: isi "data-contoh.csv" bila belum punya Spreadsheet, lalu kosongkan lagi.
  LOCAL_CSV: ""
};
const REQUIRED = ["id", "nama_lembaga", "kategori", "kabupaten_kota", "latitude", "longitude"];
const CENTER = [-7.250445, 112.768845], ZOOM = 8;
const PALETTE = ["#f26b0f", "#1f4e8c", "#0f9d8a", "#8e44ad", "#d4a017", "#c0392b", "#2e86de", "#16a085", "#7f8c8d", "#e84393"];

const S = { raw: [], valid: [], problems: [], cats: [], colors: {}, hidden: new Set(), filtered: [], markers: {}, charts: {}, timer: null };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- PETA ---------- */
const map = L.map("map", { center: CENTER, zoom: ZOOM, zoomControl: false });
const base = {
  "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }),
  "Citra Satelit": L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", { maxZoom: 20, attribution: "© Google" }),
  "Citra Hybrid": L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", { maxZoom: 20, attribution: "© Google" })
};
base["OpenStreetMap"].addTo(map);
L.control.layers(base, null, { position: "topright" }).addTo(map);
L.control.zoom({ position: "topleft" }).addTo(map);
L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 }).addTo(map);

/* ---------- 1. LOAD ---------- */
function getSheetURL() {
  if (CONFIG.LOCAL_CSV) return CONFIG.LOCAL_CSV;
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}&_=${Date.now()}`;
}
async function loadDataFromGoogleSheet() {
  showLoading("Memuat data anggota...", "Mohon tunggu");
  try {
    if (!navigator.onLine) throw new Error("OFFLINE");
    if (!CONFIG.LOCAL_CSV && CONFIG.SHEET_ID.startsWith("MASUKKAN")) throw new Error("NOID");
    const res = await fetch(getSheetURL());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("HTML");
    const rows = parseData(text);
    S.raw = rows;
    processData(rows);
    hideLoading();
    toast(`Data berhasil dimuat: ${S.valid.length + S.problems.filter(p => p.type === "nonaktif").length} lembaga.` +
      (S.problems.filter(p => p.type !== "nonaktif").length ? ` ${S.problems.filter(p => p.type !== "nonaktif").length} data tidak dapat ditampilkan karena koordinat bermasalah.` : ""),
      S.problems.some(p => p.type !== "nonaktif"));
  } catch (e) {
    console.error(e);
    let m = "Gagal mengambil data dari Google Spreadsheet.", sub = "Data Google Spreadsheet tidak dapat diakses. Pastikan Spreadsheet sudah dipublikasikan.";
    if (e.message === "OFFLINE") { m = "Koneksi internet bermasalah."; sub = "Data belum dapat diperbarui."; }
    else if (e.message === "NOID") { m = "SHEET_ID belum diisi."; sub = "Isi CONFIG.SHEET_ID di script.js (lihat README)."; }
    else if (e.message === "STRUKTUR") { m = "Struktur kolom Google Spreadsheet tidak sesuai dengan format WebGIS."; sub = e.detail; }
    showLoading(m, sub, true);
  }
}

/* ---------- 2. PARSE CSV (mendukung tanda kutip & baris baru) ---------- */
function parseCSV(t) {
  const out = []; let row = [], f = "", q = false;
  t = t.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); out.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); out.push(row); }
  return out.filter(r => r.some(x => x.trim() !== ""));
}
function parseData(text) {
  const table = parseCSV(text);
  if (!table.length) { const e = new Error("STRUKTUR"); e.detail = "Sheet kosong atau nama sheet salah."; throw e; }
  const head = table[0].map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const miss = REQUIRED.filter(k => !head.includes(k));
  if (miss.length) { const e = new Error("STRUKTUR"); e.detail = "Kolom tidak ditemukan: " + miss.join(", "); throw e; }
  return table.slice(1).map((r, i) => { const o = { _row: i + 2 }; head.forEach((h, j) => o[h] = r[j] ?? ""); return o; });
}

/* ---------- 3. NORMALISASI & VALIDASI ---------- */
function titleCase(s) { return s.toLowerCase().replace(/(^|[\s\/(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
function normalizeData(r) {
  const t = k => String(r[k] ?? "").trim().replace(/\s+/g, " ");
  const num = v => {
    v = String(v ?? "").trim();
    if (v === "") return { empty: true };
    if (/[°'"′″]|[NSEWnsew]\s*$/.test(v)) return { dms: true };
    if (v.includes(",") && !v.includes(".")) v = v.replace(",", ".");
    return { n: Number(v) };
  };
  return {
    _row: r._row, id: t("id"), nama_lembaga: t("nama_lembaga"), kategori: t("kategori"),
    kabupaten_kota: t("kabupaten_kota"), alamat: t("alamat"), kontak: t("kontak"), email: t("email"),
    website: t("website"), klaster: t("klaster"), deskripsi: t("deskripsi"),
    status: titleCase(t("status")) || "Aktif",
    _lat: num(r.latitude), _lng: num(r.longitude)
  };
}
function validateData(d) {
  const a = d._lat, b = d._lng;
  if (a.empty || b.empty) return "kosong";
  if (a.dms || b.dms) return "dms";
  if (!isFinite(a.n) || !isFinite(b.n) || a.n < -90 || a.n > 90 || b.n < -180 || b.n > 180) return "salah";
  return "ok";
}
function processData(rows) {
  S.valid = []; S.problems = [];
  const cnt = { kosong: 0, salah: 0, nonaktif: 0 };
  rows.map(normalizeData).forEach(d => {
    const v = validateData(d);
    if (d.status === "Tidak Aktif") { cnt.nonaktif++; S.problems.push({ type: "nonaktif", d }); }
    if (v === "ok") { d.lat = d._lat.n; d.lng = d._lng.n; S.valid.push(d); }
    else {
      if (v === "kosong") cnt.kosong++; else cnt.salah++;
      S.problems.push({ type: v, d });
    }
  });
  S.cnt = cnt;
  S.cats = [...new Set(S.valid.map(d => d.kategori || "Lainnya"))].sort();
  S.cats.forEach((c, i) => { if (!S.colors[c]) S.colors[c] = PALETTE[i % PALETTE.length]; });
  S.hidden = new Set([...S.hidden].filter(c => S.cats.includes(c)));
  buildFilters(); renderQC(); applyFilters(true);
}

/* ---------- FILTER ---------- */
function fillSelect(el, label, values) {
  const cur = el.value;
  el.innerHTML = `<option value="">${label}</option>` + values.map(v => `<option>${esc(v)}</option>`).join("");
  if (values.includes(cur)) el.value = cur;
}
function buildFilters() {
  const uniq = k => [...new Set(S.valid.map(d => d[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  fillSelect($("fKab"), "Semua Kabupaten/Kota", uniq("kabupaten_kota"));
  fillSelect($("fKlaster"), "Semua Klaster", uniq("klaster"));
}
function baseFiltered() { // filter tanpa kategori (untuk hitungan legenda)
  const kab = $("fKab").value, kl = $("fKlaster").value, aktif = $("fAktif").checked;
  return S.valid.filter(d => (!kab || d.kabupaten_kota === kab) && (!kl || d.klaster === kl) && (!aktif || d.status === "Aktif"));
}
function applyFilters(fit) {
  const base = baseFiltered();
  S.filtered = base.filter(d => !S.hidden.has(d.kategori || "Lainnya"));
  renderMarkers(); renderStatistics(); renderCharts(); renderLegend(base);
  $("empty").hidden = S.filtered.length > 0;
  if (fit && S.filtered.length) fitAll();
}
function resetFilters() {
  $("fKab").value = ""; $("fKlaster").value = ""; $("fAktif").checked = true; $("q").value = ""; $("results").hidden = true;
  S.hidden.clear(); applyFilters(true);
}

/* ---------- MARKER ---------- */
const catOf = d => d.kategori || "Lainnya";
function pinIcon(c) { return L.divIcon({ className: "", html: `<div class="pin" style="background:${c}"><i></i></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }); }
function popupHTML(d) {
  const row = (k, v) => v ? `<tr><td>${k}</td><td>${v}</td></tr>` : "";
  return `<div class="pop"><h4><small>${esc(d.kabupaten_kota)}</small>${esc(d.nama_lembaga)}</h4><div class="body"><table>
    ${row("Kategori", esc(d.kategori))}${row("Alamat", esc(d.alamat))}${row("Kontak", esc(d.kontak))}
    ${row("Email", d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : "")}
    ${row("Website", d.website ? `<a href="${esc(webURL(d.website))}" target="_blank" rel="noopener">${esc(d.website)}</a>` : "")}
    ${row("Klaster", esc(d.klaster))}${row("Deskripsi", esc(d.deskripsi))}${row("Status", esc(d.status))}
    </table><button class="btn small primary" onclick="openDetail('${esc(d.id)}')">Lihat Detail</button></div></div>`;
}
const webURL = w => /^https?:\/\//i.test(w) ? w : "https://" + w;
function renderMarkers() {
  cluster.clearLayers(); S.markers = {};
  const layers = S.filtered.map(d => {
    const m = L.marker([d.lat, d.lng], { icon: pinIcon(S.colors[catOf(d)]), title: d.nama_lembaga }).bindPopup(popupHTML(d), { maxWidth: 300 });
    S.markers[d.id] = m; return m;
  });
  cluster.addLayers(layers);
}
function fitAll() {
  if (!S.filtered.length) return map.setView(CENTER, ZOOM);
  map.fitBounds(L.latLngBounds(S.filtered.map(d => [d.lat, d.lng])).pad(0.15), { maxZoom: 13 });
}
function focusRecord(d) {
  if (!S.markers[d.id]) { // jika tersaring, reset filter dulu
    $("fKab").value = ""; $("fKlaster").value = ""; S.hidden.delete(catOf(d)); $("fAktif").checked = d.status === "Aktif"; applyFilters();
  }
  const m = S.markers[d.id]; if (!m) return;
  cluster.zoomToShowLayer(m, () => { map.setView([d.lat, d.lng], Math.max(map.getZoom(), 14)); m.openPopup(); });
}

/* ---------- STATISTIK, CHART, LEGENDA, QC ---------- */
function renderStatistics() {
  const u = k => new Set(S.filtered.map(d => d[k]).filter(Boolean)).size;
  $("sLembaga").textContent = S.filtered.length; $("sKab").textContent = u("kabupaten_kota");
  $("sKat").textContent = new Set(S.filtered.map(catOf)).size; $("sKlas").textContent = u("klaster");
  $("shown").textContent = `(${S.filtered.length} tampil)`;
}
function tally(fn) { const m = {}; S.filtered.forEach(d => { const k = fn(d) || "(Tanpa data)"; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }
function drawChart(id, entries, colors) {
  const labels = entries.map(e => e[0]), data = entries.map(e => e[1]);
  if (S.charts[id]) { const c = S.charts[id]; c.data.labels = labels; c.data.datasets[0].data = data; c.data.datasets[0].backgroundColor = colors; c.update(); return; }
  S.charts[id] = new Chart($(id), { type: "bar", data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4 }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } } });
}
function renderCharts() {
  if (typeof Chart === "undefined") return;
  drawChart("cKab", tally(d => d.kabupaten_kota).slice(0, 10), "#f26b0f");
  const kat = tally(catOf); drawChart("cKat", kat, kat.map(e => S.colors[e[0]] || "#999"));
  drawChart("cKlas", tally(d => d.klaster), "#1f4e8c");
}
function renderLegend(base) {
  const n = {}; base.forEach(d => n[catOf(d)] = (n[catOf(d)] || 0) + 1);
  $("legend").innerHTML = S.cats.map(c => `<div class="item ${S.hidden.has(c) ? "off" : ""}" data-cat="${esc(c)}"><span class="dot" style="background:${S.colors[c]}"></span>${esc(c)}<span class="n">${n[c] || 0}</span></div>`).join("");
  $("printLegend").innerHTML = S.cats.map(c => `<span><i class="pdot" style="background:${S.colors[c]}"></i>${esc(c)}</span>`).join("");
}
function renderQC() {
  const c = S.cnt, nonCoord = S.problems.filter(p => p.type !== "nonaktif");
  $("qc").innerHTML = `<li>✓ Data valid : <b>${S.valid.length}</b></li><li>⚠ Koordinat kosong : <b>${c.kosong}</b></li><li>⚠ Koordinat salah/DMS : <b>${c.salah}</b></li><li>⚠ Data nonaktif : <b>${c.nonaktif}</b></li>`;
  $("problemBox").hidden = !nonCoord.length;
  $("problemSum").textContent = `Data dengan koordinat bermasalah (${nonCoord.length})`;
  const why = { kosong: "Data tidak memiliki koordinat.", salah: "Koordinat tidak valid dan tidak dapat dipetakan.", dms: "Format DMS terdeteksi — ubah ke decimal degrees." };
  $("problemList").innerHTML = nonCoord.map(p => `<li>Baris ${p.d._row}: ${esc(p.d.nama_lembaga || "(tanpa nama)")} — ${why[p.type]}</li>`).join("");
}

/* ---------- SEARCH ---------- */
function searchData(term) {
  term = term.trim().toLowerCase(); if (term.length < 2) return [];
  return S.valid.filter(d => [d.nama_lembaga, d.kabupaten_kota, d.kategori, d.klaster, d.alamat].join(" ").toLowerCase().includes(term)).slice(0, 10);
}
$("q").addEventListener("input", e => {
  const r = searchData(e.target.value), box = $("results");
  box.hidden = e.target.value.trim().length < 2;
  box.innerHTML = r.length ? r.map(d => `<div data-id="${esc(d.id)}">${esc(d.nama_lembaga)}<small>${esc(d.kabupaten_kota)} · ${esc(d.kategori)}</small></div>`).join("") : `<div>Tidak ditemukan</div>`;
});
$("results").addEventListener("click", e => {
  const el = e.target.closest("[data-id]"); if (!el) return;
  $("results").hidden = true; $("sidebar").classList.remove("open");
  const d = S.valid.find(x => x.id === el.dataset.id); if (d) focusRecord(d);
});

/* ---------- DETAIL ---------- */
function openDetail(id) {
  const d = S.valid.find(x => x.id === id); if (!d) return;
  const r = (k, v) => v ? `<tr><td>${k}</td><td>${v}</td></tr>` : "";
  $("detailBody").innerHTML = `<h2>DETAIL LEMBAGA</h2><table class="dtab">${r("Nama", esc(d.nama_lembaga))}${r("Kategori", esc(d.kategori))}${r("Kabupaten/Kota", esc(d.kabupaten_kota))}${r("Alamat", esc(d.alamat))}${r("Kontak", esc(d.kontak))}
  ${r("Email", d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : "")}${r("Website", d.website ? `<a href="${esc(webURL(d.website))}" target="_blank" rel="noopener">${esc(d.website)}</a>` : "")}
  ${r("Klaster", esc(d.klaster))}${r("Status", esc(d.status))}${r("Deskripsi", esc(d.deskripsi))}${r("Koordinat", d.lat + ", " + d.lng)}</table>
  <p><button class="btn primary" onclick="closeModals();focusRecord(S.valid.find(x=>x.id==='${esc(d.id)}'))">Tampilkan di Peta</button></p>`;
  $("mDetail").hidden = false;
}
function closeModals() { document.querySelectorAll(".modal").forEach(m => m.hidden = true); }

/* ---------- DOWNLOAD ---------- */
function save(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
const FIELDS = ["id", "nama_lembaga", "kategori", "kabupaten_kota", "alamat", "kontak", "email", "website", "klaster", "latitude", "longitude", "deskripsi", "status"];
function downloadCSV(list) {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [FIELDS.join(",")].concat(list.map(d => FIELDS.map(f => q(f === "latitude" ? d.lat : f === "longitude" ? d.lng : d[f])).join(",")));
  save("anggota-fprb-jatim.csv", "\uFEFF" + lines.join("\n"), "text/csv;charset=utf-8");
}
function downloadGeoJSON(list) {
  const gj = { type: "FeatureCollection", features: list.map(d => ({ type: "Feature", geometry: { type: "Point", coordinates: [d.lng, d.lat] },
    properties: Object.fromEntries(FIELDS.filter(f => f !== "latitude" && f !== "longitude").map(f => [f, d[f]])) })) };
  save("anggota-fprb-jatim.geojson", JSON.stringify(gj, null, 2), "application/geo+json");
}
document.querySelectorAll("[data-dl]").forEach(b => b.addEventListener("click", () => {
  const [fmt, scope] = b.dataset.dl.split("-"), list = scope === "all" ? S.valid : S.filtered;
  if (!list.length) return toast("Tidak ada data untuk diunduh.", true);
  fmt === "csv" ? downloadCSV(list) : downloadGeoJSON(list); closeModals();
}));

/* ---------- UI ---------- */
function showLoading(m, sub, err) { $("loading").classList.remove("hide"); $("loadMsg").textContent = m; $("loadSub").textContent = sub || ""; $("btnRetry").hidden = !err; document.querySelector(".spin").style.display = err ? "none" : ""; }
function hideLoading() { $("loading").classList.add("hide"); }
let tt; function toast(m, err) { const t = $("toast"); t.textContent = m; t.className = err ? "err" : ""; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 5000); }
function locate() {
  if (!navigator.geolocation) return toast("Browser tidak mendukung geolokasi.", true);
  navigator.geolocation.getCurrentPosition(p => {
    const ll = [p.coords.latitude, p.coords.longitude];
    if (S.me) map.removeLayer(S.me);
    S.me = L.circleMarker(ll, { radius: 9, color: "#fff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 }).addTo(map).bindPopup("Lokasi Anda").openPopup();
    map.setView(ll, 14);
  }, () => toast("Izin lokasi ditolak atau lokasi tidak tersedia.", true), { enableHighAccuracy: true, timeout: 10000 });
}
function setAutoRefresh() { clearInterval(S.timer); if (CONFIG.AUTO_REFRESH) S.timer = setInterval(loadDataFromGoogleSheet, Math.max(CONFIG.REFRESH_INTERVAL, 60000)); }

$("btnRefresh").onclick = $("btnRetry").onclick = loadDataFromGoogleSheet;
$("btnInfo").onclick = () => $("mInfo").hidden = false;
$("btnStat").onclick = () => { $("sidebar").classList.add("open"); $("charts").scrollIntoView({ behavior: "smooth" }); };
$("btnMenu").onclick = () => $("sidebar").classList.toggle("open");
$("btnHome").onclick = fitAll; $("btnLoc").onclick = locate; $("btnDl").onclick = () => $("mDl").hidden = false;
$("btnPrint").onclick = () => { $("printDate").textContent = "Dicetak: " + new Date().toLocaleDateString("id-ID", { dateStyle: "long" }); map.invalidateSize(); setTimeout(() => window.print(), 300); };
$("btnReset").onclick = $("btnReset2").onclick = resetFilters;
$("allCat").onclick = e => { e.preventDefault(); S.hidden.clear(); applyFilters(); };
["fKab", "fKlaster", "fAktif"].forEach(id => $(id).addEventListener("change", () => applyFilters(true)));
$("legend").addEventListener("click", e => { const it = e.target.closest("[data-cat]"); if (!it) return; const c = it.dataset.cat; S.hidden.has(c) ? S.hidden.delete(c) : S.hidden.add(c); applyFilters(); });
document.addEventListener("click", e => { if (e.target.matches("[data-close]") || e.target.classList.contains("modal")) closeModals(); if (!e.target.closest(".sec")) $("results").hidden = true; });
window.addEventListener("online", () => toast("Koneksi kembali. Klik “Perbarui Data”."));
window.addEventListener("offline", () => toast("Koneksi internet bermasalah. Data belum dapat diperbarui.", true));
window.addEventListener("beforeprint", () => map.invalidateSize());

loadDataFromGoogleSheet().then(setAutoRefresh);
