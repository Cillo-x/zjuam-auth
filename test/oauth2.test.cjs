'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ZjuAm } = require('zjuam-auth');
const { startMockZjuam } = require('./helpers/mock-zjuam.cjs');

const COOKIE_SECRET = 'secret-cookie-value';

function assertNoSecrets(error, secrets) {
  const text = `${error.message}\n${error.details || ''}`;
  for (const secret of secrets) {
    assert.equal(text.includes(secret), false, `secret leaked: ${secret}`);
  }
}

test('OAuth2 authorize returns the final callback URL', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  const callback = await zju.getOAuth2Callback(COOKIE_SECRET, {
    clientId: 'test-client',
    redirectUri: `${mock.origin}/oauth2/callback`,
    state: '10000',
  });

  assert.equal(callback.pathname, '/oauth2/callback');
  assert.equal(callback.searchParams.get('code'), 'OAuthCode-test');
  assert.equal(callback.searchParams.get('state'), '10000');
  assert.equal(mock.counters.oauth2, 1);
});

test('OAuth2 follows a multi-hop redirect and keeps whitelisted cookies', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  const callback = await zju.getOAuth2Callback(COOKIE_SECRET, {
    clientId: 'chain-client',
    redirectUri: `${mock.origin}/oauth2/chained/callback`,
    state: '10000',
  });

  assert.equal(callback.pathname, '/oauth2/chained/callback');
  assert.equal(callback.searchParams.get('code'), 'OAuthCode-chain');
  assert.equal(callback.searchParams.get('state'), '10000');
  assert.equal(mock.counters.oauth2CallbackAuthorize, 1);
  assert.equal(mock.counters.oauth2PortalStep, 1);
});

test('OAuth2 follows HTML meta, JS, and form redirects', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });
  const cases = [
    ['html-js-client', 'OAuthCode-html-js'],
    ['html-meta-client', 'OAuthCode-html-meta'],
    ['html-form-client', 'OAuthCode-html-form'],
  ];

  for (const [clientId, code] of cases) {
    const callback = await zju.getOAuth2Callback(COOKIE_SECRET, {
      clientId,
      redirectUri: `${mock.origin}/oauth2/chained/callback`,
      state: '10000',
    });
    assert.equal(callback.searchParams.get('code'), code);
    assert.equal(callback.searchParams.get('state'), '10000');
  }
});

test('OAuth2 state mismatch returns STATE_MISMATCH', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.getOAuth2Callback(COOKIE_SECRET, {
      clientId: 'state-mismatch-client',
      redirectUri: `${mock.origin}/oauth2/callback`,
      state: '10000',
    }),
    (error) => {
      assert.equal(error.code, 'STATE_MISMATCH');
      assert.match(error.details, /期望 state：10000/);
      assert.match(error.details, /实际 state：wrong-state/);
      assertNoSecrets(error, [COOKIE_SECRET, 'OAuthCode-state']);
      return true;
    },
  );
});

test('OAuth2 redirect to an unknown host returns UNEXPECTED_REDIRECT', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.getOAuth2Callback(COOKIE_SECRET, {
      clientId: 'evil-redirect-client',
      redirectUri: `${mock.origin}/oauth2/callback`,
      state: '10000',
    }),
    (error) => {
      assert.equal(error.code, 'UNEXPECTED_REDIRECT');
      assertNoSecrets(error, [COOKIE_SECRET, 'evil-code']);
      return true;
    },
  );
});

test('OAuth2 redirect loop returns TOO_MANY_REDIRECTS', async (t) => {
  const mock = await startMockZjuam();
  t.after(() => mock.close());
  const zju = new ZjuAm({ baseUrl: mock.origin });

  await assert.rejects(
    zju.getOAuth2Callback(COOKIE_SECRET, {
      clientId: 'loop-client',
      redirectUri: `${mock.origin}/oauth2/callback`,
      state: '10000',
    }),
    (error) => {
      assert.equal(error.code, 'TOO_MANY_REDIRECTS');
      assertNoSecrets(error, [COOKIE_SECRET]);
      assert.ok(mock.counters.oauth2 > 10);
      return true;
    },
  );
});

test('invalid OAuth2 arguments throw TypeError', async () => {
  const zju = new ZjuAm({ baseUrl: 'http://127.0.0.1:1' });
  await assert.rejects(zju.getOAuth2Callback('cookie', {}), TypeError);
  await assert.rejects(
    zju.getOAuth2Callback('cookie', { clientId: '', redirectUri: 'http://example.com/' }),
    TypeError,
  );
  await assert.rejects(
    zju.getOAuth2Callback('cookie', { clientId: 'test', redirectUri: '' }),
    TypeError,
  );
});