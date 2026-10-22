// Draws the Dryland ADE app icon and writes it as icon.png, icon.ico and icon.icns into
// packages/desktop/build, where electron-builder picks them up. Run: node scripts/build-icons.mjs
// The design: a desert sunset, a sun behind two dunes, on a rounded square. It is drawn in code so
// the three formats never drift apart and no image tool is needed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "desktop", "build");

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const SKY_TOP = hex("#1f1b3a");
const SKY_LOW = hex("#e8955a");
const SUN = hex("#ffd27a");
const FAR_DUNE = hex("#b4572f");
const NEAR_DUNE = hex("#5c2b2b");

/** Colour of the scene at (x, y) in the unit square; y grows downwards. */
function scene(x, y) {
  let c = mix(SKY_TOP, SKY_LOW, Math.min(1, Math.max(0, (y - 0.1) / 0.6)) ** 1.4);
  if (Math.hypot(x - 0.5, y - 0.48) < 0.17) c = SUN;
  if (y > 0.64 + 0.05 * Math.sin(2 * Math.PI * (x + 0.1))) c = FAR_DUNE;
  if (y > 0.77 + 0.055 * Math.sin(2 * Math.PI * (0.85 * x + 0.55))) c = NEAR_DUNE;
  return c;
}

/** Whether (x, y) lies inside the rounded square that holds the scene. */
function inside(x, y) {
  const margin = 0.05;
  const radius = 0.22;
  const half = 0.5 - margin;
  const dx = Math.abs(x - 0.5) - (half - radius);
  const dy = Math.abs(y - 0.5) - (half - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) <= radius;
}

/** RGBA pixels of the icon at `size`, antialiased by 4x4 supersampling. */
function render(size) {
  const n = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const x = (px + (sx + 0.5) / n) / size;
          const y = (py + (sy + 0.5) / n) / size;
          if (!inside(x, y)) continue;
          const [cr, cg, cb] = scene(x, y);
          r += cr;
          g += cg;
          b += cb;
          hits++;
        }
      }
      const o = (py * size + px) * 4;
      if (hits > 0) {
        rgba[o] = Math.round(r / hits);
        rgba[o + 1] = Math.round(g / hits);
        rgba[o + 2] = Math.round(b / hits);
      }
      rgba[o + 3] = Math.round((hits / (n * n)) * 255);
    }
  }
  return rgba;
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size) {
  const rgba = render(size);
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Windows icon: a directory of PNG images (Vista and later read PNG entries of any size). */
function ico(sizes) {
  const images = sizes.map(png);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((size, i) => {
    const e = 6 + 16 * i;
    head[e] = size === 256 ? 0 : size;
    head[e + 1] = size === 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(images[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, ...images]);
}

/** macOS icon: typed PNG entries, each type fixing the size. */
function icns(entries) {
  const parts = entries.map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const total = 8 + parts.reduce((sum, p) => sum + p.length, 0);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...parts]);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "icon.png"), png(1024));
writeFileSync(join(out, "icon.ico"), ico([16, 24, 32, 48, 64, 128, 256]));
writeFileSync(
  join(out, "icon.icns"),
  icns([
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
  ]),
);
console.log(`Wrote icon.png, icon.ico and icon.icns to ${out}`);
