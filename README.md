# 平遥推光漆器 · 社会实践专题网站

滚屏展示社会实践照片 + 右侧 AI 悬浮问答窗口。

## 功能

- 滚屏照片展示、章节导航、AI 答疑（支持豆包大模型）

## 本地预览（仅页面，模拟 AI）

双击打开 `index.html`，或运行本地服务器（见下方）。

## 接入豆包 AI（无需 Vercel，推荐）

### 方式一：本地 Node 服务器（最简单）

1. 安装 [Node.js](https://nodejs.org)（LTS 版本）
2. 复制 `.env.example` 为 `.env`，填入火山方舟配置：
   ```
   AI_PROVIDER=doubao
   DOUBAO_API_KEY=你的API_Key
   DOUBAO_ENDPOINT_ID=ep-你的接入点ID
   ```
3. 在项目目录运行：
   ```
   node server.js
   ```
4. 浏览器打开 http://localhost:3000
5. 修改 `js/config.js`：`mockMode: false`

> 答辩演示时在本机运行 `node server.js` 即可，无需部署 Vercel。

### 火山方舟申请步骤

1. 登录 https://console.volcengine.com/ark
2. 实名认证 → 创建 API Key
3. 开通豆包模型 → 创建推理接入点（cn-beijing）
4. 复制 API Key 和 Endpoint ID（ep- 开头）

---

## 其他部署方式（都不用 Vercel）

| 方案 | 网站 | AI 接口 | 说明 |
|------|------|---------|------|
| **本地服务器** | `node server.js` | 同端口 | 答辩演示首选 |
| **GitHub Pages + 本地 API** | GitHub Pages | 本机 `node server.js` | 页面在线，AI 仅本地 |
| **学校/云服务器** | 上传项目，运行 `node server.js` | 同服务器 | 需公网 IP 或内网演示 |
| **腾讯云/阿里云函数** | GitHub Pages | 云函数 URL | 国内访问快，需额外配置 |
| **仅静态演示** | GitHub Pages | 无 | `mockMode: true`，预设回答 |

### GitHub Pages 部署（纯静态）

Settings → Pages → Source 选 `main` 分支。

> GitHub Pages **不能**运行后端 API。若只用 GitHub Pages，AI 需保持 `mockMode: true`，或另找服务器跑 `server.js` 并在 `config.js` 中填写 API 地址。

---

## 替换照片与文字

- 照片放入 `images/`（photo-01.jpg ~ photo-08.jpg）
- 文字修改 `js/config.js` 中的 `PHOTOS` 数组

## 项目结构

```
├── index.html          主页面
├── server.js           本地服务器（不用 Vercel 时运行这个）
├── lib/chat-handler.js AI 核心逻辑
├── api/chat.js         Vercel 部署用（可选）
├── js/config.js        照片、文字、AI 配置
└── .env.example        API Key 配置模板
```
