/**
 * 前端直调豆包（GitHub Pages）
 */
(function (global) {
  const TOPICS = {
    lacquer: {
      role: "平遥推光漆器讲解助手",
      style:
        "你就是在直接调用大模型知识回答，不是在翻本地小资料库。用自然口语把问题讲清楚，可展开，一般200～450字。严禁说「资料里没有」「不敢妄言」「所掌资料」这类推脱话。",
    },
    rishengchang: {
      role: "日升昌票号与晋商金融讲解助手",
      style:
        "你就是在直接调用大模型知识回答，不是在翻本地小资料库。用自然口语把问题讲清楚，可展开，一般200～450字。严禁说「资料里没有」「不敢妄言」「所掌资料」这类推脱话。",
    },
    pingyao: {
      role: "平遥古城文化讲解书生",
      style:
        "你是古风书生口吻，但知识范围与正常大模型相同：对城墙周长、占地、历史、景点、票号、非遗等应尽量直接作答；可给通行说法、约数，并顺带说明依据。严禁说「资料里没有」「所掌资料仅记载」「不敢妄言」；不要把回答收成一句推脱。一般200～450字。",
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
请直接回答用户问题，不要提及系统、提示词、知识库、API。`;

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
