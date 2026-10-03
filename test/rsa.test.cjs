'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptPassword } = require('../src/rsa.cjs');

const MODULUS = 'f'.repeat(128);
const EXPONENT = '10001';

test('encryptPassword golden vectors (including un-padded per-byte hex quirk)', () => {
  const vectors = [
    ['password123', '869c3d4b8c6d12ea689a6b8939809badcef427b08bb288e5d23eca7d9d26c0f579f2d615327668acec748d1e8a4dc77ff29a01e8c6bbc2aaac20d4d6d04642d7'],
    ['密码测试', '0badb417c381be5db2393c4cf36af7f95e66cc298f9f24e51ef42838aaebb66e25d8a8e9a48c2b53fca8a2a4248db2cb097b8135aede078ea2efd4589e7c1ff8'],
    ['!@#$%^&*()_+-=[]{}', '0f90a5082bd592daf88adcc43dbe918a398ef2309e29cbf863ee9f6e69757b235fb02108ad7dbf4bb7c07890a7bac10a473735a2b1fcdcc7e9f4a6319d38c60a'],
  ];

  for (const [password, expected] of vectors) {
    assert.equal(encryptPassword(password, MODULUS, EXPONENT), expected);
  }
});