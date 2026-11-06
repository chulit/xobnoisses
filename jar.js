// jar.js — logika murni brankas cookie per sesi (tanpa API Chrome, bisa diuji unit).
// Dipakai bersama oleh service worker (import) dan tes Node.
//
// Model klasik: Chrome hanya punya SATU cookie jar per profil. Setiap sesi
// menyimpan salinan cookie-nya sendiri di storage ekstensi; saat tab sebuah
// sesi aktif, isi jar browser untuk host itu ditukar dengan milik sesi itu,
// dan isi yang tergeser disimpan kembali ke pemilik sebelumnya.

export const PALETTE = [
  "#e5484d", "#f76b15", "#ffb224", "#46a758",
  "#12a594", "#0091ff", "#8e4ec6", "#e93d82",
];

export function nextColor(usedCount) {
  return PALETTE[usedCount % PALETTE.length];
}

/** Nama bawaan sesi baru untuk sebuah host: host itu sendiri, lalu host + nomor urut. */
export function nextSessionName(sessions, host) {
  const count = sessions.filter((s) => s.host === host).length;
  return count === 0 ? host : `${host} ${count + 1}`;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** "gmail.com" / "mail.google.com/inbox" -> URL lengkap. */
export function normalizeSiteUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

/** Cookie milik host ini: domain cookie == host, atau domain induknya. */
export function cookieMatchesHost(cookie, host) {
  if (!cookie.domain) return false;
  const d = cookie.domain.replace(/^\./, "").toLowerCase();
  const h = String(host ?? "").toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function cookiesForHost(cookies, host) {
  return cookies.filter((c) => cookieMatchesHost(c, host));
}

/**
 * Cookie host-only atau cookie domain? Chrome melaporkan cookie domain
 * dengan domain berawalan titik (".example.com") dan hostOnly=false;
 * cookie host-only tanpa titik dan hostOnly=true. Data simpanan lama
 * (sebelum hostOnly disimpan) disimpulkan dari titiknya.
 */
export function isHostOnlyCookie(c) {
  if (typeof c.hostOnly === "boolean") return c.hostOnly;
  return !(c.domain ?? "").startsWith(".");
}

export function cookieKey(c) {
  const d = (c.domain ?? "").replace(/^\./, "").toLowerCase();
  return `${c.name}${d}${c.path ?? "/"}${isHostOnlyCookie(c) ? "h" : "d"}`;
}

/** Kunci slot aplikasi: nama + domain (tanpa titik) + path, tanpa varian. */
function slotKey(c) {
  const d = (c.domain ?? "").replace(/^\./, "").toLowerCase();
  return `${c.name}${d}${c.path ?? "/"}`;
}

/**
 * Satu slot (nama+domain+path) hanya boleh diisi SATU cookie. Bila ada dua
 * varian sekaligus (host-only dan domain) — keadaan rusak akibat bug lama —
 * yang dipertahankan adalah varian host-only, yaitu yang ditulis server
 * sendiri; varian domain adalah sisa salinan ekstensi yang basi.
 */
export function dedupeCookies(cookies) {
  const bySlot = new Map();
  for (const c of cookies) {
    const key = slotKey(c);
    const kept = bySlot.get(key);
    if (!kept || (isHostOnlyCookie(c) && !isHostOnlyCookie(kept))) {
      bySlot.set(key, c);
    }
  }
  return [...bySlot.values()];
}

/**
 * Hitung pertukaran jar: dari isi jar browser sekarang (current, sudah
 * disaring ke host) menuju isi jar pemilik tujuan (target).
 * Hasil: daftar cookie yang dihapus dan yang ditulis.
 */
export function computeSwap(current, rawTarget) {
  const target = dedupeCookies(rawTarget);
  const targetKeys = new Set(target.map(cookieKey));
  const currentByKey = new Map(current.map((c) => [cookieKey(c), c]));
  const toRemove = current.filter((c) => {
    const t = target.find((x) => cookieKey(x) === cookieKey(c));
    return !t || t.value !== c.value;
  });
  const toSet = target.filter((c) => {
    const cur = currentByKey.get(cookieKey(c));
    return !cur || cur.value !== c.value;
  });
  void targetKeys;
  return { toRemove, toSet };
}

/** URL untuk chrome.cookies.remove/set dari sebuah cookie. */
export function cookieUrl(cookie) {
  const d = (cookie.domain ?? "").replace(/^\./, "");
  return `https://${d}${cookie.path ?? "/"}`;
}

/** Detail untuk chrome.cookies.set dari cookie tersimpan. */
export function toSetDetails(cookie) {
  const details = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path ?? "/",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
  };
  // PENTING: domain hanya diteruskan untuk cookie domain. Meneruskan domain
  // untuk cookie host-only mengubahnya menjadi cookie domain (".host") —
  // cookie asli server (host-only) lalu lahir kembali di sampingnya dan
  // situs menerima dua cookie se nama dengan nilai berbeda.
  if (!isHostOnlyCookie(cookie)) details.domain = cookie.domain;
  if (cookie.expirationDate) details.expirationDate = cookie.expirationDate;
  if (["unspecified", "no_restriction", "lax", "strict"].includes(cookie.sameSite)) {
    details.sameSite = cookie.sameSite;
  }
  return details;
}

/** Salinan bersih cookie untuk disimpan di storage (buang field runtime). */
export function toStoredCookie(cookie) {
  const stored = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path ?? "/",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    hostOnly: isHostOnlyCookie(cookie),
  };
  if (cookie.expirationDate) stored.expirationDate = cookie.expirationDate;
  if (cookie.sameSite) stored.sameSite = cookie.sameSite;
  return stored;
}
