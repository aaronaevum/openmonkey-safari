// OpenMonkey for Safari — extension build script (esbuild, no Vite).
//
// Usage:
//   node extension/build.mjs          Build once.
//   node extension/build.mjs --watch  Rebuild on source change.
//
// What it does:
//   1. Bundles the four entry points with esbuild into extension/dist/:
//        src/background/index.ts -> dist/background.js  (iife)
//        src/content/index.ts    -> dist/content.js     (iife)
//        src/popup/popup.ts      -> dist/popup.js       (iife)
//        src/pages/pages.ts      -> dist/pages.js       (esm)
//   2. Copies the loadable extension shell into extension/dist/ so that
//      dist/ is itself a loadable extension root:
//        manifest.json (paths rewritten: "dist/background.js" -> "background.js")
//        popup.html / pages.html (asset refs rewritten the same way)
//        popup.css / pages.css
//        _locales/ (recursively), icons/ (when present; missing PNGs warn only)
//      The source files under extension/ keep their "dist/..." references,
//      so extension/ itself is also a loadable root (manifest.json at the
//      extension root points at dist/*, popup.html at the root points at
//      dist/popup.js, and so on). Both layouts are supported on purpose:
//      Safari / Xcode loads extension/, while a plain Chromium-style load
//      or a CI smoke test can load extension/dist/ directly.
//
// The build never fails on missing icons: the PNG icons are generated
// from extension/icons/icon.svg by a later packaging step. A missing
// entry point (background/content) is a real error and fails the build,
// because a bundle without it would silently ship a broken extension.

import { build, context } from 'esbuild';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'extension');
const srcDir = path.join(extensionDir, 'src');
const outDir = path.join(extensionDir, 'dist');
const watch = process.argv.includes('--watch');

const entries = [
  { entry: 'background/index.ts', out: 'background.js', format: 'iife' },
  { entry: 'content/index.ts', out: 'content.js', format: 'iife' },
  { entry: 'popup/popup.ts', out: 'popup.js', format: 'iife' },
  { entry: 'pages/pages.ts', out: 'pages.js', format: 'esm' },
];

async function copyDirIfExists(from, to) {
  if (!existsSync(from)) {
    console.warn(`[build] skipping missing directory: ${path.relative(root, from)}`);
    return;
  }
  await cp(from, to, { recursive: true });
}

async function copyFileIfExists(from, to, rewrite) {
  if (!existsSync(from)) {
    console.warn(`[build] skipping missing file: ${path.relative(root, from)}`);
    return;
  }
  let text = await readFile(from, 'utf8');
  if (rewrite) text = rewrite(text);
  await mkdir(path.dirname(to), { recursive: true });
  await writeFile(to, text, 'utf8');
}

// Rewrite asset references for the dist/ copy, where files sit next to
// each other instead of one level below the extension root.
function rewriteForDist(text) {
  return text
    .replaceAll('"dist/background.js"', '"background.js"')
    .replaceAll('"dist/content.js"', '"content.js"')
    .replaceAll('"dist/popup.js"', '"popup.js"')
    .replaceAll('"dist/pages.js"', '"pages.js"')
    .replaceAll('"dist/*"', '"*"')
    .replaceAll('src="dist/popup.js"', 'src="popup.js"')
    .replaceAll('src="dist/pages.js"', 'src="pages.js"')
    .replaceAll('href="dist/popup.css"', 'href="popup.css"')
    .replaceAll('href="dist/pages.css"', 'href="pages.css"');
}

async function copyShell() {
  await mkdir(outDir, { recursive: true });
  // Manifest: source manifest lives at extension/manifest.json and
  // references dist/*; the dist/ copy references its siblings directly.
  await copyFileIfExists(
    path.join(extensionDir, 'manifest.json'),
    path.join(outDir, 'manifest.json'),
    rewriteForDist,
  );
  await copyFileIfExists(
    path.join(extensionDir, 'popup.html'),
    path.join(outDir, 'popup.html'),
    rewriteForDist,
  );
  await copyFileIfExists(
    path.join(extensionDir, 'pages.html'),
    path.join(outDir, 'pages.html'),
    rewriteForDist,
  );
  for (const css of ['popup.css', 'pages.css']) {
    const from = path.join(extensionDir, css);
    if (existsSync(from)) await cp(from, path.join(outDir, css));
    else console.warn(`[build] skipping missing file: extension/${css}`);
  }
  await copyDirIfExists(path.join(extensionDir, '_locales'), path.join(outDir, '_locales'));
  // Icons: the SVG source always exists; PNGs are generated later.
  // Copy whatever is present and warn (never fail) when PNGs are missing.
  const iconsDir = path.join(extensionDir, 'icons');
  await copyDirIfExists(iconsDir, path.join(outDir, 'icons'));
  if (existsSync(iconsDir)) {
    const pngs = (await readdir(iconsDir)).filter((f) => f.endsWith('.png'));
    if (pngs.length === 0) {
      console.warn(
        '[build] note: no PNG icons in extension/icons/ yet (only icon.svg). ' +
          'Generate icon16/32/48/128.png from icon.svg before packaging; ' +
          'the build does not fail on this.',
      );
    }
  }
}

async function bundleAll() {
  await mkdir(outDir, { recursive: true });
  for (const { entry, out, format } of entries) {
    const entryPath = path.join(srcDir, entry);
    if (!existsSync(entryPath)) {
      throw new Error(`Missing entry point: ${path.relative(root, entryPath)}`);
    }
    await build({
      entryPoints: [entryPath],
      bundle: true,
      format,
      platform: 'browser',
      target: 'es2022',
      outfile: path.join(outDir, out),
      sourcemap: false,
      logLevel: 'info',
    });
  }
  await copyShell();
  console.log(`[build] done -> ${path.relative(root, outDir)}/`);
}

if (watch) {
  // Watch mode: one esbuild context per entry point, plus a shell copy
  // on every rebuild. Kept simple and deterministic; `npm run dev`.
  const contexts = [];
  await mkdir(outDir, { recursive: true });
  for (const { entry, out, format } of entries) {
    const ctx = await context({
      entryPoints: [path.join(srcDir, entry)],
      bundle: true,
      format,
      platform: 'browser',
      target: 'es2022',
      outfile: path.join(outDir, out),
      sourcemap: true,
      logLevel: 'info',
    });
    contexts.push(ctx);
    await ctx.watch();
  }
  await copyShell();
  console.log('[build] watching for changes (Ctrl+C to stop)…');
  // Keep the process alive; esbuild contexts hold the watchers open.
  await new Promise(() => {});
} else {
  await bundleAll();
}
