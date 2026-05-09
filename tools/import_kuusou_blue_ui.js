#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const sourceArg = args[0] || process.env.KUUSOU_UI_SOURCE;

if (!sourceArg) {
  throw new Error('Usage: node tools/import_kuusou_blue_ui.js <path-to-downloaded-PDS-folder> [path-to-psd-js-folder]');
}

const sourceRoot = path.resolve(sourceArg);
const psdJsRoot = path.resolve(args[1] || process.env.PSD_JS_ROOT || path.join(repoRoot, '..', 'psd'));
const materialRoot = path.join(sourceRoot, 'material');
const destRoot = path.join(repoRoot, 'assets', 'ui', 'kuusou-blue');

const categoryMap = new Map([
  ['01_メッセージウィンドウ', '01-message-window'],
  ['02_システムボタン', '02-system-buttons'],
  ['03_選択肢ボタン', '03-choice-buttons'],
  ['04_汎用ボタン', '04-common-buttons'],
  ['05_可変ウィンドウ', '05-scalable-windows'],
  ['06_見出し背景', '06-heading-plates'],
  ['07_YesNoダイアログ', '07-yes-no-dialog'],
  ['08_サムネイル', '08-thumbnails'],
  ['09_システム設定用パーツ', '09-settings-parts'],
  ['10_ステッパー', '10-steppers'],
  ['11_セーブスロット', '11-save-slots'],
  ['12_タイトルメニュー', '12-title-menu'],
  ['13_タブ', '13-tabs'],
  ['14_バックログ画面用パーツ', '14-backlog-parts'],
  ['15_ページネーション', '15-pagination'],
  ['16_ヘルスゲージ', '16-health-gauge'],
  ['17_メニュー画面用パーツ', '17-menu-parts'],
  ['18_音楽鑑賞画面用パーツ', '18-music-parts'],
  ['19_大見出し', '19-major-headings'],
  ['20_汎用背景', '20-backgrounds'],
  ['21_矢印ボタン', '21-arrow-buttons'],
  ['22_編集用psd', '22-psd-source']
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toSafeSegment(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'asset';
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

function uniqueDestination(dir, baseName, ext, used) {
  let candidate = `${baseName}${ext}`;
  let index = 2;
  while (used.has(path.join(dir, candidate).toLowerCase())) {
    candidate = `${baseName}-${index}${ext}`;
    index += 1;
  }
  used.add(path.join(dir, candidate).toLowerCase());
  return path.join(dir, candidate);
}

async function convertPsdFiles(manifest) {
  const psdDir = path.join(materialRoot, '22_編集用psd');
  if (!fs.existsSync(psdDir)) return [];

  let PSD;
  try {
    PSD = require(psdJsRoot);
  } catch (error) {
    console.warn(`PSD conversion skipped: cannot load psd.js at ${psdJsRoot}`);
    console.warn(error.message);
    return [];
  }

  const converted = [];
  const outputDir = path.join(destRoot, '22-psd-flattened');
  ensureDir(outputDir);

  for (const file of fs.readdirSync(psdDir, { withFileTypes: true })) {
    if (!file.isFile() || path.extname(file.name).toLowerCase() !== '.psd') continue;
    const source = path.join(psdDir, file.name);
    const dest = path.join(outputDir, `${toSafeSegment(file.name)}.png`);
    try {
      const psd = await PSD.open(source);
      await psd.image.saveAsPng(dest);
      const rel = path.relative(repoRoot, dest).replace(/\\/g, '/');
      converted.push(rel);
      manifest.assets.push({
        type: 'psd-flattened',
        source: path.relative(sourceRoot, source).replace(/\\/g, '/'),
        path: rel
      });
    } catch (error) {
      console.warn(`PSD conversion failed for ${file.name}: ${error.message}`);
    }
  }

  return converted;
}

async function main() {
  if (!fs.existsSync(materialRoot)) {
    throw new Error(`Material folder not found: ${materialRoot}`);
  }

  ensureDir(destRoot);

  const manifest = {
    name: 'kuusou-blue',
    vendor: 'KUUSOU-KYOKUSEN / 空想曲線',
    source: 'Purchased BOOTH pack; local source path intentionally omitted.',
    importedAt: new Date().toISOString(),
    termsUrl: 'https://kopacurve.blog.fc2.com/blog-entry-394.html',
    boothUrl: 'https://ko10panda.booth.pm/items/3485930',
    assets: []
  };

  const used = new Set();
  let copied = 0;

  for (const source of walk(materialRoot)) {
    const ext = path.extname(source).toLowerCase();
    if (ext !== '.png' && ext !== '.webp') continue;

    const relParts = path.relative(materialRoot, source).split(path.sep);
    const category = relParts[0];
    const categoryDir = categoryMap.get(category) || toSafeSegment(category);
    const subdirs = relParts.slice(1, -1).map(toSafeSegment);
    const destDir = path.join(destRoot, categoryDir, ...subdirs);
    const fileBase = toSafeSegment(path.basename(source));
    const dest = uniqueDestination(destDir, fileBase, ext, used);

    ensureDir(destDir);
    fs.copyFileSync(source, dest);
    copied += 1;

    manifest.assets.push({
      type: ext.slice(1),
      category: categoryDir,
      source: path.relative(sourceRoot, source).replace(/\\/g, '/'),
      path: path.relative(repoRoot, dest).replace(/\\/g, '/')
    });
  }

  const converted = await convertPsdFiles(manifest);

  const credit = [
    '# KUUSOU Blue UI Pack',
    '',
    'Imported for in-app UI use from the purchased BOOTH material pack.',
    '',
    '- Creator/site: KUUSOU-KYOKUSEN / 空想曲線',
    '- BOOTH item: https://ko10panda.booth.pm/items/3485930',
    '- Current terms: https://kopacurve.blog.fc2.com/blog-entry-394.html',
    '',
    'The raw PSD files are intentionally not included here. These copied and converted assets are for this app UI only; do not redistribute them as a standalone material pack or use them for generative AI / machine-learning training or analysis.'
  ].join('\n');

  fs.writeFileSync(path.join(destRoot, 'CREDITS.md'), `${credit}\n`, 'utf8');
  fs.writeFileSync(path.join(destRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Copied ${copied} image assets to ${path.relative(repoRoot, destRoot)}`);
  console.log(`Converted ${converted.length} PSD files`);
  console.log(`Manifest: ${path.relative(repoRoot, path.join(destRoot, 'manifest.json'))}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
