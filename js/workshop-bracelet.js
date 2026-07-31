/**
 * 手镯推光
 * 右键切换：移动沾粉 ↔ 砂纸打磨
 * 起始为干净手镯；拖入碗中逐渐沾粉；打磨露出更亮版本
 */

window.WorkshopBracelet = (function createWorkshopBracelet() {
  const META = {
    imgW: 1024,
    imgH: 575,
    placeX: 628,
    placeY: 199,
    braceletW: 198,
    braceletH: 195,
    bowl: { x0: 154, y0: 119, x1: 479, y1: 420 },
  };

  const PAPER_SIZE = 48;
  const ERASE = 22;
  const DIP_STRENGTH = 0.035;
  const SFX = {
    powder: "audio/powder.wav?v=2",
    sand: "audio/bracelet-sand.wav?v=1",
  };

  let overlayEl;
  let stageEl;
  let deskEl;
  let pieceEl;
  let shinyEl;
  let dustCanvas;
  let dustCtx;
  let paperEl;
  let hintEl;
  let modeEl;
  let active = false;
  let mode = "move";
  let dragging = false;
  let polishing = false;
  let last = null;
  let offset = { x: 0, y: 0 };
  let piecePos = { x: 0, y: 0 };
  let pieceSize = { w: 0, h: 0 };
  let drawRect = { x: 0, y: 0, w: 0, h: 0 };
  let dustyImg = null;
  let dustStamp = null;
  let dipCooldown = 0;

  let audioCtx = null;
  const sfxState = {
    powder: { buffer: null, source: null, gain: null, html: null, loading: null },
    sand: { buffer: null, source: null, gain: null, html: null, loading: null },
  };

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function setupHtmlAudio(kind) {
    const st = sfxState[kind];
    if (st.html) return st.html;
    st.html = new Audio(SFX[kind]);
    st.html.loop = true;
    st.html.preload = "auto";
    st.html.volume = kind === "powder" ? 1.0 : 0.15;
    st.html.playbackRate = kind === "powder" ? 0.88 : 0.8;
    return st.html;
  }

  function loadOneSfx(kind) {
    const st = sfxState[kind];
    if (st.buffer || st.html || st.loading) return st.loading;
    if (location.protocol === "file:") {
      setupHtmlAudio(kind);
      return Promise.resolve(st.html);
    }
    const ctx = ensureAudio();
    if (!ctx) {
      setupHtmlAudio(kind);
      return Promise.resolve(st.html);
    }
    st.loading = fetch(SFX[kind])
      .then((r) => {
        if (!r.ok) throw new Error(`sfx ${kind} ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        st.buffer = decoded;
        return decoded;
      })
      .catch((err) => {
        console.warn(`${kind} sfx load failed:`, err);
        st.loading = null;
        setupHtmlAudio(kind);
        return st.html;
      });
    return st.loading;
  }

  function loadSfx() {
    loadOneSfx("powder");
    loadOneSfx("sand");
  }

  function startSfx(kind) {
    const st = sfxState[kind];
    // 同一种音效只开一路，避免叠成机枪
    if (st.html && !st.buffer) {
      if (!st.html.paused) return;
      try {
        const p = st.html.play();
        if (p?.catch) p.catch(() => {});
      } catch (_) {
        /* ignore */
      }
      return;
    }
    const ctx = ensureAudio();
    if (!ctx || !st.buffer || st.source) return;
    st.gain = ctx.createGain();
    st.gain.gain.value = 0;
    st.gain.connect(ctx.destination);
    st.source = ctx.createBufferSource();
    st.source.buffer = st.buffer;
    st.source.loop = true;
    st.source.playbackRate.value = kind === "powder" ? 0.88 : 0.8;
    st.source.connect(st.gain);
    try {
      st.source.start(0);
      const now = ctx.currentTime;
      st.gain.gain.setValueAtTime(0, now);
      st.gain.gain.linearRampToValueAtTime(kind === "powder" ? 1.0 : 0.15, now + 0.08);
    } catch (_) {
      st.source = null;
      st.gain = null;
    }
  }

  function stopSfx(kind) {
    const kinds = kind ? [kind] : ["powder", "sand"];
    kinds.forEach((k) => {
      const st = sfxState[k];
      if (st.html) {
        try {
          st.html.pause();
        } catch (_) {
          /* ignore */
        }
      }
      const source = st.source;
      const gain = st.gain;
      st.source = null;
      st.gain = null;
      if (!source) return;
      try {
        if (audioCtx && gain) {
          const now = audioCtx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.1);
          source.stop(now + 0.11);
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
          }, 160);
          return;
        }
        source.stop();
      } catch (_) {
        /* ignore */
      }
    });
  }

  function coverRect(imgW, imgH, boxW, boxH) {
    const scale = Math.max(boxW / imgW, boxH / imgH);
    const w = imgW * scale;
    const h = imgH * scale;
    return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
  }

  function setMode(next) {
    mode = next;
    stageEl?.classList.toggle("is-sand-mode", mode === "sand");
    stageEl?.classList.toggle("is-move-mode", mode === "move");
    if (modeEl) {
      modeEl.textContent = mode === "move" ? "模式：移动沾粉" : "模式：砂纸打磨";
    }
    if (hintEl) {
      hintEl.textContent =
        mode === "move"
          ? "拖动手镯到碗里反复沾粉 · 右键切换砂纸"
          : "拖动砂纸打磨，磨出光泽 · 右键切回移动";
    }
    if (mode === "move") {
      paperEl?.classList.remove("is-visible");
      if (pieceEl) pieceEl.style.cursor = "grab";
    } else if (pieceEl) {
      pieceEl.style.cursor = "none";
    }
  }

  function toggleMode(e) {
    e.preventDefault();
    stopSfx();
    setMode(mode === "move" ? "sand" : "move");
  }

  function bowlScreenRect() {
    const sx = drawRect.w / META.imgW;
    const sy = drawRect.h / META.imgH;
    return {
      x: drawRect.x + META.bowl.x0 * sx,
      y: drawRect.y + META.bowl.y0 * sy,
      w: (META.bowl.x1 - META.bowl.x0) * sx,
      h: (META.bowl.y1 - META.bowl.y0) * sy,
    };
  }

  function pieceCenter() {
    return {
      x: piecePos.x + pieceSize.w / 2,
      y: piecePos.y + pieceSize.h / 2,
    };
  }

  function overBowl() {
    const c = pieceCenter();
    const b = bowlScreenRect();
    // 手镯中心进入碗内区域即算沾粉
    const padX = b.w * 0.12;
    const padY = b.h * 0.12;
    return (
      c.x > b.x + padX &&
      c.x < b.x + b.w - padX &&
      c.y > b.y + padY &&
      c.y < b.y + b.h - padY
    );
  }

  function applyPieceTransform() {
    if (!pieceEl) return;
    pieceEl.style.transform = `translate3d(${piecePos.x}px, ${piecePos.y}px, 0)`;
    pieceEl.style.width = `${pieceSize.w}px`;
    pieceEl.style.height = `${pieceSize.h}px`;
  }

  function clearDust() {
    if (!dustCtx || !dustCanvas) return;
    dustCtx.setTransform(1, 0, 0, 1, 0, 0);
    dustCtx.clearRect(0, 0, dustCanvas.width, dustCanvas.height);
  }

  function prepareDustStamp() {
    if (!dustyImg) return;
    dustStamp = document.createElement("canvas");
    dustStamp.width = dustyImg.naturalWidth || dustyImg.width;
    dustStamp.height = dustyImg.naturalHeight || dustyImg.height;
    const ctx = dustStamp.getContext("2d");
    ctx.clearRect(0, 0, dustStamp.width, dustStamp.height);
    ctx.drawImage(dustyImg, 0, 0);
  }

  function addPowder() {
    if (!dustCtx || !dustStamp || !dustCanvas) return;
    const now = performance.now();
    if (now < dipCooldown) return;
    dipCooldown = now + 90;

    const w = dustCanvas.width;
    const h = dustCanvas.height;
    dustCtx.save();
    // 在手镯轮廓内叠加磨粉层
    dustCtx.globalCompositeOperation = "source-over";
    dustCtx.globalAlpha = DIP_STRENGTH;
    dustCtx.drawImage(dustStamp, 0, 0, w, h);

    // 额外撒一些不规则粉点，更像沾粉
    dustCtx.globalAlpha = DIP_STRENGTH * 0.85;
    dustCtx.globalCompositeOperation = "source-atop";
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 3 + Math.random() * 10;
      const g = 150 + Math.random() * 40;
      dustCtx.fillStyle = `rgb(${g},${g * 0.98},${g * 0.94})`;
      dustCtx.beginPath();
      dustCtx.arc(x, y, r, 0, Math.PI * 2);
      dustCtx.fill();
    }
    dustCtx.restore();
    startSfx("powder");
  }

  function eraseDust(localX, localY) {
    if (!dustCtx) return;
    dustCtx.save();
    dustCtx.globalCompositeOperation = "destination-out";
    dustCtx.beginPath();
    dustCtx.arc(localX, localY, ERASE / 2, 0, Math.PI * 2);
    dustCtx.fill();
    // 柔边
    const grd = dustCtx.createRadialGradient(localX, localY, ERASE * 0.2, localX, localY, ERASE * 0.75);
    grd.addColorStop(0, "rgba(0,0,0,0.85)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    dustCtx.fillStyle = grd;
    dustCtx.beginPath();
    dustCtx.arc(localX, localY, ERASE * 0.75, 0, Math.PI * 2);
    dustCtx.fill();
    dustCtx.restore();
    startSfx("sand");
  }

  function movePaper(clientX, clientY) {
    if (!paperEl || !overlayEl || mode !== "sand") return;
    const rect = overlayEl.getBoundingClientRect();
    paperEl.style.transform = `translate3d(${clientX - rect.left - PAPER_SIZE / 2}px, ${
      clientY - rect.top - PAPER_SIZE / 2
    }px, 0)`;
    paperEl.classList.add("is-visible");
  }

  function localOnPiece(clientX, clientY) {
    const rect = pieceEl.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { x: 0, y: 0, inside: false };
    }
    const x = ((clientX - rect.left) / rect.width) * dustCanvas.width;
    const y = ((clientY - rect.top) / rect.height) * dustCanvas.height;
    return {
      x,
      y,
      inside: x >= 0 && y >= 0 && x <= dustCanvas.width && y <= dustCanvas.height,
    };
  }

  function layout() {
    if (!stageEl || !active) return;
    const rect = stageEl.getBoundingClientRect();
    const boxW = Math.max(2, Math.floor(rect.width));
    const boxH = Math.max(2, Math.floor(rect.height));
    drawRect = coverRect(META.imgW, META.imgH, boxW, boxH);

    const scale = drawRect.w / META.imgW;
    pieceSize = {
      w: META.braceletW * scale,
      h: META.braceletH * scale,
    };
    piecePos = {
      x: drawRect.x + META.placeX * scale,
      y: drawRect.y + META.placeY * scale,
    };
    applyPieceTransform();

    if (dustCanvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const prev = document.createElement("canvas");
      let had = false;
      if (dustCtx && dustCanvas.width > 1) {
        prev.width = dustCanvas.width;
        prev.height = dustCanvas.height;
        prev.getContext("2d").drawImage(dustCanvas, 0, 0);
        had = true;
      }
      dustCanvas.width = Math.max(2, Math.floor(META.braceletW * dpr));
      dustCanvas.height = Math.max(2, Math.floor(META.braceletH * dpr));
      dustCanvas.style.width = "100%";
      dustCanvas.style.height = "100%";
      dustCtx = dustCanvas.getContext("2d");
      dustCtx.setTransform(1, 0, 0, 1, 0, 0);
      dustCtx.clearRect(0, 0, dustCanvas.width, dustCanvas.height);
      if (had) {
        dustCtx.drawImage(prev, 0, 0, dustCanvas.width, dustCanvas.height);
      }
    }
  }

  function onPointerDown(e) {
    if (!active || e.button !== 0) return;
    if (e.target.closest(".workshop-game-ui")) return;
    e.preventDefault();

    if (mode === "move") {
      const rect = pieceEl.getBoundingClientRect();
      const over =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!over) return;
      dragging = true;
      loadSfx();
      offset = { x: e.clientX - piecePos.x, y: e.clientY - piecePos.y };
      pieceEl.style.cursor = "grabbing";
      try {
        stageEl.setPointerCapture?.(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      return;
    }

    polishing = true;
    last = null;
    loadSfx();
    movePaper(e.clientX, e.clientY);
    const p = localOnPiece(e.clientX, e.clientY);
    if (p.inside) eraseDust(p.x, p.y);
    last = p;
    try {
      stageEl.setPointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  function onPointerMove(e) {
    if (!active) return;

    if (mode === "sand") {
      movePaper(e.clientX, e.clientY);
      if (!polishing) return;
      const p = localOnPiece(e.clientX, e.clientY);
      if (p.inside) {
        if (last?.inside) {
          const dist = Math.hypot(p.x - last.x, p.y - last.y);
          const steps = Math.max(1, Math.ceil(dist / 4));
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            eraseDust(last.x + (p.x - last.x) * t, last.y + (p.y - last.y) * t);
          }
        } else {
          eraseDust(p.x, p.y);
        }
      } else {
        stopSfx("sand");
      }
      last = p;
      return;
    }

    if (!dragging) return;
    const stageRect = stageEl.getBoundingClientRect();
    piecePos = {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    };
    piecePos.x = Math.min(Math.max(piecePos.x, -pieceSize.w * 0.35), stageRect.width - pieceSize.w * 0.35);
    piecePos.y = Math.min(Math.max(piecePos.y, -pieceSize.h * 0.35), stageRect.height - pieceSize.h * 0.35);
    applyPieceTransform();
    if (overBowl()) {
      addPowder();
    } else {
      stopSfx("powder");
    }
  }

  function onPointerUp() {
    dragging = false;
    polishing = false;
    last = null;
    stopSfx();
    if (mode === "move" && pieceEl) pieceEl.style.cursor = "grab";
    if (mode !== "sand") paperEl?.classList.remove("is-visible");
  }

  function onContextMenu(e) {
    if (!active) return;
    if (!stageEl.contains(e.target) && e.target !== stageEl) return;
    toggleMode(e);
  }

  function bind() {
    stageEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    stageEl.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", layout);
  }

  function unbind() {
    if (!stageEl) return;
    stageEl.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    stageEl.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("resize", layout);
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
    overlayEl = options.overlay || document.getElementById("workshop-overlay");
    stageEl = options.stage || document.getElementById("workshop-screen-bracelet");
    deskEl = options.desk || document.getElementById("bracelet-desk");
    pieceEl = options.piece || document.getElementById("bracelet-piece");
    shinyEl = options.shiny || document.getElementById("bracelet-shiny");
    dustCanvas = options.dustCanvas || document.getElementById("bracelet-dust-canvas");
    paperEl = options.paper || document.getElementById("bracelet-sandpaper");
    hintEl = options.hint || document.querySelector("#workshop-screen-bracelet .workshop-game-hint");
    modeEl = options.modeEl || document.getElementById("bracelet-mode-label");
    if (!stageEl || !pieceEl || !dustCanvas) return;

    unbind();
    active = true;
    dragging = false;
    polishing = false;
    dipCooldown = 0;
    overlayEl?.classList.add("is-bracelet");
    setMode("move");
    loadSfx();

    const bust = Date.now();
    try {
      dustyImg = await loadImage(`images/bracelet-dusty.png?v=${bust}`);
      prepareDustStamp();
      if (shinyEl) shinyEl.src = `images/bracelet-shiny.png?v=${bust}`;
      if (deskEl) deskEl.src = `images/bracelet-desk.png?v=${bust}`;
    } catch (err) {
      console.error("bracelet assets load failed:", err);
      return;
    }

    bind();
    requestAnimationFrame(() => {
      if (!active) return;
      layout();
      clearDust(); // 起始干净，未沾粉
      requestAnimationFrame(() => {
        if (!active) return;
        layout();
        clearDust();
      });
    });
  }

  function stop() {
    active = false;
    dragging = false;
    polishing = false;
    stopSfx();
    unbind();
    paperEl?.classList.remove("is-visible");
    overlayEl?.classList.remove("is-bracelet");
    stageEl?.classList.remove("is-sand-mode", "is-move-mode");
  }

  return { start, stop, layout };
})();
