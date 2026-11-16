import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { withoutEmDashes } from '../app/admin/lib/copy.ts';
test('copied text normalizes em dashes from lead details and manual edits', () => {
  assert.equal(withoutEmDashes('Studio\u2014North\n\nHello \u2014 an idea'), 'Studio, North\n\nHello, an idea');
});
test('authored application copy contains no literal or HTML em dashes', () => {
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(tsx|ts|css|html|json)$/.test(file)) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\u2014|&mdash;|&#8212;|&#x2014;/i, file);
      }
    }
  }
  scan('app');
});
