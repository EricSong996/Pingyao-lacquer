/**
 * AI 悬浮聊天窗逻辑
 * 依赖页面中的 CHAT_CONFIG（可含 topic / 文案 / 推荐问题）
 */

class ChatWidget {
  constructor() {
    this.isOpen = false;
    this.isLoading = false;
    this.messages = [];

    this.toggleBtn = document.getElementById("chat-toggle");
    this.panel = document.getElementById("chat-panel");
    this.closeBtn = document.getElementById("chat-close");
    this.messagesEl = document.getElementById("chat-messages");
    this.inputEl = document.getElementById("chat-input");
    this.sendBtn = document.getElementById("chat-send");
    this.quickEl = document.getElementById("chat-quick");

    this.applyBranding();
    this.bindEvents();
    this.renderQuickQuestions();
    this.addBotMessage(
      CHAT_CONFIG.welcome ||
        "您好！我是 AI 助手，可以为您答疑解惑。请随意提问！"
    );
  }

  applyBranding() {
    const avatar = this.panel?.querySelector(".chat-panel__avatar");
    const title = this.panel?.querySelector(".chat-panel__title");
    const subtitle = this.panel?.querySelector(".chat-panel__subtitle");
    if (avatar && CHAT_CONFIG.avatar) avatar.textContent = CHAT_CONFIG.avatar;
    if (title && CHAT_CONFIG.title) title.textContent = CHAT_CONFIG.title;
    if (subtitle && CHAT_CONFIG.subtitle) {
      subtitle.textContent = CHAT_CONFIG.subtitle;
    }
  }

  bindEvents() {
    this.toggleBtn.addEventListener("click", () => this.open());
    this.closeBtn.addEventListener("click", () => this.close());
    this.sendBtn.addEventListener("click", () => this.send());
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
    this.inputEl.addEventListener("input", () => {
      requestAnimationFrame(() => {
        this.inputEl.style.height = "auto";
        this.inputEl.style.height =
          Math.min(this.inputEl.scrollHeight, 80) + "px";
      });
    });
    this.quickEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".quick-btn");
      if (!btn) return;
      this.inputEl.value = btn.dataset.q;
      this.send();
    });
  }

  renderQuickQuestions() {
    this.quickEl.innerHTML = (CHAT_CONFIG.quickQuestions || [])
      .map((q) => `<button class="quick-btn" data-q="${q}">${q}</button>`)
      .join("");
  }

  open() {
    this.isOpen = true;
    this.panel.classList.add("open");
    this.toggleBtn.classList.add("hidden");
    this.inputEl.focus();
  }

  close() {
    this.isOpen = false;
    this.panel.classList.remove("open");
    this.toggleBtn.classList.remove("hidden");
  }

  addMessage(text, role) {
    const div = document.createElement("div");
    div.className = `message message--${role}`;
    div.textContent = text;
    this.messagesEl.appendChild(div);
    this.scrollToBottom();
    return div;
  }

  addBotMessage(text) {
    return this.addMessage(text, "bot");
  }

  addUserMessage(text) {
    return this.addMessage(text, "user");
  }

  showTyping() {
    const div = document.createElement("div");
    div.className = "message message--typing";
    div.id = "typing-indicator";
    div.innerHTML = "<span></span><span></span><span></span>";
    this.messagesEl.appendChild(div);
    this.scrollToBottom();
  }

  hideTyping() {
    document.getElementById("typing-indicator")?.remove();
  }

  scrollToBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  async send() {
    const text = this.inputEl.value.trim();
    if (!text || this.isLoading) return;

    this.inputEl.value = "";
    this.inputEl.style.height = "auto";
    this.addUserMessage(text);
    this.isLoading = true;
    this.sendBtn.disabled = true;
    this.showTyping();

    try {
      const reply = await this.fetchReply(text);
      this.hideTyping();
      this.addBotMessage(reply);
    } catch (err) {
      this.hideTyping();
      const errDiv = document.createElement("div");
      errDiv.className = "message message--error";
      const raw = String(err?.message || err || "");
      console.error("AI 问答失败:", err);
      if (/Failed to fetch|NetworkError|Load failed|网络|跨域/i.test(raw)) {
        errDiv.textContent =
          "豆包请求被浏览器拦截。请打开 ai-test.html 看具体原因（不一定是梯子）。";
      } else if (/缺少豆包|未加载|配置/i.test(raw)) {
        errDiv.textContent = "AI 配置未加载，请强制刷新（Cmd+Shift+R）。";
      } else {
        errDiv.textContent = raw || "暂时无法获取回答";
      }
      this.messagesEl.appendChild(errDiv);
      this.scrollToBottom();
    } finally {
      this.isLoading = false;
      this.sendBtn.disabled = false;
    }
  }

  getMockReply(question) {
    const answers = CHAT_CONFIG.mockAnswers || {};
    for (const [key, answer] of Object.entries(answers)) {
      if (question.includes(key) || key.includes(question.slice(0, 4))) {
        return answer;
      }
    }
    if (typeof getMockAnswer === "function") {
      return getMockAnswer(question);
    }
    return (
      CHAT_CONFIG.mockFallback ||
      "感谢您的提问！请稍后再试，或换一个相关问题。"
    );
  }

  resolveApiUrl() {
    const raw = CHAT_CONFIG.apiUrl || "/api/chat";
    // 双击打开 html（file://）时，相对路径 /api/chat 无法到达本地 Node 服务
    if (location.protocol === "file:" && raw.startsWith("/")) {
      return `http://localhost:3000${raw}`;
    }
    return raw;
  }

  async fetchReply(question) {
    if (CHAT_CONFIG.mockMode) {
      await delay(800 + Math.random() * 600);
      return this.getMockReply(question);
    }

    const topic = CHAT_CONFIG.topic || "lacquer";

    // GitHub Pages 必须走前端直调；不要回退到 /api/chat（项目页路径会错）
    if (typeof askDoubao !== "function") {
      throw new Error("AI 脚本未加载（askDoubao 不存在），请强制刷新");
    }
    return await askDoubao(question, topic);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

document.addEventListener("DOMContentLoaded", () => {
  new ChatWidget();
});
