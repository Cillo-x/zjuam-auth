// Redacted response summaries and human-readable flow traces.
'use strict';

const { redactUrl } = require('./errors.cjs');
const { cookieNamesFromHeader, setCookieNames } = require('./cookies.cjs');

function summarizeResponse(response) {
  const body = (response && response.body ? String(response.body) : '').trim();
  if (!body) return '<空响应>';

  try {
    const json = JSON.parse(body);
    if (json && typeof json === 'object') {
      if (Array.isArray(json)) return `<JSON数组；条目数=${json.length}>`;
      return `<JSON对象；字段数=${Object.keys(json).length}>`;
    }
  } catch {
    // Not JSON; continue with HTML/text detection.
  }

  if (/<!doctype html|<html|<body|<form/i.test(body)) {
    return `<HTML响应；长度=${body.length}>`;
  }
  return `<文本响应；长度=${body.length}>`;
}

function responseDetails(response) {
  const location = response.location ? redactUrl(response.location) : '<缺失>';
  return (
    `HTTP ${response.statusCode}\n` +
    `Location：${location}\n` +
    `响应摘要：${summarizeResponse(response)}`
  );
}

function formatLoginTrace(step, uri, response, requestCookieHeader) {
  return (
    `login step=${step} 请求=${redactUrl(uri)} HTTP=${response.statusCode} ` +
    `ReqCookie=${cookieNamesFromHeader(requestCookieHeader) || '<无>'} ` +
    `SetCookie=${setCookieNames(response.setCookies) || '<无>'} ` +
    `Location=${response.location ? redactUrl(response.location) : '<无>'}`
  );
}

function formatOAuthTrace(hop, current, response, requestCookieHeader, next) {
  return (
    `hop=${hop} 请求=${redactUrl(current)} HTTP=${response.statusCode} ` +
    `ReqCookie=${cookieNamesFromHeader(requestCookieHeader) || '<无>'} ` +
    `SetCookie=${setCookieNames(response.setCookies) || '<无>'} ` +
    (response.location
      ? `Location=${redactUrl(response.location)}`
      : next
        ? `HTML-redirect=${redactUrl(next)}`
        : 'Location=<无>')
  );
}

module.exports = {
  summarizeResponse,
  responseDetails,
  formatLoginTrace,
  formatOAuthTrace,
};