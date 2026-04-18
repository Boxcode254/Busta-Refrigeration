#!/usr/bin/env node
'use strict';

/**
 * dns_smoke_check.js
 *
 * DNS-ready smoke checklist for media.bustarefrigeration.co.ke CDN go-live.
 *
 * Run this script once the CDN DNS record has been created. It will:
 *   1. Verify DNS resolves for the CDN hostname
 *   2. Confirm the CDN origin is reachable (HTTP HEAD check)
 *   3. Spot-check a representative sample of CDN image URLs (HTTP 200)
 *   4. Report any 4xx / 5xx failures
 *
 * Usage:
 *   node scripts/dns_smoke_check.js
 *   node scripts/dns_smoke_check.js --host media.bustarefrigeration.co.ke
 *   node scripts/dns_smoke_check.js --sample 10    (default 5 per page)
 *   node scripts/dns_smoke_check.js --strict       (exit 1 on any failure)
 *
 * Requirements: Node 18+ (built-in fetch). No npm install needed.
 */

const dns  = require('dns').promises;
const fs   = require('fs');
const path = require('path');

const DEFAULT_CDN_HOST = 'media.bustarefrigeration.co.ke';
const HTML_FILES = [
  'index.html',
  'projects-clients/index.html',
  'spares-components/index.html',
  'privacy/index.html',
  'legal-notice/index.html',
];
const CDN_URL_PATTERN = /https?:\/\/media\.bustarefrigeration\.co\.ke\/images\/[A-Za-z0-9%_,+./:-]+/g;

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv  = process.argv.slice(2);
  const get   = (flag, def) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : def;
  };
  return {
    host:    get('--host',   DEFAULT_CDN_HOST),
    sample:  parseInt(get('--sample', '5'), 10),
    strict:  argv.includes('--strict'),
    root:    get('--root', process.cwd()),
  };
}

function extractCdnUrls(root, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return [];
  const content = fs.readFileSync(abs, 'utf8');
  const matches = [...content.matchAll(CDN_URL_PATTERN)].map(m => m[0]);
  // Deduplicate, keeping original order
  return [...new Set(matches)];
}

async function checkDns(host) {
  try {
    const addrs = await dns.resolve4(host);
    return { ok: true, addrs };
  } catch (err) {
    return { ok: false, err: err.message };
  }
}

async function headRequest(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    return { ok: res.ok, status: res.status, url };
  } catch (err) {
    return { ok: false, status: null, url, err: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function sampleUrls(urls, n) {
  if (urls.length <= n) return urls;
  // Pick evenly spaced items so we test variety across the gallery
  const step  = Math.floor(urls.length / n);
  const picks = [];
  for (let i = 0; i < n; i++) picks.push(urls[i * step]);
  return picks;
}

function printRow(label, value, pass) {
  const icon = pass === true ? '✓' : pass === false ? '✗' : '·';
  console.log(`  ${icon}  ${label.padEnd(48)} ${value}`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { host, sample, strict, root } = parseArgs();

  console.log(`\nBusta Refrigeration — DNS Smoke Check`);
  console.log(`CDN Host : ${host}`);
  console.log(`────────────────────────────────────────────────────`);

  let failed = 0;

  // ── Step 1: DNS resolution ──────────────────────────────────────────────
  console.log('\n[1/3] DNS Resolution');
  const dns1 = await checkDns(host);
  if (dns1.ok) {
    printRow('A record resolves', dns1.addrs.join(', '), true);
  } else {
    printRow('A record resolves', `FAIL — ${dns1.err}`, false);
    console.log('\n  DNS has not propagated yet. Re-run this script once the');
    console.log(`  A/CNAME record for ${host} is live.\n`);
    process.exit(strict ? 1 : 2);
  }

  // ── Step 2: CDN origin reachability ────────────────────────────────────
  console.log('\n[2/3] CDN Origin Reachability');
  const originUrl  = `https://${host}/`;
  const originHead = await headRequest(originUrl);
  if (originHead.ok) {
    printRow('Origin HEAD /', `HTTP ${originHead.status}`, true);
  } else {
    const detail = originHead.err ?? `HTTP ${originHead.status}`;
    printRow('Origin HEAD /', `FAIL — ${detail}`, false);
    failed++;
  }

  // ── Step 3: Image spot-checks ───────────────────────────────────────────
  console.log(`\n[3/3] Image URL Spot-Checks (${sample} per page)`);
  let totalChecked = 0;
  let totalFailed  = 0;

  for (const relPath of HTML_FILES) {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) {
      printRow(relPath, 'file not found — skipped', null);
      continue;
    }

    const allUrls = extractCdnUrls(root, relPath);
    if (allUrls.length === 0) {
      printRow(relPath, 'no CDN URLs found — skipped', null);
      continue;
    }

    const picks = sampleUrls(allUrls, sample);
    let pageFail = 0;

    for (const url of picks) {
      const result = await headRequest(url);
      totalChecked++;
      if (!result.ok) {
        const detail = result.err ?? `HTTP ${result.status}`;
        printRow(url.replace(`https://${host}`, ''), detail, false);
        pageFail++;
        totalFailed++;
      }
    }

    if (pageFail === 0) {
      printRow(relPath, `${picks.length}/${allUrls.length} sampled — all OK`, true);
    } else {
      printRow(relPath, `${pageFail} of ${picks.length} FAILED`, false);
      failed += pageFail;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n────────────────────────────────────────────────────`);
  console.log(`URLs checked : ${totalChecked}`);
  console.log(`Failures     : ${totalFailed}`);

  if (failed === 0) {
    console.log(`\n  PASS — CDN is live and all sampled images are reachable.\n`);
    process.exit(0);
  } else {
    console.log(`\n  ${strict ? 'FAIL' : 'WARN'} — ${failed} check(s) did not pass. Review the items above.\n`);
    process.exit(strict ? 1 : 0);
  }
}

main().catch(err => {
  console.error('\nUnexpected error:', err.message);
  process.exit(1);
});
