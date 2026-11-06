import assert from 'node:assert/strict';
import test from 'node:test';
import { clean, columns, due, empty, preview } from '../app/admin/lib/leads.ts';

test('preview separates existing and in-batch duplicates from genuinely new companies', () => {
  const existing=[clean({...empty,company:'Known',website:'https://known.example'})];
  const rows=preview([columns.join('\t'),'Renamed\thttps://www.known.example/about','Studio\tstudio.example','Studio','Company','\tinvalid.example'].join('\n'),existing);
  assert.deepEqual(rows.slice(0,4).map(r=>r.label),['Duplicate','Ready','Duplicate','Ready']);
  assert.notEqual(rows[4].label,'Ready');
});

test('unsafe links and impossible follow-up dates are rejected', () => {
  for(const extra of [{source:'javascript:alert(1)'},{follow_up:'2026-02-30'}]) {
    assert.throws(()=>clean({...empty,company:'Test',...extra}));
  }
});

test('due filter includes today and overdue work only for open leads', () => {
  const now='2026-11-06';
  for (const [status,date,expected] of [['New',now,true],['Contacted','2026-11-01',true],['Contacted','2026-11-07',false],['Won',now,false],['Closed',now,false]]) {
    assert.equal(due({...empty,status,follow_up:date},now),expected);
  }
});
