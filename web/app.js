'use strict';
/* Katnis — UI. Jejak kerja, Claude, suara, dan file lewat jembatan native (Swift). */

/* ---------- util ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const BR = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge;
const DEMO = !!window.KATNIS_DEMO || !BR;
const native = (action, args = {}) => {
  if (DEMO && Mock[action]) return Promise.resolve(Mock[action](args));
  return BR ? BR.postMessage({ action, ...args }) : Promise.resolve(null);
};

const DN = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
const DS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DF = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const add = (s, n) => { const x = pd(s); x.setDate(x.getDate() + n); return ymd(x); };
const todayY = () => ymd(new Date());
const fLong = s => { const d = pd(s); return `${DF[d.getDay()]}, ${d.getDate()} ${MN[d.getMonth()]}`; };
const fShort = s => { const d = pd(s); return `${DS[d.getDay()]}, ${d.getDate()} ${MN[d.getMonth()]}`; };
const isWeekend = s => [0, 6].includes(pd(s).getDay());
const prevWork = s => { let d = add(s, -1); while (isWeekend(d)) d = add(d, -1); return d; };
const monday = s => { const d = pd(s); return add(s, -((d.getDay() + 6) % 7)); };
const weekNo = s => { const d = pd(s); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const k = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - k); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
const hmNow = () => { const d = new Date(); return `${pad(d.getHours())}.${pad(d.getMinutes())}`; };

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
  up: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  regen: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
};
const ic = (n, s = 16, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

/* ---------- konstanta ---------- */
const SRC = {
  claude: { label: 'Claude Code', hint: 'Prompt, sesi, dan artifact yang terbit' },
  figma: { label: 'Figma', hint: 'File Figma yang dibuka atau diubah lewat Claude' },
  web: { label: 'Riwayat browser', hint: 'Chrome, Arc, Brave, Edge: judul dan domain kerja saja' },
  suara: { label: 'Catatan suara', hint: 'Ditranskripsi macOS, audio tidak disimpan' },
  chat: { label: 'Chat ditempel', hint: 'Hanya yang kamu tempel sendiri' },
  lokal: { label: 'File lokal', hint: 'Desktop, Downloads, Documents, dan lampiranmu' },
};
const SRC_ORDER = ['claude', 'figma', 'web', 'suara', 'chat', 'lokal'];
const PSRC = { claude: '#5EE6A8', figma: '#C9A7FF', web: '#7CC4FF', suara: '#F5D565', chat: '#FFB27A', lokal: '#B7C7C2' };
const SECS = [
  { key: 'selesai', label: 'DIKERJAKAN', name: 'Apa yang dikerjakan' },
  { key: 'blocker', label: 'KENDALA', name: 'Kendala (blocker)' },
  { key: 'lanjut', label: 'SELANJUTNYA', name: 'Yang dikerjakan selanjutnya' },
];
const CSECS = [
  { key: 'minta', label: 'PERMINTAAN', name: 'Permintaan untukmu' },
  { key: 'balas', label: 'PERLU DIBALAS', name: 'Perlu dibalas' },
  { key: 'info', label: 'INFO', name: 'Info penting' },
];
const PSEC = { selesai: '#5EE6A8', blocker: '#FF9B85', lanjut: '#7CC4FF', minta: '#7CC4FF', balas: '#FFB27A', info: '#C9A7FF' };
const VIEW = {
  2: { dayNum: '30px', item: '14px', ringkas: '15.5px', lbl: '11px', cardPad: '20px', colPad: '18px', secGap: '16px' },
  4: { dayNum: '26px', item: '13px', ringkas: '14.5px', lbl: '10.5px', cardPad: '16px', colPad: '16px', secGap: '14px' },
  7: { dayNum: '24px', item: '12.5px', ringkas: '13.5px', lbl: '10px', cardPad: '14px', colPad: '14px', secGap: '12px' },
};
const ERRS = {
  NO_CLI: 'Claude Code belum terpasang di Mac ini, jadi catatan disusun dari jejak saja.',
  NOT_LOGGED_IN: 'Claude Code perlu login ulang (jalankan `claude` di Terminal), jadi catatan disusun dari jejak saja.',
  TIMEOUT: 'Claude terlalu lama menjawab, jadi catatan disusun dari jejak saja.',
  PARSE: 'Jawaban Claude tidak terbaca, jadi catatan disusun dari jejak saja.',
};

/* ---------- state ---------- */
const DEF = {
  v: 1, notes: {}, chats: {}, extra: {}, blockers: [],
  settings: { theme: null, span: 4, model: 'sonnet', sources: { claude: true, figma: true, web: true, suara: true, chat: true, lokal: true } },
};
let S = clone(DEF);
const U = {
  anchor: todayY(), jj: {}, jjAt: {}, loading: {}, busy: null, menu: false, cap: null, rec: { mode: 'idle', sec: 0, text: '', level: 0, err: '' },
  panel: false, panelDay: null, chip: null, addMenu: null, confirm: null, err: {}, hasClaude: true, cam: null, newBlk: '',
};

async function load() {
  let raw = '';
  try { raw = await native('load'); } catch (e) { }
  let o = null;
  try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
  S = Object.assign(clone(DEF), o || {});
  S.settings = Object.assign(clone(DEF.settings), (o && o.settings) || {});
  S.settings.sources = Object.assign(clone(DEF.settings.sources), (o && o.settings && o.settings.sources) || {});
  if (![2, 4, 7].includes(S.settings.span)) S.settings.span = 4;
}
let saveT;
function save() { if (DEMO) return; clearTimeout(saveT); saveT = setTimeout(() => native('save', { data: JSON.stringify(S) }), 300); }

/* ---------- tema ---------- */
const sysDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const themeKey = () => S.settings.theme || (sysDark() ? 'gelap' : 'terang');
function applyTheme() { document.documentElement.dataset.theme = themeKey(); }

/* ---------- jejak ---------- */
function extrasOf(day) {
  return (S.extra[day] || []).map(x => ({ id: x.id, src: x.src, jam: x.jam, ts: x.ts, judul: x.judul, teks: x.teks, detail: x.detail || '', url: '', path: x.path || '', kind: x.kind || '', extra: true }));
}
function jejakOf(day) {
  const on = S.settings.sources;
  return [...(U.jj[day] || []), ...extrasOf(day)].filter(j => on[j.src]).sort((a, b) => a.ts - b.ts);
}
async function loadJejak(day, force) {
  if (day > todayY()) return;
  if (U.jj[day] && !force) return;
  if (U.loading[day]) return U.loading[day];
  const p = (async () => {
    try { U.jj[day] = (await native('jejak', { day, sources: S.settings.sources })) || []; } catch (e) { U.jj[day] = U.jj[day] || []; }
    U.jjAt[day] = Date.now();
    delete U.loading[day];
    render();
  })();
  U.loading[day] = p;
  render();
  return p;
}
async function loadVisible() { for (const d of visibleDays()) if (d <= todayY()) await loadJejak(d); }
function onFocus() {
  const t = todayY();
  if (U.anchor > t) U.anchor = t;
  if (!U.jjAt[t] || Date.now() - U.jjAt[t] > 120000) loadJejak(t, true);
  renderTop();
}

/* ---------- generate catatan ---------- */
function jejakBlock(list, budget = 28000) {
  const out = [];
  for (const j of list) {
    let l = `[${j.id}] ${j.jam} · ${SRC[j.src].label} · ${j.judul}\n  ${(j.detail || j.teks || '').replace(/\n/g, '\n  ')}`;
    if (j.url) l += `\n  tautan: ${j.url}`;
    if ((budget -= l.length) < 0) break;
    out.push(l);
  }
  return out.join('\n');
}
function buildPrompt(day, list) {
  const prev = S.notes[prevWork(day)];
  const prevPlan = prev ? prev.lanjut.map(i => `- ${i.t}`).join('\n') || '-' : '-';
  const open = S.blockers.map(b => `- ${b.t}`).join('\n') || '-';
  return `Kamu membantu anggota tim BIS (product, design, engineering) menyiapkan catatan daily standup.
Di bawah ini jejak kerjanya pada ${fLong(day)} yang terekam di Mac-nya. Tiap jejak punya ID dalam kurung siku.

Aturan:
- Bahasa Indonesia natural untuk standup. Mulai tiap poin dengan kata kerja ("Merapikan…", "Menyusun…"), tanpa "saya/aku".
- Gabungkan jejak yang membahas pekerjaan sama jadi satu poin. Sebut nama produk/fitur yang jelas dari jejak. Jangan menyebut Claude, prompt, AI, atau nama sumber jejak.
- Jangan mengarang. Hanya pakai hal yang ada di jejak. Abaikan jejak yang jelas bukan pekerjaan.
- "selesai" = Apa yang dikerjakan: 2–7 poin, ≤ 18 kata per poin, urut dari yang paling berdampak. Keputusan yang diambil hari itu juga masuk di sini, diawali "Memutuskan …".
- "blocker" = Kendala: hanya hambatan nyata (menunggu keputusan/aset/pihak lain, error yang belum beres). Kalau tidak ada, [].
- "lanjut" = Yang dikerjakan selanjutnya: 1–4 poin, dari pekerjaan yang belum tuntas atau rencana yang disebut.
- Tiap poin wajib punya "src": 1–3 ID jejak pendukung, persis dari daftar.
- "lampiran": maksimal 4 ID jejak bertautan/berfile yang paling penting untuk ditunjukkan saat standup.
- "ringkas": 1 kalimat inti hari itu, ≤ 20 kata.

Balas HANYA JSON valid tanpa teks lain:
{"ringkas":"","selesai":[{"t":"","src":["id"]}],"blocker":[{"t":"","src":["id"]}],"lanjut":[{"t":"","src":["id"]}],"lampiran":["id"]}

Rencana yang ditulis di hari kerja sebelumnya:
${prevPlan}
Blocker yang masih terbuka:
${open}

=== JEJAK ${day} ===
${jejakBlock(list)}`;
}
function pickJSON(t) {
  if (!t) return null;
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}
function cleanItems(arr, ids) {
  return (Array.isArray(arr) ? arr : []).map(x => typeof x === 'string' ? { t: x, src: [] } : { t: String(x.t || x.teks || '').trim(), src: (Array.isArray(x.src) ? x.src : []).map(String).filter(id => ids.has(id)).slice(0, 3) }).filter(x => x.t);
}
const lampOf = j => ({ id: 'L' + j.id, src: j.id, judul: j.judul.replace(/^Artifact · /, ''), url: j.url || '', path: j.path || '', dipakai: false });
function buildLamp(list, chosen) {
  const withLink = list.filter(j => j.url || j.path);
  const pick = new Set(chosen);
  const used = withLink.filter(j => pick.has(j.id)).map(j => Object.assign(lampOf(j), { dipakai: true }));
  const rest = withLink.filter(j => !pick.has(j.id)).slice(-8).map(lampOf);
  return [...used, ...rest];
}
function noteLocal(list) {
  const out = [], seen = new Set();
  for (const j of list) {
    let s = (j.src === 'claude' && !j.url ? j.teks.split(' · ')[0] : j.judul).replace(/https?:\/\/\S+/g, '').trim();
    if (s.length < 6) continue;
    const k = s.toLowerCase().slice(0, 40);
    if (seen.has(k)) continue;
    seen.add(k);
    s = s.charAt(0).toUpperCase() + s.slice(1);
    out.push({ t: s.length > 120 ? s.slice(0, 117).trim() + '…' : s, src: [j.id] });
  }
  const srcN = new Set(list.map(j => j.src)).size;
  return { ringkas: `${list.length} jejak dari ${srcN} sumber, belum dirangkum Claude.`, selesai: out.slice(0, 7), blocker: [], lanjut: [], lampiran: buildLamp(list, []) };
}

function runSteps(kind, day, steps, finalWait) {
  U.busy = { day, kind, steps, i: 0 };
  render();
  return new Promise(res => {
    const tick = () => {
      if (!U.busy) return res();
      if (U.busy.i < steps.length - 1) { U.busy.i++; render(); setTimeout(tick, 420); } else res();
    };
    setTimeout(tick, 420);
  }).then(() => finalWait);
}

async function generate(day, opts = {}) {
  if (U.busy) { toast('Tunggu draf yang sedang disusun selesai dulu.'); return false; }
  const ex = S.notes[day];
  if (ex && ex.edited && !opts.force) { U.confirm = 'n|' + day; U.addMenu = null; render(); scrollToDay(day); return false; }
  U.confirm = null; U.chip = null; U.addMenu = null; delete U.err[day];
  if (day === todayY() || !U.jj[day]) await loadJejak(day, true);
  const list = jejakOf(day);
  if (!list.length) { toast(`Belum ada jejak pada ${fLong(day)}. Tambah lewat menu Tambah.`); return false; }
  const on = S.settings.sources;
  const steps = SRC_ORDER.filter(s => on[s] && list.some(j => j.src === s)).map(s => `Membaca ${SRC[s].label} (${list.filter(j => j.src === s).length})`).concat(['Merangkum dengan Claude']);
  const call = native('claude', { prompt: buildPrompt(day, list), model: S.settings.model }).catch(() => ({ ok: false, error: 'BRIDGE' }));
  const r = await runSteps('note', day, steps, call);
  let note = null, err = null;
  if (r && r.ok) {
    const o = pickJSON(r.text);
    const ids = new Set(list.map(j => j.id));
    if (o) {
      note = { ringkas: String(o.ringkas || '').trim(), selesai: cleanItems(o.selesai, ids), blocker: cleanItems(o.blocker, ids), lanjut: cleanItems(o.lanjut, ids), lampiran: buildLamp(list, (o.lampiran || []).map(String)) };
      if (!note.selesai.length) { note = null; err = 'PARSE'; }
    } else err = 'PARSE';
  } else err = (r && r.error) || 'BRIDGE';
  const src = note ? 'claude' : 'lokal';
  if (!note) note = noteLocal(list);
  Object.assign(note, { at: new Date().toISOString(), src, model: src === 'claude' ? S.settings.model : '', edited: false, nJejak: list.length });
  S.notes[day] = note;
  mergeBlockers(note.blocker, day);
  if (err) U.err[day] = err;
  U.busy = null;
  save(); render();
  toast(err ? (ERRS[String(err).split(':')[0]] || 'Claude tidak bisa dihubungi, jadi catatan disusun dari jejak saja.') : `Draf ${fLong(day)} siap. Cek dan edit sebelum standup.`, err ? { err: true } : { label: 'Salin teks', fn: () => copyText('notes', day) });
  return true;
}
function mergeBlockers(items, day) {
  const have = new Set(S.blockers.map(b => b.t.toLowerCase()));
  for (const b of items) if (b.t && !have.has(b.t.toLowerCase())) { S.blockers.push({ id: uid(), t: b.t, day }); have.add(b.t.toLowerCase()); }
}

/* ---------- rangkum chat (dari chat yang kamu tempel) ---------- */
const chatsOf = day => (S.extra[day] || []).filter(x => x.src === 'chat');
async function generateChat(day, opts = {}) {
  if (U.busy) { toast('Tunggu draf yang sedang disusun selesai dulu.'); return; }
  const ex = S.chats[day];
  if (ex && ex.edited && !opts.force) { U.confirm = 'c|' + day; render(); return; }
  U.confirm = null;
  const list = chatsOf(day);
  if (!list.length) { toast('Tempel chat dulu lewat menu Tambah › Tempel chat.'); return; }
  const prompt = `Kamu membantu anggota tim BIS menyaring chat kerja (WhatsApp / Google Chat) yang ia tempel pada ${fLong(day)}.
Kelompokkan isinya:
- "minta": permintaan yang ditujukan kepadanya (tugas, revisi, tenggat), sebut siapa yang meminta kalau jelas.
- "balas": pertanyaan atau pesan yang masih perlu ia balas.
- "info": informasi penting yang perlu ia tahu (keputusan, jadwal, perubahan).
Aturan: bahasa Indonesia ringkas, ≤ 18 kata per poin, jangan mengarang, jangan tulis nomor HP/email. Tiap poin wajib "src" = ID potongan chat dari daftar. Kalau tidak ada, [].
"ringkas": 1 kalimat inti, ≤ 20 kata.
Balas HANYA JSON valid: {"ringkas":"","minta":[{"t":"","src":["id"]}],"balas":[{"t":"","src":["id"]}],"info":[{"t":"","src":["id"]}]}

=== CHAT ===
${list.map(c => `[${c.id}] ditempel ${c.jam}\n${c.teks}`).join('\n\n').slice(0, 24000)}`;
  const call = native('claude', { prompt, model: S.settings.model }).catch(() => ({ ok: false, error: 'BRIDGE' }));
  const r = await runSteps('chat', day, [`Membaca ${list.length} potongan chat`, 'Merangkum dengan Claude'], call);
  U.busy = null;
  const o = r && r.ok ? pickJSON(r.text) : null;
  if (!o) { render(); toast(r && r.error === 'NO_CLI' ? ERRS.NO_CLI : 'Rangkuman chat gagal. Coba lagi sebentar lagi.', { err: true }); return; }
  const ids = new Set(list.map(c => c.id));
  S.chats[day] = { ringkas: String(o.ringkas || '').trim(), minta: cleanItems(o.minta, ids), balas: cleanItems(o.balas, ids), info: cleanItems(o.info, ids), edited: false, at: new Date().toISOString(), n: list.length };
  save(); render();
  toast(`Rangkuman chat ${fLong(day)} siap.`);
}

/* ---------- tambah: suara / foto / file / chat ---------- */
function maskPII(t) {
  let n = 0;
  const out = t.replace(/(\+62|62|0)8[\d\s-]{7,}\d/g, () => { n++; return '[nomor disamarkan]'; })
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => { n++; return '[email disamarkan]'; })
    .replace(/\b(?:ID|id|Id)\s*(?:pelanggan|plg|cust(?:omer)?)?\s*[:#]?\s*\d{6,}\b/g, () => { n++; return '[ID disamarkan]'; });
  return { text: out, n };
}
async function integrate(day, x) {
  const note = S.notes[day];
  if (!note) return 0;
  const prompt = `Catatan standup ${fLong(day)} sudah ada:
Apa yang dikerjakan: ${note.selesai.map(i => i.t).join('; ') || '-'}
Kendala: ${note.blocker.map(i => i.t).join('; ') || '-'}
Selanjutnya: ${note.lanjut.map(i => i.t).join('; ') || '-'}

Ada jejak baru (${SRC[x.src].label}):
${x.detail || x.teks}

Ambil hanya poin BARU dari jejak ini yang belum ada di catatan. Bahasa Indonesia standup, mulai dengan kata kerja, ≤ 18 kata, jangan mengarang. Keputusan masuk "selesai" diawali "Memutuskan …". Kalau tidak ada yang baru, kosongkan.
Balas HANYA JSON: {"selesai":[""],"blocker":[""],"lanjut":[""]}`;
  const r = await native('claude', { prompt, model: S.settings.model }).catch(() => null);
  const o = r && r.ok ? pickJSON(r.text) : null;
  if (!o) return -1;
  const n2 = S.notes[day];
  if (!n2) return 0;
  let n = 0;
  for (const s of SECS) for (const t of (Array.isArray(o[s.key]) ? o[s.key] : [])) {
    const tt = String(typeof t === 'string' ? t : t.t || '').trim();
    if (tt) { n2[s.key].push({ t: tt, src: [x.id] }); n++; }
  }
  mergeBlockers((o.blocker || []).map(t => ({ t: String(typeof t === 'string' ? t : t.t || '').trim() })), day);
  if (n) n2.edited = true;
  save(); render();
  return n;
}
async function describeFile(x, day) {
  const isImg = /\.(png|jpe?g|heic|gif|webp)$/i.test(x.path);
  const prompt = `Baca file ini dengan alat Read: ${x.path}
${isImg ? 'Ini foto/gambar (mis. papan tulis, sketsa, dokumen fisik). Tuliskan teks dan poin kerja yang terbaca.' : 'Ringkas isi yang relevan untuk pekerjaan.'}
${x.teks ? `Keterangan dari pemilik: ${x.teks}\n` : ''}Bahasa Indonesia, ≤ 70 kata, tanpa pembuka. Kalau tidak terbaca, tulis "Tidak terbaca".`;
  const r = await native('claude', { prompt, model: S.settings.model, read: true }).catch(() => null);
  if (!(r && r.ok && r.text.trim()) || /^tidak terbaca/i.test(r.text.trim())) return false;
  const list = S.extra[day] || [];
  const it = list.find(e => e.id === x.id);
  if (!it) return false;
  it.detail = (x.teks ? x.teks + '\n' : '') + r.text.trim();
  save();
  return true;
}
function addExtra(day, x) {
  (S.extra[day] = S.extra[day] || []).push(x);
  save();
}
async function saveCap() {
  const c = U.cap, r = U.rec, day = c.day;
  const has = !!S.notes[day];
  const now = Date.now(), jam = hmNow();
  let x = null;
  if (c.type === 'suara') {
    const t = (r.text || '').trim(); if (!t) return;
    x = { id: 'x' + uid(), src: 'suara', ts: now, jam, judul: `Catatan suara · ${Math.floor(r.sec / 60)}:${pad(r.sec % 60)}`, teks: t };
  } else if (c.type === 'chat') {
    const raw = (c.chatText || '').trim(); if (!raw) return;
    const m = maskPII(raw);
    x = { id: 'x' + uid(), src: 'chat', ts: now, jam, judul: 'Chat ditempel', teks: m.text };
    c.masked = m.n;
  } else if (c.type === 'foto') {
    if (!c.photo) return;
    x = { id: 'x' + uid(), src: 'lokal', kind: 'foto', ts: now, jam, judul: c.caption.trim() || c.photo.name, teks: c.caption.trim(), path: c.photo.path };
  } else {
    if (!c.file) return;
    x = { id: 'x' + uid(), src: 'lokal', kind: 'file', ts: now, jam, judul: c.file.name, teks: c.caption.trim() || `${c.file.size} · lampiran`, path: c.file.path };
  }
  const masked = c.masked || 0;
  U.cap.kept = true;
  closeCap();
  addExtra(day, x);
  if (x.path && has) {
    const n = S.notes[day];
    n.lampiran = n.lampiran || [];
    n.lampiran.unshift({ id: 'L' + x.id, src: x.id, judul: x.judul, url: '', path: x.path, dipakai: true });
    n.edited = true; save();
  }
  render();
  const hid = masked ? ` ${masked} data pribadi disamarkan.` : '';
  if (!S.settings.sources[x.src]) { toast(`Tersimpan, tapi sumber ${SRC[x.src].label} sedang mati di panel Sumber.`); return; }
  if (!has) { toast(`Masuk ke jejak ${fLong(day)}. Ikut dirangkum saat Generate.${hid}`); if (x.path) describeFile(x, day); return; }
  toast(`Menambahkan ke catatan ${fLong(day)}…${hid}`);
  if (x.path) await describeFile(x, day);
  const nx = (S.extra[day] || []).find(e => e.id === x.id) || x;
  const n = await integrate(day, nx);
  if (x.src === 'chat' && S.chats[day]) toast('Chat baru tersimpan. Rangkum ulang chat untuk memasukkannya.');
  else toast(n > 0 ? `${n} poin baru masuk ke catatan ${fLong(day)}.` : n === 0 ? (x.path ? 'Lampiran ditambahkan ke catatan.' : 'Tersimpan di jejak. Tidak ada poin baru untuk catatan.') : 'Tersimpan di jejak. Claude tidak bisa dihubungi, jadi poinnya belum masuk.');
}

function openCap(type) {
  closeOverlays();
  U.cap = { type, day: todayY(), photo: null, file: null, caption: '', chatText: '', camErr: '' };
  U.rec = { mode: 'idle', sec: 0, text: '', level: 0, err: '' };
  render();
  if (type === 'foto') startCam();
  setTimeout(() => { const f = document.querySelector('.dlg [data-autofocus]'); f && f.focus(); }, 60);
}
function closeCap() {
  if (!U.cap) return;
  stopCam();
  if (U.rec.mode === 'on') native('voiceCancel');
  clearInterval(U.recT);
  const c = U.cap;
  if (!c.kept) { if (c.photo) native('removeFile', { path: c.photo.path }); if (c.file) native('removeFile', { path: c.file.path }); }
  U.cap = null; U.rec = { mode: 'idle', sec: 0, text: '', level: 0, err: '' };
  render();
}

/* suara */
const VOICE_ERR = {
  SPEECH_DENIED: 'Izin Pengenalan Ucapan belum diberikan. Nyalakan di Pengaturan Sistem › Privasi & Keamanan › Pengenalan Ucapan, atau ketik ceritamu langsung.',
  MIC_DENIED: 'Izin mikrofon belum diberikan. Nyalakan di Pengaturan Sistem › Privasi & Keamanan › Mikrofon, atau ketik ceritamu langsung.',
  SPEECH_UNAVAILABLE: 'Pengenalan ucapan bahasa Indonesia belum tersedia di Mac ini. Ketik ceritamu langsung.',
  MIC_FAILED: 'Mikrofon tidak bisa dipakai. Ketik ceritamu langsung.',
  SPEECH_RESTRICTED: 'Pengenalan ucapan dibatasi di Mac ini (profil kantor/Screen Time). Ketik ceritamu langsung.',
  SPEECH_DICTATION_OFF: 'Dikte macOS sedang mati, jadi suara tidak bisa diubah jadi teks. Nyalakan di Pengaturan Sistem › Keyboard › Dikte, lalu rekam ulang. Atau ketik ceritamu langsung.',
  SPEECH_NETWORK: 'Transkripsi butuh internet karena model bahasa Indonesia belum terpasang di Mac ini. Cek koneksi lalu rekam ulang, atau ketik ceritamu langsung.',
  SPEECH_FAILED: 'Suara tidak bisa diubah jadi teks. Rekam ulang, atau ketik ceritamu langsung.',
};
async function startRec() {
  U.rec = { mode: 'starting', sec: 0, text: '', level: 0, err: '' }; render();
  const r = await native('voiceStart').catch(() => ({ error: 'MIC_FAILED' }));
  if (!U.cap) { native('voiceCancel'); return; }
  if (r && r.error) { U.rec = { mode: 'idle', sec: 0, text: '', level: 0, err: VOICE_ERR[r.error] || VOICE_ERR.MIC_FAILED }; render(); return; }
  U.rec.mode = 'on'; render();
  clearInterval(U.recT);
  U.recT = setInterval(() => { if (U.rec.mode !== 'on') return clearInterval(U.recT); U.rec.sec++; updVoice(); if (U.rec.sec >= 120) stopRec(); }, 1000);
}
function stopRec() { clearInterval(U.recT); if (U.rec.mode !== 'on') return; U.rec.mode = 'finishing'; native('voiceStop'); render(); setTimeout(() => { if (U.rec.mode === 'finishing') { U.rec.mode = 'done'; render(); } }, 3000); }
function onVoice(p) {
  if (!U.cap || U.cap.type !== 'suara') return;
  if (p.error && U.rec.mode !== 'idle') {
    clearInterval(U.recT);
    U.rec = { mode: 'idle', sec: 0, text: '', level: 0, err: VOICE_ERR[p.error] || VOICE_ERR.SPEECH_FAILED };
    render(); return;
  }
  if (p.text) U.rec.text = p.text;
  U.rec.level = p.level || 0;
  if (p.final && U.rec.mode === 'finishing') { U.rec.mode = 'done'; render(); return; }
  updVoice();
}
const WAVE = 22;
function updVoice() {
  const t = $('#recTime'); if (t) t.textContent = `${pad(Math.floor(U.rec.sec / 60))}:${pad(U.rec.sec % 60)}`;
  const l = $('#liveText'); if (l) l.textContent = U.rec.text || 'Mulai bicara…';
  const w = $('#wave'); if (w) { const lv = U.rec.level; w.querySelectorAll('i').forEach((el, i) => { el.style.height = `${4 + Math.round(Math.abs(Math.sin((Date.now() / 140) + i * 0.9)) * 18 * Math.min(1, lv * 1.6 + 0.08))}px`; }); }
}

/* kamera */
async function startCam() {
  if (!U.cap) return;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomedia');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    if (!U.cap || U.cap.type !== 'foto' || U.cap.photo) { stream.getTracks().forEach(t => t.stop()); return; }
    U.cam = stream; U.cap.camErr = ''; render();
  } catch (e) { if (U.cap) { U.cap.camErr = 'Kamera tidak bisa dibuka. Izinkan Katnis di Pengaturan Sistem › Privasi & Keamanan › Kamera, atau pilih foto dari Mac.'; render(); } }
}
function stopCam() { if (U.cam) { U.cam.getTracks().forEach(t => t.stop()); U.cam = null; } }
async function shoot() {
  const v = $('#camVideo'); if (!v || !v.videoWidth) return;
  const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
  cv.getContext('2d').drawImage(v, 0, 0);
  const data = cv.toDataURL('image/jpeg', 0.86);
  const r = await native('savePhoto', { day: U.cap.day, data });
  if (!r || r.error) { toast('Foto gagal disimpan.', { err: true }); return; }
  stopCam();
  U.cap.photo = { path: r.path, name: r.name, size: r.size, preview: data, time: hmNow() };
  render();
}
async function pickFile(image) {
  const r = await native('pickFile', { day: U.cap.day, image: !!image });
  if (!U.cap) return;
  if (!r) return;
  if (r.error) { toast(r.error === 'TOO_BIG' ? 'File lebih dari 25 MB.' : 'File gagal dibaca.', { err: true }); return; }
  if (image) { stopCam(); U.cap.photo = { path: r.path, name: r.name, size: r.size, preview: 'file://' + r.path, time: hmNow() }; }
  else U.cap.file = r;
  render();
}

/* ---------- teks standup ---------- */
function standupText(store, day) {
  if (store === 'chats') {
    const c = S.chats[day]; if (!c) return '';
    const li = a => a.length ? a.map(i => `• ${i.t}`).join('\n') : '• –';
    return `*Rangkuman chat · ${fLong(day)}*\n${c.ringkas}\n\n*Permintaan untukmu*\n${li(c.minta)}\n\n*Perlu dibalas*\n${li(c.balas)}\n\n*Info penting*\n${li(c.info)}`;
  }
  const n = S.notes[day]; if (!n) return '';
  const li = a => a.length ? a.map(i => `• ${i.t}`).join('\n') : '• –';
  const seen = new Set();
  const blk = n.blocker.map(x => x.t).concat(day === todayY() ? S.blockers.map(b => b.t) : []).filter(t => { const k = (t || '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  let s = `*Standup · ${fLong(day)}*\n${n.ringkas}\n\n*Apa yang dikerjakan*\n${li(n.selesai)}\n\n*Kendala (blocker)*\n${blk.length ? blk.map(t => `• ${t}`).join('\n') : '• Tidak ada'}\n\n*Yang dikerjakan selanjutnya*\n${li(n.lanjut)}`;
  const links = (n.lampiran || []).filter(l => l.dipakai && l.url);
  if (links.length) s += `\n\n*Tautan*\n${links.map(l => `• ${l.judul}: ${l.url}`).join('\n')}`;
  return s;
}
async function copyText(store, day) {
  const t = standupText(store, day); if (!t) return;
  await native('copy', { text: t });
  toast(store === 'chats' ? 'Rangkuman chat disalin.' : `Teks standup ${fLong(day)} disalin. Tinggal tempel di Slack/WA.`);
}

/* ---------- tampilan ---------- */
function visibleDays() {
  const sp = S.settings.span;
  if (sp === 7) { const m = monday(U.anchor); return Array.from({ length: 7 }, (_, i) => add(m, i)); }
  return Array.from({ length: sp }, (_, i) => add(U.anchor, i - sp + 1));
}
function rangeTitle(days) {
  const a = pd(days[0]), b = pd(days[days.length - 1]);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MN[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${MN[a.getMonth()]} – ${b.getDate()} ${MN[b.getMonth()]} ${b.getFullYear()}`;
}
function shift(dir) {
  const sp = S.settings.span, step = sp === 7 ? 7 : sp;
  let a = add(U.anchor, dir * step);
  if (a > todayY()) a = todayY();
  U.anchor = a; U.chip = null; U.addMenu = null; U.confirm = null;
  render(); loadVisible();
}
function goToday() { U.anchor = todayY(); render(); loadVisible(); scrollToDay(todayY()); }
function scrollToDay(day) { setTimeout(() => { const c = document.querySelector(`[data-col="${day}"]`); c && c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50); }

function renderTop() {
  const t = todayY(), d = pd(t);
  $('#todayLabel').textContent = `${DF[d.getDay()]}, ${d.getDate()} ${MN[d.getMonth()]} ${d.getFullYear()}`;
  const dark = themeKey() === 'gelap';
  const tb = $('#themeBtn');
  tb.innerHTML = ic(dark ? 'sun' : 'moon', 18);
  tb.setAttribute('aria-label', dark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'); tb.title = tb.getAttribute('aria-label');
  const nb = S.blockers.length, pb = $('#panelBtn');
  pb.innerHTML = ic('sliders', 18) + (nb ? `<span class="badge" aria-hidden="true">${nb}</span>` : '');
  pb.setAttribute('aria-label', 'Sumber jejak dan blocker' + (nb ? `, ${nb} blocker aktif` : ''));
  pb.setAttribute('aria-expanded', String(U.panel));
  $('#menuBtn').setAttribute('aria-expanded', String(U.menu));
  const g = $('#genBtn');
  g.innerHTML = ic('spark', 16, 2.2) + (U.busy && U.busy.day === t ? 'Menyusun…' : S.notes[t] ? 'Generate ulang hari ini' : 'Generate hari ini');
  g.disabled = !!U.busy;
  $('#menu').innerHTML = U.menu ? `<button class="scrimbtn" data-act="menuClose" aria-label="Tutup menu"></button>
  <div class="menu" role="menu" aria-label="Tambah ke catatan">
    ${[['suara', 'mic', 'yel', 'Rekam suara', 'Ceritakan yang terjadi di luar laptop'], ['foto', 'cam', 'mint', 'Ambil foto', 'Papan tulis, sketsa, atau dokumen fisik'], ['file', 'up', 'ins', 'Upload file', 'PDF, gambar, atau dokumen'], ['chat', 'chat', 'ora', 'Tempel chat', 'WhatsApp atau Google Chat']]
      .map(([k, i, c, b, s]) => `<button role="menuitem" class="mi" data-act="cap" data-k="${k}"><span class="ic ${c}">${ic(i, 17)}</span><span><b>${b}</b><small>${s}</small></span></button>`).join('')}
  </div>` : '';
}

const rowsOf = (t, cpl) => Math.max(1, Math.ceil(((t || '').length + 1) / cpl));
function paperHTML(store, day, data, defs, title, titleInk, cmd, meta) {
  const pre = store === 'chats' ? 'c' : 'n';
  const list = store === 'chats' ? chatsOf(day).map(c => ({ ...c, url: '', detail: '' })) : jejakOf(day);
  const jmap = Object.fromEntries([...list, ...extrasOf(day)].map(j => [j.id, j]));
  const secs = defs.filter(s => (data[s.key] || []).length).map(s => `<div class="sec"><h4 style="color:${PSEC[s.key]}">## ${s.label}</h4>${data[s.key].map((it, i) => {
    const key = `${pre}|${day}|${s.key}|${i}`;
    const srcs = (it.src || []).map(id => jmap[id]).filter(Boolean);
    const open = U.chip === key && srcs.length;
    return `<div class="it"><div class="it-r"><span aria-hidden="true" style="color:${PSEC[s.key]}">-</span>
      <textarea class="ink" rows="1" data-kf="${key}" data-e="${key}" aria-label="${esc(s.name)} ${i + 1}, ${esc(fLong(day))}" placeholder="Tulis poin…">${esc(it.t)}</textarea>
      ${srcs.length ? `<button class="pdots" data-act="chip" data-k="${key}" aria-pressed="${!!open}" aria-label="${open ? 'Tutup' : 'Lihat'} sumber: ${esc(srcs.map(j => SRC[j.src].label + ' ' + j.jam).join(', '))}" title="Lihat sumber">${srcs.map(j => `<i style="background:${PSRC[j.src]}"></i>`).join('')}</button>` : ''}
      <button class="pdel" data-act="delItem" data-k="${key}" aria-label="Hapus poin ${i + 1} dari ${esc(s.name)}" title="Hapus poin">${ic('x', 12, 2.4)}</button></div>
      ${open ? `<div class="quote">${srcs.map(j => `<div><div class="qh"><span><i class="dot" style="width:6px;height:6px;background:${PSRC[j.src]}"></i>${esc(j.judul)}</span><span>${esc(j.jam)}</span></div><div class="qt">&gt; ${esc(clipQ(j))}</div>${j.url || j.path ? `<button class="linkbtn" data-act="openJ" data-day="${day}" data-id="${esc(j.id)}">Buka</button>` : ''}</div>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`).join('');
  const lamp = store === 'notes' ? (data.lampiran || []) : [];
  const used = lamp.map((l, i) => [l, i]).filter(([l]) => l.dipakai), sugg = lamp.map((l, i) => [l, i]).filter(([l]) => !l.dipakai);
  const confirm = U.confirm === `${pre}|${day}`;
  const addOpen = U.addMenu === `${pre}|${day}`;
  return `<article class="paper" aria-label="${esc(title)} ${esc(fLong(day))}">
    <div class="pbar"><span class="lights" aria-hidden="true"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></span>
      <span class="ptitle" style="color:${titleInk}">${esc(title)}</span>${data.edited ? '<span class="pedited">● diedit</span>' : ''}</div>
    <div class="pbody">
      <div class="pmeta"><div aria-hidden="true"><span class="prompt">$</span> ${esc(cmd)}</div>${meta ? `<div># ${esc(meta)}</div>` : ''}</div>
      <div class="ring"><span aria-hidden="true">›</span><textarea class="ink" rows="1" data-kf="${pre}|${day}|ringkas" data-e="${pre}|${day}|ringkas" aria-label="Ringkasan ${esc(fLong(day))}" placeholder="Tulis ringkasan satu kalimat…">${esc(data.ringkas)}</textarea></div>
      <div class="secs">${secs || `<div class="small" style="color:var(--pMuted)">Belum ada poin. Tambah lewat “+ Poin”.</div>`}</div>
      ${used.length ? `<div class="chips">${used.map(([l, i]) => `<span class="chip"><i class="sq7" style="background:${PSRC[(jmap[l.src] || {}).src] || '#B7C7C2'}"></i><button class="open" data-act="openLamp" data-day="${day}" data-i="${i}" title="Buka ${esc(l.judul)}">${esc(l.judul)}</button><button class="pdel" data-act="dropLamp" data-day="${day}" data-i="${i}" aria-label="Lepas lampiran ${esc(l.judul)}" title="Lepas lampiran">${ic('x', 11, 2.4)}</button></span>`).join('')}</div>` : ''}
      ${confirm ? `<div class="confirm">Catatan ini sudah kamu edit. Generate ulang akan menimpa editanmu.<div style="display:flex;gap:6px"><button class="pbtn yel" data-act="confirmYes" data-store="${store}" data-day="${day}">Timpa</button><button class="pbtn line" data-act="confirmNo">Batal</button></div></div>` : ''}
      <div class="pfoot">
        <button class="pbtn" data-act="addMenu" data-k="${pre}|${day}" aria-haspopup="menu" aria-expanded="${addOpen}">${ic('plus', 13, 2.4)}Poin</button>
        <span class="sp"></span>
        <button class="pbtn sq" data-act="copy" data-store="${store}" data-day="${day}" aria-label="Salin teks ${esc(fLong(day))}" title="Salin teks">${ic('copy', 15)}</button>
        <button class="pbtn sq" data-act="regen" data-store="${store}" data-day="${day}" ${U.busy ? 'disabled' : ''} aria-label="Generate ulang ${esc(fLong(day))}" title="Generate ulang">${ic('regen', 15)}</button>
        ${addOpen ? `<div class="pmenu" role="menu" aria-label="Tambah ke catatan"><div class="h">Tambah poin ke</div>
          ${defs.map(s => `<button role="menuitem" data-act="addItem" data-store="${store}" data-day="${day}" data-sec="${s.key}"><i class="sq7" style="background:${PSEC[s.key]}"></i><span>${esc(s.name)}</span></button>`).join('')}
          ${sugg.length ? `<div class="h sep">Lampiran yang disarankan</div>${sugg.map(([l, i]) => `<button role="menuitem" data-act="useLamp" data-day="${day}" data-i="${i}">${ic('plus', 13, 2.4)}<span>${esc(l.judul)}</span></button>`).join('')}` : ''}
        </div>` : ''}
      </div>
    </div></article>`;
}
const clipQ = j => { const t = j.detail || j.teks || ''; return t.length > 420 ? t.slice(0, 417) + '…' : t; };

function stepsHTML(b, color) {
  return b.steps.map((label, i) => { const k = i < b.i ? 'done' : i === b.i ? 'run' : 'wait'; return `<div class="step ${k}"><i>${k === 'done' ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>` : ''}</i><span>${esc(label)}</span></div>`; }).join('');
}

function dayHTML(day) {
  const t = todayY(), future = day > t, isToday = day === t, wk = isWeekend(day);
  const d = pd(day), sp = S.settings.span;
  const list = future ? [] : jejakOf(day);
  const loaded = !!U.jj[day] || future;
  const note = S.notes[day], chat = S.chats[day];
  const isBusy = U.busy && U.busy.day === day && U.busy.kind === 'note';
  const isChatBusy = U.busy && U.busy.day === day && U.busy.kind === 'chat';
  const counts = SRC_ORDER.map(k => ({ k, n: list.filter(j => j.src === k).length })).filter(x => x.n);
  const hasChats = chatsOf(day).length > 0;
  let h = `<section class="col glass ${isToday ? 'today' : ''} ${wk && !list.length && !note ? 'weekend' : ''}" data-col="${day}" aria-label="${esc(fLong(day))}">
    <div class="col-h"><div><div class="dn mono">${DN[d.getDay()]}</div><div class="dd">${d.getDate()}</div></div>${isToday ? '<span class="pill">Hari ini</span>' : ''}</div>`;
  if (list.length) h += `<button class="jejak" data-act="showJejak" data-day="${day}" title="Lihat semua jejak"><div class="row"><span>Jejak</span><span class="mono">${list.length} · ${counts.length} sumber</span></div><div class="bars">${counts.map(c => `<span title="${esc(SRC[c.k].label)}: ${c.n}" style="flex:${c.n};background:var(--src-${c.k})"></span>`).join('')}</div></button>`;
  if (U.loading[day]) h += `<div class="loading"><span class="spin"></span>Membaca jejak…</div>`;
  if (future) h += `<div class="future">${wk ? 'Akhir pekan. Kolom ini hanya terisi kalau ada jejak.' : 'Belum ada jejak. Kolom ini terisi nanti.'}</div>`;
  else if (isBusy) h += `<div class="busy" aria-live="polite"><b><span class="spin"></span>Menyusun draf…</b>${stepsHTML(U.busy, '#3CC98B')}</div>`;
  else if (!note && loaded) {
    if (!list.length) h += wk ? `<div class="future">Akhir pekan. Tidak ada jejak.</div>` : `<div class="idle"><b>Belum ada jejak</b><p>${isToday ? 'Jejak muncul begitu kamu bekerja. Bisa juga tambah sendiri lewat menu Tambah.' : 'Tidak ada jejak yang terbaca di hari ini.'}</p></div>`;
    else h += `<div class="idle"><b>Belum dirangkum</b><p>${list.length} jejak siap dirangkum. Hasilnya draf yang bisa kamu edit.</p><div class="btnrow"><button class="pri sm" data-act="gen" data-day="${day}" ${U.busy ? 'disabled' : ''}>${ic('spark', 15, 2.2)}Generate</button>${hasChats && !chat && !isChatBusy ? `<button class="chatbtn" data-act="genChat" data-day="${day}" ${U.busy ? 'disabled' : ''}>${ic('chat', 15, 2.2)}Rangkum chat</button>` : ''}</div></div>`;
  }
  if (note && !isBusy) {
    if (U.err[day] && note.src === 'lokal') h += `<div class="errnote">${esc(ERRS[String(U.err[day]).split(':')[0]] || 'Claude tidak bisa dihubungi, jadi catatan disusun dari jejak saja.')}</div>`;
    h += paperHTML('notes', day, note, SECS, 'Catatan hari ini', '#9DE8C4', `katnis rangkum --tgl ${pad(d.getDate())}-${pad(d.getMonth() + 1)}`, note.src === 'lokal' ? 'disusun tanpa Claude' : '');
  }
  if (chat && !isChatBusy) h += paperHTML('chats', day, chat, CSECS, 'Rangkuman chat', '#FFB27A', `katnis chat --tgl ${pad(d.getDate())}-${pad(d.getMonth() + 1)}`, `${chat.n} potongan chat ditempel`);
  if (isChatBusy) h += `<div class="busy ora" aria-live="polite"><b><span class="spin"></span>Merangkum chat…</b>${stepsHTML(U.busy, '#E5793A')}</div>`;
  if (note && !isBusy && !chat && !isChatBusy && hasChats) h += `<button class="chatbtn dash" data-act="genChat" data-day="${day}" ${U.busy ? 'disabled' : ''}>${ic('chat', 15, 2.2)}Rangkum chat</button>`;
  return h + '</section>';
}

function renderMain() {
  const sp = S.settings.span, V = VIEW[sp], days = visibleDays(), t = todayY();
  const nextOff = sp === 7 ? days.includes(t) || days[0] > t : U.anchor >= t;
  const m = $('#main');
  m.style.cssText = Object.entries({ '--dayNum': V.dayNum, '--item': V.item, '--ringkas': V.ringkas, '--lbl': V.lbl, '--cardPad': V.cardPad, '--colPad': V.colPad, '--secGap': V.secGap }).map(([k, v]) => `${k}:${v}`).join(';');
  m.innerHTML = `<div class="bar">
      <div class="nav"><button class="ibtn nbtn" data-act="prev" aria-label="Sebelumnya">${ic('left', 16, 2.2)}</button><button class="ibtn nbtn" data-act="next" aria-label="Berikutnya" ${nextOff ? 'disabled' : ''}>${ic('right', 16, 2.2)}</button></div>
      <h1>${rangeTitle(days)}</h1><span class="wk mono">minggu ke-${weekNo(days[days.length - 1])}</span>
      ${!days.includes(t) ? `<button class="btn xs" data-act="today">Ke hari ini</button>` : ''}
      <span class="sp"></span>
      <div class="seg" role="group" aria-label="Rentang tampilan">${[[2, '2 hari'], [4, '4 hari'], [7, 'Seminggu']].map(([n, l]) => `<button aria-pressed="${sp === n}" data-act="span" data-n="${n}">${l}</button>`).join('')}</div>
    </div>
    <div class="legend">${SRC_ORDER.map(k => `<span style="${S.settings.sources[k] ? '' : 'opacity:.45;text-decoration:line-through'}"><i class="dot" style="background:var(--src-${k})"></i>${SRC[k].label}</span>`).join('')}</div>
    <div class="${sp === 2 ? 'grid2' : sp === 4 ? 'grid4' : 'grid7'}">${days.map(dayHTML).join('')}</div>`;
}

function capHTML() {
  const c = U.cap, r = U.rec, t = todayY();
  const kinds = { suara: ['Rekam suara', 'mic', 'yel'], foto: ['Ambil foto', 'cam', 'mint'], file: ['Upload file', 'up', 'ins'], chat: ['Tempel chat', 'chat', 'ora'] };
  const [title, icon, tone] = kinds[c.type];
  const days = Array.from({ length: 7 }, (_, i) => add(t, i - 6));
  const ready = c.type === 'suara' ? r.mode === 'done' && !!(r.text || '').trim() : c.type === 'foto' ? !!c.photo : c.type === 'chat' ? !!(c.chatText || '').trim() : !!c.file;
  let body = '';
  if (c.type === 'suara') {
    body = `<div class="box yel"><p>Ceritakan apa yang kamu kerjakan, apa yang diputuskan, dan apa yang menghambat. Suara ditranskripsi macOS, audionya tidak disimpan.</p>
      ${r.err ? `<p style="color:var(--text);font-weight:500">${esc(r.err)}</p>` : ''}
      ${r.mode === 'idle' ? `<div class="btnrow"><button class="recbtn" data-act="recStart" data-autofocus><span class="recdot"></span>Mulai rekam</button><button class="btn sm" data-act="recType">Ketik saja</button></div>` : ''}
      ${r.mode === 'starting' ? `<div class="loading"><span class="spin"></span>Menyiapkan mikrofon…</div>` : ''}
      ${r.mode === 'on' || r.mode === 'finishing' ? `<div class="recon" aria-live="polite"><span class="recdot"></span><span class="mono" id="recTime" style="font-size:15px">${pad(Math.floor(r.sec / 60))}:${pad(r.sec % 60)}</span><div class="wave" id="wave" aria-hidden="true">${'<i style="height:4px"></i>'.repeat(WAVE)}</div>${r.mode === 'on' ? '<button class="btn sm" data-act="recStop">Selesai</button>' : '<span class="small">Menyelesaikan…</span>'}</div><div class="live" id="liveText">${esc(r.text || 'Mulai bicara…')}</div>` : ''}
      ${r.mode === 'done' && r.sec && !(r.text || '').trim() ? `<p style="color:var(--text);font-weight:500">Belum ada suara yang tertangkap jadi teks. Cek mikrofon yang dipakai Mac, rekam ulang, atau ketik ceritamu di bawah.</p>` : ''}
      ${r.mode === 'done' ? `<label class="stack"><span class="small">Transkrip${r.sec ? ` ${pad(Math.floor(r.sec / 60))}:${pad(r.sec % 60)}` : ''} (bisa dikoreksi)</span><textarea class="field" rows="5" data-kf="rec" data-f="rec" placeholder="Ketik ceritamu…">${esc(r.text)}</textarea></label><button class="btn xs" data-act="recReset" style="align-self:flex-start">Rekam ulang</button>` : ''}
    </div>`;
  } else if (c.type === 'foto') {
    body = c.photo ? `<div class="cam"><img src="${esc(c.photo.preview)}" alt="Foto yang diambil"><span class="tag">Foto · ${esc(c.photo.time)}</span><button class="btn xs redo" data-act="retake">Ulangi</button></div>
      <label class="stack"><span class="lbl">Keterangan (opsional)</span><input class="field" data-kf="cap" data-f="caption" value="${esc(c.caption)}" placeholder="Mis. sketsa alur bayar di papan tulis"></label>
      <p class="hint">Claude membaca isi foto ini supaya ikut masuk ke catatan.</p>`
      : U.cam ? `<div class="cam"><video id="camVideo" autoplay playsinline muted></video><span class="tag"><i class="dot" style="width:6px;height:6px;background:#5EE6A8"></i>Kamera Mac</span><button class="shoot" data-act="shoot" aria-label="Ambil foto" data-autofocus><i></i></button></div><button class="btn xs" data-act="pickPhoto" style="align-self:flex-start">Pilih foto dari Mac</button>`
      : `<div class="cam"><div class="cammsg">${c.camErr ? esc(c.camErr) : '<span class="spin"></span>Membuka kamera…'}${c.camErr ? '<button class="btn sm" data-act="pickPhoto">Pilih foto dari Mac</button>' : ''}</div></div>`;
  } else if (c.type === 'file') {
    body = c.file ? `<div class="filecard"><span class="fext mono">${esc((c.file.name.split('.').pop() || 'file').slice(0, 4).toUpperCase())}</span><div style="flex:1;min-width:0"><div class="nm" title="${esc(c.file.name)}">${esc(c.file.name)}</div><small>${esc(c.file.size)} · masuk sebagai lampiran</small></div><button class="btn xs" data-act="pickFile">Ganti</button></div>
      <label class="stack"><span class="lbl">Keterangan (opsional)</span><input class="field" data-kf="cap" data-f="caption" value="${esc(c.caption)}" placeholder="Mis. notulen rapat planning"></label>`
      : `<div class="drop">${ic('up', 28, 1.8)}<div>PDF, gambar, atau dokumen sampai 25 MB</div><button class="btn sm" data-act="pickFile" data-autofocus>Pilih file</button></div>`;
  } else {
    body = `<div class="box ora"><label class="stack"><span class="lbl">Potongan chat</span><textarea class="field" rows="7" data-kf="chat" data-f="chat" data-autofocus placeholder="Tempel potongan chat yang menyangkut pekerjaanmu…">${esc(c.chatText)}</textarea></label>
      <p class="small">Nomor HP, email, dan ID pelanggan disamarkan sebelum disimpan dan dikirim ke Claude.</p></div>`;
  }
  return `<div class="scrim" data-act="capClose"></div><div class="dlg-wrap"><section class="dlg" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="dhead"><span class="ic ${tone}">${ic(icon, 18)}</span><h2>${title}</h2><button class="ibtn xbtn" data-act="capClose" aria-label="Tutup">${ic('x', 16, 2.2)}</button></div>
    <div class="dbody">
      <div role="group" aria-label="Terkait tanggal" style="display:flex;flex-direction:column;gap:8px"><span class="lbl">Terkait tanggal</span>
        <div class="daypick">${days.map(d => { const x = pd(d); return `<button aria-pressed="${d === c.day}" data-act="capDay" data-day="${d}" aria-label="${esc(fLong(d))}${d === t ? ', hari ini' : ''}"><small>${d === t ? 'Hari ini' : DS[x.getDay()]}</small><b>${x.getDate()} ${MN[x.getMonth()]}</b></button>`; }).join('')}</div>
        <p class="hint">${S.notes[c.day] ? `Langsung masuk ke catatan ${esc(fLong(c.day))} yang sudah ada.` : `${esc(fLong(c.day))} belum dirangkum. Isinya disimpan sebagai jejak dan ikut dirangkum saat kamu Generate.`}</p>
      </div>
      ${body}
    </div>
    <div class="dfoot"><button class="btn" data-act="capClose">Batal</button><button class="pri" data-act="capSave" ${ready ? '' : 'disabled'}>Simpan ke ${esc(fShort(c.day))}</button></div>
  </section></div>`;
}

function sideHTML() {
  const on = S.settings.sources, day = U.panelDay;
  const list = day ? jejakOf(day) : [];
  return `<div class="scrim" data-act="panelClose"></div><aside class="side" role="dialog" aria-modal="true" aria-label="Sumber jejak dan blocker">
    <div class="dhead"><h2>Sumber &amp; blocker</h2><button class="ibtn xbtn" data-act="panelClose" aria-label="Tutup panel">${ic('x', 16, 2.2)}</button></div>
    <div class="dbody" style="gap:22px">
      ${day ? `<section><div class="shead"><h3>Jejak ${esc(fLong(day))}</h3><small>${list.length} jejak</small></div><div class="jl">${list.map(j => `<div class="j"><div class="h"><span><i class="dot" style="background:var(--src-${j.src})"></i>${esc(j.judul)}</span><span class="mono">${esc(j.jam)}</span></div>${esc((j.teks || '').slice(0, 260))}${j.url || j.path ? ` <button class="linkbtn" data-act="openJ" data-day="${day}" data-id="${esc(j.id)}">Buka</button>` : ''}${j.extra ? ` <button class="linkbtn" data-act="delExtra" data-day="${day}" data-id="${esc(j.id)}">Hapus</button>` : ''}</div>`).join('') || '<p class="small">Belum ada jejak.</p>'}</div></section>` : ''}
      <section><div class="shead"><h3>Sumber jejak</h3><small>hanya dibaca di Mac-mu</small></div>
        ${SRC_ORDER.map(k => `<div class="srow"><i class="dot" style="width:9px;height:9px;background:var(--src-${k});opacity:${on[k] ? 1 : .3}"></i><div class="t"><b>${SRC[k].label}</b><small>${SRC[k].hint}</small></div><button class="sw" role="switch" aria-checked="${!!on[k]}" aria-label="${SRC[k].label}" data-act="src" data-k="${k}"><i></i></button></div>`).join('')}
      </section>
      <section><h3 style="margin-bottom:10px">Blocker aktif</h3>
        ${S.blockers.length ? '' : '<p class="small" style="margin:0 0 10px">Tidak ada blocker. Kendala dari catatan muncul di sini sampai kamu tandai beres.</p>'}
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">${S.blockers.map(b => `<div class="blk"><i class="dot"></i><span class="t">${esc(b.t)}${b.day ? `<small>sejak ${esc(fShort(b.day))}</small>` : ''}</span><button class="btn xs" data-act="blkDone" data-id="${b.id}" aria-label="Tandai beres: ${esc(b.t)}">Beres</button></div>`).join('')}</div>
        <div class="blkadd"><label class="sr" for="newBlk">Blocker baru</label><input id="newBlk" data-kf="blk" data-f="blk" value="${esc(U.newBlk)}" placeholder="Tambah blocker…"><button class="ibtn" style="width:40px;height:40px;border-radius:10px" data-act="blkAdd" aria-label="Tambah blocker">${ic('plus', 16, 2.2)}</button></div>
      </section>
      <section><h3 style="margin-bottom:10px">Pengaturan</h3>
        <label class="stack"><span class="lbl">Model Claude untuk merangkum</span><select class="field" data-f="model">${[['sonnet', 'Sonnet (seimbang)'], ['haiku', 'Haiku (paling cepat)'], ['opus', 'Opus (paling teliti)']].map(([v, l]) => `<option value="${v}" ${S.settings.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${U.hasClaude ? '' : `<p class="small" style="margin-top:8px">Claude Code belum terpasang di Mac ini. Catatan tetap disusun dari jejak, tanpa dirangkum.</p>`}
        <p class="small" style="margin-top:10px">Semua catatan disimpan di Mac ini. <button class="linkbtn" data-act="openData">Buka folder data</button></p>
      </section>
    </div></aside>`;
}

function renderLayer() {
  const L = $('#layer');
  if (U.cap) {
    const keepVideo = U.cam && $('#camVideo');
    L.innerHTML = capHTML();
    const v = $('#camVideo'); if (v && U.cam && v.srcObject !== U.cam) v.srcObject = U.cam;
    void keepVideo;
  } else if (U.panel) L.innerHTML = sideHTML();
  else L.innerHTML = '';
}

function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
function render() {
  const a = document.activeElement;
  const kf = a && a.dataset ? a.dataset.kf : null;
  const ss = a && 'selectionStart' in a ? a.selectionStart : null, se = a && 'selectionEnd' in a ? a.selectionEnd : null;
  applyTheme(); renderTop(); renderMain(); renderLayer();
  document.querySelectorAll('textarea.ink').forEach(autosize);
  if (kf) { const el = document.querySelector(`[data-kf="${CSS.escape(kf)}"]`); if (el) { el.focus({ preventScroll: true }); try { if (ss != null) el.setSelectionRange(ss, se); } catch (e) { } } }
}
function focusKey(k, end = true) { setTimeout(() => { const el = document.querySelector(`[data-kf="${CSS.escape(k)}"]`); if (el) { el.focus(); if (end) { const n = el.value.length; el.setSelectionRange(n, n); } } }, 0); }

let toastT;
function toast(msg, o = {}) {
  const t = $('#toast');
  t.className = 'on' + (o.err ? ' err' : '');
  t.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${o.err ? '#E5584A' : '#3CC98B'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${o.err ? 'M12 8v5M12 17h.01' : 'M5 12l5 5L20 7'}"/></svg><span>${esc(msg)}</span>${o.label ? `<button id="toastBtn">${esc(o.label)}</button>` : ''}`;
  if (o.label) $('#toastBtn').onclick = () => { t.className = ''; o.fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, o.label ? 6000 : 4200);
}
function closeOverlays() { U.menu = false; U.panel = false; U.panelDay = null; U.addMenu = null; }

/* ---------- edit langsung ---------- */
const storeOf = p => p === 'c' ? 'chats' : 'notes';
function parseKey(k) { const [p, day, sec, i] = k.split('|'); return { store: storeOf(p), pre: p, day, sec, i: i == null ? null : +i }; }
function markEdited(data) { if (!data.edited) { data.edited = true; render(); } }
function itemAt(k) { const q = parseKey(k); const data = S[q.store][q.day]; return { q, data, arr: data && q.sec !== 'ringkas' ? data[q.sec] : null }; }
function insertItem(store, day, sec, at) {
  const data = S[store][day]; if (!data) return;
  const i = at == null ? data[sec].length : at;
  data[sec].splice(i, 0, { t: '', src: [] });
  data.edited = true; U.addMenu = null; save(); render();
  focusKey(`${store === 'chats' ? 'c' : 'n'}|${day}|${sec}|${i}`);
}

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.e) {
    const { q, data, arr } = itemAt(el.dataset.e);
    if (!data) return;
    if (q.sec === 'ringkas') data.ringkas = el.value.replace(/\n/g, ' ');
    else if (arr && arr[q.i]) arr[q.i].t = el.value;
    autosize(el); save(); markEdited(data);
    return;
  }
  const f = el.dataset.f;
  if (f === 'rec') U.rec.text = el.value;
  else if (f === 'caption') U.cap.caption = el.value;
  else if (f === 'chat') U.cap.chatText = el.value;
  else if (f === 'blk') { U.newBlk = el.value; return; }
  else return;
  const btn = document.querySelector('[data-act="capSave"]');
  if (btn) btn.disabled = !(f === 'rec' ? el.value.trim() : f === 'chat' ? el.value.trim() : true);
});
document.addEventListener('change', e => {
  if (e.target.dataset.f === 'model') { S.settings.model = e.target.value; save(); toast('Model untuk Generate berikutnya: ' + e.target.value + '.'); }
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Escape') {
    if (U.addMenu) { U.addMenu = null; render(); return; }
    if (U.menu) { U.menu = false; render(); return; }
    if (U.cap) { closeCap(); return; }
    if (U.panel) { closeOverlays(); render(); return; }
    if (el.dataset && el.dataset.e) el.blur();
    return;
  }
  if (el.dataset && el.dataset.e && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    const q = parseKey(el.dataset.e);
    if (q.sec === 'ringkas') { el.blur(); return; }
    if (el.value.trim()) insertItem(q.store, q.day, q.sec, q.i + 1);
    return;
  }
  if (el.dataset && el.dataset.e && e.key === 'Backspace' && !el.value) {
    const q = parseKey(el.dataset.e);
    if (q.sec === 'ringkas') return;
    e.preventDefault();
    const data = S[q.store][q.day];
    data[q.sec].splice(q.i, 1); save(); render();
    if (q.i > 0) focusKey(`${q.pre}|${q.day}|${q.sec}|${q.i - 1}`);
    return;
  }
  if (el.id === 'newBlk' && e.key === 'Enter') { e.preventDefault(); act('blkAdd', {}); }
});
document.addEventListener('focusout', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.e) return;
  const key = el.dataset.e;
  setTimeout(() => {
    const { q, data, arr } = itemAt(key);
    if (!data || q.sec === 'ringkas' || !arr || !arr[q.i] || (arr[q.i].t || '').trim()) return;
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.kf === key) return;
    arr.splice(q.i, 1); save(); render();
  }, 120);
});

/* ---------- aksi ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  act(b.dataset.act, b.dataset, e);
});
function act(a, d) {
  switch (a) {
    case 'theme': S.settings.theme = themeKey() === 'gelap' ? 'terang' : 'gelap'; save(); render(); break;
    case 'panel': U.menu = false; U.panel = !U.panel; U.panelDay = null; render(); break;
    case 'panelClose': closeOverlays(); render(); break;
    case 'menu': U.menu = !U.menu; render(); if (U.menu) setTimeout(() => { const f = document.querySelector('.menu .mi'); f && f.focus(); }, 30); break;
    case 'menuClose': U.menu = false; render(); break;
    case 'cap': openCap(d.k); break;
    case 'capClose': closeCap(); break;
    case 'capDay': U.cap.day = d.day; render(); break;
    case 'capSave': saveCap(); break;
    case 'recStart': startRec(); break;
    case 'recStop': stopRec(); break;
    case 'recType': U.rec = { mode: 'done', sec: 0, text: '', level: 0, err: '' }; render(); focusKey('rec'); break;
    case 'recReset': U.rec = { mode: 'idle', sec: 0, text: '', level: 0, err: '' }; render(); break;
    case 'shoot': shoot(); break;
    case 'retake': native('removeFile', { path: U.cap.photo.path }); U.cap.photo = null; U.cap.caption = ''; render(); startCam(); break;
    case 'pickPhoto': pickFile(true); break;
    case 'pickFile': if (U.cap.file) native('removeFile', { path: U.cap.file.path }); U.cap.file = null; pickFile(false); break;
    case 'genToday': { const t = todayY(); if (!visibleDays().includes(t)) goToday(); generate(t); break; }
    case 'gen': generate(d.day); break;
    case 'genChat': generateChat(d.day); break;
    case 'regen': d.store === 'chats' ? generateChat(d.day) : generate(d.day); break;
    case 'confirmYes': d.store === 'chats' ? generateChat(d.day, { force: true }) : generate(d.day, { force: true }); break;
    case 'confirmNo': U.confirm = null; render(); break;
    case 'copy': copyText(d.store, d.day); break;
    case 'chip': U.chip = U.chip === d.k ? null : d.k; render(); break;
    case 'delItem': { const { data, arr, q } = itemAt(d.k); if (arr) { arr.splice(q.i, 1); data.edited = true; U.chip = null; save(); render(); } break; }
    case 'addMenu': U.addMenu = U.addMenu === d.k ? null : d.k; U.chip = null; render(); if (U.addMenu) setTimeout(() => { const f = document.querySelector('.pmenu button'); f && f.focus(); }, 30); break;
    case 'addItem': insertItem(d.store, d.day, d.sec, null); break;
    case 'useLamp': { const n = S.notes[d.day]; n.lampiran[+d.i].dipakai = true; n.edited = true; U.addMenu = null; save(); render(); break; }
    case 'dropLamp': { const n = S.notes[d.day]; n.lampiran[+d.i].dipakai = false; n.edited = true; save(); render(); break; }
    case 'openLamp': { const l = S.notes[d.day].lampiran[+d.i]; openTarget(l.url, l.path); break; }
    case 'openJ': { const j = [...(U.jj[d.day] || []), ...extrasOf(d.day)].find(x => x.id === d.id); if (j) openTarget(j.url, j.path); break; }
    case 'showJejak': U.menu = false; U.panel = true; U.panelDay = d.day; render(); break;
    case 'delExtra': { const l = S.extra[d.day] || []; const x = l.find(e => e.id === d.id); if (x && x.path) native('removeFile', { path: x.path }); S.extra[d.day] = l.filter(e => e.id !== d.id); save(); render(); toast('Jejak dihapus.'); break; }
    case 'src': { const k = d.k; S.settings.sources[k] = !S.settings.sources[k]; save(); U.jj = {}; render(); loadVisible(); toast(SRC[k].label + (S.settings.sources[k] ? ' dinyalakan.' : ' dimatikan. Generate berikutnya tidak membacanya.')); break; }
    case 'blkDone': S.blockers = S.blockers.filter(b => b.id !== d.id); save(); render(); toast('Blocker ditandai beres.'); break;
    case 'blkAdd': { const v = (U.newBlk || '').trim(); if (!v) return; S.blockers.push({ id: uid(), t: v, day: todayY() }); U.newBlk = ''; save(); render(); focusKey('blk'); break; }
    case 'openData': native('openData'); break;
    case 'prev': shift(-1); break;
    case 'next': shift(1); break;
    case 'today': goToday(); break;
    case 'span': S.settings.span = +d.n; save(); render(); loadVisible(); break;
  }
}
function openTarget(url, path) { if (url) native('open', { url }); else if (path) native('openPath', { path }); }

/* ---------- API untuk menu native ---------- */
window.Katnis = {
  voice: onVoice, onFocus,
  genToday: () => act('genToday', {}), goToday,
  openCap, copyToday: () => S.notes[todayY()] ? copyText('notes', todayY()) : toast('Catatan hari ini belum ada. Generate dulu.'),
  togglePanel: () => act('panel', {}),
};
window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!S.settings.theme) render(); });

/* ---------- mock untuk pratinjau di browser / --demo ---------- */
const Mock = {
  load: () => '',
  hasClaude: () => true,
  jejak: ({ day }) => {
    const base = pd(day).getTime();
    const at = (h, m) => base + (h * 60 + m) * 60000;
    if (day === todayY()) return [
      { id: 'c1', src: 'claude', ts: at(9, 31), jam: '09.31', judul: 'Sesi Claude Code · katnis', teks: 'planning asisten rangkuman harian untuk tiap anggota BIS', detail: '- planning asisten rangkuman harian untuk tiap anggota BIS\n- riset sumber data: Claude Code, Figma, Chrome, suara' },
      { id: 'c2', src: 'claude', ts: at(10, 5), jam: '10.05', judul: 'Sesi Claude Code · katnis', teks: 'ubah poin catatan jadi dikerjakan, kendala, selanjutnya', detail: '- ubah poin catatan jadi dikerjakan, kendala, selanjutnya\n- buat dmg lalu push ke repo' },
      { id: 'a1', src: 'claude', ts: at(10, 20), jam: '10.20', judul: 'Artifact · Katnis — Prototipe', teks: 'Diterbitkan/diperbarui 7×', url: 'https://claude.ai/artifact/contoh' },
      { id: 'w1', src: 'figma', ts: at(13, 5), jam: '13.05', judul: 'Katnis · Logo Mata Panah', teks: 'Dibuka 3× antara 13.05 dan 14.10', url: 'https://www.figma.com/design/contoh' },
      { id: 'w2', src: 'web', ts: at(14, 20), jam: '14.20', judul: 'Kapasitas Tim BIS · docs.google.com', teks: 'Dibuka 2× antara 14.20 dan 15.05', url: 'https://docs.google.com/contoh' },
      { id: 'l1', src: 'lokal', ts: at(16, 30), jam: '16.30', judul: 'Screenshot 2026-11-19 at 16.30.png', teks: 'Disimpan di Desktop · 412 KB', path: '/tmp/contoh.png' },
    ];
    if (isWeekend(day)) return [];
    return [
      { id: 'c9', src: 'claude', ts: at(9, 12), jam: '09.12', judul: 'Sesi Claude Code · bis-dashboard', teks: 'rapikan judul dashboard aktivitas, tampilkan periode sprint', detail: '' },
      { id: 'w9', src: 'web', ts: at(14, 0), jam: '14.00', judul: 'Papan Tim BIS · claude.ai', teks: 'Dibuka 4×', url: 'https://claude.ai/contoh' },
    ];
  },
  claude: ({ prompt }) => {
    if (prompt.includes('=== CHAT ===')) return { ok: true, text: '{"ringkas":"PO minta copy tombol bayar diganti sebelum Jumat.","minta":[{"t":"Mengganti copy tombol Bayar sekarang jadi Bayar tagihan sebelum Jumat","src":[]}],"balas":[],"info":[]}' };
    return { ok: true, text: '{"ringkas":"Merencanakan Katnis dan merapikan susunan catatannya.","selesai":[{"t":"Menyusun planning Katnis berdasarkan sumber jejak kerja","src":["c1"]},{"t":"Memutuskan catatan memakai tiga bagian: dikerjakan, kendala, selanjutnya","src":["c2"]},{"t":"Memperbarui prototipe Katnis","src":["a1"]}],"blocker":[{"t":"Menunggu masukan legal soal chat rekan dan UU PDP","src":["c1"]}],"lanjut":[{"t":"Membuat DMG Katnis dan push ke repo","src":["c2"]}],"lampiran":["a1","w1"]}' };
  },
  save: () => true, copy: () => true, open: () => true, openPath: () => true,
};

/* ---------- mulai ---------- */
(async function init() {
  await load();
  try { U.hasClaude = !!(await native('hasClaude')); } catch (e) { }
  render();
  loadVisible();
  if (DEMO && location.hash) {
    const h = location.hash.slice(1).split(',');
    if (h.includes('terang')) S.settings.theme = 'terang';
    if (h.includes('gelap')) S.settings.theme = 'gelap';
    if (h.includes('s2')) S.settings.span = 2;
    if (h.includes('s7')) S.settings.span = 7;
    render();
    setTimeout(async () => {
      if (h.includes('gen')) await generate(todayY());
      if (h.includes('chip')) { U.chip = `n|${todayY()}|selesai|0`; render(); }
      if (h.includes('add')) { U.addMenu = `n|${todayY()}`; render(); }
      if (h.includes('panel')) act('panel', {});
      if (h.includes('menu')) act('menu', {});
      for (const k of ['suara', 'foto', 'file', 'chat']) if (h.includes('cap-' + k)) openCap(k);
      if (h.includes('typed')) { U.rec = { mode: 'done', sec: 48, text: 'Siang tadi aku review flow pembayaran MyNusa bareng engineer.', level: 0, err: '' }; render(); }
    }, 300);
  }
  setInterval(() => { const t = todayY(); if (U.lastDay && U.lastDay !== t) { U.anchor = t; render(); loadVisible(); } U.lastDay = t; }, 60000);
})();
