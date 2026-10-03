// Public TypeScript type contract for zjuam-auth.
export interface ZjuAmOptions {
  /** Default: https://zjuam.zju.edu.cn (override for tests). */
  baseUrl?: string | URL;
  userAgent?: string;
  /** Per-HTTP-request timeout. Default 10000. */
  timeoutMs?: number;
  /** In-memory SSO cookie cache TTL per username. Default 120000; 0 disables caching. */
  cacheTtlMs?: number;
}

export interface SsoCookie {
  readonly name: 'iPlanetDirectoryPro';
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  /** Returns "iPlanetDirectoryPro=<value>". */
  toString(): string;
}

export interface OAuth2Options {
  clientId: string;
  redirectUri: string | URL;
  /** If provided, the callback's state MUST equal it. */
  state?: string;
}

export type ZjuAmErrorCode =
  | 'INVALID_CREDENTIALS'   // password POST returned no iPlanetDirectoryPro
  | 'SESSION_EXPIRED'       // SSO cookie rejected: flow ended on a non-redirect 200/401/403
  | 'UPSTREAM_ERROR'        // unexpected status / malformed page / missing execution / bad pubkey
  | 'INVALID_CALLBACK'      // final callback origin/path mismatch, missing ticket/code, bad URL/protocol
  | 'STATE_MISMATCH'
  | 'UNEXPECTED_REDIRECT'   // redirect to a host outside the allowed set
  | 'TOO_MANY_REDIRECTS'
  | 'TIMEOUT'
  | 'NETWORK_ERROR';

export class ZjuAmError extends Error {
  readonly code: ZjuAmErrorCode;
  /** Redacted diagnostic text (HTTP status, response summary, redirect trace). */
  readonly details?: string;
  readonly cause?: unknown;
}

export class ZjuAm {
  constructor(options?: ZjuAmOptions);
  login(username: string, password: string, options?: { forceRefresh?: boolean }): Promise<SsoCookie>;
  /** cookie: an SsoCookie, the raw cookie value, or "iPlanetDirectoryPro=<value>". */
  getServiceCallback(cookie: SsoCookie | string, service: string | URL): Promise<URL>;
  getOAuth2Callback(cookie: SsoCookie | string, options: OAuth2Options): Promise<URL>;
  /** Clears cached cookie for one username, or all when omitted. Never cancels or forgets in-flight logins. */
  clearCache(username?: string): void;
}