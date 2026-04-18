#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const JPEG_QUALITY = 85;
const WEBP_QUALITY = 80;
const DEFAULT_WIDTHS = [576, 960, 1200];
const DEFAULT_SIZES = '(max-width: 576px) 100vw, (max-width: 960px) 90vw, 960px';
const DEFAULT_HTML_FILES = [
  'index.html',
  'projects-clients/index.html',
  'spares-components/index.html',
  'privacy/index.html',
  'legal-notice/index.html'
];

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
    sourceDir: 'images',
    outputDir: 'images/optimized',
    auditDir: '.audit/image-optimization',
    updateHtml: false,
    clean: false,
    imageBaseUrl: process.env.CDN_BASE_URL || process.env.IMAGE_BASE_URL || '',
    widths: DEFAULT_WIDTHS.slice(),
    htmlFiles: DEFAULT_HTML_FILES.slice()
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--update-html') {
      args.updateHtml = true;
      continue;
    }

    if (arg === '--clean') {
      args.clean = true;
      continue;
    }

    if (arg.startsWith('--root=')) {
      args.root = path.resolve(arg.slice('--root='.length));
      continue;
    }

    if (arg.startsWith('--source=')) {
      args.sourceDir = arg.slice('--source='.length);
      continue;
    }

    if (arg.startsWith('--output=')) {
      args.outputDir = arg.slice('--output='.length);
      continue;
    }

    if (arg.startsWith('--audit=')) {
      args.auditDir = arg.slice('--audit='.length);
      continue;
    }

    if (arg.startsWith('--image-base=')) {
      args.imageBaseUrl = arg.slice('--image-base='.length);
      continue;
    }

    if (arg.startsWith('--cdn-base=')) {
      args.imageBaseUrl = arg.slice('--cdn-base='.length);
      continue;
    }

    if (arg.startsWith('--widths=')) {
      const widthValues = arg
        .slice('--widths='.length)
        .split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);

      if (widthValues.length) {
        args.widths = Array.from(new Set(widthValues)).sort((a, b) => a - b);
      }
      continue;
    }

    if (arg.startsWith('--html=')) {
      const htmlValues = arg
        .slice('--html='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (htmlValues.length) {
        args.htmlFiles = htmlValues;
      }
    }
  }

  args.imageBaseUrl = normalizeBaseUrl(args.imageBaseUrl);

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(absPath));
      continue;
    }

    files.push(absPath);
  }

  return files;
}

function sanitizeStem(stem) {
  return stem.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function stripQueryAndHash(input) {
  return input.split('#')[0].split('?')[0];
}

function decodeWebPath(input) {
  try {
    return decodeURIComponent(input);
  } catch (_error) {
    return input;
  }
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attrsToTag(tagName, attrs) {
  const attrString = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}="${htmlEscape(value)}"`)
    .join(' ');

  if (!attrString) {
    return `<${tagName}>`;
  }

  return `<${tagName} ${attrString}>`;
}

function parseAttributes(imgTag) {
  const attrs = {};
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g;
  let match;

  while ((match = regex.exec(imgTag)) !== null) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function buildSrcset(variants) {
  return variants.map((item) => `${item.url} ${item.width}w`).join(', ');
}

function buildImageUrl(baseUrl, rootRelativePath) {
  if (!baseUrl) {
    return rootRelativePath;
  }

  return `${baseUrl}${rootRelativePath}`;
}

function resolveImagePath(input) {
  if (!input) {
    return null;
  }

  const normalized = decodeWebPath(stripQueryAndHash(input));
  if (normalized.startsWith('/')) {
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      return parsed.pathname || null;
    } catch (_error) {
      return null;
    }
  }

  return null;
}

function extractImageKeyFromPath(srcPath) {
  const normalized = resolveImagePath(srcPath);
  if (!normalized) {
    return null;
  }

  if (!normalized.startsWith('/images/')) {
    return null;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 3) {
    return null;
  }

  const fileName = segments[segments.length - 1];
  const imageId = segments[segments.length - 2];

  if (!fileName || !imageId) {
    return null;
  }

  return `${imageId}/${fileName}`;
}

async function generateVariants(sourceAbs, sourceRel, outputAbs, widths, imageBaseUrl) {
  const extension = path.extname(sourceAbs).toLowerCase();
  const fileName = path.basename(sourceAbs);
  const stem = sanitizeStem(path.basename(sourceAbs, extension));
  const sourceParts = sourceRel.split(path.sep);
  const sourceFolder = sourceParts.length >= 3 ? sanitizeStem(sourceParts[sourceParts.length - 3]) : '';
  const imageId = sourceParts.length >= 2 ? sourceParts[sourceParts.length - 2] : 'shared';
  const sourceWebPath = `/${sourceRel.split(path.sep).join('/')}`;

  const metadata = await sharp(sourceAbs).metadata();
  const sourceWidth = metadata.width || 0;
  const hasAlpha = Boolean(metadata.hasAlpha);

  const targetWidths = Array.from(new Set([...widths, sourceWidth]))
    .filter((width) => width > 0)
    .sort((a, b) => a - b);

  const outputDir = path.join(outputAbs, imageId);
  ensureDir(outputDir);

  let compatDir = null;
  if (sourceFolder) {
    compatDir = path.join(outputAbs, imageId, sourceFolder);
    ensureDir(compatDir);
  }

  const jpeg = [];
  const webp = [];

  for (const width of targetWidths) {
    const baseFile = `${stem}-${width}`;
    const jpegAbs = path.join(outputDir, `${baseFile}.jpg`);
    const webpAbs = path.join(outputDir, `${baseFile}.webp`);
    const compatJpegAbs = compatDir ? path.join(compatDir, `${baseFile}.jpg`) : null;
    const compatWebpAbs = compatDir ? path.join(compatDir, `${baseFile}.webp`) : null;

    let jpegPipeline = sharp(sourceAbs).rotate().resize({
      width,
      withoutEnlargement: true,
      fit: 'inside'
    });

    if (hasAlpha || extension === '.png') {
      jpegPipeline = jpegPipeline.flatten({ background: '#ffffff' });
    }

    await jpegPipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(jpegAbs);

    await sharp(sourceAbs)
      .rotate()
      .resize({
        width,
        withoutEnlargement: true,
        fit: 'inside'
      })
      .webp({ quality: WEBP_QUALITY })
      .toFile(webpAbs);

    if (compatJpegAbs) {
      fs.copyFileSync(jpegAbs, compatJpegAbs);
    }

    if (compatWebpAbs) {
      fs.copyFileSync(webpAbs, compatWebpAbs);
    }

    jpeg.push({
      width,
      url: buildImageUrl(imageBaseUrl, `/images/optimized/${imageId}/${baseFile}.jpg`)
    });

    webp.push({
      width,
      url: buildImageUrl(imageBaseUrl, `/images/optimized/${imageId}/${baseFile}.webp`)
    });
  }

  return {
    key: `${imageId}/${fileName}`,
    imageId,
    fileName,
    source: sourceWebPath,
    width: sourceWidth,
    height: metadata.height || 0,
    jpeg,
    webp
  };
}

function updateHtmlWithPictureMarkup(html, manifest) {
  const imgRegex = /<img\b[^>]*>/gi;
  let replacements = 0;

  const updated = html.replace(imgRegex, (imgTag, _match, offset) => {
    const previousChunk = html.slice(Math.max(0, offset - 160), offset).toLowerCase();
    const lastPictureOpen = previousChunk.lastIndexOf('<picture');
    const lastPictureClose = previousChunk.lastIndexOf('</picture');

    if (lastPictureOpen > lastPictureClose) {
      return imgTag;
    }

    const attrs = parseAttributes(imgTag);
    const candidateSrc = attrs['data-src'] || attrs.src;
    if (!candidateSrc || candidateSrc.startsWith('data:')) {
      return imgTag;
    }

    const ext = path.extname(stripQueryAndHash(candidateSrc)).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return imgTag;
    }

    const key = extractImageKeyFromPath(candidateSrc);
    if (!key || !manifest.images[key]) {
      return imgTag;
    }

    const entry = manifest.images[key];
    const imgAttrs = { ...attrs };

    delete imgAttrs['data-src'];
    delete imgAttrs['data-srcset'];
    delete imgAttrs.srcset;

    imgAttrs.src = entry.jpeg[0].url;
    imgAttrs.srcset = buildSrcset(entry.jpeg);
    imgAttrs.loading = imgAttrs.loading || 'lazy';
    imgAttrs.decoding = imgAttrs.decoding || 'async';
    imgAttrs['data-optimized'] = '1';

    if (entry.width && !imgAttrs.width) {
      imgAttrs.width = String(entry.width);
    }

    if (entry.height && !imgAttrs.height) {
      imgAttrs.height = String(entry.height);
    }

    const picture = [
      '<picture class="brs-picture" data-brs-managed="1">',
      `<source type="image/webp" srcset="${htmlEscape(buildSrcset(entry.webp))}" sizes="${htmlEscape(attrs.sizes || DEFAULT_SIZES)}">`,
      `<source type="image/jpeg" srcset="${htmlEscape(buildSrcset(entry.jpeg))}" sizes="${htmlEscape(attrs.sizes || DEFAULT_SIZES)}">`,
      attrsToTag('img', imgAttrs),
      '</picture>'
    ].join('');

    replacements += 1;
    return picture;
  });

  return {
    html: updated,
    replacements
  };
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function main() {
  const args = parseArgs(process.argv);

  const rootAbs = args.root;
  const sourceAbs = path.resolve(rootAbs, args.sourceDir);
  const outputAbs = path.resolve(rootAbs, args.outputDir);
  const auditAbs = path.resolve(rootAbs, args.auditDir);

  ensureDir(auditAbs);

  if (args.clean && fs.existsSync(outputAbs)) {
    fs.rmSync(outputAbs, { recursive: true, force: true });
  }

  ensureDir(outputAbs);

  if (!fs.existsSync(sourceAbs)) {
    throw new Error(`Source image directory not found: ${sourceAbs}`);
  }

  const sourceFiles = walkFiles(sourceAbs).filter((filePath) => {
    if (filePath === outputAbs || filePath.startsWith(outputAbs + path.sep)) {
      return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png'].includes(ext);
  });

  sourceFiles.sort();

  const manifest = {
    generatedAtUtc: new Date().toISOString(),
    sourceDir: path.relative(rootAbs, sourceAbs),
    outputDir: path.relative(rootAbs, outputAbs),
    quality: {
      jpeg: JPEG_QUALITY,
      webp: WEBP_QUALITY
    },
    imageBaseUrl: args.imageBaseUrl,
    widths: args.widths,
    images: {}
  };

  let processed = 0;

  for (const sourceFile of sourceFiles) {
    const rel = path.relative(sourceAbs, sourceFile);
    const entry = await generateVariants(sourceFile, rel, outputAbs, args.widths, args.imageBaseUrl);
    manifest.images[entry.key] = entry;
    processed += 1;

    if (processed % 25 === 0) {
      console.log(`[optimize] Processed ${processed}/${sourceFiles.length} source images`);
    }
  }

  const manifestPath = path.join(auditAbs, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[optimize] Wrote manifest: ${path.relative(rootAbs, manifestPath)}`);

  if (args.updateHtml) {
    const htmlSummary = [];

    for (const htmlRel of args.htmlFiles) {
      const htmlAbs = path.resolve(rootAbs, htmlRel);
      if (!fs.existsSync(htmlAbs)) {
        htmlSummary.push({ file: htmlRel, replacements: 0, skipped: true });
        continue;
      }

      const raw = fs.readFileSync(htmlAbs, 'utf-8');
      const result = updateHtmlWithPictureMarkup(raw, manifest);

      if (result.replacements > 0) {
        fs.writeFileSync(htmlAbs, result.html, 'utf-8');
      }

      htmlSummary.push({ file: htmlRel, replacements: result.replacements, skipped: false });
      console.log(`[html] ${htmlRel}: ${result.replacements} <img> tags upgraded to <picture>`);
    }

    const htmlReportPath = path.join(auditAbs, 'html-update-summary.json');
    fs.writeFileSync(htmlReportPath, JSON.stringify(htmlSummary, null, 2), 'utf-8');
    console.log(`[html] Wrote HTML report: ${path.relative(rootAbs, htmlReportPath)}`);
  }

  const summaryPath = path.join(auditAbs, 'summary.txt');
  const existingManifest = readJsonIfPresent(manifestPath);
  const convertedCount = existingManifest ? Object.keys(existingManifest.images).length : 0;

  fs.writeFileSync(
    summaryPath,
    [
      `generated_at_utc: ${new Date().toISOString()}`,
      `source_images_processed: ${sourceFiles.length}`,
      `unique_images_in_manifest: ${convertedCount}`,
      `jpeg_quality: ${JPEG_QUALITY}`,
      `webp_quality: ${WEBP_QUALITY}`,
      `responsive_widths: ${args.widths.join(',')}`,
      `image_base_url: ${args.imageBaseUrl || '(local)'}`,
      `html_updated: ${args.updateHtml ? 'yes' : 'no'}`
    ].join('\n') + '\n',
    'utf-8'
  );

  console.log('[done] Image optimization pipeline finished successfully.');
}

main().catch((error) => {
  console.error('[error] Image optimization pipeline failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
