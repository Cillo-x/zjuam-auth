// CAS URL construction, redirect classification and host/path comparison rules.
'use strict';

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function normalizeUrl(value) {
  try {
    if (value instanceof URL) return new URL(value.toString());
    return new URL(String(value));
  } catch {
    throw new TypeError('URL 参数无效');
  }
}

function isRedirectStatus(statusCode) {
  return REDIRECT_STATUS.has(statusCode);
}

function normalizePort(url) {
  return url.port || '';
}

function sameSchemeHostPortAndPath(a, b) {
  return (
    a.protocol === b.protocol &&
    a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
    normalizePort(a) === normalizePort(b) &&
    a.pathname === b.pathname
  );
}

function buildServiceLoginUri(service, baseUrl) {
  const uri = new URL('/cas/login', baseUrl);
  uri.searchParams.set('service', service.toString());
  return uri;
}

function buildOAuth2AuthorizeUri({ clientId, redirectUri, state }, baseUrl) {
  const uri = new URL('/cas/oauth2.0/authorize', baseUrl);
  uri.searchParams.set('response_type', 'code');
  uri.searchParams.set('client_id', clientId);
  uri.searchParams.set('redirect_uri', redirectUri.toString());
  if (state != null) uri.searchParams.set('state', state);
  return uri;
}

function isAllowedOAuth2RedirectHost(hostname, baseHostname) {
  const host = String(hostname).toLowerCase();
  const base = String(baseHostname).toLowerCase();
  if (host === base) return true;
  if (base === 'zju.edu.cn' || base.endsWith('.zju.edu.cn')) {
    return host === 'zju.edu.cn' || host.endsWith('.zju.edu.cn');
  }
  return false;
}

function isSessionExpired(statusCode) {
  return statusCode === 200 || statusCode === 401 || statusCode === 403;
}

module.exports = {
  normalizeUrl,
  isRedirectStatus,
  sameSchemeHostPortAndPath,
  buildServiceLoginUri,
  buildOAuth2AuthorizeUri,
  isAllowedOAuth2RedirectHost,
  isSessionExpired,
};