'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('CJS public surface exports exactly ZjuAm and ZjuAmError', () => {
  const entry = require('zjuam-auth');
  assert.deepEqual(Object.keys(entry), ['ZjuAm', 'ZjuAmError']);
});

test('ESM public surface exports the same named functions and no default', async () => {
  const entry = await import('zjuam-auth');
  assert.deepEqual(Object.keys(entry).sort(), ['ZjuAm', 'ZjuAmError']);
  assert.equal('default' in entry, false);
});

test('ZjuAm instances expose no enumerable runtime properties', () => {
  const { ZjuAm } = require('zjuam-auth');
  assert.deepEqual(Object.keys(new ZjuAm()), []);
});