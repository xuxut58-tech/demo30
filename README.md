# DurianVault — 冻榴莲肉多工厂库存协同系统（GitHub Pages 静态网页版）

基于 **React + Vite + Tailwind CSS + Firebase (Firestore & Auth)** 构建的纯静态网页应用，可直接部署到 **GitHub Pages**，并支持十余座海外冻榴莲肉加工厂跨设备实时同步库存与总部核算单价。

## 部署与启用步骤

1. **在 Firebase 控制台开启「电子邮件/密码（Email/Password）」登录（必做）**
   - 打开 [Firebase Console](https://console.firebase.google.com/)，进入项目 `aesthetic-droplet-xflln`。
   - 前往 **Authentication → Sign-in method**，点击 **Add new provider → Email/Password**，开启第一项 **Email/Password** 开关并保存（用于支持主账号 `admin` 与各工厂独立账号密码登录）。
2. **添加 GitHub Pages 授权域名**
   - 在 Firebase Console 前往 **Authentication → Settings → Authorized domains**，点击 **Add domain**，填入 `<你的用户名>.github.io`。
3. **上传代码到 GitHub 并开启 GitHub Pages**
   - 将本项目代码推送到 GitHub 仓库的 `main` 分支。
   - 打开仓库 **Settings → Pages**，在 **Build and deployment → Source** 中选择 **GitHub Actions**。
   - `.github/workflows/deploy.yml` 会自动执行构建并发布上线（访问地址通常为 `https://<你的用户名>.github.io/<仓库名>/`）。
4. **首次打开设置主账号密码**
   - 首次访问页面会自动引导您为总部主账号（用户名 `admin`）设置登录密码，完成初始化后即自动生成 5 个冻榴莲肉级别与 12 个示例工厂，随后在后台 **「工厂账号管理」** 为各工厂设置独立密码即可分配给各厂使用。

## 本地开发运行

```bash
npm install
npm run dev
```
