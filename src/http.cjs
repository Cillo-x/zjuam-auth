// Low-level HTTP/HTTPS transport with timeout and socket-error mapping.
'use strict';

const http = require('node:http');
const https = require('node:https');
const { ZjuAmError, redactUrl } = require('./errors.cjs');

function headerValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  return value;
}

function normalizeSetCookies(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function request(url, options = {}) {
  const target = url instanceof URL ? new URL(url.toString()) : new URL(String(url));
  const {
    method = 'GET',
    headers = {},
    body,
    jar,
    cookieHeader,
    timeoutMs = 10_000,
  } = options;

  const transport = target.protocol === 'https:' ? https : http;
  const finalHeaders = {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,' +
      'application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...headers,
  };

  const outgoingCookieHeader =
    cookieHeader != null ? cookieHeader : jar ? jar.getCookieHeader(target) : '';
  if (outgoingCookieHeader) {
    finalHeaders.Cookie = outgoingCookieHeader;
  }

  if (body != null) {
    const hasContentLength = Object.keys(finalHeaders).some(
      (key) => key.toLowerCase() === 'content-length',
    );
    if (!hasContentLength) {
      finalHeaders['Content-Length'] = Buffer.byteLength(body);
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let req;
    try {
      req = transport.request(target, { method, headers: finalHeaders }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('error', (error) => {
          finishReject(
            new ZjuAmError('NETWORK_ERROR', '网络响应失败', {
              details: `URL：${redactUrl(target)}`,
              cause: error,
            }),
          );
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({
            statusCode: response.statusCode || 0,
            setCookies: normalizeSetCookies(response.headers['set-cookie']),
            body: Buffer.concat(chunks).toString('utf8'),
            location: headerValue(response.headers.location),
          });
        });
      });
    } catch (error) {
      finishReject(
        new ZjuAmError('NETWORK_ERROR', '网络请求失败', {
          details: `URL：${redactUrl(target)}`,
          cause: error,
        }),
      );
      return;
    }

    req.on('error', (error) => {
      if (timedOut) {
        finishReject(
          new ZjuAmError('TIMEOUT', '请求超时', {
            details: `URL：${redactUrl(target)}`,
            cause: error,
          }),
        );
        return;
      }
      finishReject(
        new ZjuAmError('NETWORK_ERROR', '网络请求失败', {
          details: `URL：${redactUrl(target)}`,
          cause: error,
        }),
      );
    });

    req.setTimeout(timeoutMs, () => {
      timedOut = true;
      req.destroy(new Error('request timeout'));
    });

    if (body != null) {
      req.write(body);
    }
    req.end();
  });
}

module.exports = { request };