import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const development = process.env.HALENN_DEV_URL || "http://127.0.0.1:3010";
const production = process.env.HALENN_PRODUCTION_URL;
const artworkHash = "8d0753ae6b55e250a7880408943cbfb80e9a37d041b1274900140d68d9f94c97";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

for (const [value, name] of [["1", "Monument"], ["2", "Editorial"], ["3", "Foundation"], ["invalid", "Monument"], ["4", "Monument"], ["2&v=3", "Monument"]]) {
  test(`server renders ${name} for v=${value} without requiring JavaScript`, async () => {
    const response = await fetch(`${development}/prototypes/hero?v=${value}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`data-variant="${name}"`));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    for (const destination of ["companies", "principles", "about"]) {
      assert.ok(html.includes(`href="/#${destination}"`));
    }
  });
}

test("approved artwork is served byte-for-byte with its original dimensions", async () => {
  const original = await readFile(new URL("../public/prototypes/halenn-original.png", import.meta.url));
  assert.equal(sha256(original), artworkHash);
  assert.equal(original.readUInt32BE(16), 1774);
  assert.equal(original.readUInt32BE(20), 887);
  const response = await fetch(`${development}/prototypes/halenn-original.png`);
  assert.equal(response.status, 200);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), artworkHash);
});

test("production retains the homepage and returns 404 for prototypes", { skip: !production && "Set HALENN_PRODUCTION_URL to a running next start instance" }, async () => {
  assert.equal((await fetch(production)).status, 200);
  for (const path of ["/prototypes/hero", "/prototypes/hero?v=2", "/prototypes/hero?v=3"]) {
    assert.equal((await fetch(`${production}${path}`)).status, 404);
  }
  assert.equal((await fetch(`${production}/api/version`)).status, 200);
});
