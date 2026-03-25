# Changelog

## v3.0.0 - 2026-03-25

### Breaking Changes

- 完全重写为 `TypeScript + Vite` 工程，旧版分散存储结构不再自动迁移
- 升级到版本化 schema：`chrome.storage.sync['settings']` 与 `chrome.storage.local['device']`
- 移除旧版 `jQuery`、`Bootstrap` 和零构建脚本

### Added

- 新的 popup 三态流程：`setup`、`locked`、`ready`
- 主密码加密与本地 JWK 缓存模型
- IAAA 普通登录、短信验证码、OTP、OTP 未绑定的原生 DOM 处理逻辑
- `Vitest` 自动化测试与页面夹具
- `ESLint`、`TypeScript`、`Vite` 构建链路
- GitHub Actions CI：自动执行 `lint`、`test`、`build` 并上传 `dist/`

### Changed

- 重写 README，补充安装、构建、升级与安全模型说明
- 构建产物统一输出到 `dist/`
- manifest 更新为 v3 发布形态

### Validation

- `npm run lint`
- `npm test`
- `npm run build`

### Release Notes

v3 是一次完整重写，目标是把原先的零构建扩展升级为可维护的工程化版本，同时保留 IAAA 自动登录、短信验证码和 OTP 场景。  
由于存储结构已经切换，旧版数据不会自动迁移；升级后请重新配置，或先在弹窗中执行“清除数据”。
