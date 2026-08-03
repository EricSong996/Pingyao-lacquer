/**
 * 车间参观：3D 漫游
 */

(function initWorkshopTour() {
  const entryBtn = document.getElementById("tour-entry");
  const overlay = document.getElementById("tour-overlay");
  const closeBtn = document.getElementById("tour-close");
  const stage3d = document.getElementById("tour-3d");
  if (!entryBtn || !overlay || !stage3d) return;

  let tour3d = null;

  async function ensure3d() {
    if (!globalThis.Workshop3D) return;
    if (!tour3d) tour3d = new Workshop3D(stage3d);
    await tour3d.start();
  }

  async function openTour() {
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    try {
      await ensure3d();
    } catch (err) {
      console.error(err);
    }
    closeBtn?.focus();
  }

  function closeTour() {
    tour3d?.stop();
    tour3d = null;
    if (document.pointerLockElement) document.exitPointerLock?.();
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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!overlay.classList.contains("is-open")) return;
    if (document.getElementById("workshop-overlay")?.classList.contains("is-open")) return;
    // 指针锁定时先由 3D 退出锁定；再按一次退出参观
    if (document.pointerLockElement) return;
    closeTour();
  });
})();
