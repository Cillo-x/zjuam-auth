'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ZjuAm, ZjuAmError } = require('zjuam-auth');
const { startMockZjuam } = require('./helpers/mock-zjuam.cjs');

const PASSWORD_SECRET = 'super-secret-password';

function assertNoSecret(error, secret) {
  const text = `${error.message}\n${error.details || ''}`;
  assert.equal(text.includes(secret), false, `secret leaked: ${secret}`);
}

test('login performs the CAS flow and returns an SsoCookie', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  const cookie = await zju.login('2023000000', PASSWORD_SECRET);

  assert.equal(cookie.name, 'iPlanetDirectoryPro');
  assert.equal(cookie.value, 'fresh-cookie');
  assert.equal(cookie.toString(), 'iPlanetDirectoryPro=fresh-cookie');
  assert.equal(cookie.domain, '127.0.0.1');
  assert.equal(cookie.path, '/');
  assert.equal(mock.counters.loginPage, 1);
  assert.equal(mock.counters.publicKey, 1);
  assert.equal(mock.counters.postLogin, 1);

  const form = new URLSearchParams(mock.postLoginBodies[0]);
  assert.equal(form.get('username'), '2023000000');
  assert.equal(form.get('execution'), 'execution-1');
  assert.equal(form.get('_eventId'), 'submit');
  assert.equal(form.get('rememberMe'), 'true');
  assert.ok(form.get('password'));
  assert.notEqual(form.get('password'), PASSWORD_SECRET);
});

test('concurrent logins for the same username use one password POST', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  const [first, second] = await Promise.all([
    zju.login('2023000000', PASSWORD_SECRET),
    zju.login('2023000000', PASSWORD_SECRET),
  ]);

  assert.equal(first.value, 'fresh-cookie');
  assert.equal(second.value, 'fresh-cookie');
  assert.equal(mock.counters.loginPage, 1);
  assert.equal(mock.counters.postLogin, 1);
});

test('clearCache during an in-flight login does not start a second password POST', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  const first = zju.login('2023000000', PASSWORD_SECRET);
  zju.clearCache();
  const second = zju.login('2023000000', PASSWORD_SECRET);

  await Promise.all([first, second]);
  assert.equal(mock.counters.postLogin, 1);
});

test('cacheTtlMs: 0 disables cookie caching', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin, cacheTtlMs: 0 });

  await zju.login('2023000000', PASSWORD_SECRET);
  await zju.login('2023000000', PASSWORD_SECRET);

  assert.equal(mock.counters.loginPage, 2);
  assert.equal(mock.counters.postLogin, 2);
});

test('wrong password returns INVALID_CREDENTIALS with server message in details', async (t) => {
  const mock = await startMockZjuam({
    loginPostErrorHtml: '<html><div id="msg">用户名或密码错误</div></html>',
  });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.login('2023000000', PASSWORD_SECRET),
    (error) => {
      assert.ok(error instanceof ZjuAmError);
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      assert.match(error.details, /服务器提示：用户名或密码错误/);
      assertNoSecret(error, PASSWORD_SECRET);
      return true;
    },
  );
});

test('wrong password without server message omits the server hint', async (t) => {
  const mock = await startMockZjuam({
    loginPostErrorHtml: '<html><body>bad credentials</body></html>',
  });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.login('2023000000', PASSWORD_SECRET),
    (error) => {
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      assert.equal(error.details.includes('服务器提示'), false);
      assertNoSecret(error, PASSWORD_SECRET);
      return true;
    },
  );
});

test('login page missing execution returns UPSTREAM_ERROR', async (t) => {
  const mock = await startMockZjuam({ omitExecution: true });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.login('2023000000', PASSWORD_SECRET),
    (error) => {
      assert.equal(error.code, 'UPSTREAM_ERROR');
      assertNoSecret(error, PASSWORD_SECRET);
      return true;
    },
  );
});

test('request timeout returns TIMEOUT', async (t) => {
  const mock = await startMockZjuam({ hang: true });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin, timeoutMs: 30 });

  await assert.rejects(
    zju.login('2023000000', PASSWORD_SECRET),
    (error) => {
      assert.equal(error.code, 'TIMEOUT');
      assertNoSecret(error, PASSWORD_SECRET);
      return true;
    },
  );
});

test('invalid login arguments throw TypeError', async () => {
  assert.throws(() => new ZjuAm({ baseUrl: 'not a url' }), TypeError);
  const zju = new ZjuAm({ baseUrl: 'http://127.0.0.1:1' });
  await assert.rejects(zju.login('', PASSWORD_SECRET), TypeError);
  await assert.rejects(zju.login('2023000000', ''), TypeError);
});

test('password POST 5xx returns UPSTREAM_ERROR', async (t) => {
  const mock = await startMockZjuam({
    loginPostErrorStatus: 500,
    loginPostErrorHtml: '<html><div class="error">服务端错误</div></html>',
  });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.login('2023000000', PASSWORD_SECRET),
    (error) => {
      assert.equal(error.code, 'UPSTREAM_ERROR');
      assert.match(error.details, /服务器提示：服务端错误/);
      assertNoSecret(error, PASSWORD_SECRET);
      return true;
    },
  );
});

test('invalid ZjuAm options throw TypeError', () => {
  assert.throws(() => new ZjuAm({ baseUrl: 123 }), TypeError);
  assert.throws(() => new ZjuAm({ userAgent: '' }), TypeError);
  assert.throws(() => new ZjuAm({ userAgent: 123 }), TypeError);
  assert.throws(() => new ZjuAm({ timeoutMs: 0 }), TypeError);
  assert.throws(() => new ZjuAm({ timeoutMs: NaN }), TypeError);
  assert.throws(() => new ZjuAm({ timeoutMs: Infinity }), TypeError);
  assert.throws(() => new ZjuAm({ cacheTtlMs: -1 }), TypeError);
  assert.throws(() => new ZjuAm({ cacheTtlMs: NaN }), TypeError);
  assert.doesNotThrow(
    () =>
      new ZjuAm({
        userAgent: 'test-agent',
        timeoutMs: 100,
        cacheTtlMs: 0,
      }),
  );
});