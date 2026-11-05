import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeSwap,
  cookieMatchesHost,
  cookiesForHost,
  hostOf,
  normalizeSiteUrl,
  toSetDetails,
  toStoredCookie,
} from "../jar.js";

test("normalizeSiteUrl menambah https", () => {
  assert.equal(normalizeSiteUrl("mail.google.com"), "https://mail.google.com");
  assert.equal(normalizeSiteUrl("https://x.com/a"), "https://x.com/a");
  assert.equal(normalizeSiteUrl("  "), "");
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
