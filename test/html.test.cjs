'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCasErrorMessage } = require('../src/html.cjs');

test('extractCasErrorMessage reads id="msg" content', () => {
  assert.equal(
    extractCasErrorMessage('<div id="msg">用户名或密码错误</div>'),
    '用户名或密码错误',
  );
});

test('extractCasErrorMessage reads id="errormsg" content', () => {
  assert.equal(
    extractCasErrorMessage("<span id='errormsg'>登录失败</span>"),
    '登录失败',
  );
});

test('extractCasErrorMessage reads elements whose class contains "error"', () => {
  assert.equal(
    extractCasErrorMessage('<div class="alert alert-error">认证失败</div>'),
    '认证失败',
  );
});

test('extractCasErrorMessage strips tags, decodes entities, trims, and caps length', () => {
  const longText = '错'.repeat(250);
  const html = `<div id="msg">  <b>用户名</b>&nbsp;或&amp;密码错误 ${longText}</div>`;
  const message = extractCasErrorMessage(html);
  assert.equal(message.startsWith('用户名 或&密码错误'), true);
  assert.equal(message.length, 200);
});

test('extractCasErrorMessage returns null when no error element exists', () => {
  assert.equal(extractCasErrorMessage('<html><body>ok</body></html>'), null);
  assert.equal(extractCasErrorMessage(''), null);
});