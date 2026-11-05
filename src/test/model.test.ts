import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cookieMatchesHost,
  cookieToSetDetails,
  cookiesForHost,
  hostOf,
  normalizeInputUrl,
  partitionFor,
  type CookieLike,
} from "../shared/model.js";

test("normalizeInputUrl: host polos diberi https", () => {
  assert.equal(normalizeInputUrl("mail.google.com"), "https://mail.google.com");
  assert.equal(normalizeInputUrl("gmail.com/inbox"), "https://gmail.com/inbox");
});

test("normalizeInputUrl: URL lengkap dibiarkan", () => {
  assert.equal(normalizeInputUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(normalizeInputUrl("http://localhost:3000/x"), "http://localhost:3000/x");
});

test("normalizeInputUrl: teks bebas menjadi pencarian Google", () => {
  assert.equal(
    normalizeInputUrl("kucing lucu"),
    "https://www.google.com/search?q=kucing%20lucu",
  );
});

test("hostOf mengambil hostname", () => {
  assert.equal(hostOf("https://mail.google.com/inbox"), "mail.google.com");
  assert.equal(hostOf("bukan url"), "");
});

test("partitionFor: utama vs sesi", () => {
  assert.equal(partitionFor(null), "persist:xob-main");
  assert.equal(partitionFor("abc"), "persist:xob-abc");
});

const cookies: CookieLike[] = [
  { name: "a", value: "1", domain: ".google.com", path: "/" },
  { name: "b", value: "2", domain: "mail.google.com", path: "/" },
  { name: "c", value: "3", domain: ".facebook.com", path: "/" },
  { name: "d", value: "4", domain: "google.com", path: "/accounts" },
];

test("cookieMatchesHost: domain induk cocok untuk subdomain", () => {
  assert.equal(cookieMatchesHost(cookies[0], "mail.google.com"), true);
  assert.equal(cookieMatchesHost(cookies[0], "google.com"), true);
  assert.equal(cookieMatchesHost(cookies[0], "notgoogle.com"), false);
  assert.equal(cookieMatchesHost(cookies[1], "google.com"), false);
});

test("cookiesForHost menyaring milik host saja", () => {
  const got = cookiesForHost(cookies, "mail.google.com").map((c) => c.name);
  assert.deepEqual(got, ["a", "b", "d"]);
});

test("cookieToSetDetails: cookie sesi diberi umur 30 hari", () => {
  const now = 1_700_000_000;
  const d = cookieToSetDetails({ name: "s", value: "v", domain: ".google.com", path: "/" }, now);
  assert.equal(d.expirationDate, now + 30 * 24 * 60 * 60);
  assert.equal(d.url, "https://google.com/");
});

test("cookieToSetDetails: expirationDate asli dipertahankan", () => {
  const d = cookieToSetDetails(
    { name: "s", value: "v", domain: "x.com", path: "/", expirationDate: 123 },
    999,
  );
  assert.equal(d.expirationDate, 123);
});
