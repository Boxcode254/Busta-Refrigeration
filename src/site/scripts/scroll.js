import { getHashTarget, queryAll } from "./dom.js";
import {
  getOffsetTop,
  getScrollTop,
  getViewportHeight,
  observeViewport,
  scrollToTarget
} from "./runtime.js";

/**
 * Initialize all scroll-related behaviors.
 */
export function initScrollBehavior() {
  initSmoothScroll();
  initStickyMenus();
  initActiveMenuLinks();
  initBackToTop();
  initStatsCounters();
  initScrollReveal();
}

/**
 * Fade-in reveal for overlines, headings, cards, and stat items as they enter
 * the viewport. Skipped entirely when prefers-reduced-motion is set — elements
 * are made visible immediately in that case.
 */
function initScrollReveal() {
  const SELECTORS = [
    ".busta-services-overline",
    ".busta-about-overline",
    ".busta-features-overline",
    ".busta-process-overline",
    ".busta-gallery-overline",
    ".busta-testimonials-overline",
    ".busta-cta-overline",
    ".busta-contact-overline",
    ".busta-services-heading",
    ".busta-about-heading",
    ".busta-features-heading",
    ".busta-gallery-heading",
    ".busta-testimonials-heading",
    ".busta-contact-heading",
    ".busta-svc-card",
    ".busta-gallery-card",
    ".busta-feature-item",
    ".busta-process-step",
    ".busta-testimonials-card",
    ".busta-stats-item",
  ].join(",");

  const elements = Array.from(document.querySelectorAll(SELECTORS));
  if (!elements.length) {
    return;
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    // Ensure elements are visible without animation
    elements.forEach((el) => el.classList.add("anim-ready", "visible"));
    return;
  }

  // Group elements into stagger batches by their containing section
  elements.forEach((el, index) => {
    // Find siblings within the same parent to compute per-group stagger index
    const parent = el.parentElement;
    const siblings = parent
      ? Array.from(parent.querySelectorAll(SELECTORS)).filter((s) => s.parentElement === parent)
      : [el];
    const groupIndex = siblings.indexOf(el);
    const delay = Math.min(groupIndex * 0.1, 0.5);
    el.style.setProperty("--anim-delay", `${delay}s`);
    el.classList.add("anim-ready");
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -60px 0px", threshold: 0.12 }
  );

  elements.forEach((el) => io.observe(el));
}

/**
 * Animate stat counters once when the stats section enters the viewport.
 */
function initStatsCounters() {
  const section = document.querySelector(".busta-stats");
  if (!section) {
    return;
  }

  /**
   * Ease-out quart: fast start, smooth deceleration.
   *
   * @param {number} t - Progress 0–1
   * @returns {number}
   */
  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  /**
   * Animate a single counter element from 0 to target over duration ms.
   *
   * @param {HTMLElement} el
   * @param {number} target
   * @param {string} suffix
   * @param {number} duration
   */
  function animateCounter(el, target, suffix, duration) {
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.round(easeOutQuart(progress) * target);
      el.textContent = value + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        io.disconnect();

        const numbers = section.querySelectorAll(".busta-stats-number");
        numbers.forEach((el) => {
          if (el.dataset.static === "true") {
            // 24/7 — no animation needed, value already set in HTML
            return;
          }

          const target = parseInt(el.dataset.target, 10);
          const suffix = el.dataset.suffix || "";

          if (prefersReduced) {
            el.textContent = target + suffix;
            return;
          }

          animateCounter(el, target, suffix, 2000);
        });
      });
    },
    { rootMargin: "0px 0px -80px 0px", threshold: 0.1 }
  );

  io.observe(section);
}

/**
 * Enable smooth scroll for menu and scroll-button links.
 *
 * @param {string} selector
 */
export function initSmoothScroll(selector = ".menu-wrapper .ed-menu a, .scroll a") {
  const links = queryAll(selector);

  links.forEach((link) => {
    if (link.dataset.smoothScrollBound === "1") {
      return;
    }

    link.dataset.smoothScrollBound = "1";
    link.addEventListener("click", (event) => {
      const target = determineTarget(link);
      if (!target) {
        return;
      }

      event.preventDefault();
      scrollToTarget(target, "top", 500, 0);
    });
  });
}

/**
 * Add sticky behavior to menu wrappers.
 *
 * @param {string} wrapperSelector
 * @param {string} cssClass
 */
export function initStickyMenus(wrapperSelector = ".menu-wrapper", cssClass = "sticky") {
  const wrappers = queryAll(wrapperSelector);
  const banner = document.querySelector(".banner");

  wrappers.forEach((wrapper) => {
    handleSticky(wrapper, cssClass, banner);
  });
}

/**
 * Highlight active menu links while scrolling sections.
 *
 * @param {string} linkSelector
 * @param {string} cssClass
 * @param {number} sectionViewportRatio
 */
export function initActiveMenuLinks(
  linkSelector = ".menu-wrapper .ed-menu a",
  cssClass = "active",
  sectionViewportRatio = 2 / 3
) {
  const links = queryAll(linkSelector);
  if (!links.length) {
    return;
  }

  const activeFallbackLink = links.find(
    (link) => link.classList.contains("active") && !link.classList.contains("wv-link-elm")
  );

  const targets = [];
  const hashLinks = links.filter((link) => {
    const target = getHashTarget(link.hash);
    if (!target) {
      return false;
    }

    const cacheOffset = () => {
      target.dataset.offset = String(getOffsetTop(target));
    };

    observeViewport("resize", cacheOffset);
    observeViewport("animation.end", cacheOffset);
    cacheOffset();

    targets.push(target);
    return true;
  });

  if (!hashLinks.length) {
    return;
  }

  const checkVisibility = () => {
    links.forEach((link) => link.classList.remove(cssClass));

    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index];
      const offset = Number(target.dataset.offset || "0");
      const desiredScrollPosition = offset - getViewportHeight() * (1 - sectionViewportRatio);
      if (getScrollTop() >= desiredScrollPosition && target.offsetParent !== null) {
        hashLinks[index].classList.add(cssClass);
        return;
      }
    }

    if (activeFallbackLink) {
      activeFallbackLink.classList.add(cssClass);
    }
  };

  observeViewport("scroll", checkVisibility);
  checkVisibility();
}

/**
 * Initialize back-to-top buttons.
 *
 * @param {string} buttonSelector
 */
export function initBackToTop(buttonSelector = ".back-to-top-button-icon") {
  const buttons = queryAll(buttonSelector);
  if (!buttons.length) {
    return;
  }

  buttons.forEach((button) => {
    button.classList.remove("show");

    if (button.dataset.backToTopBound === "1") {
      return;
    }

    button.dataset.backToTopBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToTarget(0, "top", 500, 0);
    });
  });

  const toggleVisibility = () => {
    const shouldShow = getScrollTop() > getViewportHeight() / 3;
    buttons.forEach((button) => {
      button.classList.toggle("show", shouldShow);
    });
  };

  observeViewport("scroll", toggleVisibility);
  toggleVisibility();
}

/**
 * @param {HTMLAnchorElement} link
 * @returns {Element | null}
 */
function determineTarget(link) {
  if (link.hash === "#!next") {
    const currentElement = link.closest(".ed-element");
    return currentElement ? currentElement.nextElementSibling : null;
  }

  return getHashTarget(link.hash);
}

/**
 * @param {Element} element
 * @returns {"sticky_banner" | "sticky_menu" | "sticky_instant" | "sticky_reverse" | "sticky_none"}
 */
function getStickyMode(element) {
  const fillValue = getComputedStyle(element).fill;

  if (fillValue === "rgb(255, 0, 0)") {
    return "sticky_banner";
  }

  if (fillValue === "rgb(0, 255, 0)") {
    return "sticky_menu";
  }

  if (fillValue === "rgb(0, 0, 255)") {
    return "sticky_instant";
  }

  if (fillValue === "rgb(255, 255, 255)") {
    return "sticky_reverse";
  }

  return "sticky_none";
}

/**
 * Adds sticky behavior to one menu wrapper.
 *
 * @param {Element} element
 * @param {string} cssClass
 * @param {Element | null} banner
 */
function handleSticky(element, cssClass, banner) {
  if (!element) {
    return;
  }

  let triggerPosition = 0;
  let offset = 0;
  let menuWrapperHeight = element.getBoundingClientRect().height;
  let mode = "sticky_none";
  let previousScroll = 0;

  element.classList.remove(cssClass);
  element.classList.remove("scrolled");

  const toggleSpacer = (toggle) => {
    document.body.style.setProperty("--spacer-height", toggle ? `${menuWrapperHeight}px` : "");
  };

  const handleScroll = () => {
    const currentScroll = getScrollTop();
    element.classList.toggle("scrolled", currentScroll > 24);

    if (mode === "sticky_none") {
      return;
    }

    const isReverse = mode === "sticky_reverse";

    if (triggerPosition <= currentScroll && (!isReverse || previousScroll > currentScroll)) {
      element.classList.add(cssClass);
      toggleSpacer(true);
    } else {
      element.classList.remove(cssClass);
      toggleSpacer(false);
    }

    previousScroll = currentScroll;
  };

  const updateOffset = () => {
    mode = getStickyMode(element);
    menuWrapperHeight = element.getBoundingClientRect().height;

    if (!element.classList.contains(cssClass)) {
      offset = getOffsetTop(element);
    }

    if (mode === "sticky_banner" && !banner) {
      mode = "sticky_menu";
    }

    if (mode === "sticky_banner") {
      triggerPosition = getOffsetTop(banner) + (banner ? banner.getBoundingClientRect().height : menuWrapperHeight);
    }

    if (mode === "sticky_menu" || mode === "sticky_reverse") {
      triggerPosition = offset + element.getBoundingClientRect().height;
    }

    if (mode === "sticky_instant") {
      triggerPosition = offset;
    }

    handleScroll();
  };

  observeViewport("resize", updateOffset);
  observeViewport("animation.end", updateOffset);
  observeHeightChange(element, updateOffset);
  updateOffset();

  observeViewport("scroll", handleScroll);
  handleScroll();
}

export function initHeroRotator() {
  const el = document.getElementById("hero-rotating-phrase");
  if (!el) return; // homepage guard — safe to call on every page

  const phrases = [
    "COMMERCIAL REFRIGERATION EXPERTS",
    "INDUSTRIAL SYSTEMS EXPERTS",
    "COLD ROOM INSTALLATION EXPERTS",
    "AC INSTALLATION & SERVICE EXPERTS",
  ];

  // Prevent duplicate timers on hot-reload / re-init
  if (el.dataset.rotatorActive) return;
  el.dataset.rotatorActive = "1";

  // Wrap initial text in a phrase slot so transforms are scoped
  const initSlot = document.createElement("span");
  initSlot.className = "busta-hero-phrase-slot";
  initSlot.textContent = phrases[0];
  el.textContent = "";
  el.appendChild(initSlot);

  // Measure every phrase and lock the container to the tallest result
  // so .line-1 ("TRUSTED COOLING &") never shifts during transitions.
  let maxH = 0;
  for (const phrase of phrases) {
    initSlot.textContent = phrase;
    const h = el.getBoundingClientRect().height;
    if (h > maxH) maxH = h;
  }
  initSlot.textContent = phrases[0];
  if (maxH > 0) el.style.height = maxH + "px";

  // Respect reduced-motion preference — show stable first phrase, no cycling
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let current = 0;
  const ANIM_MS = 450;
  const HOLD_MS = 2600;

  function rotate() {
    // Target the slot that is NOT currently animating out
    const outgoing = el.querySelector(".busta-hero-phrase-slot:not(.ticker-out)");
    if (!outgoing) return;

    current = (current + 1) % phrases.length;

    // Build incoming slot — starts from right, slides left into place
    const incoming = document.createElement("span");
    incoming.className = "busta-hero-phrase-slot ticker-in";
    incoming.textContent = phrases[current];
    el.appendChild(incoming);

    // Send outgoing slot left while fading it out
    outgoing.classList.add("ticker-out");
    setTimeout(() => outgoing.remove(), ANIM_MS);

    // Strip animation class once incoming lands
    setTimeout(() => incoming.classList.remove("ticker-in"), ANIM_MS);
  }

  setInterval(rotate, HOLD_MS + ANIM_MS * 2);
}

/**
 * Observe element height changes and trigger callback.
 *
 * @param {Element | null} element
 * @param {() => void} callback
 */
function observeHeightChange(element, callback) {
  if (!element || !("ResizeObserver" in window)) {
    return;
  }

  const resizeObserver = new ResizeObserver(callback);
  resizeObserver.observe(element);
}
