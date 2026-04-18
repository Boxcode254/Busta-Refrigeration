import { queryAll } from "./dom.js";

/**
 * Initialize image and background lazy-loading behavior.
 */
export function initMediaLazyLoading() {
  observeTargets();

  if (!("MutationObserver" in window)) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (let index = 0; index < mutations.length; index += 1) {
      if (mutations[index].addedNodes && mutations[index].addedNodes.length) {
        observeTargets();
        return;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * @param {HTMLImageElement} image
 */
function setImageSource(image) {
  const dataSrc = image.getAttribute("data-src");
  const dataSrcset = image.getAttribute("data-srcset");

  if (dataSrc) {
    image.setAttribute("src", dataSrc);
    image.removeAttribute("data-src");
  }

  if (dataSrcset) {
    image.setAttribute("srcset", dataSrcset);
    image.removeAttribute("data-srcset");
  }

  if (!image.getAttribute("loading")) {
    image.setAttribute("loading", "lazy");
  }

  if (!image.getAttribute("decoding")) {
    image.setAttribute("decoding", "async");
  }

  image.classList.remove("ed-lazyload");
}

/**
 * @param {HTMLPictureElement} picture
 */
function setPictureSources(picture) {
  const sources = queryAll("source", picture);
  sources.forEach((sourceElement) => {
    const dataSrcset = sourceElement.getAttribute("data-srcset");
    if (!dataSrcset) {
      return;
    }

    sourceElement.setAttribute("srcset", dataSrcset);
    sourceElement.removeAttribute("data-srcset");
  });
}

/**
 * @param {HTMLSourceElement} sourceElement
 */
function setSourceSourceSet(sourceElement) {
  const dataSrcset = sourceElement.getAttribute("data-srcset");
  if (!dataSrcset) {
    return;
  }

  sourceElement.setAttribute("srcset", dataSrcset);
  sourceElement.removeAttribute("data-srcset");
}

/**
 * @param {HTMLElement} holder
 */
function setBackgroundImage(holder) {
  const backgroundValue = holder.getAttribute("data-background");
  if (!backgroundValue) {
    return;
  }

  holder.style.backgroundImage = backgroundValue;
  holder.removeAttribute("data-background");
  holder.classList.remove("ed-lazyload");
}

/**
 * @param {Element} node
 */
function revealNode(node) {
  if (node instanceof HTMLImageElement) {
    setImageSource(node);

    const picture = node.closest("picture");
    if (picture instanceof HTMLPictureElement) {
      setPictureSources(picture);
    }
  }

  if (node instanceof HTMLPictureElement) {
    setPictureSources(node);
    const image = node.querySelector("img");
    if (image instanceof HTMLImageElement) {
      setImageSource(image);
    }
  }

  if (node instanceof HTMLSourceElement) {
    setSourceSourceSet(node);
  }

  if (node instanceof HTMLElement && node.classList.contains("background-image-holder")) {
    setBackgroundImage(node);
  }

  node.setAttribute("data-io-ready", "1");
}

function observeTargets() {
  const selector =
    'img[data-src], img[data-srcset], img[loading="lazy"], picture source[data-srcset], .background-image-holder[data-background]';
  const nodes = queryAll(selector);

  if (!nodes.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    nodes.forEach((node) => revealNode(node));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, io) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        revealNode(entry.target);
        io.unobserve(entry.target);
      });
    },
    {
      rootMargin: "250px 0px",
      threshold: 0.01
    }
  );

  nodes.forEach((node) => {
    if (node.getAttribute("data-io-ready") === "1") {
      return;
    }

    observer.observe(node);
  });
}

/**
 * Initialize testimonials slider.
 * - Autoplay every 5 s, paused on hover
 * - Prev/next button navigation (data-dir="prev" / data-dir="next")
 * - Dot navigation
 * - Touch swipe (threshold > 50 px)
 * - aria-hidden toggling per slide
 */
export function initTestimonialsSlider() {
  const slider = document.querySelector(".busta-testimonials-slider");
  if (!slider) {
    return;
  }

  const slides = slider.querySelectorAll(".busta-testimonials-slide");
  const dots = document.querySelectorAll(".busta-testimonials-dot");
  const prevBtn = document.querySelector(".busta-testimonials-btn[data-dir='prev']");
  const nextBtn = document.querySelector(".busta-testimonials-btn[data-dir='next']");

  if (!slides.length) {
    return;
  }

  let current = 0;
  let autoplayTimer = null;
  let touchStartX = 0;

  function goTo(index) {
    slides[current].classList.remove("active");
    slides[current].setAttribute("aria-hidden", "true");
    if (dots[current]) {
      dots[current].classList.remove("active");
      dots[current].setAttribute("aria-selected", "false");
    }

    current = (index + slides.length) % slides.length;

    slides[current].classList.add("active");
    slides[current].setAttribute("aria-hidden", "false");
    if (dots[current]) {
      dots[current].classList.add("active");
      dots[current].setAttribute("aria-selected", "true");
    }
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(function () {
      goTo(current + 1);
    }, 5000);
  }

  function stopAutoplay() {
    if (autoplayTimer !== null) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  // Set initial aria state
  slides.forEach(function (slide, i) {
    slide.setAttribute("aria-hidden", i === 0 ? "false" : "true");
    if (i === 0) {
      slide.classList.add("active");
    }
  });
  if (dots[0]) {
    dots[0].classList.add("active");
    dots[0].setAttribute("aria-selected", "true");
  }

  // Prev / Next buttons
  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      goTo(current - 1);
      startAutoplay();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      goTo(current + 1);
      startAutoplay();
    });
  }

  // Dot buttons
  dots.forEach(function (dot, i) {
    dot.addEventListener("click", function () {
      goTo(i);
      startAutoplay();
    });
  });

  // Pause autoplay on hover
  slider.addEventListener("mouseenter", stopAutoplay);
  slider.addEventListener("mouseleave", startAutoplay);

  // Touch swipe
  slider.addEventListener("touchstart", function (e) {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  slider.addEventListener("touchend", function (e) {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 50) {
      goTo(delta < 0 ? current + 1 : current - 1);
      startAutoplay();
    }
  }, { passive: true });

  startAutoplay();
}

/**
 * Initialize gallery category filter tabs.
 * Binds click handlers to .busta-gallery-tab elements,
 * toggling the .hidden class on .busta-gallery-card items
 * based on their data-category attribute.
 * Does not interfere with IntersectionObserver lazy-loading.
 */
export function initGalleryFilter() {
  const tabs = document.querySelectorAll(".busta-gallery-tab");
  if (!tabs.length) {
    return;
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      const filter = tab.getAttribute("data-filter");

      tabs.forEach(function (t) {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      const cards = document.querySelectorAll(".busta-gallery-card");
      cards.forEach(function (card) {
        if (filter === "all" || card.getAttribute("data-category") === filter) {
          card.classList.remove("hidden");
        } else {
          card.classList.add("hidden");
        }
      });
    });
  });
}
