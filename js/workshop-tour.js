/**
 * 车间参观：全屏视频二级页
 */

(function initWorkshopTour() {
  const entryBtn = document.getElementById("tour-entry");
  const overlay = document.getElementById("tour-overlay");
  const closeBtn = document.getElementById("tour-close");
  const video = document.getElementById("tour-video");
  if (!entryBtn || !overlay || !video) return;

  function openTour() {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // 进入后自动尝试播放；失败则等待用户点控件
    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        /* 浏览器自动播放策略限制时，保留控件让用户手动播 */
      });
    }
    closeBtn?.focus();
  }

  function closeTour() {
    video.pause();
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    // 若工坊未打开，恢复滚动
    if (!document.getElementById("workshop-overlay")?.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
    entryBtn.focus();
  }

  entryBtn.addEventListener("click", openTour);
  closeBtn?.addEventListener("click", closeTour);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!overlay.classList.contains("is-open")) return;
    // 工坊打开时优先由工坊处理 Esc
    if (document.getElementById("workshop-overlay")?.classList.contains("is-open")) return;
    closeTour();
  });
})();
