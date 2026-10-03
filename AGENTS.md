# AGENTS.md

## Purpose

This repository is a zero-dependency Node.js client for ZJUam CAS password login,
service-ticket callbacks, and OAuth2 authorization-code callbacks.

The public API is the contract in `src/index.d.ts`. The package is not published
to npm and is consumed from a git URL or local path.

## Scope

- Maintain CAS password login.
- Maintain CAS service-ticket callback validation.
- Maintain OAuth2 authorization-code callback validation.
- Keep the runtime dependency-free and Node.js >= 22 compatible.
- Keep tests hermetic: local mock HTTP servers only, never real ZJUam.

## Non-goals

- No campus business APIs.
- No browser bundle or browser support.
- No code-to-token exchange.
- No publishing or licensing decisions.
- No backward-compatibility aliases for removed APIs.

## Commands

```bash
npm install
npm test
npm run typecheck
```

If a sandbox blocks the Node test runner from spawning processes, use:

```bash
node --test --test-isolation=none "test/*.test.cjs"
```

Tests must never hit real ZJUam. Do not add integration tests that require a
real account unless they are explicitly opt-in and skipped by default.

## Repo map

`src/index.cjs` — public CommonJS exports.
`src/index.mjs` — thin ESM wrapper.
`src/index.d.ts` — public TypeScript contract and source of truth.
`src/client.cjs` — `ZjuAm` class, cache, single-flight, flow context.
`src/login.cjs` — CAS password login flow.
`src/service.cjs` — CAS service-ticket callback flow.
`src/oauth2.cjs` — OAuth2 authorization-code flow.
`src/cookies.cjs` — Set-Cookie parsing, cookie jar, SSO cookie value handling.
`src/urls.cjs` — CAS URL construction, redirect status and host/path rules.
`src/http.cjs` — HTTP/HTTPS transport and error mapping.
`src/errors.cjs` — `ZjuAmError`, `fail`, secret redaction.
`src/diagnostics.cjs` — response summaries and redacted flow traces.
`src/html.cjs` — HTML execution/error/redirect extraction.
`src/rsa.cjs` — RSA password encryption.
`test/helpers/mock-zjuam.cjs` — configurable local mock ZJUam server.
`test/login.test.cjs` — login, cache, timeout, option tests.
`test/service.test.cjs` — service-ticket flow tests.
`test/oauth2.test.cjs` — OAuth2 redirect/state/cookie tests.
`test/rsa.test.cjs` — RSA golden vectors.
`test/html.test.cjs` — HTML error extraction tests.
`test/public-surface.test.cjs` — public export and runtime-shape assertions.
`test/types-check.mts` — TypeScript API exercise.

## Protocol notes

Login sequence:

1. `GET /cas/login` and extract the `execution` field.
2. `GET /cas/v2/getPubKey`.
3. RSA-encrypt the password.
4. `POST /cas/login` with `username`, encrypted `password`, `execution`,
   `_eventId=submit`, `rememberMe=true`.
5. Read `iPlanetDirectoryPro` from the POST response cookies.

Service-ticket sequence:

1. `GET /cas/login?service=...` with the SSO cookie.
2. CAS returns a redirect to the registered service with a `ticket`.
3. The library does not auto-follow; it validates scheme/host/port/path and a
   non-empty ticket, then returns the callback URL.

OAuth2 hop sequence:

1. `GET /cas/oauth2.0/authorize?response_type=code&client_id=...&redirect_uri=...&state=...`
2. Work through intermediate CAS hops such as
   `/cas/login?service=.../callbackAuthorize`,
   `.../callbackAuthorize?...ticket=...`, and other same-CAS redirects.
3. Finish at `redirect_uri?code=ST-...&state=...` and validate host/path,
   `code`, and optional `state`.

Cookie whitelist is `[iPlanetDirectoryPro, JSESSIONID]`: these are the cookies
CAS needs across the authorize redirect chain. Other cookies are intentionally
dropped.

Allowed intermediate redirect hosts are the configured `baseUrl` host, plus
`*.zju.edu.cn` when `baseUrl` itself is under `zju.edu.cn`. Final callbacks are
validated against the caller-provided `redirectUri`, not the intermediate host
rule.

RSA encryption mirrors the server-side JS un-padded per-byte hex quirk. The
golden vectors in `test/rsa.test.cjs` must stay byte-for-byte identical.

## Real-world verification log

Append-only; do not rewrite past entries.

- 2026-10-03: real-account `login` OK.
- 2026-10-03: `getServiceCallback` with service
  `https://zdbk.zju.edu.cn/jwglxt/xtgl/login_ssologin.html` returned a ticket.
- 2026-10-03: wrong password caused POST `/cas/login` to return HTTP 200 with
  no `iPlanetDirectoryPro`; result was `INVALID_CREDENTIALS`. Server hint was
  extracted as `"用户名或密码错误"`.
- 2026-10-03: observed login cookies: GET login set `JSESSIONID`, `_csrf`;
  GET getPubKey set `_pv0`; POST set `_pf0`.
- 2026-10-03: successful login POST `/cas/login` returns HTTP 302 (Location: service.zju.edu.cn portal) and sets `CASPRIVACY`, `_pf0`, `_pm0`, `_pc0`, `iPlanetDirectoryPro`. Contrast: wrong password returns HTTP 200 with no redirect.
- 2026-10-03: real OAuth2 flow OK with a third-party client (redirect_uri on `*.zju.edu.cn`, state given). Exactly 3 hops: hop0 `/cas/oauth2.0/authorize` → 302 `/cas/login?service=http://zjuam.zju.edu.cn/cas/oauth2.0/callbackAuthorize` (sets `JSESSIONID`); hop1 → 302 `/cas/oauth2.0/callbackAuthorize?ticket=…`; hop2 → 302 `redirect_uri?code=…&state=…`. Only `iPlanetDirectoryPro` + `JSESSIONID` were sent on every hop — confirms the whitelist is sufficient. Note the CAS-internal service URL uses `http://` even though requests are `https://`.

## Invariants

- Zero runtime dependencies.
- Node.js >= 22.
- Public surface is `src/index.d.ts`, asserted by
  `test/public-surface.test.cjs`; update d.ts, that test, and README together.
- License is GPL-3.0-or-later (derivative of Celechron). Do not change the license or remove the attribution in README.
- Error codes are a stable contract: add new codes, never rename existing ones.
- Never log or embed secrets. Redaction lives in `src/errors.cjs`.
- Human-facing docs and error messages are Chinese; code comments and
  AGENTS.md are English.
- Debug output only through `util.debuglog('zjuam')`.
- Every `src/` file starts with a one-line responsibility comment.

## Feature checklist

1. Update `src/index.d.ts` first.
2. Implement in the narrowest src module with a header comment.
3. Add focused mock-server tests; never hit real ZJUam.
4. Update `test/public-surface.test.cjs` if the public shape changed.
5. Update README and this file if docs or protocol expectations changed.
6. Run `npm test` and `npm run typecheck`.