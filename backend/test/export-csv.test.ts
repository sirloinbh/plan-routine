import assert from 'node:assert/strict';
import { test } from 'node:test';

import { csvCell, toCsv } from '../src/export-csv.js';

test('plain values stay as they are and empty values are empty cells', () => {
  assert.equal(csvCell('Wake at 6'), 'Wake at 6');
  assert.equal(csvCell(4), '4');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(new Date('2026-10-22T01:02:03Z')), '2026-10-22T01:02:03.000Z');
});

test('commas, quotes and line breaks are quoted', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line 1\nline 2'), '"line 1\nline 2"');
});

test('text that a spreadsheet would run as a formula gets a leading apostrophe', () => {
  for (const text of ['=SUM(A1:A2)', '+1', '-1', '@cmd', '\t=1', '\r=1'])
    assert.ok(csvCell(text).replace(/^"/, '').startsWith("'"), JSON.stringify(text));
  assert.equal(csvCell('=1+1'), "'=1+1");
  // Not at the start: left alone. A number is a number, not text.
  assert.equal(csvCell('a=1'), 'a=1');
  assert.equal(csvCell(-3), '-3');
});

test('a file starts with a byte order mark so Korean text opens correctly, and uses CRLF', () => {
  const csv = toCsv(
    ['date', 'entry'],
    [
      ['2026-10-22', '오늘은 좋은 하루'],
      ['2026-10-21', '=x'],
    ],
  );
  assert.equal(csv, "﻿date,entry\r\n2026-10-22,오늘은 좋은 하루\r\n2026-10-21,'=x\r\n");
  assert.deepEqual(Buffer.from(csv).subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
});
