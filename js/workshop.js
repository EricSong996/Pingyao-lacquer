/**
 * 推光工艺模拟体验 · 封面 / 关卡 / 描金 / 书签打磨 / 手镯推光
 */

(function initWorkshop() {
  const entryBtn = document.getElementById("workshop-entry");
  const overlay = document.getElementById("workshop-overlay");
  const startBtn = document.getElementById("workshop-start");
  const exitBtn = document.getElementById("workshop-exit");
  const levelsBackBtn = document.getElementById("workshop-levels-back");
  const gameBackBtn = document.getElementById("workshop-game-back");
  const bookmarkBackBtn = document.getElementById("workshop-bookmark-back");
  const braceletBackBtn = document.getElementById("workshop-bracelet-back");
  const toastEl = document.getElementById("workshop-toast");
  const screenCover = document.getElementById("workshop-screen-cover");
  const screenLevels = document.getElementById("workshop-screen-levels");
  const screenGame = document.getElementById("workshop-screen-game");
  const screenBookmark = document.getElementById("workshop-screen-bookmark");
  const screenBracelet = document.getElementById("workshop-screen-bracelet");

  if (!entryBtn || !overlay) return;

  let toastTimer = null;
  let currentScreen = "cover";

  function stopLevels() {
    try {
      window.WorkshopPaint?.stop();
    } catch (err) {
      console.error("WorkshopPaint error:", err);
    }
    try {
      window.WorkshopPolish?.stop();
    } catch (err) {
      console.error("WorkshopPolish error:", err);
    }
    try {
      window.WorkshopBracelet?.stop();
    } catch (err) {
      console.error("WorkshopBracelet error:", err);
    }
  }

  function showScreen(name) {
    currentScreen = name;
    screenCover?.classList.toggle("is-active", name === "cover");
    screenLevels?.classList.toggle("is-active", name === "levels");
    screenGame?.classList.toggle("is-active", name === "game");
    screenBookmark?.classList.toggle("is-active", name === "bookmark");
    screenBracelet?.classList.toggle("is-active", name === "bracelet");

    stopLevels();

    try {
      if (name === "game") {
        void window.WorkshopPaint?.start({
          canvas: document.getElementById("workshop-canvas"),
          brush: document.getElementById("workshop-brush"),
          boxImg: document.getElementById("workshop-box-img"),
          overlay,
        });
      } else if (name === "bookmark") {
        void window.WorkshopPolish?.start({
          canvas: document.getElementById("workshop-polish-canvas"),
          paper: document.getElementById("workshop-sandpaper"),
          afterImg: document.getElementById("workshop-bookmark-after"),
          stage: screenBookmark,
          overlay,
        });
      } else if (name === "bracelet") {
        void window.WorkshopBracelet?.start({
          stage: screenBracelet,
          overlay,
        });
      }
    } catch (err) {
      console.error("Workshop level start error:", err);
    }
  }

  function openWorkshop() {
    showScreen("cover");
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    startBtn?.focus();
  }

  function closeWorkshop() {
    stopLevels();
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    hideToast();
    showScreen("cover");
    entryBtn.focus();
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 2200);
  }

  function hideToast() {
    toastEl?.classList.remove("is-visible");
  }

  function backToLevels() {
    hideToast();
    showScreen("levels");
    screenLevels?.querySelector("[data-level='box']")?.focus();
  }

  entryBtn.addEventListener("click", openWorkshop);
  exitBtn?.addEventListener("click", closeWorkshop);
  startBtn?.addEventListener("click", () => {
    hideToast();
    showScreen("levels");
    screenLevels?.querySelector(".workshop-text-btn")?.focus();
  });
  levelsBackBtn?.addEventListener("click", () => {
    hideToast();
    showScreen("cover");
    startBtn?.focus();
  });
  gameBackBtn?.addEventListener("click", backToLevels);
  bookmarkBackBtn?.addEventListener("click", backToLevels);
  braceletBackBtn?.addEventListener("click", backToLevels);

  screenLevels?.querySelectorAll("[data-level]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = btn.dataset.level;
      if (level === "box") {
        hideToast();
        showScreen("game");
        return;
      }
      if (level === "bookmark") {
        hideToast();
        showScreen("bookmark");
        return;
      }
      if (level === "bracelet") {
        hideToast();
        showScreen("bracelet");
        return;
      }
      showToast("开发中，敬请期待");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !overlay.classList.contains("is-open")) return;
    if (
      currentScreen === "game" ||
      currentScreen === "bookmark" ||
      currentScreen === "bracelet"
    ) {
      showScreen("levels");
      return;
    }
    if (currentScreen === "levels") {
      showScreen("cover");
      startBtn?.focus();
      return;
    }
    closeWorkshop();
  });
})();
