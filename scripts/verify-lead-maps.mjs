import assert from "node:assert/strict";
import test from "node:test";
import { mapEmbed } from "../app/admin/lib/maps.ts";
import { clean, empty } from "../app/admin/lib/leads.ts";

const url = "https://www.google.com/maps/embed?pb=!1m18!2m3!1d123";
test("accepts Google-provided embed URLs and extracts only iframe source", () => {
  assert.equal(mapEmbed(url), url);
  assert.equal(mapEmbed(`<iframe src="${url}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`), url);
  assert.equal(mapEmbed(""), "");
  assert.equal(mapEmbed(undefined), "");
});
test("rejects share links, hostile hosts, credentials, ports and arbitrary HTML", () => {
  for (const input of [
    "https://maps.app.goo.gl/example", "https://www.google.com/maps?cid=123",
    "https://www.google.com.evil.example/maps/embed?pb=1", "javascript:alert(1)",
    "https://evil.example/maps/embed?pb=1", "https://user:password@www.google.com/maps/embed?pb=1",
    "https://www.google.com:8443/maps/embed?pb=1",
    "https://www.google.com/maps/embed?pb=1&extra=2", "https://www.google.com/maps/embed?pb=1#fragment",
    `<script>alert(1)</script><iframe src="${url}"></iframe>`,
    `<iframe src="javascript:alert(1)"></iframe>`,
  ]) assert.throws(() => mapEmbed(input), input);
});
test("lead saves normalize embeds, support removal and preserve old clients", () => {
  assert.equal(clean({ ...empty, company: "Studio", maps_embed: `<iframe src="${url}"></iframe>` }).maps_embed, url);
  assert.equal(clean({ ...empty, company: "Studio", maps_embed: "" }).maps_embed, "");
  assert.equal(Object.hasOwn(clean({ ...empty, company: "Studio" }), "maps_embed"), false);
  assert.throws(() => clean({ ...empty, company: "Studio", maps_embed: "https://evil.example" }));
});
