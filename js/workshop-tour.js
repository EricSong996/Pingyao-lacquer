/**
 * 车间参观：3D 漫游为主，原片视频可选
 */

(function initWorkshopTour() {
  const entryBtn = document.getElementById("tour-entry");
  const overlay = document.getElementById("tour-overlay");
  const closeBtn = document.getElementById("tour-close");
  const stage3d = document.getElementById("tour-3d");
  const video = document.getElementById("tour-video");
  const hint = document.getElementById("tour-hint");
  const btn3d = document.getElementById("tour-mode-3d");
  const btnVideo = document.getElementById("tour-mode-video");
  if (!entryBtn || !overlay || !stage3d) return;

  let tour3d = null;
  let mode = "3d";

  function setMode(next) {
    mode = next;
    const is3d = mode === "3d";
    stage3d.hidden = !is3d;
    if (video) video.hidden = is3d;
    if (hint) hint.hidden = !is3d;
    btn3d?.classList.toggle("is-active", is3d);
    btnVideo?.classList.toggle("is-active", !is3d);
    if (!is3d) {
      tour3d?.stop();
      tour3d = null;
      if (document.pointerLockElement) document.exitPointerLock?.();
    }
  }

  async function ensure3d() {
    if (!globalThis.Workshop3D) return;
    if (!tour3d) tour3d = new Workshop3D(stage3d);
    await tour3d.start();
  }

  async function openTour() {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setMode("3d");
    try {
      await ensure3d();
    } catch (err) {
      console.error(err);
      setMode("video");
    }
    closeBtn?.focus();
  }

  function closeTour() {
    tour3d?.stop();
    tour3d = null;
    if (document.pointerLockElement) document.exitPointerLock?.();
    video?.pause();
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    if (!document.getElementById("workshop-overlay")?.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
    entryBtn.focus();
  }

  entryBtn.addEventListener("click", () => {
    openTour();
  });
  closeBtn?.addEventListener("click", closeTour);
  btn3d?.addEventListener("click", async () => {
    setMode("3d");
    video?.pause();
    try {
      await ensure3d();
    } catch (err) {
      console.error(err);
    }
  });
  btnVideo?.addEventListener("click", () => {
    setMode("video");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!overlay.classList.contains("is-open")) return;
    if (document.getElementById("workshop-overlay")?.classList.contains("is-open")) return;
    // 指针锁定时先由 3D 退出锁定；再按一次退出参观
    if (document.pointerLockElement) return;
    closeTour();
  });
})();
