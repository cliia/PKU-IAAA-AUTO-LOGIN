# PKU IAAA 自动登录

面向北京大学统一身份认证页面的 Chromium 扩展。插件会在 `iaaa.pku.edu.cn` 页面内自动填写用户名和密码，并按页面实际状态处理普通登录、短信验证码和 OTP 场景。

## 版本说明

- 当前版本：`3.0.0`
- 技术栈：`TypeScript + Vite + Vitest + ESLint`
- 浏览器范围：Chrome、Edge 及其他现代 Chromium 浏览器
- 存储结构：v3 使用全新的 `settings` / `device` schema

> 注意：v3 不兼容旧版分散存储结构，不会自动迁移旧数据。升级后请重新配置，或在弹窗中先执行“清除数据”。

## 功能

- 保存用户名、IAAA 密码与主密码
- 使用 `PBKDF2-SHA-256 + AES-GCM-256` 加密同步密码
- 仅在本地缓存解锁后的 JWK，不上传主密码
- 支持三态弹窗：`setup`、`locked`、`ready`
- 支持自动登录开关、清除配置、锁定后重新解锁
- 支持 IAAA 普通登录、短信验证、OTP、OTP 未绑定提示

## 安装与使用

### 1. 构建扩展

```bash
npm install
npm run build
```

构建完成后，浏览器可加载的扩展目录为 `dist/`。

### 2. 加载到浏览器

1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目下的 `dist/` 目录

### 3. 首次配置

1. 点击浏览器工具栏中的扩展图标
2. 输入学号、IAAA 密码和主密码
3. 按需开启或关闭“自动登录”
4. 点击“保存配置”

首次保存后，本机会进入 `ready` 状态，可直接自动登录；其他设备只会同步密文，需要重新输入主密码解锁。

## 开发

### 常用脚本

```bash
npm run lint
npm test
npm run build
```

### 项目结构

```text
.
├── manifest.json
├── popup.html
├── src
│   ├── content
│   │   ├── index.ts
│   │   └── runner.ts
│   ├── popup
│   │   ├── controller.ts
│   │   ├── main.ts
│   │   ├── styles.css
│   │   └── template.ts
│   └── shared
│       ├── constants.ts
│       ├── crypto.ts
│       ├── selectors.ts
│       ├── storage.ts
│       └── types.ts
├── test
│   ├── fixtures
│   ├── content.test.ts
│   ├── crypto.test.ts
│   ├── popup.test.ts
│   └── storage.test.ts
└── scripts
    └── build-extension.mjs
```

## 存储与安全模型

- `chrome.storage.sync['settings']`

```ts
{
  version: 1,
  username: string,
  autoLoginEnabled: boolean,
  encryptedPassword: string,
  salt: string,
  iv: string
}
```

- `chrome.storage.local['device']`

```ts
{
  cachedKeyJwk: JsonWebKey | null
}
```

说明：

- 真实密码只以密文形式进入同步存储
- 主密码只用于派生密钥，不会写入浏览器存储
- 本地缓存的是解锁后的密钥 JWK，用于当前设备后续自动登录
- 若本地缓存失效，弹窗会自动回到 `locked` 状态

## 自动化测试覆盖

- 加密、解密、主密码验证
- 新版存储结构读写与旧版数据识别
- Popup 的首次配置、解锁、自动登录切换、清除数据
- Content script 的普通登录、短信验证码、OTP、OTP 未绑定、探测失败回退、未启用/未解锁跳过

## 已知边界

- 插件依赖 IAAA 当前页面的 DOM 结构和页面内函数，例如 `oauthLogon()`、`sendSMSCode()`
- 如果 IAAA 页面后续改版，优先修改 `src/shared/selectors.ts` 和 `src/content/runner.ts` 中的适配逻辑
- 当前不提供 Firefox 兼容层，也不包含后台脚本或云端服务

## 许可证

本项目采用 [MIT License](./LICENSE)。
