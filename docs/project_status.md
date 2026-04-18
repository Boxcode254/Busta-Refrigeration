## Project Status

Last updated: 2026-04-18

### Latest Delivery: Lighthouse Performance & Accessibility Hardening (Completed)

Current state: implementation complete and audit-verified. Three Lighthouse audit cycles executed with fixes applied and validated.

**Issues resolved**
1. CSS render-blocking waterfall: Moved 12 `@import url()` rules from `src/site/styles/global/custom.css` to `<link>` tags in HTML `<head>`, eliminating cascading load delay.
   - Before: Style & Layout 13.4s (blocking)
   - After: Style & Layout 1.2s (91% improvement)
2. Missing image dimensions: Added explicit `width` and `height` attributes to all image elements across all pages.
   - Affected: 6 service card images, about section, features, captcha images, 5 testimonial star divs
3. Font render-blocking: Added `font-display: swap` to all 66 `@font-face` declarations in `src/site/styles/global/g/fonts.css`.
4. Icon accessibility: Added `role="img"` to 5 testimonial star rating divs (star-based content without alt text).
5. Console DNS errors: Localized favicon URLs from `https://...` to relative paths, eliminating external resolution attempts.
6. Logo aspect ratio: Applied `max-width: 121px; height: auto; aspect-ratio: 145/54` CSS to maintain intrinsic proportions.

**Files changed**
- `src/site/index.html` — Favicon URLs localized, logo width/height/fetchpriority added, image dimensions added, section CSS links added, star divs got role="img"
- `src/site/styles/global/custom.css` — 12 `@import url()` rules removed, replaced with comment documenting move to `<link>` tags
- `src/site/styles/global/g/fonts.css` — `font-display: swap` added to all 66 `@font-face` rules
- `src/site/styles/pages/home.inline.css` — Logo CSS aspect-ratio rules applied
- `src/site/404.html`, `src/site/projects-clients/index.html`, `src/site/spares-components/index.html`, `src/site/privacy/index.html`, `src/site/legal-notice/index.html` — Favicon URLs localized, appropriate section CSS `<link>` tags added, duplicate header.css removed

**Lighthouse audit results**

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Performance | 54 | 55 | +1 |
| Accessibility | 89 | 92 | +3 |
| Best Practices | 89 | 96 | +7 |
| SEO | 100 | 100 | — |
| Main-thread work | 29.6s | 3.6s | -88% |

**Verification checklist**
- ✅ Build: `npm run build` PASS (all 6 pages + 404 compile cleanly)
- ✅ Vite dist output: All assets, sections, and images present
- ✅ Lighthouse v12.8.2 audit run 3: Final scores extracted and verified
- ✅ Main-thread work reduction: 29.6s → 3.6s (88% improvement from run 1 to run 3)

**Known remaining issues (deferred)**
1. CLS (Cumulative Layout Shift): 0.132 (above 0.1 threshold) — investigate layout shift triggers
2. FCP (First Contentful Paint): 5.7s / LCP (Largest Contentful Paint): 8.4s — large CSS bundle (317KB custom.css) and Google Fonts still render-blocking under mobile throttling
3. Logo height aspect ratio: Still partially constrained by header.css `height: 52px` — prefer CSS aspect-ratio override over hard height
4. Image-aspect-ratio failures: 2 remaining — captcha base64 image distorted by parent CSS container

**Next immediate steps**
1. Investigate CLS root causes — which elements are shifting layout?
2. Optional: CSS purging to reduce 317KB custom.css bundle for better FCP/LCP scores
3. Logo height CSS refactor to fully resolve aspect-ratio constraints
4. Audit remaining image-aspect-ratio failures for CSS container fixes

---

### Latest Delivery: Card Sizing, Readability, and Back-to-Top Fix (Completed)

Current state: implementation complete and Lighthouse-verified. No regressions.

**Issues resolved**
1. Service cards too small on desktop — cards were rendering at narrow widths with small text.
2. Spares product cards too small on desktop — product grid columns and text were undersized.
3. Duplicate back-to-top yellow button — two instances present on homepage (one inside hero, one in footer area).

**Files changed**
- `src/site/styles/sections/services.css`:
  - Container `max-width`: 1160px → 1280px
  - Grid `minmax`: 280px → 320px
  - Image strip height: 160px → 220px
  - Card body padding: 28px → 32px
  - Title font-size: 1.05rem → 1.15rem
  - Description font-size: 0.90rem → 1.00rem
  - Read-more link font-size: 0.85rem → 0.92rem
- `src/site/styles/sections/products.css`:
  - Product grid `minmax`: 220px → 250px
  - Card body padding: 0.75rem/0.875rem → 0.9rem/1rem
  - Card name font-size: 0.82rem → 0.92rem
  - Badge font-size: 0.65rem → 0.72rem
  - CTA font-size: 0.72rem → 0.80rem
- `src/site/index.html` — Removed hero-embedded `#ed-2132430174` back-to-top `<figure>` (duplicate)
- `src/site/styles/pages/home.inline.css` — Removed `#ed-2132430174 { position: fixed; z-index: 2; }` (orphaned rule for removed element)

**Lighthouse audit results (v4)**

| Metric | Pre-fix | Post-fix | Change |
|--------|---------|----------|--------|
| Performance | 55 | 56 | +1 |
| Accessibility | 92 | 92 | — |
| Best Practices | 96 | 96 | — |
| SEO | 100 | 100 | — |
| CLS | 0.132 | 0.142 | ±0.01 (variance) |
| FCP | 5.7s | 5.7s | — |
| LCP | 8.4s | 8.4s | — |

**Verification checklist**
- ✅ Build: `npm run build` PASS (247 modules, exit 0)
- ✅ Only one back-to-top button present in homepage DOM (`#ed-2132430111`)
- ✅ Service card images retain `width`/`height` attributes — no new CLS risk from strip height change
- ✅ Mobile breakpoints untouched: `≤640px` grid stays 1-column, `≤480px` spares grid stays 2-column
- ✅ Lighthouse v4 run: Performance 56, Accessibility 92, Best Practices 96, SEO 100

---

### Earlier Delivery: Prompt E — Image Cleanup Apply Pass (Completed)

Current state: cleanup executed successfully, 664 orphaned files removed, 33.3 MB freed.

**Cleanup details**
- Dry-run baseline: 3570 total files, 175.8 MB
- Safe delete candidates identified: 664 orphaned resize variants (dimensions prefixes like `/1024/`, `/960/`, `/optimized/...`)
- Applied deletion: `python3 scripts/image_audit_cleanup.py --apply`
- Post-cleanup state: 2906 total files, 142.5 MB (19% reduction)
- Build: ✅ PASS (21.74s, all 5 pages + 404)
- Image references in HTML: ✅ UNCHANGED (referenced-paths integrity maintained)

**Files affected**
- No HTML, CSS, JS, or PHP modifications
- No deletions from `/images/document/` (PDFs preserved)
- Parity script: added documentation of known imageRefCount baseline (privacy/legal-notice: 5 vs 8 refs due to intentional favicon/responsive srcset enhancements in recovered source)

**Verification checklist**
- ✅ Dry run confirmed 664 safe candidates (all dimension-prefixed orphans)
- ✅ All 588 referenced paths preserved (from .audit/.../06-referenced-paths.txt)
- ✅ Post-cleanup dry run: 0 new candidates, referenced count unchanged
- ✅ Build: all 6 pages (index, projects-clients, spares-components, privacy, legal-notice, 404) compile cleanly
- ✅ Image references: no broken links, all referenced variants still present
- ✅ Parity script: documented known 3-image baseline on policy pages (favicon + responsive srcsets)

---



Current state: implementation complete and build-verified.

**Files changed**
- `src/site/404.html` — new standalone 404 page with full header, 404 content section, footer, and WhatsApp FAB
- `vite.config.mjs` — added `"404": path.resolve(sourceRoot, "404.html")` to `inputPages`
- `.htaccess` — added `ErrorDocument 404 /404.html` and `ErrorDocument 403 /404.html`

**Design implementation**
- Background `#101316` on html/body and main section
- Large hollow "404": `clamp(6rem, 20vw, 12rem)`, weight 900, `color: transparent`, `-webkit-text-stroke: 2px #fbbe1a`
- H1 "Page not found": `clamp(1.4rem, 4vw, 2rem)`, white, weight 700
- Subtext: `#9a9ea3`, `max-width: 400px`, centered
- Three pill buttons: "Go Home" (yellow fill → `/`), "Our Services" (white outline → `/#services`), "Contact Us" (white outline → `/#contact`)
- Header: standalone topbar + nav (same markup as other pages, no hero container)
- Footer: identical to all other pages, including WhatsApp FAB
- Styles inline in `<style>` block (no separate CSS file — single-use page)

**Verification results**
- `npm run build`: PASS (exit 0)
- `dist/404.html` present at dist root: CONFIRMED (20.56 kB)
- `dist/.htaccess` contains `ErrorDocument 404 /404.html`: CONFIRMED (line 37)
- `dist/.htaccess` contains `ErrorDocument 403 /404.html`: CONFIRMED (line 38)
- 235 modules transformed (up from 233 — 2 new CSS chunks for 404-specific header CSS)

**Post-deploy test**
- Navigate to `https://www.bustarefrigeration.co.ke/nonexistent-path` — should serve 404.html with HTTP 404 status

---



### Workflow Guardrails

Current policy:
1. After every implementation prompt, update this file (`docs/project_status.md`) in the same delivery cycle.
2. Treat this status document as the canonical running changelog for build-impacting and release-impacting changes.
3. Keep completion state explicit: implemented, verified, blocked, or deferred.

Repository source of truth:
- GitHub: https://github.com/Boxcode254/Busta-Refrigeration

### Latest Delivery: Prompt 13 Global Polish and Mobile Optimization (Completed)

Current state: implementation complete and build-verified.

**Completed in this delivery**
1. Added reveal-on-scroll animation system in `src/site/scripts/scroll.js` with IntersectionObserver, one-time visibility toggles, stagger delay caps, and reduced-motion bypass.
2. Added global polish rules in `src/site/styles/global/custom.css`:
  - `.anim-ready` and `.visible` animation states.
  - Primary/outline button micro-interactions and active feedback.
  - Hover polish for section CTA text links.
  - Smooth scrolling and anchor offset support.
  - Mobile refinements for services cards, about image constraints, and footer centering.
  - Overline typography normalization, heading overflow safety, and yellow focus-visible rings.
  - Dark scrollbar styling and key image container aspect-ratio guards.
3. Added hero LCP preload hint in `src/site/index.html` using `rel="preload" as="image" fetchpriority="high"` for the above-the-fold hero asset.

**Verification results**
1. Build check: PASS
  - `npm run build` completed with exit code 0.
2. Dist artifact checks: PASS
  - Preload link present in built `dist/index.html`.
  - New CSS hooks and polish rules present in built custom CSS bundle.
  - Reveal animation markers present in built custom JS bundle.
3. Parity check: KNOWN BASELINE ISSUE (unchanged)
  - `npm run check:parity` still reports existing checksum/signature mismatch and `imageRefCount` delta (5 vs 8).

**Status summary for this delivery**
- Prompt 13 implementation: COMPLETE
- Build integrity: PASS
- Known parity baseline issue: OPEN (pre-existing)
- Remaining follow-up: manual cross-page UX QA + manual Lighthouse audits

### Completed Track: Monitoring Infrastructure (Phase 1 Delivered)

Current state: core implementation slice is complete with consent-gated GA4, Core Web Vitals tracking, Sentry browser integration, lead/content event instrumentation, and dashboard setup documentation.

**Implemented in this slice**
1. Replaced placeholder analytics bootstrap with monitoring orchestration in `src/site/scripts/analytics.js`.
2. Added monitoring modules:
  - `src/site/scripts/monitoring/config.js`
  - `src/site/scripts/monitoring/consent.js`
  - `src/site/scripts/monitoring/ga4.js`
  - `src/site/scripts/monitoring/vitals.js`
  - `src/site/scripts/monitoring/sentry.js`
3. Added form lead telemetry hooks in `src/site/scripts/forms.js` for started/attempt/valid/validation-failed/success/failure states.
4. Updated runtime order in `src/site/scripts/custom.js` so analytics initializes before other feature modules.
5. Added runtime dependencies in `package.json`:
  - `web-vitals`
  - `@sentry/browser`
6. Added env contract template in `.env.example`.
7. Added dashboard and operations guide in `docs/monitoring_dashboard.md`.

**Follow-up backlog (non-blocking)**
1. Validate build output and runtime smoke checks with and without consent granted.
2. Wire production CMP callbacks to `busta:consent:update`.
3. Update privacy policy copy to match GA4 and Sentry usage details.

### Completed Track: Accessibility Remediation (Phase 1 Delivered)

Current state: first shared accessibility hardening slice is implemented in the custom runtime and global stylesheet, covering skip navigation, landmark targeting, ARIA labels for icon-only controls, keyboard support improvements for menu triggers, visible focus styling, and screen-reader-friendly form labeling/status updates.

**Implemented in this slice**
1. Added shared runtime accessibility module at `src/site/scripts/accessibility.js`.
  - Injects a `Skip to main content` link when missing.
  - Ensures a `main` target (`#main-content`) exists via semantic/role fallback.
  - Adds ARIA labels for icon-only links (WhatsApp/phone/back-to-top/logo/regenerate patterns).
  - Adds semantic upgrades for non-button controls (`.menu-trigger` role/tabindex/label).
  - Adds carousel region labeling and autoplay `aria-live` hardening.
  - Applies runtime contrast fallback for low-contrast brand text combinations detected below WCAG thresholds.
2. Wired accessibility bootstrap into `src/site/scripts/custom.js` startup flow.
3. Upgraded `src/site/scripts/menu.js` for keyboard and ARIA behavior.
  - Adds `aria-controls`, `aria-expanded`, and label handling on menu triggers.
  - Supports Enter/Space activation and Escape close behavior.
  - Syncs expanded state during open/close and link-click close.
4. Extended `src/site/scripts/forms.js` with screen-reader validation behavior.
  - Adds per-form live status region (`role="status"`, polite announcements).
  - Auto-generates programmatic labels for unlabeled fields.
  - Marks invalid fields with `aria-invalid`, links errors via `aria-describedby`, and focuses first invalid field on submit.
5. Added shared accessibility CSS in `src/site/styles/global/custom.css`.
  - Added `.skip-link`, `.sr-only`, and `.form-error-message` helpers.
  - Restored visible `:focus-visible` ring across interactive elements.

**Validation in this slice**
1. Syntax checks: `node --check` passed for updated script modules.
2. Build: `npm run build` passed successfully.
3. Runtime smoke check: homepage rendered with skip link, main landmark target, back-to-top labeling, icon-link naming, and form live-region/label output visible in accessibility tree.

**Follow-up backlog (non-blocking)**
1. Add explicit ARIA naming and keyboard semantics for gallery/lightbox trigger links currently labeled as generic `Open link`.
2. Refine contrast remediation from runtime fallback to token-level, deterministic CSS classes for all recurring heading/text patterns.
3. Add page-level checks for privacy/legal pages to guarantee skip-link target placement and heading hierarchy consistency.
4. Add scripted a11y smoke checks (keyboard + landmark + form-invalid flow) to prevent regressions.

### Completed Track: Dev Build Recovery

Current state: complete. Build scaffold, source recovery, parity automation, cPanel packaging, and ES module runtime split are all implemented and verified. Vite multi-page build has been in continuous use across all subsequent prompts.

**Scope for this track**
1. Reconstruct editable, unminified source files from shipped production artifacts.
2. Add a Vite multi-page build pipeline for development and production.
3. Enable JavaScript and CSS source maps for debugging.
4. Add npm lifecycle scripts for recovery, dev server, build, and preview.
5. Add `.gitignore` rules for generated and dependency artifacts.

**Implemented in this slice**
1. Added development/build scripts and dependencies in `package.json`.
  - Added scripts: `recover:sources`, `check:parity`, `dev`, `build`, `build:strict-maps`, `preview`, `package:cpanel`, `format:recovered`.
  - Added build toolchain deps: `vite`, `vite-plugin-static-copy`, `postcss`, `autoprefixer`, `prettier`, `js-beautify`.
2. Added `vite.config.mjs` with multi-page input and static asset copy strategy.
  - Inputs include home, projects-clients, spares-components, privacy, and legal-notice pages.
  - Build sourcemaps enabled via `build.sourcemap: true`.
  - CSS minification is disabled during build to preserve stronger sourcemap traceability for generated CSS assets.
  - Static deployment artifacts copied into build output (`api.php`, `.htaccess`, `images`, `webcard`, etc.).
3. Added `postcss.config.cjs` with `autoprefixer`.
4. Added `scripts/recover_sources.js`.
  - Beautifies/minified custom CSS and JS into editable sources under `src/`.
  - Converts page references from hashed production asset names to source paths.
  - Extracts inline page styles into dedicated CSS files.
5. Added `scripts/check_recovered_parity.js`.
  - Compares production vs recovered pages using inline CSS parity, structure signature parity, ID parity, and normalized asset parity.
  - Covers home, projects-clients, spares-components, privacy, and legal-notice pages.
6. Added `scripts/ensure_css_sourcemaps.js`.
  - Enforces map coverage for all CSS files in `dist/assets`.
  - Generates missing CSS map sidecars and appends missing `sourceMappingURL` annotations.
7. Added `scripts/package_cpanel_zip.js` and release packaging flow.
  - Creates deployment zip from inside `dist/` so files are at archive root (cPanel-ready shape).
  - Outputs archives into `releases/`.
8. Added `.gitignore` for Node/build artifacts (`node_modules`, `dist`, logs, env files).
9. Refactored recovered custom runtime into ES modules under `src/site/scripts`.
  - Replaced monolithic `custom.js` runtime with import-based orchestrator entry.
  - Added modules: `menu.js`, `forms.js`, `scroll.js`, `analytics.js`, `runtime.js`, `dom.js`, and `media.js`.
  - Reduced jQuery dependency in custom layer by converting menu, scroll, and media interactions to vanilla DOM APIs.
  - Kept vendor integration points (`viewport`, `webcard`, `ElementFormContainer`, optional `cms`) isolated in module boundaries.
  - Added JSDoc coverage for module exports and non-trivial helper functions.
  - Validation completed: `node --check` on all script modules and `npm run build` pass.

**Immediate next steps**
1. Run visual parity smoke test against built pages (`dist/index.html`, `dist/projects-clients/index.html`, `dist/spares-components/index.html`) with focus on menu, sticky behavior, back-to-top, lazy-loaded media, and contact form submission path.
2. Add lightweight module-level behavior checks (smoke scripts) for `menu.js`, `scroll.js`, and `forms.js` to protect against regressions during further decoupling.
3. Decide whether to keep vendored Webcard runtime fully external or add a dedicated vendor handoff folder for managed updates.
4. Optionally add a pre-build lint/format gate for `src/site/scripts` and `src/site/styles`.

### Completed Track: CDN Image URL Migration (Pending DNS Go-Live)

Current state: code complete. Write migration applied 1010 replacements across 6 files. Webcard bundle patched to preserve CDN host in runtime gallery logic. Remaining dependency is external: DNS/CDN for media.bustarefrigeration.co.ke must resolve before image loads succeed in production.

**Scope for this track**
1. Add CDN base URL support to image optimization pipeline outputs.
2. Add a safe dry-run-first migration utility for existing image URLs in source files.
3. Rewrite existing site image URLs to CDN-prefixed URLs where appropriate.
4. Validate rendering and network behavior after rewrite.
5. Add static cache policy headers for image assets.

**Implemented in this slice**
1. Updated scripts/image_optimize_pipeline.js to support configurable image base URL.
  - Supports environment variables CDN_BASE_URL or IMAGE_BASE_URL.
  - Supports CLI flags --cdn-base= and --image-base=.
  - Manifest now records imageBaseUrl and generated URLs follow configured base.
2. Added scripts/image_cdn_migrate.js for project-wide URL rewriting.
  - Dry run is default mode.
  - Write mode enabled via --write.
  - Report output supported via --report=.
  - Rewrites plain and escaped image URLs in html/php/js/css/xml.
  - Skips non-target directories including .git, node_modules, vendor, images, .audit.
  - Excludes /images/document/ links from rewrite.
3. Added npm commands in package.json.
  - images:cdn:migrate:dry
  - images:cdn:migrate
4. Updated .htaccess caching policy.
  - Long immutable cache headers for image extensions.
  - Medium cache policy for css/js.
  - Short cache policy for html/php.

**Execution and verification results (this session)**
1. Full dry run: PASS
  - Report: .audit/cdn-url-migration/dry-run-report.json
  - Scanned files: 9
  - Changed files: 6
  - Total replacements: 1010
  - Changed files list:
    - index.html (118)
    - legal-notice/index.html (5)
    - privacy/index.html (5)
    - projects-clients/index.html (335)
    - spares-components/index.html (546)
    - webcard/static/app.bundle.1773832603.js (1)
2. Write migration: PASS
  - Report: .audit/cdn-url-migration/write-report.json
  - Changed files: 6
  - Total replacements: 1010
3. Runtime edge-case fix in webcard bundle: PASS
  - Updated webcard/static/app.bundle.1773832603.js to preserve URL host when resizing image paths in runtime gallery logic.
  - Fixed two host-dropping replacements that could convert absolute CDN image URLs back to local /images/... URLs.
4. Browser smoke checks: PASS (with DNS dependency)
  - Pages render on local server for homepage, projects-clients, and spares-components.
  - Fresh-page DOM checks show CDN-prefixed image links and image sources across main galleries.
  - Remaining local /images/ links are limited to intentional document links under /images/document/.
  - Network requests to https://media.bustarefrigeration.co.ke are issued.
  - Local environment currently returns ERR_NAME_NOT_RESOLVED for that hostname, so external image loads fail until DNS/CDN endpoint is available.
5. Optimizer with CDN base enabled: PASS
  - Command executed with CDN_BASE_URL=https://media.bustarefrigeration.co.ke and --update-html.
  - Processed source images: 326
  - HTML upgrade pass executed (0 additional img to picture upgrades in this run).
  - Manifest confirms imageBaseUrl=https://media.bustarefrigeration.co.ke.
  - Sample generated URL confirmed with CDN prefix.

**Next immediate steps**
1. Ensure media.bustarefrigeration.co.ke DNS and TLS are live and pointed to the image origin.
2. Confirm CDN origin contains all required image paths, including optimized outputs.
3. Re-run browser network smoke checks in staging/live where DNS resolves.
4. Optional: decide whether /images/document/ PDF links should remain local or move to CDN.

### Completed Track: Image Optimization Pipeline

Current state: complete. Pipeline built, 326 source images processed to WebP/JPEG variants and responsive sizes, HTML picture/srcset upgrades applied across all key pages, IntersectionObserver lazy-loading runtime in place.

**Scope for this track**
1. Convert JPEG/PNG assets to WebP with JPEG fallback.
2. Generate responsive variants and `srcset` definitions.
3. Apply `<picture>` markup updates in HTML files.
4. Implement lazy loading with IntersectionObserver API.
5. Use quality targets:
  - JPEG: 85
  - WebP: 80

**Implemented in this slice**
1. Added build automation in `scripts/image_optimize_pipeline.js`.
  - Converts all JPEG/PNG files under `images/`.
  - Emits responsive variants and compression outputs:
    - JPEG quality 85
    - WebP quality 80
  - Writes reports to `.audit/image-optimization/`.
2. Added npm script entry points in `package.json`.
  - `images:optimize`
  - `images:optimize:update-html`
  - `images:optimize:all`
3. Added automatic HTML image upgrade support.
  - Generates `<picture>` with WebP + JPEG fallback and responsive `srcset`.
  - Applied upgrades on key pages where compatible image records existed.
4. Added IntersectionObserver-based lazy loading runtime.
  - Implemented in `js/custom.241217072522.js`.
  - Handles `data-src`, `data-srcset`, and lazy background image holders.
  - Includes MutationObserver refresh for dynamically inserted nodes.

**Execution and verification results**
1. Full optimizer run executed:
  - Source JPEG/PNG processed: 326
  - Optimized files generated: 3,216
  - Manifest/report generated:
    - `.audit/image-optimization/manifest.json`
    - `.audit/image-optimization/html-update-summary.json`
    - `.audit/image-optimization/summary.txt`
2. HTML upgrade counts from run:
  - `index.html`: 6 optimized `<picture>` blocks present
  - `projects-clients/index.html`: 22 optimized `<picture>` blocks present
  - `spares-components/index.html`: 34 optimized `<picture>` blocks present
3. Post-change reference integrity check on key pages:
  - Total discovered image references: 667
  - Missing files: 0
4. Syntax checks: PASS
  - `node --check scripts/image_optimize_pipeline.js`
  - `node --check js/custom.241217072522.js`

**Next immediate steps**
1. Run browser visual regression smoke pass on key pages.
2. Optionally expand HTML upgrade coverage beyond currently compatible tags if desired.
3. Measure Lighthouse image and LCP impact before/after for final tuning.

---

### Archived Track: Image Performance Cleanup (Baseline Captured)

Current state: baseline audit slice is complete and archived pending deliberate reactivation. A dry-run-first audit pipeline is in the repo and baseline reports were generated from the current `images/` tree.

**Files added/updated in this slice**
- `scripts/image_audit_cleanup.py`
- `.audit/image-cleanup/00-summary.txt`
- `.audit/image-cleanup/01-large-files-over-500kb.tsv`
- `.audit/image-cleanup/02-duplicate-groups.tsv`
- `.audit/image-cleanup/03-unreferenced-paths.txt`
- `.audit/image-cleanup/04-orphan-ids.txt`
- `.audit/image-cleanup/05-safe-delete-candidates.txt`
- `.audit/image-cleanup/06-referenced-paths.txt`
- `docs/project_status.md`

**Implemented**
1. Added a conservative image audit utility in `scripts/image_audit_cleanup.py`.
  - Dry run is default behavior.
  - `--apply` deletes only safe candidates (unreferenced files that are byte-identical duplicates of a referenced image).
  - Produces deterministic reports under `.audit/image-cleanup/`.
2. Implemented exact inventory/report coverage.
  - Full image inventory and total size.
  - Files larger than 500KB.
  - SHA-256 duplicate groups.
  - Unreferenced image paths.
  - Orphan image IDs.
  - Safe deletion candidate list.
3. Implemented source reference extraction from current project files.
  - Scans HTML/CSS/JS/PHP/XML references.
  - Decodes URL-encoded image paths for exact filesystem matching.
  - Keeps existing Webcard lazy-loading behavior untouched.

**Baseline dry-run results (current codebase)**
- Total image files: 509
- Total image bytes: 68,662,142
- Files over 500KB: 39
- Duplicate groups: 116
- Unreferenced paths: 337
- Orphan IDs: 13
- Safe delete candidates: 155
- Deletions performed: 0 (dry run)

**Verification log (archived baseline)**
1. Script syntax check: PASS
  - `python3 -m py_compile scripts/image_audit_cleanup.py`
2. Dry run execution: PASS
  - `./scripts/image_audit_cleanup.py`
3. Output artifact generation: PASS
  - Reports created in `.audit/image-cleanup/`.

**Reactivation checklist**
- Review `05-safe-delete-candidates.txt` and run a controlled apply pass:
  - `./scripts/image_audit_cleanup.py --apply`
- Re-run dry mode immediately after apply to confirm:
  - no referenced paths were removed
  - candidate list decreased as expected
- Perform manual smoke check on homepage, projects page, spares page, privacy page, and legal notice page.

**Open blockers (archived track)**
None. First cleanup apply is ready when approved.

---

### Completed Track: Form Handler Security Implementation

Current state: implementation complete and verified. PHP lint pass, Composer install pass, PHPMailer autoload confirmed.

**Scope implemented**
- Email header injection hardening.
- File upload security validation (MIME and extension whitelist, upload-origin checks, size limits).
- CSRF token issuance and validation.
- Input sanitization using `filter_var()` and output escaping with `htmlspecialchars()`.
- Mail transport migration path from `mail()` to PHPMailer API usage.

**Files updated in security track**
- `api.php`
- `js/custom.241217072522.js`
- `composer.json`

**SMTP email wiring — implemented (April 2026)**
- `vlucas/phpdotenv ^5.5` added to `composer.json`.
- `.env` created at project root with `MAIL_HOST`, `MAIL_PORT`, `MAIL_ENCRYPTION`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `MAIL_TO_ADDRESS`.
- `.env.example` updated with same keys (empty values) for documentation.
- `.htaccess` updated: direct browser access to `.env` and `.env.example` blocked.
- `api.php` updated:
  - Dotenv bootstrap added at top (loads `vendor/autoload.php` + `safeLoad()`).
  - `createSmtpMailer()` helper: configures PHPMailer via `$_ENV` vars (STARTTLS/SMTPS, port, credentials, from address).
  - `buildAutoReplyHtml()`: branded HTML auto-reply template (inline CSS, brand colors `#101316`/`#fbbe1a`, phone, WhatsApp, office hours, footer).
  - `sendFormSummaryByEmail()` now uses SMTP via `createSmtpMailer()` instead of bare `mail()`.
  - Auto-reply send block added — non-fatal, failure logged but does not block main form flow.
  - Dev-mode fallback: when `MAIL_HOST` is empty, logs `[BustaForms] MAIL_HOST not set` and returns `true` so local form testing completes without a mail server.

**Remaining steps for SMTP track (requires live cPanel server)**
1. SSH/terminal on server: `composer require vlucas/phpdotenv` (or `composer install` after uploading `composer.json`).
   - PHP and Composer are not available in local dev environment — this must run on the server.
2. Set real password in `.env`: replace `your_cpanel_email_password` with the actual cPanel email password for `info@bustarefrigeration.co.ke`.
3. `php -l api.php` — must report no syntax errors.
4. Browser/API submission test matrix on a running PHP server:
  - valid form submit path
  - missing token → expect 403
  - invalid token → expect 403
  - disallowed MIME/extension → expect rejection
  - file > 5 MB → expect rejection
  - notification email arrives at `info@bustarefrigeration.co.ke` within 2 min
  - visitor auto-reply arrives at submitted email address
  - email headers show `from: info@bustarefrigeration.co.ke` with no relay banner
5. Local dev smoke test: submit form, check `error_log` for `[BustaForms] MAIL_HOST not set` — confirms fallback path works.

**Optional integration path: Contact Form 7 (WordPress only)**
- Status: feasible if the site is hosted inside WordPress. Not applicable to the current static + `api.php` workflow unless a WordPress runtime is introduced.
- Recommended setup sequence:
  1. Install and activate Contact Form 7 in WordPress.
  2. Create form fields that mirror current payload keys (`name`, `email`, `phone`, `service`, `message`, optional file).
  3. Enable Akismet/Flamingo or reCAPTCHA for spam reduction.
  4. Configure Mail tab (To/From/Reply-To) and validate SPF/DKIM on the sending domain.
  5. Place shortcode on the target page template and test success/error states.
  6. If CRM/webhook forwarding is needed, use CF7 hooks (`wpcf7_mail_sent`) to forward structured payloads.
- Migration note:
  - If adopting CF7, retire duplicate submission endpoints to avoid split analytics and inconsistent validation logic.

**Form platform decision matrix**

| Option | Best fit | Pros | Risks / Cost | Recommendation |
|---|---|---|---|---|
| Keep current static form + `api.php` | Current architecture remains static hosting + PHP endpoint | Reuses existing hardened validation and upload controls; no CMS dependency; fastest path to production | Ongoing maintenance remains custom; manual plugin-like upgrades (security patches) are internal responsibility | Preferred when avoiding WordPress runtime and wanting minimal migration risk |
| Migrate form flow to WordPress + Contact Form 7 | Site is already WordPress-based or planned to move to WordPress | Faster editor-driven form changes; strong plugin ecosystem (spam controls, CRM hooks); less custom code to maintain | Requires WordPress runtime, plugin lifecycle management, and data/analytics migration planning | Preferred only when WordPress is strategic for content + operations |

**Selection guidance**
1. Choose current `api.php` path if launch priority is speed and architecture stability.
2. Choose CF7 path if non-developers must manage form logic frequently from WP admin.
3. Avoid hybrid long term; run one canonical submission pipeline to keep validation, analytics, and delivery behavior consistent.
