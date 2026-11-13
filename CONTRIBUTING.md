# 参与贡献

欢迎提交问题反馈、功能建议和 Pull Request。

## 开始开发

使用 Node.js 22.18 或更新版本，推荐 Node.js 24：

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/newtab.html`。普通浏览器是预览模式；需要 Chrome API 的功能请按 [README](README.md) 加载扩展验证。

## 提交前检查

```sh
npm test
npm run build
npm run test:e2e
```

浏览器交互测试在本地默认使用已安装的 Google Chrome。也可以安装并使用 Playwright Chromium：

```sh
npx playwright install chromium
TOBY_TEST_BROWSER=chromium npm run test:e2e
npm run test:extension
```

GitHub CI 使用 Chromium，运行数据测试、界面测试和真实扩展测试。测试均使用隔离的浏览器上下文或临时配置目录。

请在 Pull Request 中说明问题、修改后的行为和验证方式。涉及数据格式或本地持久化时，请覆盖旧数据迁移、删除、并发编辑和失败恢复，避免静默覆盖用户数据。

## 项目约定

- 界面文案使用中文，保留键盘操作和减少动画支持。
- Chrome API 适配集中在 `src/platform.ts`，本地持久化写入通过后台队列处理。
- 优先保持离线可用，确认本地保存成功后才执行关闭标签等后续动作。
- 新增权限或外部请求时，同时更新 manifest、README 和隐私说明。
- 运行 `npm run format` 格式化主要源码。
- 不提交个人备份、访问令牌、私钥、个人工具设置、浏览器配置目录或构建输出。

## Fork 与扩展身份

`extension-identity.json` 只包含用于兼容旧开发版 ID 的公钥，不是登录凭证。常规本地构建无需固定 ID。

如果以不同产品名发布 Fork，请使用独立的扩展身份，并在改变 ID 前导出旧数据备份。不要让用户把 Fork 当成原版或其他同名产品。

本项目采用 [MIT 许可证](LICENSE)。第三方依赖许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。提交贡献即表示同意按 MIT 许可证提供该贡献。
