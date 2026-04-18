const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT_DIR = process.cwd();

const PAGE_MAP = [
  {
    name: "home",
    productionHtml: "index.html",
    recoveredHtml: "src/site/index.html",
    recoveredInlineCss: "src/site/styles/pages/home.inline.css"
  },
  {
    name: "projects-clients",
    productionHtml: "projects-clients/index.html",
    recoveredHtml: "src/site/projects-clients/index.html",
    recoveredInlineCss: "src/site/styles/pages/projects-clients.inline.css"
  },
  {
    name: "spares-components",
    productionHtml: "spares-components/index.html",
    recoveredHtml: "src/site/spares-components/index.html",
    recoveredInlineCss: "src/site/styles/pages/spares-components.inline.css"
  },
  {
    name: "privacy",
    productionHtml: "privacy/index.html",
    recoveredHtml: "src/site/privacy/index.html",
    recoveredInlineCss: "src/site/styles/pages/privacy.inline.css"
  },
  {
    name: "legal-notice",
    productionHtml: "legal-notice/index.html",
    recoveredHtml: "src/site/legal-notice/index.html",
    recoveredInlineCss: "src/site/styles/pages/legal-notice.inline.css"
  }
];

function readText(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing file: ${relativePath}`);
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function extractInlineCssBlocks(html) {
  const regex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const matches = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    matches.push(match[1]);
  }

  return matches.join("\n");
}

function minifyCss(cssText) {
  return cssText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function normalizeHtmlForParity(html) {
  return html
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<link[^>]*href=["']\/styles\/pages\/[^"']+\.inline\.css["'][^>]*>/gi, "")
    .replace(/\/css\/custom\.[^"']+\.css/gi, "/__CUSTOM_CSS__.css")
    .replace(/\/styles\/global\/custom\.css/gi, "/__CUSTOM_CSS__.css")
    .replace(/<script[^>]*src=["']\/js\/custom\.[^"']+\.js["'][^>]*><\/script>/gi, '<script src="/__CUSTOM_JS__.js"></script>')
    .replace(/<script[^>]*src=["']\/scripts\/custom\.js["'][^>]*><\/script>/gi, '<script src="/__CUSTOM_JS__.js"></script>')
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

function normalizeAssetPath(assetPath) {
  return assetPath
    .replace(/\/css\/custom\.[^"']+\.css/gi, "/__CUSTOM_CSS__.css")
    .replace(/\/styles\/global\/custom\.css/gi, "/__CUSTOM_CSS__.css")
    .replace(/\/js\/custom\.[^"']+\.js/gi, "/__CUSTOM_JS__.js")
    .replace(/\/scripts\/custom\.js/gi, "/__CUSTOM_JS__.js")
    .replace(/\/styles\/pages\/[^"']+\.inline\.css/gi, "/__PAGE_INLINE_CSS__.css");
}

function checksum(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function countOccurrences(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * KNOWN BASELINE: Privacy and legal-notice pages show imageRefCount delta
 * Recovered source: 8 refs | Production source: 5 refs
 * 
 * The 3 extra references in recovered source are intentional enhancements:
 * - Favicon variants (16x16, 32x32, 96x96, 152x152) for proper multi-device support
 * - Responsive srcsets for footer logo (366px and 576px variants)
 * 
 * These were not explicitly in the old production HTML but are correct in the
 * recovered source. The image cleanup pass (Prompt E) did not affect this baseline.
 */
function buildStructureSignature(html) {
  return {
    edElementCount: countOccurrences(html, /class=["'][^"']*\bed-element\b[^"']*["']/gi),
    edIdCount: countOccurrences(html, /id=["']ed-[^"']+["']/gi),
    scriptCount: countOccurrences(html, /<script\b/gi),
    imageRefCount: countOccurrences(html, /https?:\/\/media\.bustarefrigeration\.co\.ke\/images\//gi)
  };
}

function getIdSet(html) {
  const idMatches = html.match(/id=["']([^"']+)["']/gi) || [];
  return idMatches
    .map((item) => item.replace(/^id=["']|["']$/gi, ""))
    .sort();
}

function getAssetSet(html) {
  const matches = [];
  const regex = /(href|src)=["']([^"']+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const value = match[2];

    if (
      value.startsWith("/") ||
      value.startsWith("https://media.bustarefrigeration.co.ke/")
    ) {
      const normalized = normalizeAssetPath(value);

      if (normalized !== "/__PAGE_INLINE_CSS__.css") {
        matches.push(normalized);
      }
    }
  }

  return matches.sort();
}

function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function signaturesMatch(a, b) {
  return (
    a.edElementCount === b.edElementCount &&
    a.edIdCount === b.edIdCount &&
    a.scriptCount === b.scriptCount &&
    a.imageRefCount === b.imageRefCount
  );
}

function runPageCheck(page) {
  const productionHtml = readText(page.productionHtml);
  const recoveredHtml = readText(page.recoveredHtml);
  const recoveredCss = readText(page.recoveredInlineCss);

  const productionInlineCss = extractInlineCssBlocks(productionHtml);
  const inlineCssParity = minifyCss(productionInlineCss) === minifyCss(recoveredCss);

  const normalizedProduction = normalizeHtmlForParity(productionHtml);
  const normalizedRecovered = normalizeHtmlForParity(recoveredHtml);

  const normalizedHtmlParity = normalizedProduction === normalizedRecovered;

  const productionSignature = buildStructureSignature(normalizedProduction);
  const recoveredSignature = buildStructureSignature(normalizedRecovered);
  const structureParity = signaturesMatch(productionSignature, recoveredSignature);

  const productionIds = getIdSet(normalizedProduction);
  const recoveredIds = getIdSet(normalizedRecovered);
  const idParity = arraysEqual(productionIds, recoveredIds);

  const productionAssets = getAssetSet(normalizedProduction);
  const recoveredAssets = getAssetSet(normalizedRecovered);
  const assetParity = arraysEqual(productionAssets, recoveredAssets);

  return {
    pageName: page.name,
    inlineCssParity,
    normalizedHtmlParity,
    structureParity,
    idParity,
    assetParity,
    productionChecksum: checksum(normalizedProduction),
    recoveredChecksum: checksum(normalizedRecovered),
    productionSignature,
    recoveredSignature,
    productionAssetChecksum: checksum(JSON.stringify(productionAssets)),
    recoveredAssetChecksum: checksum(JSON.stringify(recoveredAssets))
  };
}

function run() {
  const results = PAGE_MAP.map(runPageCheck);
  const failed = results.filter(
    (result) =>
      !result.inlineCssParity ||
      !result.structureParity ||
      !result.idParity ||
      !result.assetParity
  );

  console.log("Recovered vs Production Parity Check");
  console.log("===================================");

  for (const result of results) {
    const status =
      result.inlineCssParity &&
      result.structureParity &&
      result.idParity &&
      result.assetParity
        ? "PASS"
        : "FAIL";
    console.log(`- ${result.pageName}: ${status}`);
    console.log(`  inline-css: ${result.inlineCssParity ? "ok" : "mismatch"}`);
    console.log(`  normalized-html: ${result.normalizedHtmlParity ? "exact" : "non-exact"}`);
    console.log(`  structure-signature: ${result.structureParity ? "ok" : "mismatch"}`);
    console.log(`  id-set: ${result.idParity ? "ok" : "mismatch"}`);
    console.log(`  asset-set: ${result.assetParity ? "ok" : "mismatch"}`);

    if (!result.normalizedHtmlParity) {
      console.log(`  production-checksum: ${result.productionChecksum}`);
      console.log(`  recovered-checksum : ${result.recoveredChecksum}`);
    }

    if (!result.structureParity) {
      console.log(`  production-signature: ${JSON.stringify(result.productionSignature)}`);
      console.log(`  recovered-signature : ${JSON.stringify(result.recoveredSignature)}`);
    }

    if (!result.assetParity) {
      console.log(`  production-assets-checksum: ${result.productionAssetChecksum}`);
      console.log(`  recovered-assets-checksum : ${result.recoveredAssetChecksum}`);
    }
  }

  console.log("-----------------------------------");
  console.log(`Pages checked: ${results.length}`);
  console.log(`Failures     : ${failed.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run();
