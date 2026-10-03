import { ZjuAm } from 'zjuam-auth';

const required = [
  'ZJU_USERNAME',
  'ZJU_PASSWORD',
  'ZJU_OAUTH_CLIENT_ID',
  'ZJU_OAUTH_REDIRECT_URI',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`缺少环境变量：${missing.join(', ')}`);
  process.exit(1);
}

const zju = new ZjuAm();
try {
  const cookie = await zju.login(
    process.env.ZJU_USERNAME,
    process.env.ZJU_PASSWORD,
  );
  const options = {
    clientId: process.env.ZJU_OAUTH_CLIENT_ID,
    redirectUri: process.env.ZJU_OAUTH_REDIRECT_URI,
  };
  if (process.env.ZJU_OAUTH_STATE) options.state = process.env.ZJU_OAUTH_STATE;

  const callback = await zju.getOAuth2Callback(cookie, options);
  const redactedCallback = callback
    .toString()
    .replace(/([?&]code=)[^&]*/i, '$1<redacted>');

  console.log(`cookie: ${cookie.value.slice(0, 8)}...`);
  console.log(`callback: ${redactedCallback}`);
} catch (err) {
  console.error(`code: ${err.code}`);
  console.error(`message: ${err.message}`);
  if (err.details) console.error(`details: ${err.details}`);
  process.exit(1);
}