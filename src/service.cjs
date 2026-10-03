// CAS service-ticket callback flow: start login and validate the returned ticket.
'use strict';

const { fail, redactUrl } = require('./errors.cjs');
const { toSsoCookieValue } = require('./cookies.cjs');
const { responseDetails } = require('./diagnostics.cjs');
const {
  normalizeUrl,
  isRedirectStatus,
  sameSchemeHostPortAndPath,
  buildServiceLoginUri,
  isSessionExpired,
} = require('./urls.cjs');

async function runServiceFlow({ request, baseUrl }, cookie, service) {
  const cookieValue = toSsoCookieValue(cookie);
  const serviceUrl = normalizeUrl(service);
  if (serviceUrl.protocol !== 'http:' && serviceUrl.protocol !== 'https:') {
    throw new TypeError('service 只支持 http/https');
  }

  const uri = buildServiceLoginUri(serviceUrl, baseUrl);
  const response = await request(uri, {
    method: 'GET',
    cookieHeader: `iPlanetDirectoryPro=${cookieValue}`,
  });
  if (!isRedirectStatus(response.statusCode) || !response.location) {
    if (isSessionExpired(response.statusCode)) {
      fail(
        'SESSION_EXPIRED',
        'CAS service 登录：未获得 CAS ticket',
        responseDetails(response),
      );
    }
    fail(
      'UPSTREAM_ERROR',
      'CAS service 登录：CAS service 请求失败',
      responseDetails(response),
    );
  }

  let callback;
  try {
    callback = new URL(response.location, uri);
  } catch (error) {
    fail(
      'INVALID_CALLBACK',
      'CAS service 回调无效',
      `Location：${redactUrl(response.location)}`,
      error,
    );
  }

  const ticket = callback.searchParams.get('ticket');
  if (
    !sameSchemeHostPortAndPath(callback, serviceUrl) ||
    ticket == null ||
    ticket.length === 0
  ) {
    fail('INVALID_CALLBACK', 'CAS service 回调无效', [
      `期望回调：${redactUrl(serviceUrl)}`,
      `实际回调：${redactUrl(callback)}`,
    ].join('\n'));
  }
  return callback;
}

module.exports = { runServiceFlow };