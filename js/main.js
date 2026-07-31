/**
 * 主页面逻辑：渲染滚屏区块、导航、滚动交互
 */

/* ===== 状态与缓存 ===== */
let scrollSections = [];
let sectionOffsets = [];
let chapterNavItems = [];
let navElements = {};
let navbarEl = null;

const SCROLL_DURATION = 650;
const SCROLL_COOLDOWN = 150;

let activeSectionIndex = 0;
let activeChapterId = "";
let isScrolling = false;
let scrollWheelLocked = false;
let scrollAnimationId = null;
let navAnimating = false;
let navAnimTimer = null;
let navbarTicking = false;

/* ===== 工具函数 ===== */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function cacheSections() {
  scrollSections = [...document.querySelectorAll(".hero, .footer-section")];
  updateSectionOffsets();
}

function updateSectionOffsets() {
  sectionOffsets = scrollSections.map((section) => section.offsetTop);
}

function getSectionByIndex(index) {
  return scrollSections[index] || null;
}

function getSectionOffset(index) {
  return sectionOffsets[index] ?? 0;
}

function getCurrentSectionIndex() {
  const viewportMiddle = window.scrollY + window.innerHeight * 0.4;
  let current = 0;
  sectionOffsets.forEach((offset, index) => {
    if (offset <= viewportMiddle + 2) current = index;
  });
  return current;
}

/* ===== 渲染 ===== */
function renderHeroSections() {
  const container = document.getElementById("hero-sections");
  if (!container) return;

  container.innerHTML = PHOTOS.map((photo, index) => {
    const isIntro = photo.isIntro;
    const isImageOnly = photo.imageOnly;
    const alignTop = photo.contentAlign === "top";
    const alignRight = photo.contentAlign === "right";
    const alignLeft = photo.contentAlign === "left";
    const lightOverlay = Boolean(photo.lightOverlay);

    const scrollHint = isIntro
      ? `<div class="hero__scroll-hint">
           <span>向下滚动探索</span>
           <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
         </div>`
      : "";

    const contentMods = [
      alignTop ? "hero__content--top" : "",
      alignRight ? "hero__content--right" : "",
      alignLeft ? "hero__content--left" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const contentBlock = isImageOnly
      ? ""
      : `
        <div class="hero__content${contentMods ? ` ${contentMods}` : ""}">
          ${photo.tag ? `<span class="hero__tag">${photo.tag}</span>` : ""}
          <h2 class="hero__title">${photo.title || ""}</h2>
          ${photo.subtitle ? `<p class="hero__subtitle">${photo.subtitle}</p>` : ""}
          ${photo.description ? `<p class="hero__desc">${photo.description}</p>` : ""}
        </div>
      `;

    const sectionClass = [
      "hero",
      isIntro ? "hero--intro" : "",
      isImageOnly ? "hero--image-only" : "",
      lightOverlay ? "hero--light-overlay" : "",
      alignTop ? "hero--content-top" : "",
      alignRight ? "hero--content-right" : "",
      alignLeft ? "hero--content-left" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <section
        class="${sectionClass}"
        id="${photo.id}"
        data-index="${index}"
      >
        <div
          class="hero__bg"
          style="background-image: url('${photo.image}')"
          data-fallback="${photo.fallback || ""}"
          data-src="${photo.image}"
        ></div>
        <div class="hero__overlay"></div>
        ${contentBlock}
        ${index > 0 && !isImageOnly ? `<span class="hero__index">${String(index).padStart(2, "0")} / ${String(PHOTOS.length - 1).padStart(2, "0")}</span>` : ""}
        ${scrollHint}
      </section>
    `;
  }).join("");

  initImageFallbacks();
  cacheSections();
}

function initImageFallbacks() {
  document.querySelectorAll(".hero__bg").forEach((el) => {
    const src = el.dataset.src;
    if (!src) return;

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      el.classList.add("is-loaded");
    };
    img.onerror = () => {
      const fallback = el.dataset.fallback;
      if (fallback) {
        el.style.backgroundImage = `url('${fallback}')`;
        el.classList.add("is-loaded");
      }
    };
    img.src = src;
  });

  preloadAdjacentImages(0);
}

function preloadAdjacentImages(index) {
  [index - 1, index, index + 1].forEach((i) => {
    const photo = PHOTOS[i];
    if (!photo) return;
    const img = new Image();
    img.decoding = "async";
    img.src = photo.image;
  });
}

function renderChapterNavItem(photo, { isChild = false } = {}) {
  if (isChild) {
    return `
      <li class="chapter-nav__item chapter-nav__item--child" data-target="${photo.id}">
        <button class="chapter-nav__link chapter-nav__link--child" type="button" data-target="${photo.id}" aria-label="跳转到：${photo.title}">
          <span class="chapter-nav__dot chapter-nav__dot--sub" aria-hidden="true"></span>
        </button>
      </li>
    `;
  }

  return `
    <li class="chapter-nav__item" data-target="${photo.id}">
      <button class="chapter-nav__link" type="button" data-target="${photo.id}" aria-label="跳转到：${photo.title}">
        <span class="chapter-nav__label">${photo.title}</span>
        <span class="chapter-nav__dot" aria-hidden="true"></span>
      </button>
    </li>
  `;
}

function renderChapterNav() {
  const list = document.getElementById("chapter-nav-list");
  if (!list) return;

  const showcaseChildren = PHOTOS.filter((p) => p.navParent === "showcase");
  const topLevel = PHOTOS.filter((p) => !p.navParent);

  list.innerHTML = topLevel
    .map((photo) => {
      if (photo.id !== "showcase") {
        return renderChapterNavItem(photo);
      }

      return `
        <li class="chapter-nav__item chapter-nav__item--has-children" data-target="${photo.id}">
          <button class="chapter-nav__link" type="button" data-target="${photo.id}" aria-label="跳转到：${photo.title}">
            <span class="chapter-nav__label">${photo.title}</span>
            <span class="chapter-nav__dot" aria-hidden="true"></span>
          </button>
          <ul class="chapter-nav__sublist">
            ${showcaseChildren.map((child) => renderChapterNavItem(child, { isChild: true })).join("")}
          </ul>
        </li>
      `;
    })
    .join("");

  chapterNavItems = [...list.querySelectorAll(".chapter-nav__item")];
}

function setActiveChapter(sectionId) {
  if (!sectionId || sectionId === activeChapterId) return;
  activeChapterId = sectionId;

  chapterNavItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.target === sectionId);
  });

  const index = PHOTOS.findIndex((p) => p.id === sectionId);
  if (index >= 0) preloadAdjacentImages(index);
}

const NAV_ITEM_DURATION = 380;
const NAV_STAGGER = 42;
const NAV_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

function isNavGroupWrapper(item) {
  return item.classList.contains("chapter-nav__item--has-children");
}

function clearNavItemStyles() {
  chapterNavItems.forEach((item) => {
    item.style.removeProperty("opacity");
    item.style.removeProperty("transform");
    item.style.removeProperty("transition");
    const label = item.querySelector(".chapter-nav__label");
    label?.style.removeProperty("opacity");
    label?.style.removeProperty("transition");
  });
}

function setNavItemsInstant(items, opacity, translateX, labelOpacity) {
  items.forEach((item) => {
    item.style.transition = "none";
    item.style.opacity = String(opacity);
    if (isNavGroupWrapper(item)) {
      item.style.transform = "none";
    } else {
      item.style.transform = `translateX(${translateX}px)`;
    }
    const label = item.querySelector(".chapter-nav__label");
    if (label) {
      label.style.transition = "none";
      label.style.opacity = String(labelOpacity);
    }
  });
}

function animateNavItems(items, toOpen) {
  const count = items.length;
  let maxDelay = 0;

  items.forEach((item, index) => {
    const label = item.querySelector(".chapter-nav__label");
    const delay = toOpen ? 80 + index * NAV_STAGGER : (count - 1 - index) * NAV_STAGGER;
    maxDelay = Math.max(maxDelay, delay);
    const itemTransition = `opacity ${NAV_ITEM_DURATION}ms ${NAV_EASING} ${delay}ms, transform ${NAV_ITEM_DURATION}ms ${NAV_EASING} ${delay}ms`;

    item.style.transition = itemTransition;
    item.style.opacity = toOpen ? "1" : "0";
    if (isNavGroupWrapper(item)) {
      item.style.transform = "none";
    } else {
      item.style.transform = toOpen ? "translateX(0)" : "translateX(18px)";
    }

    if (label) {
      const labelDelay = toOpen ? delay + 60 : delay;
      label.style.transition = `opacity 280ms ease ${labelDelay}ms`;
      label.style.opacity = toOpen ? "0.65" : "0";
    }
  });

  return maxDelay + NAV_ITEM_DURATION;
}

function finishNavAnimation() {
  const { nav, toggle } = navElements;
  nav?.classList.remove("is-animating", "is-closing");
  clearNavItemStyles();
  navAnimating = false;
  if (nav?.classList.contains("is-open")) {
    toggle?.classList.add("is-hidden");
  } else {
    toggle?.classList.remove("is-hidden");
  }
}

function expandChapterNav() {
  const { nav, toggle, list } = navElements;
  if (!nav || !toggle || !list || navAnimating || nav.classList.contains("is-open")) return;

  navAnimating = true;
  nav.classList.remove("is-closing");
  nav.classList.add("is-animating");
  toggle.setAttribute("aria-expanded", "true");
  list.setAttribute("aria-hidden", "false");

  setNavItemsInstant(chapterNavItems, 0, 18, 0);
  void nav.offsetHeight;

  nav.classList.add("is-open");
  toggle.classList.add("is-hidden");

  const duration = animateNavItems(chapterNavItems, true);
  clearTimeout(navAnimTimer);
  navAnimTimer = setTimeout(finishNavAnimation, duration);
}

function collapseChapterNav() {
  const { nav, toggle, list } = navElements;
  if (!nav || !toggle || !list || navAnimating || !nav.classList.contains("is-open")) return;

  navAnimating = true;
  setNavItemsInstant(chapterNavItems, 1, 0, 0.65);
  void nav.offsetHeight;
  nav.classList.add("is-animating", "is-closing");

  const duration = animateNavItems(chapterNavItems, false);
  clearTimeout(navAnimTimer);
  navAnimTimer = setTimeout(() => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    list.setAttribute("aria-hidden", "true");
    toggle.classList.remove("is-hidden");
    finishNavAnimation();
  }, duration);
}

function initChapterNavToggle() {
  const nav = document.getElementById("chapter-nav");
  const toggle = document.getElementById("chapter-nav-toggle");
  const list = document.getElementById("chapter-nav-list");
  if (!nav || !toggle || !list) return;

  navElements = { nav, toggle, list };

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    expandChapterNav();
  });

  list.addEventListener("click", (e) => {
    const link = e.target.closest(".chapter-nav__link");
    if (!link) return;
    scrollToSection(document.getElementById(link.dataset.target), true);
  });

  document.addEventListener("click", (e) => {
    if (navAnimating) return;
    if (!nav.classList.contains("is-open") || nav.contains(e.target)) return;
    collapseChapterNav();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !navAnimating && nav.classList.contains("is-open")) {
      collapseChapterNav();
    }
  });
}

/* ===== 滚屏 ===== */
function lockScrollWheel() {
  scrollWheelLocked = true;
  isScrolling = true;
}

function unlockScrollWheel() {
  isScrolling = false;
  scrollAnimationId = null;
  setTimeout(() => {
    scrollWheelLocked = false;
    activeSectionIndex = getCurrentSectionIndex();
  }, SCROLL_COOLDOWN);
}

function scrollToSection(section, smooth = true) {
  if (!section) return;

  const index = scrollSections.indexOf(section);
  if (index >= 0) activeSectionIndex = index;

  if (section.classList.contains("hero")) {
    setActiveChapter(section.id);
  }

  const targetTop = getSectionOffset(index);

  if (!smooth) {
    window.scrollTo(0, targetTop);
    scrollWheelLocked = false;
    isScrolling = false;
    return;
  }

  if (scrollAnimationId) {
    cancelAnimationFrame(scrollAnimationId);
  }

  const startTop = window.scrollY;
  const distance = targetTop - startTop;
  if (distance === 0) {
    scrollWheelLocked = false;
    isScrolling = false;
    return;
  }

  lockScrollWheel();
  const startTime = performance.now();

  function step(currentTime) {
    const progress = Math.min((currentTime - startTime) / SCROLL_DURATION, 1);
    window.scrollTo(0, startTop + distance * easeInOutCubic(progress));

    if (progress < 1) {
      scrollAnimationId = requestAnimationFrame(step);
    } else {
      window.scrollTo(0, targetTop);
      unlockScrollWheel();
    }
  }

  scrollAnimationId = requestAnimationFrame(step);
}

function initWheelScroll() {
  activeSectionIndex = getCurrentSectionIndex();

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.target.closest(".chat-panel__messages")) return;
      if (!scrollSections.length || navAnimating) return;

      e.preventDefault();

      if (scrollWheelLocked) return;

      const direction = e.deltaY > 0 ? 1 : -1;
      const next = activeSectionIndex + direction;
      if (next < 0 || next >= scrollSections.length) return;

      scrollToSection(getSectionByIndex(next), true);
    },
    { passive: false }
  );
}

function updateNavbarState() {
  navbarEl?.classList.toggle("scrolled", window.scrollY > 60);
  navbarTicking = false;
}

function initScrollObserver() {
  navbarEl = document.querySelector(".navbar");
  const heroes = document.querySelectorAll(".hero");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in-view");
        setActiveChapter(entry.target.id);
      }
    },
    { threshold: 0.5 }
  );

  heroes.forEach((hero) => observer.observe(hero));

  window.addEventListener(
    "scroll",
    () => {
      if (!navbarTicking) {
        navbarTicking = true;
        requestAnimationFrame(updateNavbarState);
      }
    },
    { passive: true }
  );

  if (PHOTOS.length) {
    setActiveChapter(PHOTOS[0].id);
  }
}

function initResizeHandler() {
  let resizeTimer;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateSectionOffsets, 150);
    },
    { passive: true }
  );
}

function initApp() {
  renderHeroSections();
  renderChapterNav();
  initChapterNavToggle();
  initScrollObserver();
  initWheelScroll();
  initResizeHandler();

  document.querySelector(".navbar__logo")?.addEventListener("click", (e) => {
    const target = document.getElementById("intro");
    if (target) {
      e.preventDefault();
      scrollToSection(target, true);
    }
  });
}

document.addEventListener("DOMContentLoaded", initApp);
