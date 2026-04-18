import { initAccessibility } from "./accessibility.js";
import { initAnalytics } from "./analytics.js";
import { initForms } from "./forms.js";
import { initGalleryFilter, initMediaLazyLoading, initTestimonialsSlider } from "./media.js";
import { initMenus } from "./menu.js";
import { onDomReady } from "./runtime.js";
import { initScrollBehavior, initHeroRotator } from "./scroll.js";

/**
 * Bootstraps all recovered custom front-end behavior.
 */
function initCustomRuntime() {
  initAccessibility();
  initAnalytics();
  initMenus();
  initScrollBehavior();
  initHeroRotator();
  initForms();
  initMediaLazyLoading();
  initGalleryFilter();
  initTestimonialsSlider();
}

onDomReady(initCustomRuntime);
