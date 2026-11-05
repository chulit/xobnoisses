// Model bersama: tipe data + fungsi murni (tanpa Electron, bisa diuji unit).

export interface SiteSession {
  id: string;
  name: string;
  color: string;
  homeUrl: string;
  host: string;
  createdAt: number;
}

export interface TabInfo {
  id: number;
  sessionId: string | null; // null = sesi utama
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface AppState {
  tabs: TabInfo[];
  activeTabId: number;
  sessions: SiteSession[];
}

export const MAIN_PARTITION = "persist:xob-main";

export function partitionFor(sessionId: string | null): string {
  return sessionId === null ? MAIN_PARTITION : `persist:xob-${sessionId}`;
}

export const PALETTE = [
  "#e5484d", // merah
  "#f76b15", // oranye
  "#ffb224", // kuning
  "#46a758", // hijau
  "#12a594", // teal
  "#0091ff", // biru
  "#8e4ec6", // ungu
  "#e93d82", // pink
];

export function nextColor(usedCount: number): string {
  return PALETTE[usedCount % PALETTE.length];
}

/** "gmail.com" / "mail.google.com/inbox" -> URL lengkap; teks bebas -> pencarian Google. */
export function normalizeInputUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("about:") || raw.startsWith("file:")) {
    return raw;
  }
  const looksLikeHost = !/\s/.test(raw) && (raw.includes(".") || raw.startsWith("localhost"));
  if (looksLikeHost) return `https://${raw}`;
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// --- Salin cookie antar-partisi -------------------------------------------

/** Bentuk minimal cookie, kompatibel dengan Electron.Cookie. */
export interface CookieLike {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: string;
}

/** Cookie milik host ini: domain cookie == host, atau domain induknya. */
export function cookieMatchesHost(cookie: CookieLike, host: string): boolean {
  if (!cookie.domain) return false;
  const d = cookie.domain.replace(/^\./, "").toLowerCase();
  const h = host.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function cookiesForHost(cookies: CookieLike[], host: string): CookieLike[] {
  return cookies.filter((c) => cookieMatchesHost(c, host));
}

export interface CookieSetDetails {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
}

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

/**
 * Bangun detail untuk cookies.set di partisi tujuan.
 * Cookie sesi (tanpa expirationDate) diberi umur 30 hari agar ikut persisten
 * di partisi baru — persis perilaku "simpan sesi" klasik.
 */
export function cookieToSetDetails(cookie: CookieLike, nowSeconds: number): CookieSetDetails {
  const d = (cookie.domain ?? "").replace(/^\./, "");
  const url = `https://${d}${cookie.path ?? "/"}`;
  const sameSite = ["unspecified", "no_restriction", "lax", "strict"].includes(cookie.sameSite ?? "")
    ? (cookie.sameSite as CookieSetDetails["sameSite"])
    : undefined;
  return {
    url,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate ?? nowSeconds + THIRTY_DAYS_S,
    sameSite,
  };
}
