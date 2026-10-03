'use strict';

const http = require('node:http');
const { once } = require('node:events');

const DEFAULT_MODULUS = 'f'.repeat(128);
const DEFAULT_EXPONENT = '10001';

function send(response, statusCode, headers, body = '') {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function callbackWith(redirectUri, code, state) {
  const callback = new URL(redirectUri);
  callback.searchParams.set('code', code);
  if (state != null) callback.searchParams.set('state', state);
  return callback.toString();
}

async function startMockZjuam(options = {}) {
  const counters = {
    loginPage: 0,
    publicKey: 0,
    postLogin: 0,
    service: 0,
    oauth2: 0,
    oauth2CallbackAuthorize: 0,
    oauth2PortalStep: 0,
  };
  const serviceCookieHeaders = [];
  const postLoginBodies = [];
  const sockets = new Set();

  const server = http.createServer((request, response) => {
    const origin = `http://${request.headers.host}`;
    const url = new URL(request.url || '/', origin);
    const hang = typeof options.hang === 'function'
      ? options.hang(url, request)
      : options.hang === true;
    if (hang) return;

    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (request.method === 'GET' && url.pathname === '/cas/login' && !url.searchParams.has('service')) {
        counters.loginPage += 1;
        if (options.omitExecution) {
          send(response, 200, { 'Content-Type': 'text/html; charset=utf-8' }, '<html><body>no execution</body></html>');
          return;
        }
        send(
          response,
          200,
          {
            'Content-Type': 'text/html; charset=utf-8',
            'Set-Cookie': 'JSESSIONID=form-session; Path=/cas; HttpOnly',
          },
          '<html><input name="execution" value="execution-1"></html>',
        );
        return;
      }

      if (request.method === 'GET' && url.pathname === '/cas/v2/getPubKey') {
        counters.publicKey += 1;
        if (options.publicKeyStatus) {
          send(response, options.publicKeyStatus, { 'Content-Type': 'text/plain' }, options.publicKeyBody || 'bad');
          return;
        }
        send(
          response,
          200,
          { 'Content-Type': 'application/json; charset=utf-8' },
          JSON.stringify({
            modulus: options.publicKeyModulus || DEFAULT_MODULUS,
            exponent: options.publicKeyExponent || DEFAULT_EXPONENT,
          }),
        );
        return;
      }

      if (request.method === 'POST' && url.pathname === '/cas/login') {
        counters.postLogin += 1;
        postLoginBodies.push(body);
        if (options.loginPostErrorStatus) {
          send(
            response,
            options.loginPostErrorStatus,
            { 'Content-Type': 'text/html; charset=utf-8' },
            options.loginPostErrorHtml || '',
          );
          return;
        }
        if (options.loginPostErrorHtml) {
          send(response, 200, { 'Content-Type': 'text/html; charset=utf-8' }, options.loginPostErrorHtml);
          return;
        }
        send(
          response,
          302,
          {
            'Content-Type': 'text/html; charset=utf-8',
            'Set-Cookie': 'iPlanetDirectoryPro=fresh-cookie; Domain=127.0.0.1; Path=/; HttpOnly',
          },
          '',
        );
        return;
      }

      if (request.method === 'GET' && url.pathname === '/cas/login' && url.searchParams.has('service')) {
        counters.service += 1;
        serviceCookieHeaders.push(request.headers.cookie || '');
        if (!(request.headers.cookie || '').includes('iPlanetDirectoryPro=')) {
          send(response, 401, { 'Content-Type': 'text/plain; charset=utf-8' }, 'missing sso cookie');
          return;
        }
        if (options.serviceRejected) {
          send(response, 200, { 'Content-Type': 'text/html; charset=utf-8' }, '<html><body>login</body></html>');
          return;
        }
        if (options.serviceLocation) {
          const location = typeof options.serviceLocation === 'function'
            ? options.serviceLocation(url.searchParams.get('service'), origin)
            : options.serviceLocation;
          send(response, 302, { Location: location }, '');
          return;
        }
        const callback = new URL(url.searchParams.get('service'));
        callback.searchParams.set('ticket', options.serviceTicket || 'ST-test-ticket');
        send(response, 302, { Location: callback.toString() }, '');
        return;
      }

      if (request.method === 'GET' && url.pathname === '/cas/oauth2.0/authorize') {
        counters.oauth2 += 1;
        const clientId = url.searchParams.get('client_id');
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');
        if (clientId === 'chain-client') {
          const next = new URL('/cas/oauth2.0/callbackAuthorize', origin);
          next.searchParams.set('redirect_uri', redirectUri);
          if (state != null) next.searchParams.set('state', state);
          send(response, 302, { Location: next.toString() }, '');
          return;
        }
        if (clientId === 'html-js-client') {
          const target = callbackWith(redirectUri, 'OAuthCode-html-js', state);
          send(response, 200, { 'Content-Type': 'text/html; charset=utf-8' }, `<html><script>window.location.href='${target}'</script></html>`);
          return;
        }
        if (clientId === 'html-meta-client') {
          const target = callbackWith(redirectUri, 'OAuthCode-html-meta', state);
          send(response, 200, { 'Content-Type': 'text/html; charset=utf-8' }, `<html><meta http-equiv="refresh" content="0;url=${target}"></html>`);
          return;
        }
        if (clientId === 'html-form-client') {
          const target = callbackWith(redirectUri, 'OAuthCode-html-form', state);
          send(response, 200, { 'Content-Type': 'text/html; charset=utf-8' }, `<html><form action="${target}"></form></html>`);
          return;
        }
        if (clientId === 'state-mismatch-client') {
          send(response, 302, { Location: callbackWith(redirectUri, 'OAuthCode-state', 'wrong-state') }, '');
          return;
        }
        if (clientId === 'evil-redirect-client') {
          send(response, 302, { Location: 'http://evil.example/callback?code=evil-code' }, '');
          return;
        }
        if (clientId === 'loop-client') {
          send(response, 302, { Location: `${url.pathname}${url.search}` }, '');
          return;
        }
        send(
          response,
          302,
          { Location: callbackWith(redirectUri, options.oauth2Code || 'OAuthCode-test', state) },
          '',
        );
        return;
      }

      if (request.method === 'GET' && url.pathname === '/cas/oauth2.0/callbackAuthorize') {
        counters.oauth2CallbackAuthorize += 1;
        const next = new URL('/oauth2/portal-step', origin);
        next.searchParams.set('redirect_uri', url.searchParams.get('redirect_uri'));
        const state = url.searchParams.get('state');
        if (state != null) next.searchParams.set('state', state);
        send(
          response,
          302,
          {
            'Set-Cookie': 'JSESSIONID=portal-session; Path=/; HttpOnly',
            Location: next.toString(),
          },
          '',
        );
        return;
      }

      if (request.method === 'GET' && url.pathname === '/oauth2/portal-step') {
        counters.oauth2PortalStep += 1;
        const cookieHeader = request.headers.cookie || '';
        if (!cookieHeader.includes('JSESSIONID=portal-session')) {
          send(response, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'missing portal session');
          return;
        }
        send(
          response,
          302,
          {
            Location: callbackWith(
              url.searchParams.get('redirect_uri'),
              'OAuthCode-chain',
              url.searchParams.get('state'),
            ),
          },
          '',
        );
        return;
      }

      send(response, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'not found');
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    counters,
    serviceCookieHeaders,
    postLoginBodies,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(resolve);
      }),
  };
}

module.exports = { startMockZjuam };