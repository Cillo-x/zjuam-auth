import { ZjuAm } from 'zjuam-auth';

const required = ['ZJU_USERNAME', 'ZJU_PASSWORD', 'ZJU_SERVICE'];
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
  const callback = await zju.getServiceCallback(cookie, process.env.ZJU_SERVICE);
  const redactedCallback = callback
    .toString()
    .replace(/([?&]ticket=)[^&]*/i, '$1<redacted>');

  console.log(`cookie: ${cookie.value.slice(0, 8)}...`);
  console.log(`callback: ${redactedCallback}`);
} catch (err) {
  console.error(`code: ${err.code}`);
  console.error(`message: ${err.message}`);
  if (err.details) console.error(`details: ${err.details}`);
  process.exit(1);
}