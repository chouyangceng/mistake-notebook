# 拾题 Mac 稳定版基线

## 结论

Mac 端旧版本曾正常，当前问题属于后续共享源码变化造成的回归，不能把 Windows 端的升级结果直接当作 Mac 端新版发布。

## 最后确认可追溯的成功构建

- Git 提交：`3689633a56cd21a6db342dfd0b2783ddf42ff154`
- GitHub Actions 运行：`31305774510`
- 构建时间：2026-08-09
- Artifact：`shiti-kaoyan-macos-latest`
- DMG：`拾题考研错题本-1.1.0-arm64.dmg`
- 架构：Apple Silicon / arm64
- 大小：95,150,013 字节
- SHA-256：`AEBD2DED7A48D15A000B735E03A5596EF5A1C389F05785381C70B113F9EED7B0`

本地恢复位置：

`E:\02-陈禹成文件\代码源码\_归档\mistake-notebook\Mac稳定版-3689633\拾题考研错题本-1.1.0-arm64.dmg`

## 回归原因边界

- Windows 与 Mac 当前共用 `index.html`、`app.js`、`styles.css` 和 Electron 主进程。
- 1.1.0 成功构建之后，主分支持续加入 Windows 数据路径、分类、组卷、同步和移动端配套变化。
- GitHub 工作流在手动运行时会同时按当前提交构建 Windows、macOS、Linux，因此直接在当前 `main` 重跑会把尚未验证的共享改动带入 Mac。
- 本次 Windows 1.6.1 只在本机构建并推送源码，不创建版本标签、不手动触发跨平台工作流，所以不会覆盖稳定 Mac artifact。

## 后续修复原则

1. 从该提交和 DMG 确认 Mac 正常行为清单。
2. 逐批移植 1.1.0 之后的业务能力，每批在 Apple Silicon 真机验证。
3. 将 `E:\错题本数据` 等 Windows 固定路径改成平台感知的 `app.getPath("userData")` 或用户可选目录。
4. Mac 版通过回归前，保留旧 DMG，不发布由当前 `main` 直接生成的 Mac 包。
