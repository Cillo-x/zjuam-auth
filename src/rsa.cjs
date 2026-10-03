// RSA password encryption for the ZJUam login form.
'use strict';

const { ZjuAmError } = require('./errors.cjs');

function hexToBigInt(hex) {
  const cleaned = String(hex).trim().replace(/^0x/i, '');
  if (!cleaned) {
    throw new ZjuAmError('UPSTREAM_ERROR', 'RSA 公钥字段为空');
  }
  try {
    return BigInt(`0x${cleaned}`);
  } catch (error) {
    throw new ZjuAmError('UPSTREAM_ERROR', 'RSA 公钥字段格式错误', {
      cause: error,
    });
  }
}

function modPow(base, exponent, modulus) {
  if (modulus === 1n) return 0n;
  let result = 1n;
  let b = base % modulus;
  let e = exponent;

  while (e > 0n) {
    if ((e & 1n) === 1n) {
      result = (result * b) % modulus;
    }
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}

function encryptPassword(password, modulusHex, exponentHex) {
  const bytes = Buffer.from(String(password), 'utf8');
  // Keep the server-side JS quirk: each byte is hex-encoded without zero padding.
  const passwordHex = Array.from(bytes, (byte) => byte.toString(16)).join('');
  const passwordInt = passwordHex ? BigInt(`0x${passwordHex}`) : 0n;
  const modulus = hexToBigInt(modulusHex);
  const exponent = hexToBigInt(exponentHex);
  const encrypted = modPow(passwordInt, exponent, modulus);
  return encrypted.toString(16).padStart(128, '0');
}

module.exports = { encryptPassword };