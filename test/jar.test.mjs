import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeSwap,
  cookieKey,
  cookieMatchesHost,
  cookiesForHost,
  dedupeCookies,
  hostOf,
  isHostOnlyCookie,
  nextSessionName,
  normalizeSiteUrl,
  toSetDetails,
  toStoredCookie,
} from "../jar.js";

test("normalizeSiteUrl menambah https", () => {
  assert.equal(normalizeSiteUrl("mail.google.com"), "https://mail.google.com");
  assert.equal(normalizeSiteUrl("https://x.com/a"), "https://x.com/a");
  assert.equal(normalizeSiteUrl("  "), "");
});

test("nextSessionName: nama bawaan sesi baru per host", () => {
  assert.equal(nextSessionName([], "mail.google.com"), "mail.google.com");
  assert.equal(
    nextSessionName([{ host: "mail.google.com" }], "mail.google.com"),
    "mail.google.com 2",
  );
  assert.equal(
    nextSessionName(
      [{ host: "mail.google.com" }, { host: "mail.google.com" }, { host: "x.com" }],
      "mail.google.com",
    ),
    "mail.google.com 3",
  );
});

test("hostOf", () => {
  assert.equal(hostOf("https://mail.google.com/inbox"), "mail.google.com");
  assert.equal(hostOf("chrome://extensions"), "extensions");
});

const jar = [
  { name: "a", value: "1", domain: ".google.com", path: "/" },
  { name: "b", value: "2", domain: "mail.google.com", path: "/" },
  { name: "c", value: "3", domain: ".facebook.com", path: "/" },
];

test("cookiesForHost menyaring per host termasuk domain induk", () => {
  assert.deepEqual(cookiesForHost(jar, "mail.google.com").map((c) => c.name), ["a", "b"]);
  assert.equal(cookieMatchesHost(jar[0], "notgoogle.com"), false);
});

test("computeSwap: jar sama -> tidak ada perubahan", () => {
  const { toRemove, toSet } = computeSwap(jar, jar.map((c) => ({ ...c })));
  assert.deepEqual(toRemove, []);
  assert.deepEqual(toSet, []);
});

test("computeSwap: menuju jar kosong -> semua dihapus", () => {
  const { toRemove, toSet } = computeSwap(jar, []);
  assert.equal(toRemove.length, 3);
  assert.equal(toSet.length, 0);
});

test("computeSwap: nilai berubah -> hapus + tulis", () => {
  const target = [{ name: "a", value: "BARU", domain: ".google.com", path: "/" }];
  const { toRemove, toSet } = computeSwap(jar, target);
  assert.deepEqual(toRemove.map((c) => c.name), ["a", "b", "c"]);
  assert.deepEqual(toSet.map((c) => c.name), ["a"]);
});

test("toSetDetails & toStoredCookie membentuk ulang cookie", () => {
  const c = { name: "s", value: "v", domain: ".google.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: true };
  const stored = toStoredCookie(c);
  assert.equal("session" in stored, false);
  const details = toSetDetails(stored);
  assert.equal(details.url, "https://google.com/");
  assert.equal(details.sameSite, "lax");
  assert.equal(details.expirationDate, undefined);
});

test("hostOnly: cookie host-only tidak boleh ditulis ulang sebagai cookie domain", () => {
  // Kasus e-TPP: server menulis e_tpp_session host-only; ekstensi dulu
  // meneruskan domain ke cookies.set sehingga lahir varian ".host" basi
  // di samping cookie asli dan situs menerima dua cookie senama.
  const hostOnly = { name: "e_tpp_session", value: "v1", domain: "ekinnew.kom", path: "/", httpOnly: true, hostOnly: true };
  const stored = toStoredCookie(hostOnly);
  assert.equal(stored.hostOnly, true);
  const details = toSetDetails(stored);
  assert.equal("domain" in details, false);

  const domainCookie = { name: "s", value: "v", domain: ".google.com", path: "/", hostOnly: false };
  assert.equal(toStoredCookie(domainCookie).hostOnly, false);
  assert.equal(toSetDetails(toStoredCookie(domainCookie)).domain, ".google.com");
});

test("hostOnly: data simpanan lama tanpa flag disimpulkan dari titik domain", () => {
  assert.equal(isHostOnlyCookie({ domain: "ekinnew.kom" }), true);
  assert.equal(isHostOnlyCookie({ domain: ".ekinnew.kom" }), false);
  assert.equal("domain" in toSetDetails({ name: "s", value: "v", domain: "ekinnew.kom", path: "/" }), false);
  assert.equal(toSetDetails({ name: "s", value: "v", domain: ".ekinnew.kom", path: "/" }).domain, ".ekinnew.kom");
});

test("cookieKey membedakan varian host-only dan domain", () => {
  const h = { name: "s", domain: "ekinnew.kom", path: "/", hostOnly: true };
  const d = { name: "s", domain: ".ekinnew.kom", path: "/", hostOnly: false };
  assert.notEqual(cookieKey(h), cookieKey(d));
});

test("dedupeCookies: satu slot satu cookie, varian host-only menang", () => {
  const d = { name: "s", value: "domain", domain: ".ekinnew.kom", path: "/", hostOnly: false };
  const h = { name: "s", value: "host", domain: "ekinnew.kom", path: "/", hostOnly: true };
  const other = { name: "x", value: "1", domain: ".google.com", path: "/" };
  const out = dedupeCookies([d, h, other]);
  assert.equal(out.length, 2);
  assert.equal(out.find((c) => c.name === "s").value, "host");
  assert.equal(dedupeCookies([h, d]).find((c) => c.name === "s").value, "host");
});

test("computeSwap: varian domain basi ikut terhapus saat target hanya punya host-only", () => {
  const current = [
    { name: "s", value: "v1", domain: "ekinnew.kom", path: "/", hostOnly: true },
    { name: "s", value: "basi", domain: ".ekinnew.kom", path: "/", hostOnly: false },
  ];
  const target = [{ name: "s", value: "v1", domain: "ekinnew.kom", path: "/", hostOnly: true }];
  const { toRemove, toSet } = computeSwap(current, target);
  assert.deepEqual(toRemove.map((c) => c.value), ["basi"]);
  assert.deepEqual(toSet, []);
});

test("computeSwap: target warisan yang dobel didedupe sebelum ditulis", () => {
  const target = [
    { name: "s", value: "domain", domain: ".ekinnew.kom", path: "/" },
    { name: "s", value: "host", domain: "ekinnew.kom", path: "/" },
  ];
  const { toSet } = computeSwap([], target);
  assert.equal(toSet.length, 1);
  assert.equal(toSet[0].value, "host");
});
