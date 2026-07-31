/**
 * 平遥古城地图交互
 * - 悬停：景点区域微放大（镜头层对齐底图裁切）
 * - 已开放景点：苹果风平滑开合过渡
 */

const SPOT_META = {
  museum: {
    title: "平遥推光漆器博物馆",
    ready: true,
    url: "lacquer.html",
  },
  rishengchang: {
    title: "日升昌票号",
    ready: true,
    url: "rishengchang.html",
  },
  yamen: {
    title: "县衙",
    ready: false,
  },
  chenghuang: {
    title: "城隍庙",
    ready: false,
  },
};

const OVERLAY_MS = 620;

const mapPage = document.getElementById("map-page");
const mapStage = document.getElementById("map-stage");
const overlay = document.getElementById("spot-overlay");
const frame = document.getElementById("spot-frame");
const closeBtn = document.getElementById("spot-close");
const toastEl = document.getElementById("map-toast");
const titleEl = document.querySelector(".spot-overlay__title");
const hotspots = [...document.querySelectorAll(".map-hotspot")];

let toastTimer = null;
let overlayBusy = false;
let closeTimer = null;

function parsePercent(value) {
  return parseFloat(String(value).replace("%", "")) / 100;
}

function syncHotspotLenses() {
  if (!mapStage) return;
  const stageW = mapStage.clientWidth;
  const stageH = mapStage.clientHeight;

  hotspots.forEach((btn) => {
    const lens = btn.querySelector(".map-hotspot__lens");
    if (!lens) return;

    const styles = getComputedStyle(btn);
    const x = parsePercent(styles.getPropertyValue("--x"));
    const y = parsePercent(styles.getPropertyValue("--y"));

    lens.style.backgroundSize = `${stageW}px ${stageH}px`;
    lens.style.backgroundPosition = `${-x * stageW}px ${-y * stageH}px`;
  });
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("is-visible");
    setTimeout(() => {
      toastEl.hidden = true;
    }, 400);
  }, 2200);
}

function openSpot(meta) {
  if (overlayBusy || overlay.classList.contains("is-open")) return;
  overlayBusy = true;

  if (titleEl) titleEl.textContent = meta.title;

  clearTimeout(closeTimer);
  overlay.classList.remove("is-closing");
  mapPage?.classList.add("is-recessed");
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    frame.src = meta.url;
  });

  window.setTimeout(() => {
    overlayBusy = false;
    closeBtn?.focus();
  }, OVERLAY_MS);
}

function closeOverlay() {
  if (overlayBusy || !overlay.classList.contains("is-open")) return;
  overlayBusy = true;

  overlay.classList.add("is-closing");
  overlay.classList.remove("is-open");
  mapPage?.classList.remove("is-recessed");
  overlay.setAttribute("aria-hidden", "true");

  clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    overlay.classList.remove("is-closing");
    frame.src = "about:blank";
    document.body.style.overflow = "";
    overlayBusy = false;
  }, OVERLAY_MS);
}

function onHotspotClick(event) {
  const btn = event.currentTarget;
  const id = btn.dataset.spot;
  const meta = SPOT_META[id];
  if (!meta) return;

  if (meta.ready && meta.url) {
    openSpot(meta);
    return;
  }

  showToast(`「${meta.title}」专题即将开放，敬请期待`);
}

hotspots.forEach((btn) => {
  btn.addEventListener("click", onHotspotClick);
});

closeBtn?.addEventListener("click", closeOverlay);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeOverlay();
  }
});

window.addEventListener("message", (event) => {
  if (
    event.data === "close-spot-overlay" ||
    event.data === "close-lacquer-overlay"
  ) {
    closeOverlay();
  }
});

const mapImage = document.getElementById("map-image");
if (mapImage?.complete) {
  syncHotspotLenses();
} else {
  mapImage?.addEventListener("load", syncHotspotLenses, { once: true });
}

window.addEventListener("resize", () => {
  window.requestAnimationFrame(syncHotspotLenses);
});

if (typeof ResizeObserver !== "undefined" && mapStage) {
  new ResizeObserver(() => syncHotspotLenses()).observe(mapStage);
}
