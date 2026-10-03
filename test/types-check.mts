import {
  ZjuAm,
  ZjuAmError,
  type OAuth2Options,
  type SsoCookie,
  type ZjuAmErrorCode,
  type ZjuAmOptions,
} from 'zjuam-auth';

async function exercisePublicSurface(): Promise<void> {
  const defaults = new ZjuAm();
  const options: ZjuAmOptions = {
    baseUrl: new URL('https://example.com'),
    userAgent: 'test-agent',
    timeoutMs: 1000,
    cacheTtlMs: 0,
  };
  const zju = new ZjuAm(options);
  void defaults;

  const cookie: SsoCookie = await zju.login('username', 'password', {
    forceRefresh: true,
  });
  const name: 'iPlanetDirectoryPro' = cookie.name;
  const value: string = cookie.value;
  const domain: string = cookie.domain;
  const path: string = cookie.path;
  const header: string = cookie.toString();
  void name;
  void domain;
  void path;

  const serviceByCookie: URL = await zju.getServiceCallback(
    cookie,
    'https://example.com/callback',
  );
  const serviceByValue: URL = await zju.getServiceCallback(
    value,
    new URL('https://example.com/callback'),
  );
  void serviceByCookie;
  void serviceByValue;

  const oauthOptions: OAuth2Options = {
    clientId: 'client-id',
    redirectUri: 'https://example.com/oauth2/callback',
    state: 'state-value',
  };
  const oauthByCookie: URL = await zju.getOAuth2Callback(cookie, oauthOptions);
  const oauthByHeader: URL = await zju.getOAuth2Callback(header, {
    clientId: 'client-id',
    redirectUri: new URL('https://example.com/oauth2/callback'),
  });
  void oauthByCookie;
  void oauthByHeader;

  zju.clearCache();
  zju.clearCache('username');
}

async function exerciseErrorNarrowing(): Promise<void> {
  try {
    await new ZjuAm({ baseUrl: 'https://example.com' }).login('u', 'p');
  } catch (error) {
    if (error instanceof ZjuAmError) {
      const code: ZjuAmErrorCode = error.code;
      const details: string | undefined = error.details;
      const cause: unknown = error.cause;
      if (code === 'TIMEOUT') {
        const timeoutCode: 'TIMEOUT' = code;
        void timeoutCode;
      }
      if (code === 'NETWORK_ERROR') {
        const networkCode: 'NETWORK_ERROR' = code;
        void networkCode;
      }
      void details;
      void cause;
    }
  }
}

