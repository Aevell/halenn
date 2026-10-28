import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const development = process.env.HALENN_DEV_URL || "http://127.0.0.1:3010";
const production = process.env.HALENN_PRODUCTION_URL;
const artworkHash = "8d0753ae6b55e250a7880408943cbfb80e9a37d041b1274900140d68d9f94c97";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

for (const [value, name] of [["1", "Cinematic"], ["2", "Editorial"], ["3", "Foundation"], ["invalid", "Cinematic"], ["4", "Cinematic"], ["2&v=3", "Cinematic"]]) {
  test(`server renders ${name} for v=${value} without requiring JavaScript`, async () => {
    const response = await fetch(`${development}/prototypes/hero?v=${value}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`data-variant="${name}"`));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.ok(html.includes("https://aevell.com"));
    assert.ok(html.includes("Aevell"));
    assert.ok(html.includes("n8n"));
    assert.ok(!html.includes("A Halenn company"));
    if (name === "Cinematic") {
      for (const destination of ["services", "scope"]) assert.ok(html.includes(`href="#${destination}"`));
      for (const service of ["Webshop", "Cart &amp; checkout", "Website care", "Bookings &amp; forms"]) assert.ok(html.includes(service));
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

test("public release renders the approved site and real contact without the picker", { skip: !production }, async () => {
  const html = await (await fetch(production)).text();
  assert.match(html, /data-variant="Cinematic"/);
  assert.match(html, /mailto:contact@halenn\.com/);
  assert.match(html, /Opens your email app/);
  assert.match(html, /\/brand\/halenn-ribbon-2x\.webp/);
  assert.match(html, /<title>Halenn \| Websites &amp; Connected Systems<\/title>/);
  assert.match(html, /\/brand\/halenn-ribbon-favicon\.ico/);
  assert.match(html, /data-silk-scene/);
  assert.match(html, /rel="canonical" href="https:\/\/halenn\.com"/);
  assert.doesNotMatch(html, /hello@halenn\.example|noindex|Halenn is a parent company|Preview enquiry|Switch prototype|\u2014/);
  assert.match(await (await fetch(`${production}/robots.txt`)).text(), /Allow: \/\n/);
  assert.match(await (await fetch(`${production}/sitemap.xml`)).text(), /https:\/\/halenn.com/);
});

test("production serves the unchanged ribbon, upscale, silk and favicon", { skip: !production }, async () => {
  for (const name of ["halenn-ribbon-v1.png", "halenn-ribbon-2x.webp", "halenn-silk-v1.png", "halenn-ribbon-favicon.ico", "halenn-ribbon-icon-32.png", "halenn-ribbon-icon-64.png", "halenn-ribbon-icon-180.png"]) {
    const original = await readFile(new URL(`../public/prototypes/${name}`, import.meta.url));
    const response = await fetch(`${production}/brand/${name}`);
    assert.equal(response.status, 200, name);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), sha256(original), name);
  }
  assert.equal((await fetch(`${production}/favicon.ico`)).status, 200);
});
