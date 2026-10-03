// Error type, assertion helper and secret-query redaction for zjuam-auth.
'use strict';

const SECRET_QUERY_PARAMS = new Set([
  'code',
  'ticket',
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'password',
  'passwd',
  'pwd',
]);

const SECRET_QUERY_PATTERN = new RegExp(
  `([?&]?(?:${Array.from(SECRET_QUERY_PARAMS).join('|')})=)[^&\\s#]*`,
  'gi',
);

class ZjuAmError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ZjuAmError';
    this.code = code;
    this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ZjuAmError);
    }
  }

  toString() {
    return this.details ? `${this.message}\n${this.details}` : this.message;
  }
}

function fail(code, message, details, cause) {
  throw new ZjuAmError(code, message, { details, cause });
}

function redactText(value) {
  return String(value).replace(SECRET_QUERY_PATTERN, '$1<redacted>');
}

/** Redacts secret query parameters in a URL or URL-like string. */
function redactUrl(value) {
  if (value == null) return '';
  const text = value instanceof URL ? value.toString() : String(value);
  try {
    const url = new URL(text);
    let changed = false;
    for (const key of Array.from(new Set(url.searchParams.keys()))) {
      if (SECRET_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.set(key, '<redacted>');
        changed = true;
      }
    }
    if (!changed) return text;
    return url.toString().replace(/%3Credacted%3E/gi, '<redacted>');
  } catch {
    return redactText(text);
  }
}

module.exports = { ZjuAmError, fail, redactUrl };