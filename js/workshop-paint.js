/**
 * 漆器盒描金（简化版）
 * 单击 / 拖动即可留下金色字迹，不做痕迹判定
 */

window.WorkshopPaint = (function createWorkshopPaint() {
  // 毛笔图 421×492，显示 150×175，橙金笔尖约 (13,482)
  const TIP_OFFSET = { x: 5, y: 171 };
  const STROKE = 4.2;

  let canvas;
  let ctx;
  let brushEl;
  let overlayEl;
  let active = false;
  let painting = false;
  let last = null;

  let W = 0;
  let H = 0;
  let dpr = 1;

  function getPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  }

  function moveBrush(clientX, clientY) {
    if (!brushEl || !overlayEl) return;
    const rect = overlayEl.getBoundingClientRect();
    brushEl.style.transform = `translate3d(${clientX - rect.left - TIP_OFFSET.x}px, ${
      clientY - rect.top - TIP_OFFSET.y
    }px, 0)`;
    brushEl.classList.add("is-visible");
  }

  function paintDab(x, y, angle = -0.55) {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(x, y);
    ctx.rotate(angle);

    const grd = ctx.createLinearGradient(0, -5, 0, 6);
    grd.addColorStop(0, "rgba(255, 240, 180, 0.95)");
    grd.addColorStop(0.45, "rgba(232, 197, 71, 0.95)");
    grd.addColorStop(1, "rgba(184, 134, 11, 0.75)");

    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, 0, STROKE * 0.45, STROKE * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintStroke(x0, y0, x1, y1) {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(232, 197, 71, 0.95)";
    ctx.lineWidth = STROKE;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 240, 190, 0.55)";
    ctx.lineWidth = STROKE * 0.35;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function tryPaint(clientX, clientY, force = false) {
    const p = getPos(clientX, clientY);
    if (last && !force) {
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      if (dist < 0.8) return;
      const steps = Math.max(1, Math.ceil(dist / 2));
      for (let i = 1; i <= steps; i++) {
        const t0 = (i - 1) / steps;
        const t1 = i / steps;
        const x0 = last.x + (p.x - last.x) * t0;
        const y0 = last.y + (p.y - last.y) * t0;
        const x1 = last.x + (p.x - last.x) * t1;
        const y1 = last.y + (p.y - last.y) * t1;
        paintStroke(x0, y0, x1, y1);
      }
      last = p;
      return;
    }
    paintDab(p.x, p.y, -0.55 + (Math.random() - 0.5) * 0.3);
    last = p;
  }

  function resize(preserve = true) {
    if (!canvas || !active) return;
    const parent = canvas.parentElement || overlayEl;
    const rect = parent.getBoundingClientRect();
    let width = Math.floor(rect.width);
    let height = Math.floor(rect.height);
    if (width < 2 || height < 2) {
      width = Math.floor(window.innerWidth || 800);
      height = Math.floor(window.innerHeight || 600);
    }

    let prev = null;
    if (preserve && ctx && canvas.width > 1 && canvas.height > 1) {
      prev = document.createElement("canvas");
      prev.width = canvas.width;
      prev.height = canvas.height;
      prev.getContext("2d").drawImage(canvas, 0, 0);
    }

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = width;
    H = height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (prev) ctx.drawImage(prev, 0, 0, canvas.width, canvas.height);
  }

  function onPointerDown(e) {
    if (!active) return;
    if (e.target.closest(".workshop-game-ui")) return;
    e.preventDefault();
    painting = true;
    last = null;
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    tryPaint(e.clientX, e.clientY, true);
  }

  function onPointerMove(e) {
    if (!active) return;
    moveBrush(e.clientX, e.clientY);
    if (painting) tryPaint(e.clientX, e.clientY, false);
  }

  function onPointerUp() {
    painting = false;
    last = null;
  }

  function onPointerLeave() {
    brushEl?.classList.remove("is-visible");
  }

  function bind() {
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", resize);
  }

  function unbind() {
    if (!canvas) return;
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("resize", resize);
  }

  function start(options = {}) {
    canvas = options.canvas || document.getElementById("workshop-canvas");
    brushEl = options.brush || document.getElementById("workshop-brush");
    overlayEl = options.overlay || document.getElementById("workshop-overlay");
    const boxImgEl = options.boxImg || document.getElementById("workshop-box-img");
    if (!canvas) return;

    // 强制刷新盒子贴图，避免浏览器继续用旧缓存（带残留金色的图）
    if (boxImgEl) {
      const raw = (boxImgEl.getAttribute("src") || boxImgEl.src || "").split("?")[0];
      if (raw) boxImgEl.src = `${raw}?v=${Date.now()}`;
    }

    unbind();
    active = true;
    painting = false;
    last = null;
    bind();
    // 进入关卡时不保留上一局笔迹
    resize(false);
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    overlayEl?.classList.add("is-painting");
  }

  function stop() {
    active = false;
    painting = false;
    unbind();
    brushEl?.classList.remove("is-visible");
    overlayEl?.classList.remove("is-painting");
  }

  return { start, stop, resize };
})();
