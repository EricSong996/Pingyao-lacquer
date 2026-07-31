/**
 * 前端直调豆包（GitHub Pages）
 */
(function (global) {
  const TOPICS = {
    lacquer: {
      role: "平遥推光漆器工艺专家助手",
      focus: "推光漆器的历史、工艺、特点与传承",
      brevity: "语气亲切、专业，回答充实一些，一般150～280字。",
      knowledge: `推光漆器是山西平遥传统手工艺，因用手掌推磨漆面至光亮如镜得名，2006年列入国家级非遗。始于唐、盛于明清，与北京雕漆、福州脱胎并称中国漆器三大流派。主要工序包括选料制胎、裱布挂灰、荫房荫干、髹漆、推光、描金彩绘等。推光用掌心蘸细砖灰、人发、麻油等反复推磨。成品漆面如镜，红黑金为主，防潮耐腐，制作周期长。`,
    },
    rishengchang: {
      role: "日升昌票号讲解助手",
      focus: "日升昌历史、汇兑流程与晋商金融",
      brevity: "语气亲切、专业，回答充实一些，一般150～280字。",
      knowledge: `日升昌创办于清道光年间，总号在平遥西大街，中国最早专营异地汇兑的票号之一，旧址今为中国票号博物馆，以汇通天下闻名。核心理念是以票代现、信誉立号。运转大致为：交银开票→开出汇票→持票赴外→异地兑付→号内清算。`,
    },
    pingyao: {
      role: "平遥古城文化讲解书生",
      focus: "平遥古城历史、格局、晋商票号、景点与地方非遗",
      brevity: "像古风书生口述讲解，亲切自然，一般180～320字，可适当展开。",
      knowledge: `平遥古城位于山西省晋中市平遥县，是中国现存最完整的明清古县城之一。1997年与双林寺、镇国寺等列入世界文化遗产。城墙呈方形，周长约6公里，明洪武三年扩建定型，高约12米，有瓮城、角楼、奎星楼等。城内按龟城意象布局，南北大街为轴线。明清为晋商重镇、票号发源地，日升昌开创中国银行业先河。主要景点：古城墙、县衙、城隍庙、日升昌（票号博物馆）、文庙、清虚观、推光漆器工坊与博物馆等。地方特色含推光漆器非遗、平遥牛肉等。游览宜步行南大街、西大街、东大街与城墙。`,
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
    const systemPrompt = `你是${topicConfig.role}，负责讲解${topicConfig.focus}。
${topicConfig.brevity}
下面是参考资料，请优先采用；若访客问到资料未写明、但属于平遥/晋商/漆器常识范围内的内容，可用你掌握的可靠知识补充回答，不要动辄说“资料没有”。
只有完全无关或无法确认的内容，才温和说明不确定。
不要提及“系统提示”“大模型”“API”等字样。
参考资料：
${topicConfig.knowledge}`;

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
