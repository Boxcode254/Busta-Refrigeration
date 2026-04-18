const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");
const RELEASES_DIR = path.join(ROOT_DIR, "releases");

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function parseNameArg() {
  const arg = process.argv.find((entry) => entry.startsWith("--name="));
  return arg ? arg.replace("--name=", "").trim() : "";
}

function ensureZipCommand() {
  const probe = spawnSync("zip", ["-v"], { stdio: "ignore" });
  if (probe.error) {
    throw new Error("zip command is required to package deployment artifacts.");
  }
}

function ensureDistReady() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error("dist directory not found. Run npm run build:strict-maps first.");
  }
}

function createZipArchive(outputPath) {
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const zipRun = spawnSync("zip", ["-rq", outputPath, "."], {
    cwd: DIST_DIR,
    stdio: "inherit"
  });

  if (zipRun.status !== 0) {
    throw new Error("zip command failed while creating cPanel package.");
  }
}

function assertZipRootShape(outputPath) {
  const listing = spawnSync("unzip", ["-Z1", outputPath], { encoding: "utf8" });

  if (listing.status !== 0) {
    return;
  }

  const entries = listing.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.some((entry) => entry.startsWith("dist/"))) {
    throw new Error("Invalid archive shape: zip contains dist/ prefix; expected dist contents at archive root.");
  }
}

function run() {
  ensureZipCommand();
  ensureDistReady();

  const customName = parseNameArg();
  const archiveName = customName || `BustaRefrigeration_cpanel_${formatTimestamp(new Date())}.zip`;

  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  const outputPath = path.join(RELEASES_DIR, archiveName);

  createZipArchive(outputPath);
  assertZipRootShape(outputPath);

  console.log("cPanel deployment package created");
  console.log(`Archive: ${outputPath}`);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
