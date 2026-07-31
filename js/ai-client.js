/**
 * 前端直调豆包（GitHub Pages 可用，无需 Vercel / Node）
 * 依赖页面里的 AI_CONFIG（或 CHAT_CONFIG 中的 doubao 字段）
 */
(function (global) {
  const TOPICS = {
    lacquer: {
      role: "平遥推光漆器工艺专家助手",
      focus: "推光漆器的历史、工艺、特点与传承",
      brevity: "语气亲切、专业、简洁。",
      knowledge: `
## 平遥推光漆器概述
推光漆器是山西省平遥县特有的传统手工艺，因用手掌推磨漆面至光亮如镜而得名。
2006年5月20日，平遥推光漆器髹饰技艺经国务院批准列入第一批国家级非物质文化遗产名录。

## 历史渊源
推光漆器始于唐开元年间，盛于明清。平遥地处晋商重镇，漆器随商贸流通远销海内外。
历史上平遥漆器与北京雕漆、福州脱胎漆器并称中国漆器三大流派。

## 制作工艺（主要步骤）
1. 选料制胎：选用梨木、松木等优质木材，或竹篾、纸胎等，经锯、刨、凿制成胎体。
2. 裱褙：在胎体上裱夏布，使胎体更加牢固，防止开裂。
3. 髹漆：以天然大漆（生漆）为主，加入砖灰、麻绳等作为漆灰，反复涂刷、打磨，通常需数十遍。
4. 推光：核心工序。用手掌心蘸细砖灰、人头发、麻油等，反复推磨漆面，直至光亮如镜。
5. 装饰：推光后进行描金、彩绘、堆鼓、镶嵌等装饰，题材多为山水、花鸟、人物故事。

## 推光工艺详解
- 使用人手掌心推磨，而非机械抛光
- 推光材料包括：细砖灰、头发、麻油、瓦灰等
- 需反复推磨数百次甚至上千次
- 推光后漆面硬度高、光泽度好、手感温润

## 主要特点
漆面光洁如镜；色彩以红、黑、金为主；防潮耐腐、不变形；兼具实用与艺术价值；制作周期长。
`,
    },
    rishengchang: {
      role: "日升昌票号与晋商金融文化讲解助手",
      focus: "日升昌票号的历史背景、经营理念、汇兑运转流程与文化意义",
      brevity: "语气亲切、专业、简洁。",
      knowledge: `
## 日升昌票号概述
日升昌票号创办于清道光年间（约1823/1824年），总号设在山西平遥古城西大街。
它是中国最早专营异地汇兑业务的票号之一，被看作中国近代银行业的重要源头。
以“汇通天下”著称，旧址今为中国票号博物馆。

## 核心经营理念
以汇票贯通商路，以信誉立号。强调诚信为本，靠严密号规与账法维持跨地域兑付信用。

## 运转流程（五步）
1. 交银开票 2. 开出汇票 3. 持票赴外 4. 异地兑付 5. 号内清算
核心是“以票代现”，银两不必随人同行。

## 文化意义
代表晋商金融智慧，促进全国商贸流通，是理解中国传统金融史与平遥晋商文化的重要窗口。
`,
    },
    pingyao: {
      role: "平遥古城文化讲解书生",
      focus: "平遥古城的历史、格局、晋商票号、主要景点与地方非遗",
      brevity: "回答请像古风书生口述讲解，亲切简洁，控制在120字以内。",
      knowledge: `
## 平遥古城概述
平遥古城位于山西省晋中市平遥县，是中国现存最完整的明清古县城之一。
1997年与周边双林寺、镇国寺等共同列入世界文化遗产名录。

## 城墙与格局
古城呈方形，周长约6公里，明洪武三年扩建定型。城内以南北大街为轴线，街巷纵横、商号林立。

## 晋商与票号
明清平遥为晋商重镇，日升昌开创中国银行业先河，旧址今为中国票号博物馆。

## 主要景点
古城墙、县衙、城隍庙、日升昌票号、文庙、清虚观，以及推光漆器相关工坊与博物馆。

## 非遗
平遥推光漆器髹饰技艺为国家级非遗，漆面推光如镜。
`,
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

  async function askDoubao(question, topic = "lacquer") {
    const { apiKey, endpointId, apiUrl } = resolveConfig();
    if (!apiKey || !endpointId) {
      throw new Error("缺少豆包 API 配置（AI_CONFIG）");
    }

    const topicConfig = TOPICS[topic] || TOPICS.lacquer;
    const systemPrompt = `你是${topicConfig.role}，专门解答关于${topicConfig.focus}的问题。
请基于以下知识资料回答，${topicConfig.brevity}如果问题超出资料范围，请诚实说明，不要编造。
资料：
${topicConfig.knowledge}`;

    const response = await fetch(apiUrl, {
      method: "POST",
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
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Doubao API error:", err);
      throw new Error("AI 服务暂时不可用");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "抱歉，未能生成回答。";
  }

  global.askDoubao = askDoubao;
})(typeof window !== "undefined" ? window : globalThis);
