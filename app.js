/* Galla app layer: saves data on this device, real barcode scanning (camera + USB/Bluetooth scanner),
   item and customer forms with photos, real UPI QR, printing, WhatsApp bills and optional YouPI PG. */
"use strict";

/* ---------- shop settings and saved data ---------- */
const KEY = "galla-data-v1";
const SHOP = { name: "Sharma General Store", addr: "12, MG Road, Pune 411001", gst: "27ABCDE1234F1Z5", upi: "sharmastore@okaxis",
  phone: "", cashier: "Ravi", paper: "80", ypUrl: "", ypMerchant: "", sample: true };
let saveTimer = 0, storageFull = false;

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); return true } catch (e) { return false } }
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = store(KEY, JSON.stringify({ v: 1, shop: SHOP, P, CUST, ORDERS, billNo: S.billNo, held: [] }));
    if (!ok && !storageFull) { storageFull = true; toast("Phone storage is full. Remove some item photos or export a backup.") }
  }, 300);
}
(function load() {
  let d = null; try { d = JSON.parse(store(KEY) || "null") } catch (e) {}
  if (d && d.v === 1) {
    Object.assign(SHOP, d.shop || {});
    P.splice(0, P.length, ...(d.P || []));
    CUST.splice(0, CUST.length, ...(d.CUST && d.CUST.length ? d.CUST : [CUST[0]]));
    ORDERS.splice(0, ORDERS.length, ...(d.ORDERS || []));
    S.billNo = d.billNo || S.billNo;
  }
  S.cart = new Map(); S.cust = 0; S.view = "billing";
})();

const pic = p => p.img ? `<img class="pphoto" src="${p.img}" alt="">` : (p.e || "📦");
const digits = s => String(s || "").replace(/\D/g, "");
const waNum = ph => { const d = digits(ph); return d.length === 10 ? "91" + d : d };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nextId = () => P.reduce((a, p) => Math.max(a, p.id), 0) + 1;
const isToday = ts => ts && new Date(ts).toDateString() === new Date().toDateString();

/* re-render also saves */
const _render = render;
render = function () { _render(); save() };

/* ---------- bills use the shop details ---------- */
const _billHTML = billHTML;
billHTML = function (d) {
  return _billHTML(d)
    .replaceAll("SHARMA GENERAL STORE", esc(SHOP.name.toUpperCase()))
    .replaceAll("Sharma General Store", esc(SHOP.name))
    .replaceAll("12, MG Road, Pune 411001", esc(SHOP.addr) + (SHOP.phone ? " · " + esc(SHOP.phone) : ""))
    .replaceAll("27ABCDE1234F1Z5", esc(SHOP.gst) || "-")
    // only say "Verified" when YouPI really checked the payment
    .replace(/<div class="rr"><span>Ref<\/span><span>[^<]*<\/span><\/div><div class="rr"><span>Verified<\/span><span>YouPI PG<\/span><\/div>/, m => SHOP.ypUrl && SHOP.ypMerchant && !(d.utr === "MANUAL") ? m : "");
};

/* finished bills are kept with their date, lines and the bill itself */
const _finishPay = finishPay;
finishPay = function () {
  const before = ORDERS.length;
  const lines = [...S.cart].map(([k, q]) => { const l = ln(k); return { id: l.base.id, n: l.name, cat: l.cat, q: l.loose ? l.g / 1000 : q, a: l.price * q, kg: !!l.loose } });
  _finishPay();
  if (ORDERS.length > before) {
    const o = ORDERS[0]; o[6] = Date.now(); o[7] = lines;
    const b = S.lastBill; o[8] = { ...b, date: b.date.toISOString(), cust: { name: b.cust.name, phone: b.cust.phone } };
    save();
  }
};
function billFromOrder(o) { const b = o[8]; if (!b) return null; return { ...b, date: new Date(b.date) } }

/* ---------- text bill for WhatsApp / SMS ---------- */
function billText(b) {
  const L = [`*${SHOP.name}*`, `Bill #${b.no} · ${b.date.toLocaleDateString("en-IN")} ${b.date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`, ""];
  b.lines.forEach(l => L.push(`${l.n} (${l.u}) ${l.q ? "x" + l.q : ""}  ₹${l.a.toFixed(2)}`));
  L.push("", `*Total: ₹${b.t.total.toFixed(2)}*`, `Paid by ${b.label}`, "", "Thank you! Visit again 🙏");
  return L.join("\n");
}
function openWa(phone, text) { const n = waNum(phone); window.open("https://wa.me/" + (n || "") + "?text=" + encodeURIComponent(text), "_blank") }

/* ---------- printing ---------- */
function printBill(b) {
  let pa = document.getElementById("printArea");
  if (!pa) { pa = document.createElement("div"); pa.id = "printArea"; document.body.appendChild(pa) }
  pa.className = "paper" + SHOP.paper; pa.innerHTML = billHTML(b);
  setTimeout(() => window.print(), 50);
}

/* ---------- real UPI QR ---------- */
function upiLink(amt) {
  const q = new URLSearchParams({ pa: SHOP.upi, pn: SHOP.name, am: Number(amt).toFixed(2), cu: "INR", tn: "Bill " + S.billNo });
  return "upi://pay?" + q.toString().replace(/\+/g, "%20");
}
drawQR = function () {
  const c = $("#qr"); if (!c || typeof qrcode !== "function") return;
  const g = S.gw, amt = S.method === "split" ? totals().total - Math.round(totals().total / 2 / 10) * 10 : totals().total;
  const text = g && g.checkoutUrl ? g.checkoutUrl : upiLink(amt);
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), W = 340, pad = 14, s = (W - pad * 2) / n, x = c.getContext("2d");
  const DK = getComputedStyle(document.documentElement).getPropertyValue("--pd").trim() || "#141b4d";
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, W); x.fillStyle = DK;
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) x.fillRect(pad + k * s, pad + r * s, Math.ceil(s), Math.ceil(s));
  c.setAttribute("aria-label", "UPI QR code for " + inr(amt));
};

/* ---------- payments: YouPI PG when set up, otherwise the cashier confirms ---------- */
const ypOn = () => !!(SHOP.ypUrl && SHOP.ypMerchant);
gwSession = function () {
  const key = S.billNo + ":" + S.method + ":" + totals().total;
  if (S.gw && S.gw.key === key) return S.gw;
  clearInterval(S.gwTimer);
  const digital = S.method === "upi" || S.method === "split";
  S.gw = { key, id: "GALLA-" + S.billNo, state: digital ? "ACTIVE" : "AWAITING_CASHIER", t0: Date.now(), utr: "" };
  if (digital) {
    S.gwTimer = setInterval(gwTick, 3000);
    if (ypOn()) ypCreate(S.gw);
  }
  return S.gw;
};
async function ypCreate(g) {
  const t = totals(), amt = S.method === "split" ? t.total - Math.round(t.total / 2 / 10) * 10 : t.total;
  try {
    const r = await fetch(SHOP.ypUrl.replace(/\/$/, "") + "/api/v1/payments", { method: "POST", headers: { "Content-Type": "application/json", "X-Merchant-Id": SHOP.ypMerchant },
      body: JSON.stringify({ orderId: g.id + "-" + Date.now().toString(36), amount: amt.toFixed(2), currency: "INR", method: "UPI" }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    g.remote = j.paymentId; g.checkoutUrl = j.checkoutUrl || ""; if ($("#qr")) drawQR();
  } catch (e) { g.ypError = String(e.message || e); toast("YouPI could not be reached. Check the bank app and confirm by hand.") }
}
gwTick = async function () {
  const g = S.gw; if (!g || !$("#gwbox")) { clearInterval(S.gwTimer); return }
  const el = Date.now() - g.t0, left = Math.max(0, 600 - Math.floor(el / 1000)), tm = $("#gwTimer");
  if (tm) tm.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  if (!g.remote || g.busy) return;
  g.busy = true;
  try {
    const r = await fetch(SHOP.ypUrl.replace(/\/$/, "") + "/api/v1/payments/" + g.remote, { headers: { "X-Merchant-Id": SHOP.ypMerchant } });
    const j = await r.json(), st = String(j.status || "").toUpperCase();
    if (st === "SUCCESS" && (!j.method || j.method === "UPI")) {
      g.state = "SUCCESS"; g.utr = j.utr || j.bankReference || j.referenceId || "YouPI"; clearInterval(S.gwTimer);
      if (S.method === "split") openPay(true); else finishPay();   // straight to the tick
    } else if (st === "PROCESSING" && g.state !== "PROCESSING") { g.state = "PROCESSING"; openPay(true) }
    else if (["FAILED", "EXPIRED", "CANCELLED"].includes(st)) { clearInterval(S.gwTimer); toast("YouPI says the payment " + st.toLowerCase()) }
  } catch (e) {} finally { g.busy = false }
};
upiBlock = function (g, amt) {
  if (g.state === "SUCCESS") return `<div class="paid"><span class="pc">${I.check}</span><div><b class="num">${inr(amt)} received by UPI</b><span class="num">${g.utr === "MANUAL" ? "Confirmed by the cashier" : "Ref " + esc(g.utr) + " · checked by YouPI"}</span></div></div>`;
  const auto = ypOn() && !g.ypError;
  return `<div class="qrwrap"><div class="qrbox ${g.state === "PROCESSING" ? "dim" : ""}"><canvas id="qr" width="340" height="340"></canvas></div>
    <div style="flex:1;min-width:170px"><b style="font-size:17px;font-family:var(--display)">Scan to pay ${inr(amt)}</b>
    <p class="note" style="margin:6px 0 0">Pays to <b>${esc(SHOP.upi) || "your UPI ID (add it in Settings)"}</b>. The amount is filled in for the customer. Any UPI app works.</p>
    <div class="apps"><span>GPay</span><span>PhonePe</span><span>Paytm</span><span>BHIM</span></div>
    <div class="waiting">${auto ? `<span class="spin"></span>${g.state === "PROCESSING" ? "Bank message received, checking amount…" : `YouPI is watching for the bank SMS · <span class="num" id="gwTimer">10:00</span>`}` : `<span class="spin"></span>Waiting for the customer to pay`}</div></div></div>
    <button class="confirm" id="gwManual" style="margin-top:4px;background:var(--good);color:#fff">${I.check}I got ${inr(amt)} in my bank app</button>
    <p class="note" style="margin:0">${auto ? "The tick appears by itself when YouPI matches the bank SMS. If it is slow, check your bank app and press the green button." : "Check the payment in your bank or UPI app, then press the green button. Set up YouPI in Settings to confirm automatically."}</p>`;
};
const _openPay = openPay;
openPay = function (keep) {
  if (S.method === "upi" && !SHOP.upi) toast("Add your UPI ID in Settings so the QR pays you");
  _openPay(keep);
  const btn = $("#confirmPay");
  if (btn && S.method === "upi" && !(S.gw && S.gw.state === "SUCCESS")) btn.hidden = true;
};

/* ---------- barcode: USB / Bluetooth scanners type fast and end with Enter ---------- */
let kb = { buf: "", t: 0 };
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const now = performance.now(), fast = now - kb.t < 45; kb.t = now;
  if (e.key === "Enter") {
    const code = kb.buf; kb.buf = "";
    const inInput = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (code.length >= 4 && (kb.fast || !inInput)) {
      if (inInput && document.activeElement.id === "f-code") return;   // form field keeps the code
      e.preventDefault(); e.stopPropagation();
      if (inInput) document.activeElement.value = document.activeElement.value.slice(0, -code.length);
      if (document.activeElement.id === "q") { S.q = ""; }
      return onCode(code);
    }
    if (document.activeElement && document.activeElement.id === "q" && findCode(S.q.trim())) { e.preventDefault(); const c = S.q.trim(); S.q = ""; return onCode(c) }
    return;
  }
  if (e.key.length === 1) { if (!fast) { kb.buf = ""; kb.fast = true } kb.buf += e.key; if (!fast && kb.buf.length > 1) kb.fast = false }
  else kb.buf = "";
}, true);

function findCode(code) {
  if (!code) return null;
  for (const p of P) {
    if (p.sku && p.sku === code) return { p };
    if (p.v) { const i = p.v.findIndex(v => v.code && v.code === code); if (i >= 0) return { p, i } }
  }
  return null;
}
function beep() {
  try { navigator.vibrate && navigator.vibrate(60) } catch (e) {}
  try { const A = window.AudioContext || window.webkitAudioContext, c = new A(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1760; g.gain.value = .12; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .09) } catch (e) {}
}
function onCode(code) {
  if (S.scanFor) { const f = S.scanFor; S.scanFor = null; stopCamera(); return f(code) }
  const hit = findCode(code);
  if (!hit) { beep(); S.unknown = code; return modal("New barcode", `<div class="empty" style="padding:18px"><div class="ei">🔎</div><b>${esc(code)} is not in your items</b>Add it once and next time it will be billed straight away.</div><button class="confirm" id="addFromCode">${I.plus}Add item with this barcode</button>`, "sm") }
  beep();
  if (S.view !== "billing") go("billing");
  if (hit.i != null) { add(hit.p.id + "#" + hit.i); toast(hit.p.name + " " + hit.p.v[hit.i].l + " added") }
  else if (hit.p.v) { stopCamera(); tap(hit.p.id) }
  else if (hit.p.kg) { stopCamera(); tap(hit.p.id) }
  else { add(hit.p.id); toast(hit.p.name + " added") }
  if (S.cam && $("#camList")) { $("#camList").insertAdjacentHTML("afterbegin", `<div class="camhit">✓ ${esc(hit.p.name)}${hit.i != null ? " " + hit.p.v[hit.i].l : ""}</div>`) }
}

/* ---------- camera scanner (BarcodeDetector where available, ZXing on iPhone and others) ---------- */
async function openCamera(forForm) {
  modal("Scan barcode", `<div class="camwrap"><video id="camv" playsinline muted autoplay></video><div class="camline"></div><div class="camframe"></div></div>
    <div id="camMsg" class="note" style="margin:10px 2px">Point the camera at the barcode. Hold steady about a hand away.</div>
    <div style="display:flex;gap:8px;margin-bottom:10px"><input id="camManual" inputmode="numeric" placeholder="Or type the barcode number" class="finput" style="flex:1"><button class="btn" id="camType">Add</button></div>
    ${forForm ? "" : `<div id="camList" class="camlist"></div>`}
    <div style="display:flex;gap:8px"><button class="btn ghost" id="camTorch" hidden>🔦 Light</button><div class="grow"></div><button class="confirm" id="camDone" style="width:auto;padding:0 22px;background:linear-gradient(135deg,var(--a1),var(--a2));color:var(--on-a)">Done</button></div>`, "sm");
  const v = $("#camv"), msg = $("#camMsg");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "This browser cannot open the camera here. Open Galla from its https link, or type the number below."; return }
  let last = "", lastT = 0;
  const hit = code => { const n = Date.now(); if (code === last && n - lastT < 2500) return; last = code; lastT = n; onCode(code) };
  try {
    if ("BarcodeDetector" in window) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      S.cam = { stream }; v.srcObject = stream; await v.play();
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] });
      const loop = async () => { if (!S.cam || S.cam.stream !== stream) return; try { const r = await det.detect(v); if (r[0]) hit(r[0].rawValue) } catch (e) {} S.cam.t = setTimeout(loop, 150) };
      loop(); torch(stream);
    } else if (window.ZXing) {
      const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      const reader = new ZXing.BrowserMultiFormatReader(hints, 200);
      S.cam = { reader };
      await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, v, res => { if (res) hit(res.getText()) });
      if (v.srcObject) { S.cam.stream = v.srcObject; torch(v.srcObject) }
    } else { msg.textContent = "The scanner is still loading. Close and try again in a moment." }
  } catch (e) {
    msg.innerHTML = e && e.name === "NotAllowedError" ? "Camera permission was blocked. Allow the camera for this site in your browser settings, or type the number below." : "Could not open the camera (" + esc(e.message || e.name) + "). You can type the number below.";
  }
}
function torch(stream) {
  const tr = stream.getVideoTracks()[0], caps = tr && tr.getCapabilities ? tr.getCapabilities() : {};
  if (caps.torch && $("#camTorch")) { const b = $("#camTorch"); b.hidden = false; let on = false; b.onclick = () => { on = !on; tr.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}) } }
}
function stopCamera() {
  const c = S.cam; S.cam = null; if (!c) return;
  clearTimeout(c.t);
  try { c.reader && c.reader.reset() } catch (e) {}
  try { (c.stream || (c.reader && $("#camv") && $("#camv").srcObject))?.getTracks().forEach(t => t.stop()) } catch (e) {}
}
const _closeModal = closeModal;
closeModal = function () { stopCamera(); _closeModal() };

/* ---------- picture library ---------- */
const PICS = ["🍚", "🌾", "🫘", "🧂", "🛢️", "🫙", "🥜", "🌶️", "🧄", "🧅", "🥔", "🍅", "🥕", "🥒", "🥬", "🌽", "🍆", "🫑", "🍋", "🍌", "🍎", "🥭", "🍇", "🍊", "🍉", "🍍", "🥥", "🍪", "🍫", "🍬", "🍭", "🥨", "🍿", "🧁", "🍞", "🥐", "🍜", "🥫", "🥛", "🧀", "🧈", "🥚", "🍦", "🥣", "🍵", "☕", "🧃", "🥤", "🍾", "💧", "🧼", "🪥", "🧴", "🧻", "🧽", "🧺", "🪣", "🧹", "🪔", "🔥", "🕯️", "🔋", "💡", "🖊️", "📒", "🧷", "🎁", "💊", "🩹", "🐟", "🍗", "🥩", "📦"];

/* ---------- item form (add / edit) ---------- */
function blankItem() { return { name: "", cat: "Grocery", e: "📦", img: "", type: "pack", price: "", unit: "", stock: "", gst: 5, sku: "", v: [{ l: "", p: "", s: "", code: "" }], kg: "", sk: "" } }
function itemToForm(p) {
  return { id: p.id, name: p.name, cat: p.cat, e: p.e, img: p.img || "", type: p.v ? "sizes" : p.kg ? "loose" : "pack", price: p.v || p.kg ? "" : p.price, unit: p.v || p.kg ? "" : p.unit, stock: p.v || p.kg ? "" : p.stock,
    gst: p.gst, sku: p.sku || "", v: p.v ? p.v.map(v => ({ ...v })) : [{ l: "", p: "", s: "", code: "" }], kg: p.kg || "", sk: p.kg ? p.sk : "" };
}
function readForm() {
  const F = S.form, val = id => { const el = document.getElementById(id); return el ? el.value : undefined };
  ["name", "price", "unit", "stock", "sku", "kg", "sk"].forEach(k => { const x = val("f-" + (k === "sku" ? "code" : k)); if (x !== undefined) F[k] = x });
  const c = val("f-cat"); if (c !== undefined) F.cat = c; const g = val("f-gst"); if (g !== undefined) F.gst = +g;
  if (F.type === "sizes") F.v = F.v.map((v, i) => ({ l: val("v-l" + i) ?? v.l, p: val("v-p" + i) ?? v.p, s: val("v-s" + i) ?? v.s, code: val("v-c" + i) ?? v.code }));
}
function openItem(id, code) {
  S.form = id ? itemToForm(P.find(x => x.id === id)) : Object.assign(blankItem(), code ? { sku: code } : {});
  drawItem();
}
function drawItem() {
  const F = S.form, inp = (id, label, v, extra = "") => `<label class="flab">${label}<input id="${id}" class="finput" value="${esc(v)}" ${extra}></label>`;
  const cats = CATS.slice(1).map(c => `<option ${F.cat === c[0] ? "selected" : ""}>${c[0]}</option>`).join("");
  modal(F.id ? "Edit item" : "Add item", `<div class="fgrid">
    <div class="photo-row"><div class="photo-prev" style="background:var(${TINT[F.cat] || "--t7"})">${F.img ? `<img src="${F.img}" alt="">` : `<span>${F.e}</span>`}</div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:0">
        <b style="font-size:13px">Picture</b>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="fCam">📷 Take photo</button><button class="btn ghost" id="fGal">🖼️ From gallery</button>${F.img ? `<button class="btn ghost" id="fNoPhoto">Remove photo</button>` : ""}</div>
        <input type="file" id="fFileCam" accept="image/*" capture="environment" hidden><input type="file" id="fFile" accept="image/*" hidden>
      </div></div>
    <details class="lib" ${F.img ? "" : "open"}><summary>Or pick a ready picture</summary><div class="libgrid">${PICS.map(e => `<button data-pic="${e}" aria-pressed="${!F.img && F.e === e}">${e}</button>`).join("")}</div></details>
    ${inp("f-name", "Item name", F.name, 'placeholder="e.g. Basmati Rice" autocomplete="off"')}
    <div class="f2"><label class="flab">Category<select id="f-cat" class="finput">${cats}</select></label>
      <label class="flab">GST<select id="f-gst" class="finput">${[0, 5, 12, 18, 28].map(g => `<option value="${g}" ${+F.gst === g ? "selected" : ""}>${g}%</option>`).join("")}</select></label></div>
    <div><b style="font-size:13px">How do you sell it?</b><div class="wseg" style="display:flex;margin-top:6px">${[["pack", "One pack"], ["sizes", "Many sizes"], ["loose", "Loose, by weight"]].map(([k, l]) => `<button data-ftype="${k}" aria-pressed="${F.type === k}" style="flex:1">${l}</button>`).join("")}</div></div>
    ${F.type === "pack" ? `<div class="f3">${inp("f-price", "Price ₹", F.price, 'inputmode="decimal"')}${inp("f-unit", "Pack size", F.unit, 'placeholder="1 kg, 500 ml, pack"')}${inp("f-stock", "In stock", F.stock, 'inputmode="numeric"')}</div>` : ""}
    ${F.type === "loose" ? `<div class="f2">${inp("f-kg", "Price per kg ₹", F.kg, 'inputmode="decimal"')}${inp("f-sk", "Stock in kg", F.sk, 'inputmode="decimal"')}</div>` : ""}
    ${F.type === "sizes" ? `<div class="sizeform">${F.v.map((v, i) => `<div class="szf"><input id="v-l${i}" class="finput" placeholder="Size e.g. 5 kg" value="${esc(v.l)}"><input id="v-p${i}" class="finput" placeholder="₹" inputmode="decimal" value="${esc(v.p)}"><input id="v-s${i}" class="finput" placeholder="Stock" inputmode="numeric" value="${esc(v.s)}"><span class="codein"><input id="v-c${i}" class="finput" placeholder="Barcode" value="${esc(v.code || "")}"><button class="mini" data-vscan="${i}" aria-label="Scan barcode for this size">📷</button></span>${F.v.length > 1 ? `<button class="mini" data-vdel="${i}" aria-label="Remove size">✕</button>` : ""}</div>`).join("")}<button class="btn ghost" id="fAddSize">${I.plus}Add another size</button></div>` : ""}
    <div class="codein">${inp("f-code", F.type === "sizes" ? "Barcode (whole item, optional)" : "Barcode", F.sku, 'inputmode="numeric" placeholder="Scan or type"')}<button class="btn" id="fScan" style="align-self:flex-end">📷 Scan</button></div>
    <div style="display:flex;gap:8px;margin-top:4px">${F.id ? `<button class="btn ghost" id="fDelete" style="color:var(--bad)">${I.trash}Delete</button>` : ""}<div class="grow"></div>
      <button class="confirm" id="fSave" style="width:auto;padding:0 26px;background:linear-gradient(135deg,var(--a1),var(--a2));color:var(--on-a)">${I.check}Save item</button></div>
  </div>`, "sm");
  const pick = el => el && (el.onchange = () => { const f = el.files[0]; if (f) photo(f) });
  pick($("#fFileCam")); pick($("#fFile"));
}
function photo(file) {
  readForm();
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const S2 = 240, c = document.createElement("canvas"); c.width = c.height = S2;
    const m = Math.min(img.width, img.height), x = c.getContext("2d");
    x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S2, S2);
    S.form.img = c.toDataURL("image/jpeg", .72); URL.revokeObjectURL(url); drawItem();
  };
  img.onerror = () => toast("That photo could not be opened");
  img.src = url;
}
function saveItem() {
  readForm(); const F = S.form, num = x => Number(String(x).replace(/[^\d.]/g, "")) || 0;
  if (!F.name.trim()) return toast("Type the item name");
  const dup = F.sku && P.find(p => p.sku === F.sku && p.id !== F.id); if (dup) return toast("This barcode is already used by " + dup.name);
  const p = F.id ? P.find(x => x.id === F.id) : { id: nextId() };
  Object.assign(p, { name: F.name.trim(), cat: F.cat, e: F.e, img: F.img || undefined, gst: +F.gst, sku: F.sku.trim() });
  delete p.v; delete p.kg; delete p.sk;
  if (F.type === "pack") { if (!num(F.price)) return toast("Type the price"); Object.assign(p, { price: num(F.price), unit: F.unit || "each", stock: Math.round(num(F.stock)) }) }
  if (F.type === "loose") { if (!num(F.kg)) return toast("Type the price per kg"); Object.assign(p, { kg: num(F.kg), sk: num(F.sk), price: num(F.kg), unit: "Loose, by weight", stock: num(F.sk) }) }
  if (F.type === "sizes") {
    const v = F.v.filter(v => v.l && num(v.p)).map(v => ({ l: v.l.trim(), p: num(v.p), s: Math.round(num(v.s)), code: (v.code || "").trim() }));
    if (!v.length) return toast("Add at least one size with a price");
    Object.assign(p, { v, price: v[0].p, unit: v.map(x => x.l).join(" · "), stock: v.reduce((a, x) => a + x.s, 0) });
  }
  if (!F.id) P.push(p);
  for (const k of [...S.cart.keys()]) if (+String(k).split(/[#@]/)[0] === p.id) S.cart.delete(k);
  closeModal(); toast(p.name + " saved"); render();
}

/* ---------- customer form ---------- */
function openCustForm() {
  modal("Add customer", `<div class="fgrid">
    <label class="flab">Name<input id="c-name" class="finput" autocomplete="off"></label>
    <label class="flab">Mobile number<input id="c-phone" class="finput" inputmode="tel" placeholder="10 digits"></label>
    <label class="flab">Credit (khata) limit ₹<input id="c-limit" class="finput" inputmode="numeric" placeholder="0 = no credit"></label>
    <button class="confirm" id="cSave" style="background:linear-gradient(135deg,var(--a1),var(--a2));color:var(--on-a)">${I.check}Save customer</button></div>`, "sm");
  setTimeout(() => $("#c-name")?.focus(), 50);
}

/* ---------- home and reports from real bills ---------- */
const real = () => !SHOP.sample;
const _renderHome = renderHome;
renderHome = function () {
  let h = _renderHome().replace("Good morning, Ravi", greet() + (SHOP.cashier ? ", " + esc(SHOP.cashier) : "")).replace(" · Sharma General Store", " · " + esc(SHOP.name));
  if (!real()) return h;
  const T = ORDERS.filter(o => isToday(o[6])), sum = T.reduce((a, o) => a + o[3], 0), by = m => T.filter(o => o[4] === m).reduce((a, o) => a + o[3], 0);
  const cats = {}; T.forEach(o => (o[7] || []).forEach(l => { const p = P.find(x => x.id === l.id); const pp = p && p.price ? l.a * 0.18 : 0; cats.p = (cats.p || 0) + pp }));
  h = h.replace(`<div class="hv num">${inr(18750)}</div>`, `<div class="hv num">${inr(sum)}</div>`).replace('<span class="delta up">▲ 12% vs last Wednesday</span>', `<span class="delta up">${T.length ? T.length + (T.length === 1 ? " bill" : " bills") + " today" : "No bills yet today"}</span>`)
    .replace('<b class="num">62</b>', `<b class="num">${T.length}</b>`).replace(`<b class="num">${inr(302)}</b>`, `<b class="num">${inr(T.length ? Math.round(sum / T.length) : 0)}</b>`).replace(`<b class="num">${inr(3375)}</b>`, `<b class="num">${inr(Math.round(cats.p || 0))}</b>`);
  const pay = [["UPI", by("UPI")], ["Cash", by("Cash")], ["Card", by("Card")], ["Khata", by("Khata")]], tot = sum || 1;
  h = h.replace(/<div class="paysplit">[\s\S]*?<\/div>\s*<div class="legend">[\s\S]*?<\/div>\s*<\/div>/, `<div class="paysplit">${!sum ? `<i style="flex:1;background:var(--line)"></i>` : pay.map(([m, v], i) => `<i style="flex:${v / tot * 100 || 0.01};background:var(${["--brand", "--gold", "--info", "--bad"][i]})"></i>`).join("")}</div>
      <div class="legend">${pay.map(([m, v], i) => `<div><span class="sw" style="background:var(${["--brand", "--gold", "--info", "--bad"][i]})"></span><span class="grow">${m === "Cash" ? "Cash in galla" : m === "Khata" ? "Khata (credit)" : m}</span><b class="num">${inr(v)}</b></div>`).join("")}</div>`);
  return h;
};
function greet() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening" }
spark = (function (orig) {
  return function () {
    if (!real()) return orig();
    const T = ORDERS.filter(o => isToday(o[6])).sort((a, b) => a[6] - b[6]);
    HOURS.length = 0; let run = 0; HOURS.push(0); T.forEach(o => { run += o[3]; HOURS.push(run) }); if (HOURS.length < 2) HOURS.push(0);
    const max = Math.max(...HOURS, 1); return orig().replace(/max=19000/, "").replace(/(H-6-\(v\/)19000/, "$1" + max);
  };
})(spark);
const _renderReports = renderReports;
renderReports = function () {
  if (!real()) return _renderReports();
  const days = S.range === "Week" ? 7 : 30, now = new Date(), data = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const ds = d.toDateString(); data.push([days === 7 ? d.toLocaleDateString("en-IN", { weekday: "short" }) : String(d.getDate()), ORDERS.filter(o => o[6] && new Date(o[6]).toDateString() === ds).reduce((a, o) => a + o[3], 0)]) }
  const inRange = ORDERS.filter(o => o[6] && now - o[6] < days * 864e5), sum = inRange.reduce((a, o) => a + o[3], 0), bills = inRange.length;
  const cat = {}, items = {}; inRange.forEach(o => (o[7] || []).forEach(l => { cat[l.cat] = (cat[l.cat] || 0) + l.a; const k = l.n; items[k] = items[k] || { n: k, q: 0, a: 0, id: l.id, kg: l.kg }; items[k].q += l.q; items[k].a += l.a }));
  const ct = Object.entries(cat).sort((a, b) => b[1] - a[1]), ctot = ct.reduce((a, c) => a + c[1], 0) || 1, col = ["--brand", "--info", "--gold", "--bad", "--good", "--faint"];
  const top = Object.values(items).sort((a, b) => b.a - a.a).slice(0, 8);
  const max = Math.max(...data.map(d => d[1]), 1000), C = 2 * Math.PI * 52; let off = 0;
  const chart = areaChart(data).replace(/max=30000/, "");
  return topbar("Reports", "From your saved bills", `<div class="seg" role="group" aria-label="Range">${["Week", "Month"].map(r => `<button data-r="${r}" aria-pressed="${S.range === r}">Last ${r === "Week" ? "7" : "30"} days</button>`).join("")}</div>`) + `
  <div class="kpis">${kpi("Total sales", inr(sum), "", "rupee", "--brand-soft", "--brand")}${kpi("Bills", bills, "", "bill", "--gold-soft", "--warn")}${kpi("Average bill", inr(bills ? Math.round(sum / bills) : 0), "", "report", "--info-soft", "--info")}${kpi("Credit given", inr(inRange.filter(o => o[4] === "Khata").reduce((a, o) => a + o[3], 0)), "", "khata", "--bad-soft", "--bad")}</div>
  <div class="cols"><div class="card"><div class="ch"><h3>Daily sales</h3></div>${bills ? areaChartMax(data, max) : `<div class="empty" style="padding:30px"><div class="ei">📈</div><b>No bills yet</b>Your sales chart fills in as you bill.</div>`}</div>
    <div class="card"><div class="ch"><h3>Sales by category</h3></div>${ct.length ? `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Category share">${ct.slice(0, 6).map((c, i) => { const len = C * c[1] / ctot; const s = `<circle cx="70" cy="70" r="52" fill="none" style="stroke:var(${col[i]})" stroke-width="18" stroke-dasharray="${Math.max(len - 2, 0)} ${C - len + 2}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return s }).join("")}
      <text x="70" y="68" text-anchor="middle" font-size="20" font-weight="800" font-family="Sora, sans-serif" style="fill:var(--fg)">${Math.round(ct[0][1] / ctot * 100)}%</text><text x="70" y="86" text-anchor="middle" font-size="11" style="fill:var(--muted)">${esc(ct[0][0])}</text></svg>
      <div class="legend" style="flex:1;min-width:140px">${ct.slice(0, 6).map((c, i) => `<div><span class="sw" style="background:var(${col[i]})"></span><span class="grow">${esc(c[0])}</span><b class="num">${Math.round(c[1] / ctot * 100)}%</b></div>`).join("")}</div></div>` : `<div class="empty" style="padding:30px"><b>Nothing sold yet</b></div>`}</div></div>
  <div class="card"><div class="ch"><h3>Best sellers</h3></div>${top.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Item</th><th>Sold</th><th style="text-align:right">Sales</th></tr></thead><tbody>${top.map((t, i) => { const p = P.find(x => x.id === t.id) || { e: "📦", cat: "" }; return `<tr><td class="num mut">${i + 1}</td><td><span class="ic"><span class="e" style="background:var(${TINT[p.cat] || "--t7"})">${pic(p)}</span><b>${esc(t.n)}</b></span></td><td class="num">${t.kg ? t.q.toFixed(2) + " kg" : t.q}</td><td class="num" style="text-align:right"><b>${inr(Math.round(t.a))}</b></td></tr>` }).join("")}</tbody></table></div>` : `<div class="empty" style="padding:24px"><b>No sales yet</b></div>`}</div>`;
};
function areaChartMax(data, max) { const m = Math.ceil(max / 1000) * 1000, svg = areaChart(data.map(d => [d[0], d[1] / m * 30000])); return svg.replace(/>₹(\d+)k</g, (a, k) => ">₹" + Math.round(k / 30 * m / 1000 * 10) / 10 + "k<").replace(/>₹[\d,]+(<\/text><\/g>)/, ">" + inr(data[data.length - 1][1]) + "$1") }

/* orders: resend and reprint the real bill */
const _renderOrders = renderOrders;
renderOrders = function () {
  return _renderOrders().replace("Today's bills · ", "Saved bills · ").replace(/<button class="mini" data-resend="(\d+)">/g, '<button class="mini" data-reprint="$1">🖨️ Print</button> <button class="mini" data-resend="$1">');
};

/* settings: real, editable */
renderSettings = function () {
  const f = (k, l, ph = "", extra = "") => `<label class="flab">${l}<input class="finput" data-shop="${k}" value="${esc(SHOP[k])}" placeholder="${ph}" ${extra}></label>`;
  return topbar("Settings", "Saved on this phone or computer") + `
  <div class="cols"><div class="card"><div class="ch"><h3>Shop details (printed on bills)</h3></div><div style="display:grid;gap:12px">
    ${f("name", "Shop name")}${f("addr", "Address")}${f("phone", "Shop phone", "Optional", 'inputmode="tel"')}${f("gst", "GSTIN", "Leave empty if you don't have one")}${f("upi", "Your UPI ID (QR payments go here)", "yourname@okaxis")}${f("cashier", "Cashier name")}
    <label class="flab">Bill printer paper<select class="finput" data-shop="paper"><option value="80" ${SHOP.paper === "80" ? "selected" : ""}>80 mm (3 inch)</option><option value="58" ${SHOP.paper === "58" ? "selected" : ""}>58 mm (2 inch)</option></select></label></div></div>
  <div class="card"><div class="ch"><h3>Barcode scanner</h3></div><div class="list">
    <div class="li"><div class="grow"><b>Phone or laptop camera</b><small>Tap "Scan barcode" on Billing. Works on Android and iPhone.</small></div><button class="btn" id="scanTest">📷 Try it</button></div>
    <div class="li"><div class="grow"><b>USB or Bluetooth scanner</b><small>Just plug it in or pair it. Scan any time on the Billing screen, no setup needed.</small></div><span class="pill ok">Ready</span></div>
  </div>
  <div class="ch" style="margin-top:16px"><h3>Install Galla</h3></div><div class="note" style="line-height:1.6">Android (Chrome): menu ⋮ then <b>Install app</b>. iPhone (Safari): Share then <b>Add to Home Screen</b>. It then opens like an app and works without internet.</div>
  ${S.installEvt ? `<button class="btn" id="installBtn" style="margin-top:10px">⬇️ Install now</button>` : ""}
  </div></div>
  <div class="card" style="margin-top:12px"><div class="ch"><span class="gw" style="border:0;padding:0;background:none"><span class="gl">Y</span></span><h3>Automatic UPI check: YouPI PG</h3><div class="grow"></div><span class="pill ${ypOn() ? "ok" : "info"}">${ypOn() ? "On" : "Off"}</span></div>
    <p class="note" style="margin:0 0 12px">Leave empty to confirm UPI payments yourself from your bank app. Fill in after you set up your own YouPI server and the Android SMS app, and the tick will appear by itself when the bank SMS arrives.</p>
    <div class="f2">${f("ypUrl", "YouPI server address", "https://pay.yourshop.in")}${f("ypMerchant", "Merchant ID", "from the YouPI dashboard")}</div>
    <div class="warnbox" style="margin-top:12px">${I.bell.replace("<svg", '<svg width="18" height="18"')}<span>YouPI is an experimental project, not a bank-approved gateway. Its makers suggest at most 20 payments a day while testing. Check your bank statement daily.</span></div></div>
  <div class="card" style="margin-top:12px"><div class="ch"><h3>Your data</h3></div>
    <p class="note" style="margin:0 0 12px">Everything is saved in this browser on this device. Export a backup file regularly, and import it to move to another phone.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="exportData">⬇️ Export backup</button><button class="btn ghost" id="importData">⬆️ Import backup</button><input type="file" id="importFile" accept="application/json,.json" hidden>
    ${SHOP.sample ? `<button class="btn ghost" id="freshStart" style="color:var(--bad)">Remove sample data and start my shop</button>` : ""}</div></div>`;
};

/* ---------- clicks for the app features (run before the page's own handler) ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; const d = b.dataset, stop = () => { e.stopImmediatePropagation(); e.preventDefault() };
  if (d.pic) { stop(); readForm(); S.form.e = d.pic; S.form.img = ""; return drawItem() }
  if (d.ftype) { stop(); readForm(); S.form.type = d.ftype; return drawItem() }
  if (d.vdel) { stop(); readForm(); S.form.v.splice(+d.vdel, 1); return drawItem() }
  if (d.vscan) { stop(); readForm(); const i = +d.vscan, F = S.form; S.scanFor = c => { F.v[i].code = c; S.form = F; drawItem() }; return openCamera(true) }
  if (d.edit) { stop(); return openItem(+d.edit) }
  if (d.restock) { stop(); const p = P.find(x => x.id == d.restock); if (p.v || p.kg) return openItem(p.id); const n = prompt("How many " + p.name + " came in?", "12"); if (n && +n) { p.stock += Math.round(+n); toast("Added " + Math.round(+n) + " × " + p.name); render() } return }
  if (d.remind) { stop(); const c = CUST[+d.remind]; return openWa(c.phone, `Namaste ${c.name.split(" ")[0]} ji, ${inr(c.due)} is due at ${SHOP.name}. You can pay by UPI to ${SHOP.upi}. Thank you!`) }
  if (d.resend) { stop(); const o = ORDERS.find(x => String(x[0]) === d.resend), bl = o && billFromOrder(o); if (!bl) return toast("This old sample bill has no details saved"); return openWa(bl.cust.phone, billText(bl)) }
  if (d.reprint) { stop(); const o = ORDERS.find(x => String(x[0]) === d.reprint), bl = o && billFromOrder(o); if (!bl) return toast("This old sample bill has no details saved"); return printBill(bl) }
  switch (b.id) {
    case "scanBtn": case "scanTest": stop(); return openCamera(false);
    case "camDone": stop(); closeModal(); return render();
    case "camType": stop(); { const v = $("#camManual").value.trim(); if (v) { $("#camManual").value = ""; onCode(v) } } return;
    case "addItem": stop(); return openItem(0);
    case "addFromCode": stop(); return openItem(0, S.unknown);
    case "fScan": stop(); readForm(); { const F = S.form; S.scanFor = c => { F.sku = c; S.form = F; drawItem() } } return openCamera(true);
    case "fCam": stop(); return $("#fFileCam").click();
    case "fGal": stop(); return $("#fFile").click();
    case "fNoPhoto": stop(); readForm(); S.form.img = ""; return drawItem();
    case "fAddSize": stop(); readForm(); S.form.v.push({ l: "", p: "", s: "", code: "" }); return drawItem();
    case "fSave": stop(); return saveItem();
    case "fDelete": stop(); { const p = P.find(x => x.id === S.form.id); if (p && confirm("Delete " + p.name + "?")) { P.splice(P.indexOf(p), 1); for (const k of [...S.cart.keys()]) if (+String(k).split(/[#@]/)[0] === p.id) S.cart.delete(k); closeModal(); toast(p.name + " deleted"); render() } } return;
    case "addCust": stop(); return openCustForm();
    case "cSave": stop(); { const n = $("#c-name").value.trim(), ph = $("#c-phone").value.trim(), lim = +digits($("#c-limit").value) || 0; if (!n) return toast("Type the customer's name"); if (ph && digits(ph).length < 10) return toast("Mobile number needs 10 digits");
      CUST.push({ name: n, phone: ph, visits: 0, spent: 0, points: 0, due: 0, limit: lim, age: 0, ledger: [] }); closeModal(); toast(n + " added"); render() } return;
    case "sendWa": stop(); return S.lastBill && openWa(S.lastBill.cust.phone, billText(S.lastBill));
    case "smsBill": stop(); { const bl = S.lastBill; if (!bl) return; location.href = "sms:" + digits(bl.cust.phone) + "?body=" + encodeURIComponent(billText(bl).replace(/\*/g, "")) } return;
    case "printBill": stop(); return S.lastBill && printBill(S.lastBill);
    case "gwManual": stop(); if (S.gw) { S.gw.state = "SUCCESS"; S.gw.utr = "MANUAL"; clearInterval(S.gwTimer) } return S.method === "split" ? openPay(true) : finishPay();
    case "closeShift": stop(); { const T = ORDERS.filter(o => isToday(o[6])), cash = T.filter(o => o[4] === "Cash").reduce((a, o) => a + o[3], 0); return toast(real() ? `Today: ${T.length} bills, ${inr(cash)} cash should be in the galla` : "Shift summary: " + inr(5250) + " cash should be in the galla") }
    case "exportData": stop(); { const blob = new Blob([store(KEY) || "{}"], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "galla-backup-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) } return;
    case "importData": stop(); return $("#importFile").click();
    case "freshStart": stop(); if (confirm("Remove all sample items, customers and bills? Your shop details stay.")) { P.length = 0; CUST.splice(1); CUST[0] = { name: "Walk-in customer", phone: "", visits: 0, spent: 0, points: 0, due: 0, limit: 0, age: 0, ledger: [] }; ORDERS.length = 0; S.cart.clear(); S.billNo = 1; SHOP.sample = false; toast("Ready. Add your first item from Stock."); go("stock") } return;
    case "installBtn": stop(); if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null } return;
  }
}, true);
/* the page's own "pay" also shows the tick for cash and card straight away (confirmPay → finishPay) */

document.addEventListener("input", e => { const k = e.target.dataset && e.target.dataset.shop; if (k) { SHOP[k] = e.target.value; save() } });
document.addEventListener("change", e => {
  const k = e.target.dataset && e.target.dataset.shop; if (k) { SHOP[k] = e.target.value; save() }
  if (e.target.id === "importFile") { const f = e.target.files[0]; if (!f) return; f.text().then(t => { const d = JSON.parse(t); if (d.v !== 1) throw 0; store(KEY, t); location.reload() }).catch(() => toast("That file is not a Galla backup")) }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "camManual") { e.preventDefault(); $("#camType").click() } });

/* ---------- install + offline ---------- */
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); S.installEvt = e; if (S.view === "settings") render() });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
window.addEventListener("pagehide", () => { clearTimeout(saveTimer); store(KEY, JSON.stringify({ v: 1, shop: SHOP, P, CUST, ORDERS, billNo: S.billNo, held: [] })) });

render();
