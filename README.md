# zjuam-auth

[![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)

零依赖的 Node.js ZJUam CAS 登录与 OAuth2 授权码回调客户端。

- 学号密码登录，缓存 SSO Cookie。
- 获取并校验 CAS service ticket 回调。
- 获取并校验 OAuth2 授权码回调。
- 手动跟随重定向，限制 Cookie 白名单与中间跳转 host。

它不提供校园业务 API，不负责 code→token 换取，也不支持浏览器环境。

## 安装

尚未发布到 npm。请从 Git URL 或本地路径安装：

```bash
npm install <repo-url>
# 或
npm install /path/to/zjuam-auth-node
```

要求 Node.js >= 22。

## 快速开始

CAS service ticket：

```js
import { ZjuAm } from 'zjuam-auth';

const zju = new ZjuAm();
const cookie = await zju.login('your-username', 'your-password');
const callback = await zju.getServiceCallback(
  cookie,
  'https://your-app.example/callback', // 必须是 CAS 已注册的 service
);
const ticket = callback.searchParams.get('ticket');
// 将 ticket 立即交给你的后端换取业务登录态。
```

OAuth2 授权码：

```js
import { ZjuAm } from 'zjuam-auth';

const zju = new ZjuAm();
const cookie = await zju.login('your-username', 'your-password');
const callback = await zju.getOAuth2Callback(cookie, {
  clientId: 'your-client-id',
  redirectUri: 'https://your-app.example/callback',
  state: 'your-state',
});
const code = callback.searchParams.get('code');
// 将 code 立即交给你的后端换取 token。
```

## 示例

Bash：

```bash
ZJU_USERNAME='your-username' ZJU_PASSWORD='your-password' \
ZJU_SERVICE='https://your-app.example/callback' node examples/service.mjs

ZJU_USERNAME='your-username' ZJU_PASSWORD='your-password' \
ZJU_OAUTH_CLIENT_ID='your-client-id' \
ZJU_OAUTH_REDIRECT_URI='https://your-app.example/callback' \
ZJU_OAUTH_STATE='your-state' node examples/oauth2.mjs
```

PowerShell：

```powershell
$env:ZJU_USERNAME='your-username'; $env:ZJU_PASSWORD='your-password'
$env:ZJU_SERVICE='https://your-app.example/callback'; node examples/service.mjs

$env:ZJU_OAUTH_CLIENT_ID='your-client-id'
$env:ZJU_OAUTH_REDIRECT_URI='https://your-app.example/callback'
$env:ZJU_OAUTH_STATE='your-state'; node examples/oauth2.mjs
```

## API

构造选项：

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `string \| URL` | `https://zjuam.zju.edu.cn` | CAS 根地址 |
| `userAgent` | `string` | 内置 UA | 请求 User-Agent |
| `timeoutMs` | `number` | `10000` | 单次 HTTP 请求超时 |
| `cacheTtlMs` | `number` | `120000` | SSO Cookie 缓存时间；`0` 关闭缓存 |

### `login(username, password, options?)`

密码登录并返回 SSO Cookie，返回 `Promise<SsoCookie>`。`options.forceRefresh` 为 `true` 时跳过缓存。

### `getServiceCallback(cookie, service)`

获取 CAS service ticket 回调地址，返回 `Promise<URL>`。`service` 必须是 CAS 已注册的 service。

库不会请求该回调地址；ticket 单次使用且短时有效，请尽快交给目标 service。

### `getOAuth2Callback(cookie, options)`

获取 OAuth2 授权码回调地址，返回 `Promise<URL>`。`options` 包含 `clientId`、`redirectUri`，可选 `state`。

库不会请求最终回调地址；code 单次使用且短时有效，请尽快交给你的后端换取 token。

### `clearCache(username?)`

清除指定用户名的 Cookie 缓存；省略 `username` 时清除全部。不会取消正在进行的登录。

`cookie` 参数接受 `SsoCookie`、裸 Cookie 值，或 `iPlanetDirectoryPro=<value>`。同一用户名的登录会复用进行中的请求；缓存有效期内直接返回内存中的 Cookie。

`SsoCookie` 包含 `name`、`value`、`domain`、`path`。如需复用会话，请安全保存 `cookie.value`，之后把该字符串传给 `getServiceCallback` / `getOAuth2Callback`；遇到 `SESSION_EXPIRED` 时重新调用 `login`。

## 错误处理

| code | 含义 | 建议处理 |
| --- | --- | --- |
| `INVALID_CREDENTIALS` | 账号密码错误或登录会话失效 | 提示用户重新输入 |
| `SESSION_EXPIRED` | SSO Cookie 已失效 | 重新调用 `login` |
| `UPSTREAM_ERROR` | CAS 返回异常状态或页面 | 稍后重试并检查 `details` |
| `INVALID_CALLBACK` | service/OAuth2 回调不合法 | 检查已注册的 service / redirectUri 与 ticket / code |
| `STATE_MISMATCH` | OAuth2 state 不匹配 | 拒绝回调并重新发起授权 |
| `UNEXPECTED_REDIRECT` | 重定向到未知 host | 检查 CAS 返回，不要放宽 host 限制 |
| `TOO_MANY_REDIRECTS` | 重定向次数过多 | 检查 CAS 配置或网络 |
| `TIMEOUT` | 请求超时 | 重试或增大 `timeoutMs` |
| `NETWORK_ERROR` | 网络或连接错误 | 检查网络、DNS 或代理 |

```js
try {
  await zju.login('your-username', 'your-password');
} catch (err) {
  if (err.code === 'INVALID_CREDENTIALS') console.error('账号或密码错误');
  else if (err.code === 'TIMEOUT') console.error('请求超时，请重试');
  else console.error(err.code, err.message, err.details);
}
```

参数不合法时抛出普通 `TypeError`。

## 调试

Bash：

```bash
NODE_DEBUG=zjuam node app.js
```

PowerShell：

```powershell
$env:NODE_DEBUG='zjuam'; node app.js
```

输出已脱敏，不会包含密码、Cookie 值、ticket、code 或 token。

## 安全

- 不要把账号密码硬编码进代码，使用环境变量或密钥管理服务。
- SSO Cookie 是登录凭证，避免明文持久化和日志输出。
- 生产环境使用 HTTPS，并严格限制 service / redirectUri。
- 传入 `state` 并在回调阶段完成校验。
- 不要上报未脱敏的完整回调 URL 或请求体。

## 开发

```bash
npm install
npm test
npm run typecheck
```

测试使用本地 mock server，不需要真实 ZJUam 账号。

`typescript` 仅为开发依赖，用于校验类型声明；运行时零依赖。

## License
本项目以 GPL-3.0-or-later 授权，全文见 LICENSE。

协议实现最初移植自 Celechron（https://github.com/Celechron/Celechron，GPL-3.0）。

Copyright (C) 2026 Cillo-x
