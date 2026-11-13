# 发布与分发

## 上传 GitHub 源码

目标公开仓库为 `Orange8/toby-zh`，采用 MIT 许可证。本项目仅在本机保存数据，通过 JSON 文件导入、导出备份。

可以将准备好的源码包解压后上传到 GitHub 仓库，保持 `package.json`、`LICENSE`、`README.md`、`src/`、`public/` 等位于仓库根目录。`.github/workflows/ci.yml` 是隐藏目录中的工作流，使用 Git 上传时会一并包含。

如果使用命令行，先确认提交作者为希望公开的昵称和 GitHub 隐私邮箱，再初始化并提交源码。不要直接沿用本机的个人或公司邮箱。根目录 `LICENSE` 与 `package.json` 的 `license` 字段应保持一致。

不要上传个人工具配置、环境文件、私钥、个人 JSON 备份、浏览器配置目录、依赖目录、构建目录及测试输出。`.gitignore` 已排除这些常见文件；网页上传不会自动应用 `.gitignore`，请使用整理过的源码包，不要拖入整个工作目录。

## 构建可安装版本

```sh
npm ci
npm test
npm run build
```

将 `dist` 目录中的内容打包为 ZIP，并作为 GitHub Release 附件发布。ZIP 根目录需要包含 `manifest.json`。用户解压后，在 `chrome://extensions` 开启开发者模式并加载该文件夹。

需要兼容旧开发版固定 ID 时，可以运行 `npm run build:fixed-id` 并使用 `dist-fixed-id`。`extension-identity.json` 只含公钥，不是私钥或账号凭证。该构建也仅在本机保存数据；常规安装不需要固定 ID。

CI 会验证项目并上传 `toby-zh-extension` 构建附件。工作流不自动创建 Release、推送 Git 提交或发布 Chrome 应用商店。

## Chrome 应用商店

GitHub 开源与商店上架是两个独立流程。上架前还需要：

1. 确定独立的产品名称和品牌，核对图标、介绍与实际功能。
2. 提供公开可访问的隐私说明、联系渠道、权限用途和商店截图。
3. 使用商店条目的正式 ID 配置后续开发构建，保留老开发版到商店版的 JSON 备份迁移方法。
4. 验证全新安装、旧数据升级、备份导入导出和本地持久化。
5. 递增版本号并重新构建。

项目展示名为「Toby 中文版」，GitHub 仓库名为 `toby-zh`。本项目是独立实现，与其他同名产品没有隶属关系；公开分发时应清楚区分自己的版本。
