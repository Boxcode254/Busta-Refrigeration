#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_EXTENSIONS = ['.html', '.php', '.js', '.css', '.xml'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'images', '.audit']);

const PLAIN_URL_REGEX = /(?:https?:\/\/(?:www\.)?bustarefrigeration\.co\.ke)?\/images\/[A-Za-z0-9%_,+./-]+/gi;
const ESCAPED_URL_REGEX = /(?:https?:\\\/\\\/(?:www\\\.)?bustarefrigeration\.co\.ke)?\\\/images\\\/[A-Za-z0-9%_,+./-]+/gi;

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\/+$/, '');
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    baseUrl: process.env.CDN_BASE_URL || process.env.IMAGE_BASE_URL || '',
    write: false,
    reportPath: '.audit/cdn-url-migration/report.json',
    fileExtensions: DEFAULT_EXTENSIONS.slice(),
    includeFiles: []
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--write') {
      args.write = true;
      continue;
    }

    if (arg === '--dry-run') {
      args.write = false;
      continue;
    }

    if (arg.startsWith('--root=')) {
      args.root = path.resolve(arg.slice('--root='.length));
      continue;
    }

    if (arg.startsWith('--base=')) {
      args.baseUrl = arg.slice('--base='.length);
      continue;
    }

    if (arg.startsWith('--report=')) {
      args.reportPath = arg.slice('--report='.length);
      continue;
    }

    if (arg.startsWith('--ext=')) {
      const list = arg
        .slice('--ext='.length)
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .map((value) => (value.startsWith('.') ? value : `.${value}`));

      if (list.length) {
        args.fileExtensions = list;
      }
      continue;
    }

    if (arg.startsWith('--include=')) {
      const files = arg
        .slice('--include='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (files.length) {
        args.includeFiles = files;
      }
    }
  }

  args.baseUrl = normalizeBaseUrl(args.baseUrl);

  if (!args.baseUrl) {
    throw new Error('Missing CDN base URL. Set CDN_BASE_URL or pass --base=https://media.example.com');
  }

  if (!/^https?:\/\//i.test(args.baseUrl)) {
    throw new Error(`Invalid CDN base URL: ${args.baseUrl}`);
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walkFiles(dirPath, fileList = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absPath, fileList);
      continue;
    }

    fileList.push(absPath);
  }

  return fileList;
}

function stripQueryAndHash(value) {
  return String(value || '').split('#')[0].split('?')[0];
}

function decodeWebPath(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function hasImageExtension(urlPath) {
  const normalized = decodeWebPath(stripQueryAndHash(urlPath)).toLowerCase();
  const ext = path.extname(normalized);
  return IMAGE_EXTENSIONS.has(ext);
}

function isDocumentPath(urlPath) {
  return decodeWebPath(stripQueryAndHash(urlPath)).toLowerCase().startsWith('/images/document/');
}

function shouldSkipRelativeMatch(fullText, offset) {
  if (offset <= 0) {
    return false;
  }

  const previousChar = fullText[offset - 1];
  return /[A-Za-z0-9._-]/.test(previousChar);
}

function rewritePlainUrl(match, baseUrl) {
  let imagePath = match;

  if (/^https?:\/\//i.test(match)) {
    try {
      const parsed = new URL(match);
      imagePath = parsed.pathname;
    } catch (_error) {
      return match;
    }
  }

  if (!imagePath.startsWith('/images/')) {
    return match;
  }

  if (isDocumentPath(imagePath)) {
    return match;
  }

  if (!hasImageExtension(imagePath)) {
    return match;
  }

  return `${baseUrl}${imagePath}`;
}

function rewriteFileContent(content, baseUrl) {
  let replacements = 0;

  const plainRewritten = content.replace(PLAIN_URL_REGEX, (match, offset, fullText) => {
    if (match.startsWith('/') && shouldSkipRelativeMatch(fullText, offset)) {
      return match;
    }

    const next = rewritePlainUrl(match, baseUrl);
    if (next !== match) {
      replacements += 1;
    }

    return next;
  });

  const escapedRewritten = plainRewritten.replace(ESCAPED_URL_REGEX, (match, offset, fullText) => {
    if (match.startsWith('\\/') && shouldSkipRelativeMatch(fullText, offset)) {
      return match;
    }

    const plain = match.replace(/\\\//g, '/');
    const rewritten = rewritePlainUrl(plain, baseUrl);
    if (rewritten === plain) {
      return match;
    }

    replacements += 1;
    return rewritten.replace(/\//g, '\\\/');
  });

  return {
    content: escapedRewritten,
    replacements
  };
}

function shouldInspect(filePath, args) {
  const ext = path.extname(filePath).toLowerCase();
  if (!args.fileExtensions.includes(ext)) {
    return false;
  }

  if (!args.includeFiles.length) {
    return true;
  }

  const normalized = filePath.split(path.sep).join('/');
  return args.includeFiles.some((includeValue) => normalized.endsWith(includeValue));
}

function writeReport(reportAbs, reportData) {
  ensureDir(path.dirname(reportAbs));
  fs.writeFileSync(reportAbs, JSON.stringify(reportData, null, 2), 'utf-8');
}

function run() {
  const args = parseArgs(process.argv);
  const rootAbs = path.resolve(args.root);
  const reportAbs = path.resolve(rootAbs, args.reportPath);

  if (!fs.existsSync(rootAbs)) {
    throw new Error(`Root path not found: ${rootAbs}`);
  }

  const allFiles = walkFiles(rootAbs);
  const targetFiles = allFiles.filter((filePath) => shouldInspect(filePath, args));

  const changedFiles = [];
  let totalReplacements = 0;
  let scannedFiles = 0;

  for (const filePath of targetFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.includes('/images/') && !raw.includes('\\/images\\/')) {
      continue;
    }

    scannedFiles += 1;

    const result = rewriteFileContent(raw, args.baseUrl);
    if (result.replacements <= 0) {
      continue;
    }

    totalReplacements += result.replacements;

    if (args.write) {
      fs.writeFileSync(filePath, result.content, 'utf-8');
    }

    changedFiles.push({
      file: path.relative(rootAbs, filePath).split(path.sep).join('/'),
      replacements: result.replacements
    });
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    root: rootAbs,
    baseUrl: args.baseUrl,
    writeMode: args.write,
    scannedFiles,
    changedFileCount: changedFiles.length,
    totalReplacements,
    files: changedFiles
  };

  writeReport(reportAbs, report);

  console.log(`[cdn] Mode: ${args.write ? 'write' : 'dry-run'}`);
  console.log(`[cdn] Root: ${rootAbs}`);
  console.log(`[cdn] CDN base URL: ${args.baseUrl}`);
  console.log(`[cdn] Scanned files with image references: ${scannedFiles}`);
  console.log(`[cdn] Changed files: ${changedFiles.length}`);
  console.log(`[cdn] Total rewritten URLs: ${totalReplacements}`);
  console.log(`[cdn] Report: ${path.relative(rootAbs, reportAbs)}`);
}

run();
