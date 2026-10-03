// Cookie parsing, per-flow cookie jar and SSO cookie value handling.
'use strict';

const SSO_COOKIE_NAME = 'iPlanetDirectoryPro';

class SsoCookie {
  constructor({ value, domain = 'zju.edu.cn', path = '/' }) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError('SsoCookie.value 必须是非空字符串');
    }
    this.name = SSO_COOKIE_NAME;
    this.value = value;
    this.domain = domain;
    this.path = path;
  }

  toString() {
    return `${this.name}=${this.value}`;
  }
}

function defaultCookiePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  const index = pathname.lastIndexOf('/');
  if (index <= 0) return '/';
  return pathname.slice(0, index);
}

function parseSetCookie(header, requestUrl) {
  if (typeof header !== 'string' || header.trim() === '') return null;

  const parts = header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const firstEquals = parts[0].indexOf('=');
  if (firstEquals <= 0) return null;

  const name = parts[0].slice(0, firstEquals).trim();
  const value = parts[0].slice(firstEquals + 1).trim();
  if (!name) return null;

  const attributes = {};
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    const eq = part.indexOf('=');
    const key = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase();
    const val = eq === -1 ? '' : part.slice(eq + 1).trim();
    if (key) attributes[key] = val;
  }

  const domainAttribute = attributes.domain;
  const domain = (domainAttribute || requestUrl.hostname)
    .replace(/^\./, '')
    .toLowerCase();

  let path = attributes.path;
  if (!path || !path.startsWith('/')) {
    path = defaultCookiePath(requestUrl.pathname);
  }

  let expires = null;
  if (attributes.expires) {
    const parsed = new Date(attributes.expires);
    if (!Number.isNaN(parsed.getTime())) expires = parsed;
  }

  let maxAge = null;
  if (attributes['max-age'] != null && attributes['max-age'] !== '') {
    const parsed = Number(attributes['max-age']);
    if (Number.isFinite(parsed)) maxAge = parsed;
  }

  return {
    name,
    value,
    domain,
    path,
    secure: Object.prototype.hasOwnProperty.call(attributes, 'secure'),
    expires,
    maxAge,
  };
}

function domainMatches(cookieDomain, hostname) {
  const host = String(hostname).toLowerCase();
  const domain = String(cookieDomain).toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function pathMatches(cookiePath, requestPath) {
  const path = cookiePath || '/';
  if (requestPath === path) return true;
  if (!requestPath.startsWith(path)) return false;
  if (path.endsWith('/')) return true;
  return requestPath.charAt(path.length) === '/';
}

class CookieJar {
  constructor(whitelist = null) {
    this._cookies = new Map();
    this._whitelist = whitelist ? new Set(whitelist) : null;
  }

  setResponseCookies(response, requestUrl) {
    for (const header of response.setCookies || []) {
      this.setCookie(header, requestUrl);
    }
  }

  setCookie(header, requestUrl) {
    const cookie = parseSetCookie(header, requestUrl);
    if (!cookie) return;
    if (this._whitelist && !this._whitelist.has(cookie.name)) return;

    const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
    const expired =
      (cookie.maxAge != null && cookie.maxAge <= 0) ||
      (cookie.expires != null && cookie.expires.getTime() <= Date.now());

    if (expired) {
      this._cookies.delete(key);
      return;
    }

    this._cookies.set(key, cookie);
  }

  getCookieHeader(url) {
    const now = Date.now();
    const matches = [];

    for (const cookie of this._cookies.values()) {
      if (cookie.maxAge != null && cookie.maxAge <= 0) continue;
      if (cookie.expires != null && cookie.expires.getTime() <= now) continue;
      if (cookie.secure && url.protocol !== 'https:') continue;
      if (!domainMatches(cookie.domain, url.hostname)) continue;
      if (!pathMatches(cookie.path, url.pathname)) continue;
      matches.push(cookie);
    }

    matches.sort((a, b) => b.path.length - a.path.length);
    return matches.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  }
}

function extractSsoCookie(setCookies, requestUrl) {
  const now = Date.now();
  const candidates = [];

  for (const header of setCookies || []) {
    const cookie = parseSetCookie(header, requestUrl);
    if (!cookie || cookie.name !== SSO_COOKIE_NAME) continue;
    if (!cookie.value) continue;
    if (cookie.maxAge != null && cookie.maxAge <= 0) continue;
    if (cookie.expires != null && cookie.expires.getTime() <= now) continue;
    candidates.push(cookie);
  }

  if (candidates.length === 0) return null;
  const cookie = candidates[candidates.length - 1];
  return new SsoCookie({
    value: cookie.value,
    domain: cookie.domain || 'zju.edu.cn',
    path: cookie.path || '/',
  });
}

function toSsoCookieValue(cookie) {
  if (typeof cookie === 'string') {
    let value = cookie.trim();
    if (/^iPlanetDirectoryPro=/i.test(value)) {
      value = value.slice('iPlanetDirectoryPro='.length);
    }
    const semicolon = value.indexOf(';');
    if (semicolon >= 0) value = value.slice(0, semicolon);
    value = value.trim();
    if (!value) throw new TypeError('cookie 必须是非空字符串');
    return value;
  }

  if (cookie && typeof cookie === 'object' && typeof cookie.value === 'string') {
    if (cookie.value.length > 0) return cookie.value;
  }

  throw new TypeError('cookie 必须是非空字符串或带有 value 的对象');
}

function cookieNamesFromHeader(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter(Boolean)
    .join(',');
}

function setCookieNames(setCookies) {
  return (setCookies || [])
    .map((header) => String(header).split(';')[0].split('=')[0].trim())
    .filter(Boolean)
    .join(',');
}

module.exports = {
  SsoCookie,
  CookieJar,
  parseSetCookie,
  extractSsoCookie,
  toSsoCookieValue,
  cookieNamesFromHeader,
  setCookieNames,
};