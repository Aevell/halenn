import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defaultSelection, emptyNotes, normalizeSelection, estimate, investmentLabel, toggleService, stagesFor, selectionError, parseSelection, serializeSelection, createBriefModel, buildBrief, enquiryHref, examples, serviceIds, packageIds, visibilityIds, careIds, appPlatformIds, appCareIds, money } from "../app/components/pricing/catalog.ts";
const selected = (values = {}) => ({ ...defaultSelection, ...values });
test("three service families combine without duplicate base charges", () => {
  for(let mask=1;mask<8;mask++) {
    const services=serviceIds.filter((_,i)=>mask&(1<<i));
    const e=estimate(selected({services,automationPackages:["missed-call"]}));
    assert.equal(e.oneTime,(services.includes("web")?1490:0)+(services.includes("app")?2490:0)+(services.includes("automation")?350:0));
    assert.equal(e.monthly,0);assert.equal(new Set(e.lines.map(l=>l.id)).size,e.lines.length);
  }
  const e=estimate(selected({services:["web","app","automation"],webType:"webshop",appPlatform:"both",automationPackages:["missed-call","win-back"],care:"plus",appCare:"app"}));
  assert.equal(e.oneTime,8880);assert.equal(e.monthly,248);assert.deepEqual(e.monthlyLines.map(l=>l.name),["Care Plus","App Care"]);
  assert.equal(e.lines.filter(l=>l.id === "webshop").length,1);assert.ok(!e.lines.some(l=>["cart","checkout","website"].includes(l.id)));
});
test("platform and care prices remain unchanged and app has no custom requirements", () => {
  for(const [appPlatform,price] of [["android",2490],["ios",3490],["both",4990]]) {
    const e=estimate(selected({services:["app"],appPlatform,appCare:"app",extras:["custom"],customAutomation:true}));
    assert.equal(e.oneTime,price);assert.equal(e.monthly,99);assert.equal(e.quoteRequired,false);assert.equal(e.lines.length,1);
    assert.deepEqual(createBriefModel(e.selection,{web:"Do not include",automation:"Do not include"}).customNotes,emptyNotes);
  }
  for(const [care,price] of [["none",0],["care",79],["plus",149]]) assert.equal(estimate(selected({care})).monthly,price);
});
test("each new package has a draft amount and bounded scope", () => {
  const prices={"missed-call":350,"lead-response":450,receptionist:2490,chat:1750,"quote-followup":550,"lead-routing":950,reminders:350,"win-back":550,reviews:290,referrals:490,feedback:290,invoices:350,intake:450,briefing:450};
  for(const [id,price] of Object.entries(prices)) {
    const e=estimate(selected({services:["automation"],automationPackages:[id,id]}));
    assert.equal(e.oneTime,price);assert.equal(e.lines.length,1);assert.ok(e.lines[0].scope.length>=2);
  }
  assert.deepEqual(packageIds,Object.keys(prices));
  const e=estimate(selected({visibility:visibilityIds}));assert.equal(e.oneTime,1490+190+490+350+150);
  assert.ok(!e.lines.some(l=>l.service === "automation"));
});
test("quantities, extras and included languages calculate once", () => {
  for(const extraPages of [0,1,3,20]) {
    const e=estimate(selected({extraPages,extras:["bookings","copywriting","custom"]}));
    assert.equal(e.oneTime,1490+extraPages*100+600);assert.equal(e.quoteRequired,true);
  }
  for(const extraPages of [-1,21,1.5,NaN,Infinity,"3"]) assert.equal(estimate(selected({extraPages})).selection.extraPages,0);
  const model=createBriefModel(selected({webType:"webshop",care:"plus"}));
  assert.ok(model.lines[0].scope.some(s=>s.includes("two additional languages")));
  assert.ok(model.notes.some(s=>s.includes("Product-catalogue")));
  assert.ok(model.monthlyLines[0].scope.some(s=>s.includes("Monthly report")));
  assert.equal(model.oneTime,2990);
});
test("service toggles remember inactive answers but exclude them from totals and URLs", () => {
  const full=selected({services:["web","app","automation"],extras:["bookings","custom"],extraPages:3,visibility:["seo"],appPlatform:"both",care:"plus",appCare:"app",automationPackages:["win-back"],customAutomation:true});
  const removed=toggleService(full,"web");assert.equal(removed.removed,"Web");assert.equal(removed.selection.extraPages,3);
  const normal=normalizeSelection(removed.selection);assert.deepEqual(normal.extras,[]);assert.equal(normal.extraPages,0);assert.equal(normal.care,"none");
  assert.equal(estimate(normal).oneTime,5540);assert.equal(estimate(normal).monthly,99);
  assert.ok(!serializeSelection(removed.selection).includes("pages="));
  assert.deepEqual(toggleService(removed.selection,"web").selection,full);
});
test("quiz paths and required selections are predictable for every service combination", () => {
  for(let mask=0;mask<8;mask++) {
    const services=serviceIds.filter((_,i)=>mask&(1<<i));const config=selected({services});const stages=stagesFor(config);
    assert.equal(stages.includes("extras"),services.includes("web"));assert.equal(stages.includes("webType"),services.includes("web"));
    assert.equal(stages.includes("platform"),services.includes("app"));assert.equal(stages.includes("automation"),services.includes("automation"));
    assert.equal(stages.includes("care"),services.includes("web")||services.includes("app"));
    assert.equal(Boolean(selectionError(config,"project")),services.length===0);
  }
  assert.ok(selectionError(selected({services:["automation"]}),"automation"));
  assert.equal(selectionError(selected({services:["automation"],customAutomation:true}),"automation"),"");
  assert.equal(selectionError(selected({services:["automation"],automationPackages:["reviews"]}),"automation"),"");
});
test("old shared links migrate to the equivalent services, packages and prices", () => {
  assert.equal(parseSelection({extras:"pages,language,custom"}).extraPages,3);
  assert.equal(estimate(parseSelection({extras:"language"})).oneTime,1490);
  assert.equal(parseSelection({extras:"pages",pages:"7"}).extraPages,7);
  assert.equal(parseSelection({extras:"pages",pages:"bad"}).extraPages,0);
  for(const [automation,id,price] of [["simple","lead-response",450],["advanced","lead-routing",950],["assistant","chat",1750]]) {
    const e=estimate(parseSelection({project:"webshop",automation,care:"plus"}));
    assert.deepEqual(e.selection.services,["web","automation"]);assert.deepEqual(e.selection.automationPackages,[id]);assert.equal(e.oneTime,2990+price);assert.equal(e.monthly,149);
  }
  assert.equal(estimate(parseSelection({project:"automation",automation:"advanced",extras:"custom"})).oneTime,950);
  const app=parseSelection({project:"app",platform:"ios",appCare:"app",extras:"custom,bookings",automation:"assistant"});
  assert.deepEqual(app.services,["app"]);assert.equal(estimate(app).oneTime,3490);assert.equal(estimate(app).quoteRequired,false);
});
test("URL validation ignores unknown IDs, repeated parameters and notes", () => {
  const malformed=parseSelection({services:"web,app,constructor,web",web:"bad",visibility:"seo,constructor,seo",packages:"receptionist",pages:"21",platform:"bad",appCare:"bad",notes:"private"});
  assert.deepEqual(malformed.services,["web","app"]);assert.deepEqual(malformed.visibility,["seo"]);assert.deepEqual(malformed.automationPackages,[]);assert.equal(malformed.extraPages,0);
  assert.deepEqual(parseSelection({services:["web","app"]}).services,[]);
  assert.deepEqual(parseSelection({services:"automation",packages:["chat","reviews"]}).automationPackages,[]);
  for(const pages of ["-1","21","1.5","1e1","Infinity","10000000000000000000"]) assert.equal(parseSelection({pages}).extraPages,0);
});
test("all service, care and platform combinations round trip without hidden charges", () => {
  for(let mask=0;mask<8;mask++) for(const care of careIds) for(const appPlatform of appPlatformIds) for(const appCare of appCareIds) for(const extraPages of [0,3,20]) for(const packages of [[],["missed-call"],["win-back","reviews"],packageIds]) {
    const raw=selected({services:serviceIds.filter((_,i)=>mask&(1<<i)),care,appPlatform,appCare,extraPages,extras:["bookings","custom"],visibility:visibilityIds,automationPackages:packages,customAutomation:true});
    const n=normalizeSelection(raw),url=serializeSelection(raw),e=estimate(raw);
    assert.deepEqual(parseSelection(Object.fromEntries(new URLSearchParams(url))),n);
    assert.equal(new Set(e.lines.map(l=>l.id)).size,e.lines.length);
    assert.ok([...new URLSearchParams(url).keys()].every(k=>["services","web","care","extras","pages","visibility","packages","customAutomation","platform","appCare"].includes(k)));
  }
});
test("custom-only automation is quoted, never presented as a free project", () => {
  const config=selected({services:["automation"],customAutomation:true});const model=createBriefModel(config);
  assert.equal(investmentLabel(model),"Quote required");assert.ok(!buildBrief(config).includes("€0"));assert.equal(model.quoteRequired,true);
});
test("notes are independent, bounded, conditional, private and consistent in email", () => {
  const config=selected({services:["web","app","automation"],extras:["custom"],customAutomation:true,appPlatform:"both",appCare:"app",care:"plus"});
  const notes={web:"WEB PRIVATE ".repeat(50),automation:"AI PRIVATE ".repeat(60)};const model=createBriefModel(config,notes),brief=buildBrief(config,notes);
  assert.equal(model.customNotes.web,notes.web.slice(0,500).trim());assert.equal(model.customNotes.automation,notes.automation.slice(0,500).trim());
  assert.ok(brief.includes(model.customNotes.web));assert.ok(brief.includes(model.customNotes.automation));
  assert.ok(!serializeSelection({...config,notes}).includes("PRIVATE"));
  assert.deepEqual(createBriefModel({...config,extras:[],customAutomation:false},notes).customNotes,emptyNotes);
  const mail=enquiryHref(config,"Test & Co","test@example.com","A question + detail?",notes);
  assert.ok(new URLSearchParams(mail.split("?")[1]).get("body").includes(brief));
  assert.equal(brief.includes("\u2014"),false);assert.equal(money(1490),"€1,490");
});
test("concrete examples have exact matching totals", () => {
  assert.deepEqual(examples.map(e=>{const r=estimate(e.selection);return [r.oneTime,r.monthly]}),[[1740,79],[2990,149],[900,0],[2490,99]]);
});
test("homepage composition and approved ribbon remain unchanged", async () => {
  const { createHash } = await import("node:crypto");
  for (const [file, hash] of [
    [
      "app/page.tsx",
      "8b6fede941f67ed827e8f3b9956a17c1b203a610091eee184bbf7a74c649486f",
    ],
    [
      "app/layout.tsx",
      "97277995e2d822b450c435df1a8b5204da89bb30311514490888617f874285db",
    ],
    [
      "public/brand/halenn-ribbon-2x.webp",
      "1368d9073d88415f31a51a409c25d8f8b837cbe522127b0de17a5308cd94b0b8",
    ],
  ])
    assert.equal(
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
      hash,
      file,
    );
});
const dev = process.env.HALENN_DEV_URL;
test(
  "development response contains full server-rendered guide and noindex",
  { skip: !dev },
  async () => {
    const response = await fetch(
      `${dev}/prototypes/pricing?project=webshop&extras=custom&automation=advanced&care=plus`,
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /noindex, nofollow/);
    for (const text of [
      "Simple pricing. Clear scope.",
      "Basic technical SEO",
      "Never miss a customer",
      "Keep customers coming back",
      "Save time",
      "AI phone receptionist",
      "€3,940",
      "Quoted separately",
      "Hosting, domains",
      "contact@halenn.com",
      "<noscript>",
    ])
      assert.ok(html.includes(text), text);
    const hero = await (await fetch(`${dev}/prototypes/hero?v=1`)).text();
    assert.ok(hero.includes('href="/prototypes/pricing"'));
  },
);
const prod = process.env.HALENN_PRODUCTION_URL;
test(
  "production publishes pricing and keeps prototype unavailable",
  { skip: !prod },
  async () => {
    for (const path of [
      "/prototypes/pricing",
      "/prototypes/pricing?project=webshop",
    ])
      assert.equal((await fetch(prod + path)).status, 404, path);
    const homepage = await (await fetch(prod)).text();
    assert.ok(!homepage.includes("/prototypes/pricing"));
    assert.ok(!homepage.includes("Prototype pricing."));
    assert.ok(homepage.includes('href="/pricing"'));
    const response = await fetch(`${prod}/pricing?services=web,app&web=webshop&platform=both&care=plus&appCare=app`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('href="https://halenn.com/pricing"'));
    assert.ok(html.includes('name="robots" content="index, follow"'));
    assert.ok(html.includes("€7,980"));
    assert.ok(html.includes("€248"));
    assert.ok(html.includes("Simple pricing. Clear scope."));
    assert.ok(!html.includes("Prototype pricing"));
    assert.ok(!html.includes('href="/prototypes/'));
    assert.ok(!html.includes("\u2014"));
    assert.ok((await (await fetch(prod + "/sitemap.xml")).text()).includes("https://halenn.com/pricing"));
  },
);
