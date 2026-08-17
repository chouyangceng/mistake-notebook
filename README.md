# 拾题 · 考研错题本 1.5.2

本地优先的考研错题管理工具，包含 Windows Electron 桌面端、浏览器/PWA 版和离线优先的 Android 端。科目固定为英语、数学、822控制；政治和通用“专业课”已从产品数据模型中移除。

## 当前功能

- 错题录入、答案展开、分类修改和带确认的删除。
- 知识分类支持任意层级增删；题型与知识路径并行维护。
- 英语默认阅读、翻译、作文；数学默认高等数学、线性代数、概率论；822控制包含控制理论知识大类。
- 数学题型为选择题、填空题、大题、证明题；822控制为选择题、大题。
- 智能组卷只面向数学与822控制，可按“知识大类 × 题型”分别填写题量，生成试卷版与答案版 PDF。
- 滚动复习只负责连续浏览题目和答案，不记录“熟练/不熟练”，也不自动安排复习间隔。
- 图片/PDF 附件、本地备份、局域网令牌同步和手机离线题库。
- 手机端的题目内容与答案/解析均可独立拍照或从相册选图，拍照确认后直接进入裁剪；支持拖动、缩放、比例切换、重新裁剪和独立移除。
- 两路图片确认后压缩为 WebP 并写入手机 IndexedDB，不连接电脑也会持久保留；题目附件另支持 PDF。

## 数据与同步

- 浏览器/Electron 渲染层：错题、分类和同步设置保存在 localStorage，附件正文保存在 IndexedDB。
- Android：题目和附件保存在手机 WebView 的 IndexedDB；不连接电脑也可新增、编辑、删除、检索、复习和组卷。
- Windows 同步服务默认监听 `17332`，所有读写请求均要求随机配对令牌。
- 同步使用题目 ID、更新时间、版本号和删除墓碑合并；手机同步成功后不会删除本机副本。
- Windows 主数据、附件和组卷结果默认保存在 `E:\错题本数据`。

局域网同步使用 HTTP，仅应在可信家庭/个人局域网内使用。不要公开配对令牌或把端口直接暴露到互联网。

## 本地运行与测试

```bash
npm install
npm test
npm start
```

Windows 便携版：

```bash
npm run dist:win
```

产物位于 `release/`。构建产物、依赖目录、本机 Android SDK 路径和安装包均被 `.gitignore` 排除，不进入源码仓库。

Android 调试包：

```powershell
cd android-app
.\构建安卓APK.ps1
```

APK 内置 `mobile/` 页面，通过 AndroidX `WebViewAssetLoader` 从安全的应用资源域名加载；仅保留联网权限，不开放 `file://` 万能跨域访问。

## 在线访问

浏览器版：[https://chouyangceng.github.io/mistake-notebook-kaoyan/](https://chouyangceng.github.io/mistake-notebook-kaoyan/)

浏览器版数据按浏览器配置隔离，不会自动读取 Electron 或 Android 的本地数据库；需要时使用备份或局域网同步。
