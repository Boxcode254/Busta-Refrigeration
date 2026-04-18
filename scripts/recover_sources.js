const fs = require("node:fs");
const path = require("node:path");
const beautify = require("js-beautify");

const ROOT_DIR = process.cwd();
const SOURCE_ROOT = path.join(ROOT_DIR, "src");
const SITE_ROOT = path.join(SOURCE_ROOT, "site");
const STYLE_ROOT = path.join(SITE_ROOT, "styles");
const SCRIPT_ROOT = path.join(SITE_ROOT, "scripts");

const PAGE_MAP = [
  { input: "index.html", output: "index.html", slug: "home" },
  { input: "projects-clients/index.html", output: "projects-clients/index.html", slug: "projects-clients" },
  { input: "spares-components/index.html", output: "spares-components/index.html", slug: "spares-components" },
  { input: "privacy/index.html", output: "privacy/index.html", slug: "privacy" },
  { input: "legal-notice/index.html", output: "legal-notice/index.html", slug: "legal-notice" }
];

const ASSET_MAP = {
  cssFrom: /\/css\/custom\.[^"']+\.css/g,
  cssTo: "/styles/global/custom.css",
  customScriptTagFrom: /<script[^>]*src=["']\/js\/custom\.[^"']+\.js["'][^>]*><\/script>/gi,
  customScriptTagTo: "<script type=\"module\" src=\"/scripts/custom.js\"></script>"
};

const CSS_OPTIONS = {
  indent_size: 2,
  end_with_newline: true
};

const HTML_OPTIONS = {
  indent_size: 2,
  preserve_newlines: true,
  max_preserve_newlines: 2,
  wrap_line_length: 0,
  end_with_newline: true
};

const JS_OPTIONS = {
  indent_size: 2,
  preserve_newlines: true,
  max_preserve_newlines: 2,
  end_with_newline: true
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function writeText(absolutePath, content) {
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, content, "utf8");
}

function recoverCustomAssets() {
  const cssSourcePath = "css/custom.250209205040.css";
  const jsSourcePath = "js/custom.241217072522.js";

  const cssOut = path.join(STYLE_ROOT, "global/custom.css");
  const jsOut = path.join(SCRIPT_ROOT, "custom.js");

  const cssInput = readText(cssSourcePath);
  const jsInput = readText(jsSourcePath);

  writeText(cssOut, beautify.css(cssInput, CSS_OPTIONS));
  writeText(jsOut, beautify.js(jsInput, JS_OPTIONS));

  return {
    cssOut,
    jsOut
  };
}

function extractInlineStyles(html, slug) {
  const inlineStylePattern = /<style[^>]*>([\s\S]*?)<\/style>/i;
  const match = html.match(inlineStylePattern);

  if (!match) {
    return {
      html,
      stylePath: null
    };
  }

  const cssContent = match[1].trim();
  const relativeStylePath = `styles/pages/${slug}.inline.css`;
  const absoluteStylePath = path.join(SITE_ROOT, relativeStylePath);
  const linkTag = `<link rel="stylesheet" href="/${relativeStylePath}">`;

  writeText(absoluteStylePath, beautify.css(cssContent, CSS_OPTIONS));

  return {
    html: html.replace(inlineStylePattern, linkTag),
    stylePath: absoluteStylePath
  };
}

function recoverPage(page) {
  const inputHtml = readText(page.input)
    .replace(ASSET_MAP.cssFrom, ASSET_MAP.cssTo)
    .replace(ASSET_MAP.customScriptTagFrom, ASSET_MAP.customScriptTagTo);

  const extracted = extractInlineStyles(inputHtml, page.slug);
  const beautifiedHtml = beautify.html(extracted.html, HTML_OPTIONS);
  const outputPath = path.join(SITE_ROOT, page.output);

  writeText(outputPath, beautifiedHtml);

  return {
    outputPath,
    inlineStylePath: extracted.stylePath
  };
}

function run() {
  const createdFiles = [];

  ensureDir(SITE_ROOT);
  ensureDir(STYLE_ROOT);
  ensureDir(SCRIPT_ROOT);

  const recoveredAssets = recoverCustomAssets();
  createdFiles.push(recoveredAssets.cssOut, recoveredAssets.jsOut);

  for (const page of PAGE_MAP) {
    const result = recoverPage(page);
    createdFiles.push(result.outputPath);

    if (result.inlineStylePath) {
      createdFiles.push(result.inlineStylePath);
    }
  }

  console.log("Recovered source files:");
  for (const file of createdFiles) {
    console.log(`- ${path.relative(ROOT_DIR, file)}`);
  }
}

run();
