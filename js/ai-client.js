/**
 * 前端直调豆包（GitHub Pages）
 */
(function (global) {
  const TOPICS = {
    lacquer: {
      role: "平遥推光漆器讲解助手",
      style:
        "用自然口语直接回答用户问题，可充分发挥你对平遥推光漆器、漆艺与相关文化的了解。语气亲切专业，条理清楚，一般回答200～400字；不要说自己在查资料库，也不要提API或大模型。",
    },
    rishengchang: {
      role: "日升昌票号与晋商金融讲解助手",
      style:
        "用自然口语直接回答用户问题，可充分发挥你对日升昌、票号与晋商金融的了解。语气亲切专业，条理清楚，一般回答200～400字；不要说自己在查资料库，也不要提API或大模型。",
    },
    pingyao: {
      role: "平遥古城文化讲解书生",
      style:
        "以古风书生口吻直接回答用户问题，可充分发挥你对平遥古城、晋商、票号、非遗与游览的了解。亲切自然，可适当展开，一般回答200～400字；不要说“资料里没有”，不要提API或大模型。",
    },
  };

  function resolveConfig() {
    const ai = global.AI_CONFIG || {};
    const chat = global.CHAT_CONFIG || {};
    return {
      apiKey: ai.apiKey || chat.doubaoApiKey || "",
      endpointId: ai.endpointId || chat.doubaoEndpointId || "",
      apiUrl:
        ai.apiUrl ||
        "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    };
  }

  function pickContent(data) {
    const msg = data?.choices?.[0]?.message;
    if (!msg) return "";
    return (
      msg.content ||
      msg.reasoning_content ||
      (Array.isArray(msg.content) ? msg.content.map((x) => x?.text || "").join("") : "") ||
      ""
    );
  }

  async function askDoubao(question, topic = "lacquer") {
    const { apiKey, endpointId, apiUrl } = resolveConfig();
    if (!apiKey || !endpointId) {
      throw new Error("缺少豆包 API 配置（AI_CONFIG 未加载）");
    }

    const topicConfig = TOPICS[topic] || TOPICS.lacquer;
    const systemPrompt = `你是${topicConfig.role}。
${topicConfig.style}
直接依据你的知识回答，不必局限于任何本地知识库。`;

    let response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: endpointId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
          max_tokens: 900,
          temperature: 0.7,
          // 部分接入点是深度思考模型，关闭可降低失败率
          thinking: { type: "disabled" },
        }),
      });
    } catch (err) {
      console.error("豆包网络错误:", err);
      throw new Error(
        "浏览器无法完成豆包请求（常被跨域/网络拦截）。请打开 ai-test.html 查看详情。"
      );
    }

    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      console.error("Doubao API error:", response.status, rawText);
      const apiMsg = data?.error?.message || rawText.slice(0, 120);
      throw new Error(`豆包返回 ${response.status}: ${apiMsg || "未知错误"}`);
    }

    const content = pickContent(data).trim();
    if (!content) {
      console.error("Doubao empty content:", data);
      throw new Error("豆包返回了空内容");
    }
    return content;
  }

  global.askDoubao = askDoubao;
  global.__AI_DEBUG__ = function () {
    const c = resolveConfig();
    return {
      hasAsk: typeof askDoubao === "function",
      hasKey: Boolean(c.apiKey),
      keyHead: c.apiKey ? c.apiKey.slice(0, 10) + "…" : "",
      endpointId: c.endpointId,
      apiUrl: c.apiUrl,
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
