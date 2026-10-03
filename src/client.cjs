// Public ZjuAm client: cache, single-flight login and flow entry points.
'use strict';

const { request } = require('./http.cjs');
const { normalizeUrl } = require('./urls.cjs');
const { runLoginFlow } = require('./login.cjs');
const { runServiceFlow } = require('./service.cjs');
const { runOAuth2Flow } = require('./oauth2.cjs');

const ZJUAM_ORIGIN = 'https://zjuam.zju.edu.cn';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36 Edg/110.0.1587.63';
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_COOKIE_TTL_MS = 2 * 60 * 1000;

class ZjuAm {
  #baseUrl;
  #userAgent;
  #timeout;
  #cacheTtlMs;
  #activeCookies;
  #pendingLogins;
  #flowContext;

  constructor(options = {}) {
    if (options == null || typeof options !== 'object') {
      throw new TypeError('options 必须是对象');
    }
    if (
      options.baseUrl !== undefined &&
      typeof options.baseUrl !== 'string' &&
      !(options.baseUrl instanceof URL)
    ) {
      throw new TypeError('baseUrl 必须是字符串或 URL');
    }
    if (
      options.userAgent !== undefined &&
      (typeof options.userAgent !== 'string' || options.userAgent.length === 0)
    ) {
      throw new TypeError('userAgent 必须是非空字符串');
    }
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    ) {
      throw new TypeError('timeoutMs 必须是大于 0 的有限数字');
    }
    if (
      options.cacheTtlMs !== undefined &&
      (!Number.isFinite(options.cacheTtlMs) || options.cacheTtlMs < 0)
    ) {
      throw new TypeError('cacheTtlMs 必须是大于等于 0 的有限数字');
    }

    this.#baseUrl = normalizeUrl(
      options.baseUrl !== undefined ? options.baseUrl : ZJUAM_ORIGIN,
    );
    if (this.#baseUrl.protocol !== 'http:' && this.#baseUrl.protocol !== 'https:') {
      throw new TypeError('baseUrl 只支持 http/https');
    }
    this.#userAgent =
      options.userAgent !== undefined ? options.userAgent : DEFAULT_USER_AGENT;
    this.#timeout =
      options.timeoutMs !== undefined ? options.timeoutMs : DEFAULT_TIMEOUT;
    this.#cacheTtlMs =
      options.cacheTtlMs !== undefined
        ? options.cacheTtlMs
        : DEFAULT_COOKIE_TTL_MS;
    this.#activeCookies = new Map();
    this.#pendingLogins = new Map();
    this.#flowContext = {
      request: (url, requestOptions) => this.#request(url, requestOptions),
      baseUrl: this.#baseUrl,
    };
  }

  async login(username, password, options = {}) {
    if (typeof username !== 'string' || username.length === 0) {
      throw new TypeError('username 必须是非空字符串');
    }
    if (typeof password !== 'string' || password.length === 0) {
      throw new TypeError('password 必须是非空字符串');
    }
    if (options == null || typeof options !== 'object') {
      throw new TypeError('options 必须是对象');
    }

    if (options.forceRefresh !== true) {
      const active = this.#activeCookies.get(username);
      if (active && active.expiresAt > Date.now()) return active.cookie;
      if (active) this.#activeCookies.delete(username);
    }

    const pending = this.#pendingLogins.get(username);
    if (pending) return await pending;

    const promise = this.#doLogin(username, password)
      .then((cookie) => {
        this.#activeCookies.set(username, {
          cookie,
          expiresAt: Date.now() + this.#cacheTtlMs,
        });
        return cookie;
      })
      .finally(() => {
        if (this.#pendingLogins.get(username) === promise) {
          this.#pendingLogins.delete(username);
        }
      });

    this.#pendingLogins.set(username, promise);
    return await promise;
  }

  clearCache(username) {
    if (username === undefined) this.#activeCookies.clear();
    else this.#activeCookies.delete(username);
  }

  async getServiceCallback(cookie, service) {
    return await runServiceFlow(this.#flowContext, cookie, service);
  }

  async getOAuth2Callback(cookie, options = {}) {
    return await runOAuth2Flow(this.#flowContext, cookie, options);
  }

  #doLogin(username, password) {
    return runLoginFlow(this.#flowContext, username, password);
  }

  #request(url, options = {}) {
    const headers = {
      'User-Agent': this.#userAgent,
      ...(options.headers || {}),
    };
    return request(url, { ...options, headers, timeoutMs: this.#timeout });
  }
}

module.exports = { ZjuAm };