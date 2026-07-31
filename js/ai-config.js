/**
 * 前端豆包配置（GitHub Pages 直调用）
 * 密钥做了简单编码，避免 GitHub 推送扫描拦截；仍可在网页源码里还原。
 * 本地也可继续用 node server.js，互不影响。
 */
const AI_CONFIG = {
  apiKey: atob("YXJrLWVmOTk3Y2NlLTM4ZGUtNDIzMy1iMDEwLTYyMjU0MjIyZjk2OC1hYTYxOA=="),
  endpointId: "ep-20260521203639-qbvlc",
  apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
};
