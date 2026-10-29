import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString } from 'pdf-lib';
import { createBriefModel, defaultSelection, estimate, buildBrief, emptyNotes, packageIds, visibilityIds } from '../app/components/pricing/catalog.ts';

const work = resolve('tmp/pdfs');
await mkdir(work, { recursive: true });
const source = await readFile('app/components/pricing/brief-pdf.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace('"./catalog"', JSON.stringify(pathToFileURL(resolve('app/components/pricing/catalog.ts')).href));
const modulePath = resolve(work, 'brief-pdf.mjs');
await writeFile(modulePath, compiled);
const { createBriefPdf, wordmarkPath } = await import(pathToFileURL(modulePath));
const assets = {
  regular: new Uint8Array(await readFile('public/brand/pricing-fonts/Geist-Regular.ttf')),
  medium: new Uint8Array(await readFile('public/brand/pricing-fonts/Geist-Medium.ttf')),
  silk: new Uint8Array(await readFile('public/brand/halenn-silk-v1.png')),
};
const cases = {
  website: { selection: defaultSelection, note: emptyNotes },
  webshop: { selection: { ...defaultSelection, webType: 'webshop', extraPages: 20, extras: ['bookings', 'copywriting', 'custom'], care: 'plus', visibility: visibilityIds }, note: {web: 'Please connect our café stock system. Reference: https://example.com/' + 'a'.repeat(430), automation: ''} },
  automation: { selection: { ...defaultSelection, services: ['automation'], customAutomation: true }, note: {web: '', automation: 'Help us connect the booking system to a morning team briefing.'} },
  app: { selection: { ...defaultSelection, services: ['app'], appPlatform: 'both', appCare: 'app' }, note: emptyNotes },
  combined: { selection: { ...defaultSelection, services: ['web','app','automation'], webType: 'webshop', appPlatform: 'both', care:'plus', appCare:'app', automationPackages: packageIds, customAutomation: true, extras:['custom'], visibility:visibilityIds }, note:{web:'Keep our existing customer information.', automation:'Use our approved templates and send exceptions to a person.'} },
};
const output = resolve(process.env.HALENN_PDF_OUTPUT || 'docs/pricing-release-2026-10-29/pdfs');
await mkdir(output, { recursive: true });
for (const [name, { selection, note }] of Object.entries(cases)) {
  test(`${name}: PDF amounts, links, scope and page count`, async () => {
    const model = createBriefModel(selection, note);
    assert.equal(model.oneTime, estimate(selection).oneTime);
    assert.equal(model.monthly, estimate(selection).monthly);
    assert.match(model.exclusions, /VAT/);
    await writeFile(resolve(output, `${name}-expected.json`), JSON.stringify({ model, brief: buildBrief(selection, note) }, null, 2));
    for (const line of model.lines) {
      assert.ok(line.scope.length);
      for (const scope of line.scope) assert.ok(buildBrief(selection, note).includes(scope));
    }
    const bytes = await createBriefPdf(model, assets, new Date('2026-10-29T12:00:00Z'));
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 2 && pdf.getPageCount() <= 12);
    assert.match(pdf.getTitle(), /Halenn/);
    const urls = [];
    for (const page of pdf.getPages()) {
      const annotations = page.node.lookup(PDFName.of('Annots'), PDFArray);
      if (!annotations) continue;
      for (let i = 0; i < annotations.size(); i++) {
        const annot = annotations.lookup(i, PDFDict);
        const action = annot.lookup(PDFName.of('A'), PDFDict);
        urls.push(action.lookup(PDFName.of('URI'), PDFString).decodeText());
      }
    }
    assert.ok(urls.includes('https://halenn.com'));
    assert.ok(urls.some(url => url.startsWith('mailto:contact@halenn.com') && decodeURIComponent(url).includes(buildBrief(selection, note))));
    assert.ok(urls.every(url => !/localhost|127\.0\.0\.1/.test(url)));
    assert.ok(bytes.length < 5_000_000);
    await writeFile(resolve(output, `${name}-brief.pdf`), bytes);
  });
}
test('PDF wordmark uses the exact approved path', async () => {
  assert.ok((await readFile('app/components/halenn/cinematic/Wordmark.tsx', 'utf8')).includes(wordmarkPath));
});
test('missing or corrupt font asset fails instead of producing an incorrect brief', async () => {
  await assert.rejects(createBriefPdf(createBriefModel(defaultSelection), { ...assets, regular: new Uint8Array([1, 2]) }));
});
after(() => rm(modulePath, { force: true }));
