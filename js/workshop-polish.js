/**
 * 书签打磨：砂纸擦除黑色表层，露出彩色书签
 */

window.WorkshopPolish = (function createWorkshopPolish() {
  const PAPER_SIZE = 52;
  const ERASE_SIZE = 28;
  const BEFORE_SRC = "images/bookmark-before.png?v=1";
  const AFTER_SRC = "images/bookmark-after.png?v=1";
  const SFX_SRC = "audio/sanding.wav?v=3";

  let canvas;
  let ctx;
  let paperEl;
  let overlayEl;
  let stageEl;
  let afterImgEl;
  let hintEl;
  let active = false;
  let polishing = false;
  let last = null;

  let W = 0;
  let H = 0;
  let dpr = 1;

  let beforeImg = null;
  let hitMask = null;
  let hitW = 0;
  let hitH = 0;
  let drawRect = { x: 0, y: 0, w: 0, h: 0 };

  let audioCtx = null;
  let sfxBuffer = null;
  let sfxSource = null;
  let sfxGain = null;
  let sfxLoading = null;
  let htmlAudio = null;

  function coverRect(imgW, imgH, boxW, boxH) {
    const scale = Math.max(boxW / imgW, boxH / imgH);
    const w = imgW * scale;
    const h = imgH * scale;
    return {
      x: (boxW - w) / 2,
      y: (boxH - h) / 2,
      w,
      h,
    };
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function setupHtmlAudio() {
    if (htmlAudio) return htmlAudio;
    htmlAudio = new Audio(SFX_SRC);
    htmlAudio.loop = true;
    htmlAudio.preload = "auto";
    htmlAudio.volume = 0.16;
    htmlAudio.playbackRate = 0.82;
    return htmlAudio;
  }

  function loadSfx() {
    if (sfxBuffer || htmlAudio || sfxLoading) return sfxLoading;

    // file:// 下 fetch 常被拦截，直接用 Audio 元素
    if (location.protocol === "file:") {
      setupHtmlAudio();
      return Promise.resolve(htmlAudio);
    }

    const ctxAudio = ensureAudio();
    if (!ctxAudio) {
      setupHtmlAudio();
      return Promise.resolve(htmlAudio);
    }

    sfxLoading = fetch(SFX_SRC)
      .then((r) => {
        if (!r.ok) throw new Error(`sfx http ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => ctxAudio.decodeAudioData(buf))
      .then((decoded) => {
        sfxBuffer = decoded;
        return decoded;
      })
      .catch((err) => {
        console.warn("sanding sfx fetch failed, fallback to Audio:", err);
        sfxLoading = null;
        setupHtmlAudio();
        return htmlAudio;
      });
    return sfxLoading;
  }

  function startSfx() {
    if (htmlAudio && !sfxBuffer) {
      if (!htmlAudio.paused) return;
      try {
        const playPromise = htmlAudio.play();
        if (playPromise?.catch) playPromise.catch(() => {});
      } catch (_) {
        /* ignore */
      }
      return;
    }

    const ctxAudio = ensureAudio();
    if (!ctxAudio || !sfxBuffer || sfxSource) return;
    sfxGain = ctxAudio.createGain();
    sfxGain.gain.value = 0;
    sfxGain.connect(ctxAudio.destination);
    sfxSource = ctxAudio.createBufferSource();
    sfxSource.buffer = sfxBuffer;
    sfxSource.loop = true;
    sfxSource.playbackRate.value = 0.82;
    sfxSource.connect(sfxGain);
    try {
      sfxSource.start(0);
      const now = ctxAudio.currentTime;
      sfxGain.gain.cancelScheduledValues(now);
      sfxGain.gain.setValueAtTime(0, now);
      sfxGain.gain.linearRampToValueAtTime(0.16, now + 0.06);
    } catch (_) {
      sfxSource = null;
      sfxGain = null;
    }
  }

  function stopSfx() {
    if (htmlAudio) {
      try {
        htmlAudio.pause();
      } catch (_) {
        /* ignore */
      }
    }

    const ctxAudio = audioCtx;
    const source = sfxSource;
    const gain = sfxGain;
    sfxSource = null;
    sfxGain = null;
    if (!source) return;
    try {
      if (ctxAudio && gain) {
        const now = ctxAudio.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.12);
        source.stop(now + 0.13);
        setTimeout(() => {
          try {
            source.disconnect();
          } catch (_) {
            /* ignore */
          }
          try {
            gain.disconnect();
          } catch (_) {
            /* ignore */
          }
        }, 180);
        return;
      }
      source.stop();
    } catch (_) {
      /* ignore */
    }
    try {
      source.disconnect();
    } catch (_) {
      /* ignore */
    }
    try {
      gain?.disconnect();
    } catch (_) {
      /* ignore */
    }
  }

  function getPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  }

  function movePaper(clientX, clientY) {
    if (!paperEl || !overlayEl) return;
    const rect = overlayEl.getBoundingClientRect();
    const x = clientX - rect.left - PAPER_SIZE / 2;
    const y = clientY - rect.top - PAPER_SIZE / 2;
    paperEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    paperEl.classList.add("is-visible");
  }

  function isOnBookmark(x, y) {
    if (!hitMask || !drawRect.w) return false;
    const ix = Math.floor(((x - drawRect.x) / drawRect.w) * hitW);
    const iy = Math.floor(((y - drawRect.y) / drawRect.h) * hitH);
    if (ix < 0 || iy < 0 || ix >= hitW || iy >= hitH) return false;
    return hitMask[iy * hitW + ix] === 1;
  }

  function eraseAt(x, y) {
    if (!ctx) return false;
    if (!isOnBookmark(x, y)) return false;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.rect(x - ERASE_SIZE / 2, y - ERASE_SIZE / 2, ERASE_SIZE, ERASE_SIZE);
    ctx.fill();
    ctx.restore();
    return true;
  }

  function polish(clientX, clientY, force = false) {
    const p = getPos(clientX, clientY);
    let erased = false;
    if (last && !force) {
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      if (dist < 1.2) return;
      const steps = Math.max(1, Math.ceil(dist / 6));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = last.x + (p.x - last.x) * t;
        const y = last.y + (p.y - last.y) * t;
        if (eraseAt(x, y)) erased = true;
      }
    } else if (eraseAt(p.x, p.y)) {
      erased = true;
    }
    last = p;
    if (erased) startSfx();
  }

  function buildFallbackHitMap(w, h) {
    hitW = w;
    hitH = h;
    hitMask = new Uint8Array(w * h);
    const x0 = Math.floor(w * 0.42);
    const x1 = Math.floor(w * 0.58);
    const y0 = Math.floor(h * 0.05);
    const y1 = Math.floor(h * 0.97);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        hitMask[y * w + x] = 1;
      }
    }
  }

  function buildHitMap() {
    if (!beforeImg) return;
    const w = beforeImg.naturalWidth || beforeImg.width;
    const h = beforeImg.naturalHeight || beforeImg.height;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(beforeImg, 0, 0);

    let data;
    try {
      data = tctx.getImageData(0, 0, w, h).data;
    } catch (err) {
      // file:// 或跨域时画布被污染，无法读像素
      console.warn("bookmark hitmap unavailable, using geometry fallback:", err);
      buildFallbackHitMap(w, h);
      return;
    }

    hitW = w;
    hitH = h;
    hitMask = new Uint8Array(w * h);

    // 先估木质底色
    let wr = 0;
    let wg = 0;
    let wb = 0;
    let wn = 0;
    const sample = (x0, y0, x1, y1) => {
      for (let y = y0; y < y1; y += 4) {
        for (let x = x0; x < x1; x += 4) {
          const i = (y * w + x) * 4;
          wr += data[i];
          wg += data[i + 1];
          wb += data[i + 2];
          wn += 1;
        }
      }
    };
    sample(8, 8, Math.min(120, w), Math.min(80, h));
    sample(Math.max(0, w - 120), 8, w - 8, Math.min(80, h));
    if (!wn) wn = 1;
    wr /= wn;
    wg /= wn;
    wb /= wn;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const dist = Math.hypot(r - wr, g - wg, b - wb);
        const woodish =
          r > 135 && g > 100 && b > 50 && r >= b - 5 && Math.abs(r - g) < 85 && lum > 118 && dist < 70;
        // 黑色书签 + 高光：偏暗或明显偏离木色，且位于中部竖条
        const central = x > w * 0.3 && x < w * 0.7;
        const bookmark = central && !woodish && (lum < 105 || dist > 55);
        hitMask[y * w + x] = bookmark ? 1 : 0;
      }
    }
  }

  function paintBase() {
    if (!ctx || !beforeImg) return;
    drawRect = coverRect(
      beforeImg.naturalWidth || beforeImg.width,
      beforeImg.naturalHeight || beforeImg.height,
      W,
      H
    );
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(beforeImg, drawRect.x, drawRect.y, drawRect.w, drawRect.h);
  }

  function resize() {
    if (!canvas || !active) return;
    const parent = stageEl || canvas.parentElement || overlayEl;
    const rect = parent.getBoundingClientRect();
    let width = Math.floor(rect.width);
    let height = Math.floor(rect.height);
    // iframe / 本地打开时，偶发首帧尺寸为 0，回退到可视区域
    if (width < 2 || height < 2) {
      const root = overlayEl || document.documentElement;
      const rootRect = root.getBoundingClientRect?.() || { width: 0, height: 0 };
      width = Math.floor(rootRect.width || window.innerWidth || 800);
      height = Math.floor(rootRect.height || window.innerHeight || 600);
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = width;
    H = height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx = canvas.getContext("2d");
    paintBase();
  }

  function onPointerDown(e) {
    if (!active) return;
    if (e.target.closest(".workshop-game-ui")) return;
    e.preventDefault();
    polishing = true;
    last = null;
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    loadSfx();
    polish(e.clientX, e.clientY, true);
  }

  function onPointerMove(e) {
    if (!active) return;
    movePaper(e.clientX, e.clientY);
    if (polishing) polish(e.clientX, e.clientY, false);
  }

  function onPointerUp() {
    polishing = false;
    last = null;
    stopSfx();
  }

  function onPointerLeave() {
    paperEl?.classList.remove("is-visible");
    if (!polishing) stopSfx();
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

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function start(options = {}) {
    canvas = options.canvas || document.getElementById("workshop-polish-canvas");
    paperEl = options.paper || document.getElementById("workshop-sandpaper");
    overlayEl = options.overlay || document.getElementById("workshop-overlay");
    stageEl = options.stage || document.getElementById("workshop-screen-bookmark");
    afterImgEl = options.afterImg || document.getElementById("workshop-bookmark-after");
    hintEl = options.hint || document.querySelector("#workshop-screen-bookmark .workshop-game-hint");
    if (!canvas) return;

    unbind();
    stopSfx();
    active = true;
    polishing = false;
    last = null;
    overlayEl?.classList.add("is-polishing");
    if (hintEl) hintEl.textContent = "按住并拖动砂纸打磨";
    if (afterImgEl) afterImgEl.src = AFTER_SRC;

    try {
      beforeImg = await loadImage(BEFORE_SRC);
      buildHitMap();
      if (!hitMask) {
        const w = beforeImg.naturalWidth || beforeImg.width || 1024;
        const h = beforeImg.naturalHeight || beforeImg.height || 576;
        buildFallbackHitMap(w, h);
      }
    } catch (err) {
      console.error("bookmark image load failed:", err);
      return;
    }

    loadSfx();
    bind();
    // 等一帧，确保 iframe / 本地打开后布局尺寸已就绪
    requestAnimationFrame(() => {
      if (!active) return;
      resize();
      requestAnimationFrame(() => {
        if (active) resize();
      });
    });
  }

  function stop() {
    active = false;
    polishing = false;
    unbind();
    stopSfx();
    paperEl?.classList.remove("is-visible");
    overlayEl?.classList.remove("is-polishing");
  }

  return { start, stop, resize };
})();
