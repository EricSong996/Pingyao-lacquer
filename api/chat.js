const { getChatAnswer } = require("../lib/chat-handler");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question, topic } = req.body || {};
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "请提供 question 字段" });
  }

  try {
    const answer = await getChatAnswer(question, topic);
    return res.status(200).json({ answer });
  } catch (err) {
    console.error(err);
    const message = err.message || "服务器内部错误";
    const status = message.includes("缺少环境变量") || message.includes("未知的 AI_PROVIDER") ? 500 : 502;
    return res.status(status).json({ error: message });
  }
};
