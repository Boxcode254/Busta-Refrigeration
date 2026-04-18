const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");

const ROOT_DIR = process.cwd();
const DIST_ASSETS_DIR = path.join(ROOT_DIR, "dist", "assets");

function listCssAssets() {
  if (!fs.existsSync(DIST_ASSETS_DIR)) {
    throw new Error("dist/assets directory not found. Run build first.");
  }

  return fs
    .readdirSync(DIST_ASSETS_DIR)
    .filter((entry) => entry.endsWith(".css"))
    .sort();
}

function hasMapAnnotation(cssText) {
  return /sourceMappingURL=.*\.css\.map\s*$/m.test(cssText);
}

function appendMapAnnotation(cssPath) {
  const cssFileName = path.basename(cssPath);
  const cssText = fs.readFileSync(cssPath, "utf8").trimEnd();

  if (hasMapAnnotation(cssText)) {
    return false;
  }

  const next = `${cssText}\n/*# sourceMappingURL=${cssFileName}.map */\n`;
  fs.writeFileSync(cssPath, next, "utf8");
  return true;
}

async function writeMapIfMissing(cssPath) {
  const mapPath = `${cssPath}.map`;

  if (fs.existsSync(mapPath)) {
    return false;
  }

  const cssText = fs.readFileSync(cssPath, "utf8");
  const result = await postcss([]).process(cssText, {
    from: cssPath,
    to: cssPath,
    map: {
      inline: false,
      annotation: false,
      sourcesContent: true
    }
  });

  if (!result.map) {
    throw new Error(`Unable to generate sourcemap for ${path.basename(cssPath)}`);
  }

  fs.writeFileSync(mapPath, result.map.toString(), "utf8");
  return true;
}

function assertMapLooksValid(cssPath) {
  const mapPath = `${cssPath}.map`;
  const raw = fs.readFileSync(mapPath, "utf8");
  const parsed = JSON.parse(raw);

  if (parsed.version !== 3) {
    throw new Error(`Invalid sourcemap version in ${path.basename(mapPath)}`);
  }

  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw new Error(`Sourcemap has no sources in ${path.basename(mapPath)}`);
  }
}

async function run() {
  const cssAssets = listCssAssets();
  let createdMaps = 0;
  let appendedAnnotations = 0;

  for (const cssFile of cssAssets) {
    const cssPath = path.join(DIST_ASSETS_DIR, cssFile);

    if (await writeMapIfMissing(cssPath)) {
      createdMaps += 1;
    }

    if (appendMapAnnotation(cssPath)) {
      appendedAnnotations += 1;
    }

    assertMapLooksValid(cssPath);
  }

  console.log("CSS Sourcemap Enforcement");
  console.log("=========================");
  console.log(`CSS files checked : ${cssAssets.length}`);
  console.log(`Maps created      : ${createdMaps}`);
  console.log(`Annotations fixed : ${appendedAnnotations}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
