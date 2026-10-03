// CAS password login flow: execution token, RSA key and form POST handling.
'use strict';

const util = require('node:util');
const { fail, redactUrl } = require('./errors.cjs');
const { CookieJar, extractSsoCookie } = require('./cookies.cjs');
const { encryptPassword } = require('./rsa.cjs');
const { extractExecution, extractCasErrorMessage } = require('./html.cjs');
const {
  summarizeResponse,
  responseDetails,
  formatLoginTrace,
} = require('./diagnostics.cjs');

const debug = util.debuglog('zjuam');

async function runLoginFlow({ request, baseUrl }, username, password) {
  const jar = new CookieJar();
  const loginUri = new URL('/cas/login', baseUrl);
  const publicKeyUri = new URL('/cas/v2/getPubKey', baseUrl);

  const loginRequestCookies = jar.getCookieHeader(loginUri);
  const loginPage = await request(loginUri, { jar });
  jar.setResponseCookies(loginPage, loginUri);
  debug(formatLoginTrace('GET-login', loginUri, loginPage, loginRequestCookies));
  if (loginPage.statusCode !== 200) {
    fail(
      'UPSTREAM_ERROR',
      `统一身份认证登录页请求失败；HTTP ${loginPage.statusCode}`,
      responseDetails(loginPage),
    );
  }

  const execution = extractExecution(loginPage.body);
  if (!execution) {
    fail(
      'UPSTREAM_ERROR',
      '统一身份认证登录页无法获取 execution',
      summarizeResponse(loginPage),
    );
  }

  const publicKeyRequestCookies = jar.getCookieHeader(publicKeyUri);
  const publicKeyResponse = await request(publicKeyUri, { jar });
  jar.setResponseCookies(publicKeyResponse, publicKeyUri);
  debug(
    formatLoginTrace(
      'GET-pubkey',
      publicKeyUri,
      publicKeyResponse,
      publicKeyRequestCookies,
    ),
  );
  if (publicKeyResponse.statusCode < 200 || publicKeyResponse.statusCode >= 300) {
    fail(
      'UPSTREAM_ERROR',
      `统一身份认证 RSA 公钥请求失败；HTTP ${publicKeyResponse.statusCode}`,
      responseDetails(publicKeyResponse),
    );
  }

  let publicKey;
  try {
    publicKey = JSON.parse(publicKeyResponse.body);
  } catch (error) {
    fail(
      'UPSTREAM_ERROR',
      '统一身份认证 RSA 公钥不是有效 JSON',
      summarizeResponse(publicKeyResponse),
      error,
    );
  }

  const modulus = publicKey && publicKey.modulus;
  const exponent = publicKey && publicKey.exponent;
  if (
    typeof modulus !== 'string' ||
    modulus.length === 0 ||
    typeof exponent !== 'string' ||
    exponent.length === 0
  ) {
    fail(
      'UPSTREAM_ERROR',
      '统一身份认证 RSA 公钥字段缺失',
      summarizeResponse(publicKeyResponse),
    );
  }

  const encryptedPassword = encryptPassword(password, modulus, exponent);
  const form = new URLSearchParams({
    username,
    password: encryptedPassword,
    execution,
    _eventId: 'submit',
    rememberMe: 'true',
  }).toString();

  const postRequestCookies = jar.getCookieHeader(loginUri);
  const loginResponse = await request(loginUri, {
    method: 'POST',
    jar,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: form,
  });
  jar.setResponseCookies(loginResponse, loginUri);
  debug(formatLoginTrace('POST-login', loginUri, loginResponse, postRequestCookies));

  const ssoCookie = extractSsoCookie(loginResponse.setCookies, loginUri);
  if (!ssoCookie) {
    const details = [responseDetails(loginResponse)];
    let serverMessage = extractCasErrorMessage(loginResponse.body);
    if (serverMessage) {
      serverMessage = redactUrl(serverMessage).split(password).join('<redacted>');
      if (encryptedPassword) {
        serverMessage = serverMessage
          .split(encryptedPassword)
          .join('<redacted>');
      }
      details.push(`服务器提示：${serverMessage}`);
    }
    if (loginResponse.statusCode >= 500) {
      fail('UPSTREAM_ERROR', '统一身份认证服务异常', details.join('\n'));
    }
    fail(
      'INVALID_CREDENTIALS',
      '统一身份认证失败，学号或密码错误，或认证会话已失效',
      details.join('\n'),
    );
  }
  return ssoCookie;
}

module.exports = { runLoginFlow };