#!/usr/bin/env node
// Regenerates every derived brand asset from the one source file, brand/mark.svg.
//
//   node scripts/build-brand.mjs
//
// Needs `rsvg-convert` (brew install librsvg) and `magick` (brew install imagemagick).
// The outputs are committed, so CI and Vercel never run this: it exists so the
// favicon and touch icon are reproducible rather than hand-edited. They go in
// src/app, where Next.js picks icon.svg, favicon.ico and apple-icon.png up by
// file name and writes the <link> tags itself.
//
// The palette is not duplicated here. It is read from the <style> block in
// mark.svg: the light-page colours are the ink/red pair, the dark-page colours
// are the paper/soft-red pair, and the app tiles are built from those four values.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appDir = path.join(root, "src/app");
const source = readFileSync(path.join(root, "brand/mark.svg"), "utf8");

for (const tool of ["rsvg-convert", "magick"]) {
  try {
    execFileSync("which", [tool], { stdio: "ignore" });
  } catch {
    console.error(`build-brand: \`${tool}\` not found on PATH`);
    process.exit(1);
  }
}

// --- read the source ---------------------------------------------------------

const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const shapes = source.match(/<\/style>([\s\S]*)<\/svg>/)?.[1].trim();
if (!css || !shapes) throw new Error("brand/mark.svg: expected <style> then shapes");

const [lightCss, darkCss] = css.split("@media");
const fill = (block, cls) =>
  block.match(new RegExp(`\\.${cls}\\s*\\{\\s*fill:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const ink = fill(lightCss, "body");
const red = fill(lightCss, "pip");
const paper = fill(darkCss, "body");
const redDeep = fill(darkCss, "pip");
if (!ink || !red || !paper || !redDeep) {
  throw new Error("brand/mark.svg: need .body and .pip fills in both colour schemes");
}

// The shapes sit in a 64 unit box. The folder spans x 6..58, y 10..58 (52 x 48),
// so that is what gets centred in a tile.
const BODY = { w: 52, h: 48, x: 6, y: 10 };
const CENTRE = { cx: 32, cy: 34 };

const flat = (body, pip) => `.body{fill:${body}}.pip{fill:${pip}}`;

// The mark on a 64 unit tile at the given scale: centred by default, or with
// the folder's top-left corner at (x0, y0) when a size needs its edges on
// whole pixels.
function tileSvg({ bg, body, pip, scale, radius = 0, x0, y0 }) {
  const tx = x0 === undefined ? 32 - CENTRE.cx * scale : x0 - BODY.x * scale;
  const ty = y0 === undefined ? 32 - CENTRE.cy * scale : y0 - BODY.y * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>${flat(body, pip)}</style><rect width="64" height="64" rx="${radius}" fill="${bg}"/><g transform="translate(${tx} ${ty}) scale(${scale})">${shapes}</g></svg>`;
}

// --- rasterising -------------------------------------------------------------

const png = (svg, size, out, { opaque } = {}) => {
  execFileSync("rsvg-convert", ["-w", size, "-h", size, "-o", out], { input: svg });
  if (opaque) flatten(out, opaque);
};
const flatten = (file, bg) =>
  execFileSync("magick", [file, "-background", bg, "-alpha", "remove", "-alpha", "off", "-strip", file]);
const out = (name) => path.join(appDir, name);

// Dark tile: paper folder on ink. It reads on any tab or home screen, light or dark.
const tile = (scale, radius, at) =>
  tileSvg({ bg: ink, body: paper, pip: redDeep, scale, radius, ...at });

// A tile of `px` pixels whose folder is `bodyPx` wide (and 12/13 of that tall),
// with its top-left corner at (x, y) pixels: the edges land on pixel boundaries,
// so they stay crisp.
const pixelTile = (px, bodyPx, x, y, radius) =>
  tile((bodyPx * 64) / px / BODY.w, radius, { x0: (x * 64) / px, y0: (y * 64) / px });

// icon.svg is the source minus its commentary: transparent, and it follows the
// reader's colour scheme itself.
writeFileSync(
  out("icon.svg"),
  source.replace(/<!--[\s\S]*?-->\s*/g, "").replace(/\n\s*\n/g, "\n"),
);

// Favicon sizes, with the folder snapped to whole pixels: at 16px a half-pixel
// edge is a visible grey fringe.
const favicon = {
  16: pixelTile(16, 13, 1, 2, 10),
  32: pixelTile(32, 26, 3, 4, 10),
  48: pixelTile(48, 39, 4, 6, 11),
};
const scratch = mkdtempSync(path.join(os.tmpdir(), "outbreakfiles-brand-"));
const files = Object.entries(favicon).map(([size, svg]) => {
  const file = path.join(scratch, `${size}.png`);
  png(svg, Number(size), file);
  return file;
});
execFileSync("magick", [...files, out("favicon.ico")]);
rmSync(scratch, { recursive: true, force: true });

// Touch icon: opaque and square, because iOS applies its own corner mask.
png(tile(0.74, 0), 180, out("apple-icon.png"), { opaque: ink });

console.log("build-brand: wrote icon.svg, favicon.ico, apple-icon.png");
