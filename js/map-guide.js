/**
 * 主地图 · 古风书生 AI 向导
 */

(function initMapGuide() {
  const WELCOME = "关于平遥古城，你有什么想问的吗？";
  const THINKING = "思考中...";
  const API_URL = "/api/chat";
  const TOPIC = "pingyao";

  const MOCK_ANSWERS = {
    古城: "平遥古城是中国现存最完整的明清古县城之一，1997年列入世界文化遗产，城墙、街巷与商号格局保存完好。",
    城墙: "平遥城墙周长约六公里，明洪武年间扩建定型，可登城俯瞰全城，是古城标志性防御工程。",
    票号: "平遥是晋商票号发源地，日升昌开创中国近代银行业先河，旧址今为中国票号博物馆。",
    日升昌: "日升昌创办于清道光年间，以“汇通天下”闻名，是中国最早专营异地汇兑的票号之一。",
    县衙: "平遥县衙是国内保存较完整的古代县级官署建筑群之一，可感受明清地方行政风貌。",
    漆器: "平遥推光漆器是国家级非遗，以手掌推磨漆面至光亮如镜著称，可在地图上进入博物馆专题了解。",
    景点: "建议游古城墙、南大街、西大街、县衙、城隍庙与日升昌票号，步行最能感受晋商街市气息。",
    晋商: "明清平遥为晋商重镇，商贸与票号发达，城内商号林立，是理解晋商文化的重要窗口。",
  };

  const root = document.getElementById("map-guide");
  const bubbleEl = document.getElementById("map-guide-bubble");
  const inputEl = document.getElementById("map-guide-input");
  const sendBtn = document.getElementById("map-guide-send");
  if (!root || !bubbleEl || !inputEl || !sendBtn) return;

  let loading = false;

  function setBubble(text, mode = "") {
    bubbleEl.textContent = text;
    bubbleEl.dataset.mode = mode;
    bubbleEl.scrollTop = 0;
  }

  function mockReply(question) {
    for (const [key, answer] of Object.entries(MOCK_ANSWERS)) {
      if (question.includes(key)) return answer;
    }
    return "平遥古城集城墙、晋商票号与非遗漆艺于一身。您可以问问城墙、日升昌、县衙或推光漆器～";
  }

  async function fetchReply(question) {
    if (typeof askDoubao === "function") {
      return await askDoubao(question, TOPIC);
    }
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
    return mockReply(question);
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!text || loading) return;

    loading = true;
    sendBtn.disabled = true;
    inputEl.value = "";
    setBubble(THINKING, "thinking");

    try {
      const answer = await fetchReply(text);
      setBubble(answer, "answer");
    } catch (_) {
      setBubble(
        "连不上豆包。若开着全局梯子，请关掉或把 volces.com 设为直连后再问。",
        "error"
      );
    } finally {
      loading = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  const form = document.getElementById("map-guide-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });

  setBubble(WELCOME, "welcome");
})();
