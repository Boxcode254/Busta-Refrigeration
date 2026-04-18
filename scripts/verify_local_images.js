#!/usr/bin/env node
'use strict';

/**
 * verify_local_images.js
 *
 * Scans all HTML files in the project for local /images/ references that are
 * NOT under /images/document/. Flags any remaining local image URLs that
 * should have been migrated to the CDN.
 *
 * Usage:
 *   node scripts/verify_local_images.js
 *   node scripts/verify_local_images.js --root /path/to/project
 *   node scripts/verify_local_images.js --strict   (exit 1 on violations)
 */

const fs   = require('fs');
const path = require('path');

// Intentional local paths that should NOT be flagged
const ALLOWED_LOCAL_PREFIXES = [
  '/images/document/',
];

// Directories to skip
const SKIP_DIRS = new Set(['.git', 'node_modules', '.audit', 'images', 'scripts', 'css', 'js', 'g', 'bundles', 'cgi-bin']);

// Patterns to check — src= and href= attributes with local /images/ values
const LOCAL_IMG_PATTERN  = /(?:src|href|content|srcset)\s*=\s*["'](\/?images\/[^"'#?]+)/gi;
const DATA_PARAM_PATTERN = /data-[a-z-]+=["']([^"']*\/images\/[^"']+)/gi;

function isAllowed(url) {
  const normalised = url.startsWith('/') ? url : '/' + url;
  return ALLOWED_LOCAL_PREFIXES.some(prefix => normalised.startsWith(prefix));
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url);
}

function collectHtmlFiles(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanFile(filePath, root) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath  = path.relative(root, filePath);
  const violations = [];

  function checkMatch(url, lineNum) {
    if (!url) return;
    if (isExternalUrl(url)) return;    // already on CDN or external — fine
    if (isAllowed(url)) return;        // intentional local document link — fine
    violations.push({ file: relPath, line: lineNum, url });
  }

  // Build a line-number index for reporting
  const lines = content.split('\n');
  const lineOffsets = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  function offsetToLine(idx) {
    let lo = 0, hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineOffsets[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  }

  // Check src/href/content/srcset attributes
  let m;
  LOCAL_IMG_PATTERN.lastIndex = 0;
  while ((m = LOCAL_IMG_PATTERN.exec(content)) !== null) {
    checkMatch(m[1], offsetToLine(m.index));
  }

  // Check data-* parameters (gallery JSON-like blobs)
  DATA_PARAM_PATTERN.lastIndex = 0;
  while ((m = DATA_PARAM_PATTERN.exec(content)) !== null) {
    // m[1] is the full attribute value — extract individual /images/... tokens
    const inner = m[1];
    const tokenRe = /(?<!\bhttp[s]?:\/\/[^\s"']+)(\/images\/[^\s"',;{}[\]\\]+)/g;
    let t;
    while ((t = tokenRe.exec(inner)) !== null) {
      checkMatch(t[1], offsetToLine(m.index));
    }
  }

  return violations;
}

function main() {
  const args    = process.argv.slice(2);
  const strict  = args.includes('--strict');
  const rootIdx = args.indexOf('--root');
  const root    = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd();

  console.log(`\nBusta Refrigeration — Local /images/ URL Verifier`);
  console.log(`Root : ${root}`);
  console.log(`────────────────────────────────────────────────────`);

  const htmlFiles  = collectHtmlFiles(root, []);
  let totalViolations = 0;
  let scanned = 0;

  for (const file of htmlFiles) {
    const violations = scanFile(file, root);
    scanned++;
    if (violations.length > 0) {
      console.log(`\n  FAIL  ${path.relative(root, file)} (${violations.length} violation${violations.length > 1 ? 's' : ''})`);
      for (const v of violations) {
        console.log(`    line ${v.line}: ${v.url}`);
      }
      totalViolations += violations.length;
    }
  }

  console.log(`\n────────────────────────────────────────────────────`);
  console.log(`Files scanned : ${scanned}`);
  console.log(`Violations    : ${totalViolations}`);

  if (totalViolations === 0) {
    console.log(`\n  PASS — No unexpected local /images/ URLs found.\n`);
    process.exit(0);
  } else {
    console.log(`\n  ${strict ? 'FAIL' : 'WARN'} — ${totalViolations} local /images/ URL(s) still present that are not under /images/document/.\n`);
    process.exit(strict ? 1 : 0);
  }
}

main();
