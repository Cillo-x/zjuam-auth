'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ZjuAm } = require('zjuam-auth');
const { startMockZjuam } = require('./helpers/mock-zjuam.cjs');

function assertNoSecrets(error, secrets) {
  const text = `${error.message}\n${error.details || ''}`;
  for (const secret of secrets) {
    assert.equal(text.includes(secret), false, `secret leaked: ${secret}`);
  }
}

test('getServiceCallback accepts SsoCookie, raw value, and cookie header', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });
  const cookie = await zju.login('2023000000', 'password');
  const service = `${mock.origin}/client/callback`;

  const callbacks = await Promise.all([
    zju.getServiceCallback(cookie, service),
    zju.getServiceCallback(cookie.value, service),
    zju.getServiceCallback(cookie.toString(), service),
  ]);

  for (const callback of callbacks) {
    assert.equal(callback.pathname, '/client/callback');
    assert.equal(callback.searchParams.get('ticket'), 'ST-test-ticket');
  }
  assert.equal(mock.counters.service, 3);
  for (const header of mock.serviceCookieHeaders) {
    assert.match(header, /iPlanetDirectoryPro=fresh-cookie/);
  }
});

test('service flow with rejected cookie returns SESSION_EXPIRED', async (t) => {
  const mock = await startMockZjuam({ serviceRejected: true });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.getServiceCallback('secret-cookie-value', `${mock.origin}/client/callback`),
    (error) => {
      assert.equal(error.code, 'SESSION_EXPIRED');
      assertNoSecrets(error, ['secret-cookie-value']);
      return true;
    },
  );
});

test('service callback to a different host returns INVALID_CALLBACK', async (t) => {
  const mock = await startMockZjuam({
    serviceLocation: 'http://evil.example/client/callback?ticket=ST-secret-ticket',
  });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.getServiceCallback('secret-cookie-value', `${mock.origin}/client/callback`),
    (error) => {
      assert.equal(error.code, 'INVALID_CALLBACK');
      assertNoSecrets(error, ['secret-cookie-value', 'ST-secret-ticket']);
      return true;
    },
  );
});

test('service callback without a ticket returns INVALID_CALLBACK', async (t) => {
  const mock = await startMockZjuam({
    serviceLocation: (_service, origin) => `${origin}/client/callback`,
  });
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.getServiceCallback('secret-cookie-value', `${mock.origin}/client/callback`),
    (error) => {
      assert.equal(error.code, 'INVALID_CALLBACK');
      assertNoSecrets(error, ['secret-cookie-value']);
      return true;
    },
  );
});