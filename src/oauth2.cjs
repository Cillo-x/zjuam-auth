// OAuth2 authorize-code flow: manual redirects, cookie whitelist and callback validation.
'use strict';

const util = require('node:util');
const { fail, redactUrl } = require('./errors.cjs');
const { CookieJar, toSsoCookieValue } = require('./cookies.cjs');
const { extractHtmlRedirect } = require('./html.cjs');
const { responseDetails, formatOAuthTrace } = require('./diagnostics.cjs');
const {
  normalizeUrl,
  isRedirectStatus,
  sameSchemeHostPortAndPath,
  buildOAuth2AuthorizeUri,
  isAllowedOAuth2RedirectHost,
  isSessionExpired,
} = require('./urls.cjs');

const debug = util.debuglog('zjuam');
const OAUTH2_COOKIE_WHITELIST = ['iPlanetDirectoryPro', 'JSESSIONID'];
const MAX_REDIRECTS = 10;

async function runOAuth2Flow({ request, baseUrl }, cookie, options = {}) {
  if (options == null || typeof options !== 'object') {
    throw new TypeError('options 必须是对象');
  }
  const { clientId, redirectUri, state } = options;
  if (typeof clientId !== 'string' || clientId.length === 0) {
    throw new TypeError('clientId 必须是非空字符串');
  }
  if (redirectUri == null || String(redirectUri).length === 0) {
    throw new TypeError('redirectUri 必须是非空字符串或 URL');
  }
  if (state !== undefined && typeof state !== 'string') {
    throw new TypeError('state 必须是字符串');
  }

  const cookieValue = toSsoCookieValue(cookie);
  const redirect = normalizeUrl(redirectUri);
  if (redirect.protocol !== 'http:' && redirect.protocol !== 'https:') {
    throw new TypeError('redirectUri 只支持 http/https');
  }

  const jar = new CookieJar(OAUTH2_COOKIE_WHITELIST);
  const baseHostname = baseUrl.hostname.toLowerCase();
  const ssoDomain =
    baseHostname === 'zju.edu.cn' || baseHostname.endsWith('.zju.edu.cn')
      ? 'zju.edu.cn'
      : baseHostname;
  const secureAttribute = baseUrl.protocol === 'https:' ? '; Secure' : '';
  jar.setCookie(
    `iPlanetDirectoryPro=${cookieValue}; Domain=${ssoDomain}; Path=/${secureAttribute}`,
    baseUrl,
  );

  let current = buildOAuth2AuthorizeUri(
    { clientId, redirectUri: redirect, state },
    baseUrl,
  );
  const redirectTrace = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const requestCookieHeader = jar.getCookieHeader(current);
    const response = await request(current, { method: 'GET', jar });
    jar.setResponseCookies(response, current);

    let next = null;
    if (response.location) {
      try {
        next = new URL(response.location, current);
      } catch (error) {
        fail(
          'INVALID_CALLBACK',
          'CAS OAuth2 回调无效',
          [`Location：${redactUrl(response.location)}`, ...redirectTrace].join('\n'),
          error,
        );
      }
    }
    if (response.statusCode === 200) {
      const htmlNext = extractHtmlRedirect(response.body, current);
      if (htmlNext) next = htmlNext;
    } else if (!isRedirectStatus(response.statusCode)) {
      next = null;
    }

    const traceLine = formatOAuthTrace(
      hop,
      current,
      response,
      requestCookieHeader,
      next,
    );
    redirectTrace.push(traceLine);
    debug(traceLine);

    if (next == null) {
      const details = [responseDetails(response), ...redirectTrace].join('\n');
      if (isSessionExpired(response.statusCode)) {
        fail('SESSION_EXPIRED', 'CAS OAuth2 登录：未获得 OAuth2 code', details);
      }
      fail('UPSTREAM_ERROR', 'CAS OAuth2 登录：OAuth2 authorize 请求失败', details);
    }

    if (sameSchemeHostPortAndPath(next, redirect)) {
      const code = next.searchParams.get('code');
      if (code == null || code.length === 0) {
        fail('INVALID_CALLBACK', 'CAS OAuth2 回调无效', [
          `期望 redirect_uri：${redactUrl(redirect)}`,
          `实际回调：${redactUrl(next)}`,
          '回调缺少 code 参数',
          ...redirectTrace,
        ].join('\n'));
      }
      const actualState = next.searchParams.get('state');
      if (state !== undefined && actualState !== state) {
        fail('STATE_MISMATCH', 'CAS OAuth2 state 校验失败', [
          `期望 redirect_uri：${redactUrl(redirect)}`,
          `实际回调：${redactUrl(next)}`,
          `期望 state：${state}`,
          `实际 state：${actualState ?? '<缺失>'}`,
          ...redirectTrace,
        ].join('\n'));
      }
      return next;
    }

    if (next.protocol !== 'http:' && next.protocol !== 'https:') {
      fail('INVALID_CALLBACK', 'CAS OAuth2 回调协议不支持', [
        `实际地址：${redactUrl(next)}`,
        ...redirectTrace,
      ].join('\n'));
    }
    if (!isAllowedOAuth2RedirectHost(next.hostname, baseUrl.hostname)) {
      fail('UNEXPECTED_REDIRECT', 'CAS OAuth2 重定向到未知主机', [
        `允许 host：${baseUrl.hostname} 或 *.zju.edu.cn`,
        `实际地址：${redactUrl(next)}`,
        ...redirectTrace,
      ].join('\n'));
    }
    current = next;
  }

  fail('TOO_MANY_REDIRECTS', 'CAS OAuth2 重定向次数过多', redirectTrace.join('\n'));
}

module.exports = { runOAuth2Flow };