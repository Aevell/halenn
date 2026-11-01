import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { estimate, parseSelection, serializeSelection, packageIds, visibilityIds, extraIds, createBriefModel, investmentLabel } from '../app/components/pricing/catalog.ts';
import { guidePricingHref } from '../app/components/halenn/solution-guide.ts';
const source = await readFile(new URL('../app/components/pricing/estimate-selection.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace('"./catalog"', JSON.stringify(new URL('../app/components/pricing/catalog.ts', import.meta.url).href));
const { emptySelection, parseBrowsingSelection, applyEstimateAction: apply, removeEstimateLine: remove, actionAvailable } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const add = (...actions) => actions.reduce(apply, emptySelection());

test('fresh visits and campaign links do not preselect a paid product', () => {
  for (const query of [{},{utm_source:'instagram'},{guide:'invalid'}]) {
    const s=parseBrowsingSelection(query);assert.deepEqual(s,emptySelection());assert.equal(estimate(s).lines.length,0);
  }
  assert.deepEqual(parseBrowsingSelection({services:''}),emptySelection());
  assert.deepEqual(parseBrowsingSelection({project:'webshop',care:'plus'}),parseSelection({project:'webshop',care:'plus'}));
});
test('website variants replace the base price and retain selected extras and care once', () => {
  let s=add({kind:'web',id:'website'},{kind:'extra',id:'bookings'},{kind:'pages',count:3},{kind:'care',id:'care'});
  assert.equal(estimate(s).oneTime,2040);assert.equal(estimate(s).monthly,79);
  s=apply(s,{kind:'web',id:'webshop'});
  assert.equal(estimate(s).oneTime,3540);assert.equal(estimate(s).monthly,79);
  assert.deepEqual(estimate(s).lines.map(x=>x.id),['webshop','pages','bookings']);
  s=apply(s,{kind:'care',id:'plus'});assert.equal(estimate(s).monthly,149);
});
test('add-ons never silently add a website or app', () => {
  for (const action of [{kind:'extra',id:'bookings'},{kind:'pages',count:1},{kind:'care',id:'care'},{kind:'visibility',id:'seo'},{kind:'appCare'}]) {
    assert.equal(actionAvailable(emptySelection(),action),false);assert.deepEqual(apply(emptySelection(),action),emptySelection());
  }
});
test('removing a base also removes dependent charges without touching other services', () => {
  let s=add({kind:'web',id:'webshop'},{kind:'extra',id:'custom'},{kind:'visibility',id:'seo'},{kind:'pages',count:5},{kind:'care',id:'plus'},{kind:'app',id:'ios'},{kind:'appCare'},{kind:'automation',id:'reviews'});
  s=remove(s,{id:'webshop',service:'web'});
  assert.equal(estimate(s).oneTime,3780);assert.equal(estimate(s).monthly,99);assert.equal(estimate(s).quoteRequired,false);
  assert.equal(s.extraPages,0);assert.deepEqual(s.extras,[]);assert.deepEqual(s.visibility,[]);
  s=apply(s,{kind:'web',id:'website'});assert.equal(estimate(s).oneTime,5270);assert.equal(s.care,'none');
  s=remove(s,{id:'app-ios',service:'app'});assert.equal(estimate(s).oneTime,1780);assert.equal(estimate(s).monthly,0);
});
test('app platform changes replace the app instead of adding a second app', () => {
  let s=add({kind:'app',id:'android'},{kind:'appCare'});
  s=apply(s,{kind:'app',id:'both'});assert.equal(estimate(s).oneTime,4990);assert.equal(estimate(s).monthly,99);assert.equal(estimate(s).lines.length,1);
  s=apply(s,{kind:'app',id:'both'});assert.deepEqual(s,emptySelection());
});
test('automation works independently and custom-only work never appears free', () => {
  let s=add({kind:'automation',id:'reviews'},{kind:'automation',id:'reminders'},{kind:'customAutomation'});
  assert.equal(estimate(s).oneTime,640);assert.equal(estimate(s).quoteRequired,true);
  s=remove(s,{id:'reviews',service:'automation'});s=remove(s,{id:'reminders',service:'automation'});
  assert.equal(investmentLabel(estimate(s)),'Quote required');
  s=remove(s,{id:'custom-automation',service:'automation'});assert.deepEqual(s,emptySelection());
  s=add({kind:'automation',id:'reviews'});s=apply(s,{kind:'automation',id:'reviews'});assert.deepEqual(s,emptySelection());
});
test('every selectable package round trips with bounded page quantities and no duplicate lines', () => {
  let s=add({kind:'web',id:'website'},{kind:'app',id:'ios'});
  for(const id of extraIds) s=apply(s,{kind:'extra',id});
  for(const id of visibilityIds) s=apply(s,{kind:'visibility',id});
  for(const id of packageIds) s=apply(s,{kind:'automation',id});
  s=apply(s,{kind:'pages',count:20});
  for(const count of [-1,21,1.5,Infinity,NaN]) assert.equal(apply(s,{kind:'pages',count}).extraPages,20);
  assert.deepEqual(parseBrowsingSelection(Object.fromEntries(new URLSearchParams(serializeSelection(s)))),s);
  assert.equal(new Set(estimate(s).lines.map(x=>x.id)).size,estimate(s).lines.length);
  for(const line of [...estimate(s).lines,...estimate(s).monthlyLines]) s=remove(s,line);
  assert.deepEqual(s,emptySelection());
});
test('homepage guide links and subsequent edits keep the same quoted starting amounts', () => {
  const answers={goal:'leads',presence:'new',visitorAction:'bookings'};
  const url=new URL(guidePricingHref(answers),'https://halenn.com');
  let s=parseBrowsingSelection(Object.fromEntries(url.searchParams));
  assert.equal(estimate(s).oneTime,1740);
  s=apply(s,{kind:'automation',id:'reviews'});assert.equal(estimate(s).oneTime,2030);
  const model=createBriefModel(s);assert.equal(model.oneTime,2030);
  assert.equal(parseBrowsingSelection(Object.fromEntries(new URLSearchParams(serializeSelection(s)))).automationPackages[0],'reviews');
});
