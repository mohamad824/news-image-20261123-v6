// news-image-20261123 v6 — "Monday 23 November 2026"
// Original code, written fresh in this session from the prose brief.
// Node stdlib only. Renders ONE 1024x1024 PNG to /output/entry.png.
// Text uses a real-font glyph atlas (atlas.png + metrics.json, shipped
// alongside this file): PIL-rendered Liberation / Noto Serif Display
// glyphs, decoded here with zlib.inflateSync + PNG unfiltering.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024, H = 1024;
const OUT = "/output/entry.png";
const DIR = path.dirname(new URL(import.meta.url).pathname);

// ---------- colours ----------
const CREAM: RGB = [250, 243, 227];
const INK: RGB = [24, 24, 24];
const RED: RGB = [176, 30, 36];
const NAVY: RGB = [22, 35, 63];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [90, 86, 78];
const LIGHT: RGB = [214, 203, 182];
type RGB = [number, number, number];

// ---------- canvas ----------
const px = new Uint8Array(W * H * 3);
function fillAll(c: RGB): void { for (let i = 0; i < W * H; i++) { px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2]; } }
function setPx(x: number, y: number, c: RGB): void {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function blendPx(x: number, y: number, c: RGB, a: number): void {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  px[i] = Math.round((a * c[0] + (255 - a) * px[i]) / 255);
  px[i + 1] = Math.round((a * c[1] + (255 - a) * px[i + 1]) / 255);
  px[i + 2] = Math.round((a * c[2] + (255 - a) * px[i + 2]) / 255);
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
}
function hline(x0: number, x1: number, y: number, c: RGB, th = 1): void { rect(x0, y - Math.floor(th / 2), x1 - x0, th, c); }
function vline(x: number, y0: number, y1: number, c: RGB, th = 1): void { rect(x - Math.floor(th / 2), y0, th, y1 - y0, c); }
function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++)
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) setPx(xx, yy, c);
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++)
    for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
      const dx = (xx - cx) / rx, dy = (yy - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(xx, yy, c);
    }
}
function poly(pts: [number, number][], c: RGB): void {
  // scanline fill for simple polygons
  let minY = 1e9, maxY = -1e9;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) setPx(x, y, c);
  }
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, th = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
    if (th <= 1) setPx(x, y, c); else circle(x, y, th / 2, c);
  }
}
function ring(cx: number, cy: number, r: number, c: RGB, th = 2): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = a * Math.PI / 180;
    circle(cx + r * Math.cos(rad), cy + r * Math.sin(rad), th / 2, c);
  }
}

// ---------- PNG decode (atlas) ----------
function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return out;
}
interface Decoded { w: number; h: number; rgba: Uint8Array }
function decodePNG(buf: Buffer): Decoded {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, w = 0, h = 0, bitDepth = 8, colorType = 0;
  const idat: Buffer[] = []; let plte: Buffer | null = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12] !== 0) throw new Error("interlaced PNG"); }
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("only 8-bit PNG supported");
  const ch = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (!ch) throw new Error("unsupported color type " + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const rgba = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = row[i], b = prev[i], c = i >= ch ? cur[i - ch] : 0, d = i >= ch ? prev[i - ch] : 0;
      let v = a;
      if (f === 1) v = (a + c) & 255;
      else if (f === 2) v = (a + b) & 255;
      else if (f === 3) v = (a + Math.floor((b + c) / 2)) & 255;
      else if (f === 4) { const p = b + c - d, pa = Math.abs(p - b), pb = Math.abs(p - c), pc = Math.abs(p - d); const pr = pa <= pb && pa <= pc ? b : pb <= pc ? c : d; v = (a + pr) & 255; }
      cur[i] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (colorType === 0) { rgba[o] = cur[s]; rgba[o + 1] = cur[s]; rgba[o + 2] = cur[s]; rgba[o + 3] = 255; }
      else if (colorType === 2) { rgba[o] = cur[s]; rgba[o + 1] = cur[s + 1]; rgba[o + 2] = cur[s + 2]; rgba[o + 3] = 255; }
      else if (colorType === 3) { const pi = cur[s] * 3; rgba[o] = plte![pi]; rgba[o + 1] = plte![pi + 1]; rgba[o + 2] = plte![pi + 2]; rgba[o + 3] = 255; }
      else if (colorType === 4) { rgba[o] = cur[s]; rgba[o + 1] = cur[s]; rgba[o + 2] = cur[s]; rgba[o + 3] = cur[s + 1]; }
      else { rgba[o] = cur[s]; rgba[o + 1] = cur[s + 1]; rgba[o + 2] = cur[s + 2]; rgba[o + 3] = cur[s + 3]; }
    }
    prev = cur;
  }
  return { w, h, rgba };
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 3)] = 0; raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- glyph atlas text ----------
interface Glyph { x: number; y: number; w: number; h: number; adv: number }
interface Spec { size: number; ascent: number; descent: number; glyphs: Record<string, Glyph> }
const metrics = JSON.parse(fs.readFileSync(path.join(DIR, "metrics.json"), "utf8")) as { specs: Record<string, Spec> };
const atlas = decodePNG(fs.readFileSync(path.join(DIR, "atlas.png")));
// atlas is greyscale: alpha = grey value
function atlasAlpha(ax: number, ay: number): number { return atlas.rgba[(ay * atlas.w + ax) * 4]; }
function measure(spec: string, text: string): number {
  const s = metrics.specs[spec]; let t = 0;
  for (const ch of text) { const g = s.glyphs[ch]; if (!g) throw new Error("missing glyph " + JSON.stringify(ch) + " in " + spec); t += g.adv; }
  return t;
}
function drawText(spec: string, x: number, baseline: number, text: string, c: RGB, align: "left" | "center" | "right" = "left"): void {
  const s = metrics.specs[spec];
  let pen = x;
  const tw = measure(spec, text);
  if (align === "center") pen = x - tw / 2;
  else if (align === "right") pen = x - tw;
  for (const ch of text) {
    const g = s.glyphs[ch];
    const ox = Math.round(pen) - 2, oy = Math.round(baseline) - s.ascent - 2;
    for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) {
      const a = atlasAlpha(g.x + gx, g.y + gy);
      if (a > 0) blendPx(ox + gx, oy + gy, c, a);
    }
    pen += g.adv;
  }
}
function wrap(spec: string, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = []; let cur = "";
  for (const wd of words) {
    const trial = cur ? cur + " " + wd : wd;
    if (measure(spec, trial) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawWrapped(spec: string, x: number, firstBaseline: number, text: string, maxW: number, leading: number, c: RGB): string[] {
  const lines = wrap(spec, text, maxW);
  lines.forEach((ln, i) => drawText(spec, x, firstBaseline + i * leading, ln, c));
  return lines;
}
function chip(x: number, y: number, text: string, bg: RGB): void {
  const w = measure("sansB9", text) + 10, h = 15;
  rect(x, y, w, h, bg);
  drawText("sansB9", x + 5, y + 11, text, WHITE);
}
function numCircle(cx: number, cy: number, n: number): void {
  circle(cx, cy, 11, RED);
  drawText("sansB10", cx, cy + 4, String(n), WHITE, "center");
}

// ---------- illustrations (original code-drawn scenes) ----------
// Each scene draws inside (x,y,w,h). Sky/background first, then figures.
const SKY: RGB = [168, 196, 214];
const DARK: RGB = [38, 48, 66];
const SEA: RGB = [42, 84, 122];
const FIRE: RGB = [232, 96, 28];
const SMOKE: RGB = [110, 110, 108];
function person(cx: number, cy: number, s: number, shirt: RGB, skin: RGB = [222, 184, 150]): void {
  circle(cx, cy - s * 0.62, s * 0.22, skin);
  poly([[cx - s * 0.3, cy + s * 0.5], [cx + s * 0.3, cy + s * 0.5], [cx + s * 0.22, cy - s * 0.38], [cx - s * 0.22, cy - s * 0.38]], shirt);
}
function flame(cx: number, cy: number, s: number): void {
  poly([[cx - s * 0.5, cy + s * 0.4], [cx - s * 0.25, cy - s * 0.5], [cx, cy - s * 0.1], [cx + s * 0.3, cy - s * 0.6], [cx + s * 0.5, cy + s * 0.4]], FIRE);
  poly([[cx - s * 0.25, cy + s * 0.4], [cx, cy - s * 0.2], [cx + s * 0.25, cy + s * 0.4]], [252, 196, 60]);
}
function smokeCol(x: number, y: number, h: number, w: number): void {
  ellipse(x, y, w, h * 0.28, SMOKE); ellipse(x + w * 0.3, y - h * 0.3, w * 0.8, h * 0.22, [130, 130, 128]); ellipse(x - w * 0.2, y - h * 0.55, w * 0.7, h * 0.2, [150, 150, 148]);
}
// 1 COP31 summit hall, Antalya
function sceneCOP(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [232, 214, 178]);
  rect(x, y, w, h * 0.22, [120, 90, 60]); // wood wall
  ellipse(x + w * 0.5, y + h * 0.62, w * 0.46, h * 0.16, [96, 66, 40]); // curved table
  rect(x + w * 0.08, y + h * 0.52, w * 0.84, h * 0.1, [150, 108, 66]);
  const cols: RGB[] = [[176, 30, 36], [22, 60, 110], [30, 110, 60], [200, 140, 30], [90, 40, 110], [30, 90, 120]];
  for (let i = 0; i < 7; i++) person(x + w * (0.14 + i * 0.12), y + h * 0.42, h * 0.34, cols[i % 6]);
  circle(x + w * 0.5, y + h * 0.2, h * 0.13, [60, 120, 170]); // globe
  ellipse(x + w * 0.46, y + h * 0.18, h * 0.05, h * 0.09, [60, 160, 90]);
  ellipse(x + w * 0.55, y + h * 0.24, h * 0.06, h * 0.06, [60, 160, 90]);
  // flags row
  for (let i = 0; i < 5; i++) { const fx = x + w * (0.2 + i * 0.15); line(fx, y + h * 0.08, fx, y + h * 0.3, INK, 1); rect(fx, y + h * 0.08, w * 0.07, h * 0.09, cols[i % 6]); }
  // torn pact document + gavel on table
  poly([[x + w * 0.62, y + h * 0.56], [x + w * 0.76, y + h * 0.56], [x + w * 0.72, y + h * 0.66], [x + w * 0.78, y + h * 0.6], [x + w * 0.62, y + h * 0.66]], WHITE);
  line(x + w * 0.64, y + h * 0.58, x + w * 0.74, y + h * 0.64, RED, 2);
  rect(x + w * 0.24, y + h * 0.55, w * 0.1, h * 0.05, [120, 80, 40]);
}
// 2 Benghazi: warship listing and burning, sea drones
function sceneShip(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h * 0.55, [70, 90, 110]); rect(x, y + h * 0.55, w, h * 0.45, SEA);
  // listing grey warship
  poly([[x + w * 0.12, y + h * 0.62], [x + w * 0.78, y + h * 0.52], [x + w * 0.82, y + h * 0.66], [x + w * 0.2, y + h * 0.78]], [110, 116, 122]);
  rect(x + w * 0.3, y + h * 0.38, w * 0.3, h * 0.16, [130, 136, 142]);
  line(x + w * 0.45, y + h * 0.38, x + w * 0.45, y + h * 0.22, [90, 96, 102], 3);
  flame(x + w * 0.6, y + h * 0.5, h * 0.5); flame(x + w * 0.3, y + h * 0.56, h * 0.36);
  smokeCol(x + w * 0.62, y + h * 0.2, h * 0.4, w * 0.05);
  // capsized hull
  ellipse(x + w * 0.86, y + h * 0.72, w * 0.08, h * 0.06, [70, 76, 82]);
  // sea drones speeding in
  for (let i = 0; i < 3; i++) {
    const dx = x + w * (0.08 + i * 0.09), dy = y + h * (0.82 + (i % 2) * 0.07);
    ellipse(dx, dy, w * 0.035, h * 0.03, DARK);
    line(dx - w * 0.06, dy, dx - w * 0.01, dy, WHITE, 2);
  }
  // helicopter silhouette on deck
  ellipse(x + w * 0.5, y + h * 0.34, w * 0.05, h * 0.035, DARK);
  line(x + w * 0.42, y + h * 0.33, x + w * 0.58, y + h * 0.33, DARK, 2);
}
// 3 Dymer apartment block, collapsed section, rescuers, ambulance
function sceneDymer(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  rect(x + w * 0.08, y + h * 0.12, w * 0.5, h * 0.62, [196, 178, 150]); // block
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) rect(x + w * (0.12 + c * 0.11), y + h * (0.17 + r * 0.11), w * 0.06, h * 0.06, r === 2 && c > 1 ? [40, 40, 40] : [90, 110, 140]);
  // collapsed section
  poly([[x + w * 0.58, y + h * 0.12], [x + w * 0.82, y + h * 0.12], [x + w * 0.82, y + h * 0.5], [x + w * 0.7, y + h * 0.62], [x + w * 0.58, y + h * 0.5]], [120, 108, 92]);
  poly([[x + w * 0.58, y + h * 0.74], [x + w * 0.86, y + h * 0.74], [x + w * 0.8, y + h * 0.9], [x + w * 0.62, y + h * 0.9]], [140, 128, 110]);
  circle(x + w * 0.66, y + h * 0.82, h * 0.05, [160, 148, 128]); circle(x + w * 0.76, y + h * 0.85, h * 0.04, [150, 138, 118]);
  smokeCol(x + w * 0.7, y + h * 0.3, h * 0.3, w * 0.04);
  person(x + w * 0.62, y + h * 0.88, h * 0.3, [220, 120, 30]); person(x + w * 0.72, y + h * 0.9, h * 0.3, [30, 90, 160]);
  // ambulance
  rect(x + w * 0.84, y + h * 0.72, w * 0.14, h * 0.16, WHITE); rect(x + w * 0.84, y + h * 0.72, w * 0.14, h * 0.05, RED);
  circle(x + w * 0.87, y + h * 0.89, h * 0.03, INK); circle(x + w * 0.95, y + h * 0.89, h * 0.03, INK);
}
// 4 US Capitol dome + House chamber seats
function sceneCapitol(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  rect(x, y + h * 0.55, w, h * 0.45, [120, 150, 90]);
  // dome
  ellipse(x + w * 0.5, y + h * 0.48, w * 0.2, h * 0.42, WHITE);
  rect(x + w * 0.46, y + h * 0.04, w * 0.08, h * 0.1, WHITE);
  circle(x + w * 0.5, y + h * 0.05, h * 0.04, INK);
  rect(x + w * 0.3, y + h * 0.5, w * 0.4, h * 0.14, WHITE);
  for (let i = 0; i < 6; i++) rect(x + w * (0.33 + i * 0.06), y + h * 0.5, w * 0.02, h * 0.14, [200, 200, 190]);
  line(x + w * 0.5, y + h * 0.12, x + w * 0.5, y + h * 0.2, INK, 2); circle(x + w * 0.5, y + h * 0.11, h * 0.03, INK);
  // chamber seat rows
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) circle(x + w * (0.12 + c * 0.095), y + h * (0.72 + r * 0.09), h * 0.035, c % 2 ? [176, 30, 36] : [22, 60, 110]);
}
// 5 Tokyo skyline + falling chart
function sceneTokyo(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [52, 58, 78]);
  const bh = [0.5, 0.7, 0.45, 0.8, 0.6, 0.75, 0.5];
  for (let i = 0; i < 7; i++) { rect(x + w * (0.03 + i * 0.135), y + h * (0.95 - bh[i]), w * 0.11, h * bh[i], [30, 34, 48]); for (let k = 0; k < 4; k++) rect(x + w * (0.05 + i * 0.135), y + h * (0.9 - bh[i] + k * 0.12), w * 0.02, h * 0.04, [250, 210, 90]); }
  // stock board + steep red fall
  rect(x + w * 0.55, y + h * 0.08, w * 0.42, h * 0.3, [240, 240, 230]);
  line(x + w * 0.58, y + h * 0.14, x + w * 0.7, y + h * 0.2, RED, 3); line(x + w * 0.7, y + h * 0.2, x + w * 0.82, y + h * 0.3, RED, 3); line(x + w * 0.82, y + h * 0.3, x + w * 0.94, y + h * 0.36, RED, 3);
  poly([[x + w * 0.94, y + h * 0.36], [x + w * 0.9, y + h * 0.34], [x + w * 0.94, y + h * 0.32]], RED);
}
// 6 Banten factory fire
function sceneFactory(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [200, 170, 140]);
  rect(x + w * 0.1, y + h * 0.35, w * 0.7, h * 0.5, [150, 120, 95]);
  rect(x + w * 0.1, y + h * 0.28, w * 0.7, h * 0.08, [110, 90, 70]);
  for (let i = 0; i < 4; i++) rect(x + w * (0.16 + i * 0.16), y + h * 0.5, w * 0.08, h * 0.2, [70, 70, 80]);
  flame(x + w * 0.3, y + h * 0.32, h * 0.55); flame(x + w * 0.55, y + h * 0.3, h * 0.7); flame(x + w * 0.68, y + h * 0.36, h * 0.45);
  smokeCol(x + w * 0.45, y + h * 0.12, h * 0.35, w * 0.05); smokeCol(x + w * 0.65, y + h * 0.08, h * 0.3, w * 0.04);
  person(x + w * 0.88, y + h * 0.88, h * 0.32, [220, 120, 30]);
  line(x + w * 0.86, y + h * 0.72, x + w * 0.68, y + h * 0.6, [80, 140, 200], 3);
  line(x + w * 0.68, y + h * 0.6, x + w * 0.6, y + h * 0.5, [120, 180, 230], 2);
}
// 7 Hormuz: two tankers ablaze, mine in water
function sceneHormuz(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h * 0.4, [210, 180, 130]); rect(x, y + h * 0.4, w, h * 0.6, SEA);
  // tanker 1
  poly([[x + w * 0.06, y + h * 0.55], [x + w * 0.48, y + h * 0.55], [x + w * 0.44, y + h * 0.72], [x + w * 0.1, y + h * 0.72]], [60, 60, 66]);
  rect(x + w * 0.34, y + h * 0.4, w * 0.1, h * 0.15, [200, 200, 190]); flame(x + w * 0.2, y + h * 0.5, h * 0.45); smokeCol(x + w * 0.22, y + h * 0.2, h * 0.35, w * 0.04);
  // tanker 2
  poly([[x + w * 0.56, y + h * 0.62], [x + w * 0.94, y + h * 0.62], [x + w * 0.9, y + h * 0.78], [x + w * 0.6, y + h * 0.78]], [80, 40, 40]);
  rect(x + w * 0.8, y + h * 0.48, w * 0.09, h * 0.14, [210, 210, 200]); flame(x + w * 0.72, y + h * 0.58, h * 0.4);
  // mine
  circle(x + w * 0.52, y + h * 0.86, h * 0.05, INK);
  for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4; line(x + w * 0.52, y + h * 0.86, x + w * 0.52 + Math.cos(r) * h * 0.09, y + h * 0.86 + Math.sin(r) * h * 0.09, INK, 1); }
}
// 8 Korean container port
function scenePort(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY); rect(x, y + h * 0.7, w, h * 0.3, SEA);
  // cranes
  for (let i = 0; i < 2; i++) {
    const cx = x + w * (0.2 + i * 0.4);
    line(cx, y + h * 0.15, cx, y + h * 0.7, [220, 170, 30], 4); line(cx, y + h * 0.15, cx + w * 0.22, y + h * 0.3, [220, 170, 30], 3); line(cx - w * 0.08, y + h * 0.15, cx + w * 0.22, y + h * 0.15, [220, 170, 30], 3);
  }
  // stacked containers
  const cc: RGB[] = [[176, 30, 36], [22, 90, 160], [30, 130, 70], [220, 140, 30]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) rect(x + w * (0.06 + c * 0.14), y + h * (0.52 - r * 0.11), w * 0.12, h * 0.09, cc[(r + c) % 4]);
  // cargo ship
  poly([[x + w * 0.62, y + h * 0.66], [x + w * 0.96, y + h * 0.66], [x + w * 0.9, y + h * 0.82], [x + w * 0.68, y + h * 0.82]], [40, 60, 80]);
  rect(x + w * 0.66, y + h * 0.5, w * 0.08, h * 0.16, WHITE); rect(x + w * 0.76, y + h * 0.56, w * 0.12, h * 0.1, [176, 30, 36]);
}
// 9 NATO HQ, flags, missile debris, map of Poland
function sceneNATO(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [210, 205, 190]);
  // map of Poland behind (rough shape)
  poly([[x + w * 0.55, y + h * 0.1], [x + w * 0.9, y + h * 0.08], [x + w * 0.95, y + h * 0.35], [x + w * 0.8, y + h * 0.48], [x + w * 0.6, y + h * 0.4]], [190, 200, 180]);
  // HQ building
  rect(x + w * 0.08, y + h * 0.4, w * 0.55, h * 0.45, [150, 150, 145]);
  for (let i = 0; i < 5; i++) rect(x + w * (0.12 + i * 0.1), y + h * 0.48, w * 0.05, h * 0.28, [70, 90, 120]);
  rect(x + w * 0.08, y + h * 0.36, w * 0.55, h * 0.05, [110, 110, 105]);
  // flags
  const fc: RGB[] = [[176, 30, 36], [22, 60, 110], [30, 110, 60], [200, 140, 30]];
  for (let i = 0; i < 4; i++) { const fx = x + w * (0.68 + i * 0.07); line(fx, y + h * 0.2, fx, y + h * 0.42, INK, 1); rect(fx, y + h * 0.2, w * 0.05, h * 0.08, fc[i]); }
  // table + debris shard
  rect(x + w * 0.6, y + h * 0.72, w * 0.34, h * 0.05, [96, 66, 40]);
  poly([[x + w * 0.68, y + h * 0.6], [x + w * 0.82, y + h * 0.55], [x + w * 0.86, y + h * 0.68], [x + w * 0.72, y + h * 0.72]], [90, 96, 102]);
  line(x + w * 0.68, y + h * 0.6, x + w * 0.82, y + h * 0.55, [180, 180, 170], 1);
}
// 10 Liverpool stadium at night, scoreboard 4-0
function sceneStadium(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [28, 32, 54]);
  rect(x, y + h * 0.7, w, h * 0.3, [40, 110, 50]);
  // stands
  rect(x, y + h * 0.35, w, h * 0.35, [60, 66, 90]);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) circle(x + w * (0.06 + c * 0.08), y + h * (0.42 + r * 0.1), h * 0.025, c % 3 ? [200, 200, 200] : [220, 60, 60]);
  // floodlights
  line(x + w * 0.08, y + h * 0.05, x + w * 0.08, y + h * 0.3, WHITE, 2); circle(x + w * 0.08, y + h * 0.05, h * 0.05, [255, 240, 180]);
  line(x + w * 0.92, y + h * 0.05, x + w * 0.92, y + h * 0.3, WHITE, 2); circle(x + w * 0.92, y + h * 0.05, h * 0.05, [255, 240, 180]);
  // scoreboard
  rect(x + w * 0.32, y + h * 0.06, w * 0.36, h * 0.26, [10, 10, 14]);
  drawText("sansB16", x + w * 0.5, y + h * 0.26, "4-0", [255, 220, 60], "center");
  // celebrating players
  person(x + w * 0.3, y + h * 0.85, h * 0.3, [200, 30, 40]); person(x + w * 0.5, y + h * 0.88, h * 0.3, [200, 30, 40]); person(x + w * 0.7, y + h * 0.85, h * 0.3, [255, 255, 255]);
  circle(x + w * 0.82, y + h * 0.92, h * 0.05, WHITE);
}
// 11 Oil refinery at night, flames, drones
function sceneRefinery(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [24, 28, 44]);
  for (let i = 0; i < 3; i++) { const tx = x + w * (0.15 + i * 0.3); rect(tx, y + h * 0.4, w * 0.12, h * 0.5, [90, 90, 95]); poly([[tx - w * 0.01, y + h * 0.4], [tx + w * 0.06, y + h * 0.22], [tx + w * 0.13, y + h * 0.4]], [110, 110, 115]); }
  rect(x + w * 0.1, y + h * 0.75, w * 0.8, h * 0.15, [60, 60, 65]);
  flame(x + w * 0.3, y + h * 0.4, h * 0.5); flame(x + w * 0.62, y + h * 0.38, h * 0.6); flame(x + w * 0.85, y + h * 0.45, h * 0.4);
  smokeCol(x + w * 0.45, y + h * 0.15, h * 0.3, w * 0.04);
  for (let i = 0; i < 3; i++) { const dx = x + w * (0.2 + i * 0.28), dy = y + h * (0.14 + (i % 2) * 0.08); ellipse(dx, dy, w * 0.03, h * 0.02, [200, 200, 200]); line(dx - w * 0.05, dy, dx + w * 0.05, dy, [200, 200, 200], 1); }
}
// 12 White House + calendar NEW YEAR + podium
function sceneWhiteHouse(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  rect(x, y + h * 0.75, w, h * 0.25, [110, 150, 90]);
  rect(x + w * 0.15, y + h * 0.4, w * 0.7, h * 0.38, WHITE);
  poly([[x + w * 0.12, y + h * 0.42], [x + w * 0.5, y + h * 0.18], [x + w * 0.88, y + h * 0.42]], [230, 230, 225]);
  for (let i = 0; i < 5; i++) rect(x + w * (0.22 + i * 0.11), y + h * 0.44, w * 0.04, h * 0.3, [200, 200, 195]);
  // calendar page
  rect(x + w * 0.68, y + h * 0.08, w * 0.26, h * 0.3, WHITE); rect(x + w * 0.68, y + h * 0.08, w * 0.26, h * 0.08, RED);
  drawText("sansB9", x + w * 0.81, y + h * 0.32, "NEW YEAR", INK, "center");
  // podium
  poly([[x + w * 0.42, y + h * 0.62], [x + w * 0.58, y + h * 0.62], [x + w * 0.62, y + h * 0.78], [x + w * 0.38, y + h * 0.78]], [90, 70, 50]);
  person(x + w * 0.5, y + h * 0.6, h * 0.3, [30, 40, 70]);
}
// 13 NYSE facade + green rising chart + bull
function sceneNYSE(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  rect(x + w * 0.12, y + h * 0.35, w * 0.76, h * 0.5, [225, 220, 205]);
  poly([[x + w * 0.1, y + h * 0.37], [x + w * 0.5, y + h * 0.12], [x + w * 0.9, y + h * 0.37]], [210, 205, 190]);
  for (let i = 0; i < 5; i++) rect(x + w * (0.18 + i * 0.13), y + h * 0.4, w * 0.05, h * 0.38, WHITE);
  // rising green chart
  line(x + w * 0.08, y + h * 0.3, x + w * 0.3, y + h * 0.22, [20, 140, 60], 3); line(x + w * 0.3, y + h * 0.22, x + w * 0.55, y + h * 0.24, [20, 140, 60], 3); line(x + w * 0.55, y + h * 0.24, x + w * 0.85, y + h * 0.1, [20, 140, 60], 3);
  poly([[x + w * 0.85, y + h * 0.1], [x + w * 0.8, y + h * 0.08], [x + w * 0.84, y + h * 0.05]], [20, 140, 60]);
  // bull
  ellipse(x + w * 0.5, y + h * 0.88, w * 0.16, h * 0.07, [110, 75, 40]);
  circle(x + w * 0.66, y + h * 0.84, h * 0.05, [110, 75, 40]);
  line(x + w * 0.68, y + h * 0.8, x + w * 0.72, y + h * 0.76, [220, 220, 210], 2); line(x + w * 0.7, y + h * 0.8, x + w * 0.74, y + h * 0.78, [220, 220, 210], 2);
}

// ---------- copy (23 November 2026, from the brief) ----------
interface Lead { n: number; kicker: string; head: string; body: string; src: string; chipTxt: string; chipBg: RGB; scene: (x: number, y: number, w: number, h: number) => void }
interface Grid { n: number; kicker: string; head: string; body: string; chipTxt: string; scene: (x: number, y: number, w: number, h: number) => void }
const LEADS: Lead[] = [
  { n: 1, kicker: "ANTALYA, TÜRKIYE — CLIMATE", head: "COP31 collapses with no climate deal",
    body: "UN talks end Sunday after two days of overtime with no deal — the longest COP ever, first breakdown since COP15 in 2009. The EU and ~130 parties reject a text omitting fossil fuels. President Murat Kurum: “there is no consensus.”",
    src: "Reuters · CNN · BBC — CONFIRMED", chipTxt: "NO DEAL", chipBg: RED, scene: sceneCOP },
  { n: 2, kicker: "BENGHAZI, LIBYA — WAR AT SEA", head: "Ukrainian sea drones sink Russian warship",
    body: "President Zelenskyy announces Monday: seven maritime drones sank the 344-foot corvette Merkury at Benghazi while refuelling, destroying a Ka-27 helicopter aboard. Cargo ship MV Angara was also hit. Russia has not commented.",
    src: "CNN — REPORTED", chipTxt: "7 SEA DRONES", chipBg: NAVY, scene: sceneShip },
  { n: 3, kicker: "DYMER, UKRAINE — WAR", head: "Russian strike kills 11 in Dymer",
    body: "A Russian strike on Dymer, north of Kyiv, kills 11, regional governor Tymur Tkachenko confirms Monday. A 7-year-old boy is pulled alive from rubble after 14 hours. Russia launched 153 drones overnight; 134 were downed.",
    src: "Reuters — CONFIRMED", chipTxt: "11 KILLED IN DYMER", chipBg: RED, scene: sceneDymer },
];
const GRID: Grid[] = [
  { n: 4, kicker: "WASHINGTON — POLITICS", head: "Democrats clinch 258 House seats", body: "Largest House majority since 1992; Hubbard beats Foxx.", chipTxt: "258 SEATS", scene: sceneCapitol },
  { n: 5, kicker: "TOKYO — MARKETS", head: "Nikkei falls 5.06% as AI sell-off spreads", body: "Friday's close, reported Monday; Kospi −3.3%; S&P −3.70%.", chipTxt: "NIKKEI −5.06%", scene: sceneTokyo },
  { n: 6, kicker: "BANTEN, INDONESIA — DISASTER", head: "24 dead in candy factory fire", body: "Factory fire in Cikande; toll confirmed Monday; about 30 missing.", chipTxt: "FACTORY FIRE", scene: sceneFactory },
  { n: 7, kicker: "STRAIT OF HORMUZ — CONFLICT", head: "Two tankers ablaze near Hormuz", body: "Two tankers hit mines and catch fire; Bahrain blames Iran.", chipTxt: "TANKERS ABLAZE", scene: sceneHormuz },
  { n: 8, kicker: "SEOUL — ECONOMY", head: "Korea's exports more than double", body: "Nov 1–20 exports $77.4bn, up 101.5%; chips up 294%.", chipTxt: "EXPORTS DOUBLE", scene: scenePort },
  { n: 9, kicker: "WARSAW / BRUSSELS — SECURITY", head: "NATO meets after Russian missiles land in Poland", body: "Emergency session in Brussels; missiles confirmed as Russian Kh-101s.", chipTxt: "NATO MEETS", scene: sceneNATO },
  { n: 10, kicker: "LIVERPOOL — SPORT", head: "Liverpool thrash Man Utd 4–0", body: "Pochettino's debut: Yoro sent off in 8th minute; four score.", chipTxt: "4–0", scene: sceneStadium },
  { n: 11, kicker: "RUSSIA — WAR", head: "Ukraine drones hit three Russian oil sites", body: "Novoshakhtinsk and Perm refineries struck; fires reported.", chipTxt: "3 OIL SITES", scene: sceneRefinery },
  { n: 12, kicker: "WASHINGTON — IRAN", head: "Trump 'inclined' to resume Iran conflict", body: "Trump 'inclined' to resume conflict if no deal by New Year.", chipTxt: "IRAN CONFLICT", scene: sceneWhiteHouse },
  { n: 13, kicker: "NEW YORK — MARKETS", head: "Wall Street opens sharply higher", body: "Nasdaq +3.6%, S&P +2.9%, Dow +2.0% in early Monday trade.", chipTxt: "STOCKS REBOUND", scene: sceneNYSE },
];
const WIRES: string[] = [
  "Paris: France's leading candidates question Ukraine aid.",
  "New Delhi: Nepal PM Balen Shah welcomed by Modi.",
  "Atlanta: Delta delays 1,600+ flights; outage resolved Monday.",
  "Gaza: experts call Gaza a “toxic wasteland” after the assault.",
  "Seoul: education minister Choi Kyo-jin resigns in exam-cheating scandal.",
  "Tehran: Iran vows to break US naval blockade; 31 tankers mass.",
  "Sinaloa: FBI most-wanted 'El Chapo Isidro' captured in Guasave.",
  "Khartoum: drone strikes kill five children in Khartoum and Omdurman.",
  "Brasilia: Bolsonaro in intensive care, stable; no discharge date.",
  "Nigeria: vigilantes reportedly kill Fulani; 35 dead in Wawa.",
  "South Sudan: 21 killed in a Saturday-night raid on a cattle camp.",
  "Ghana: opens a voluntary buyback of up to $2.4bn of bonds.",
  "Ecuador: alleged Los Lobos leader Sayayin arrested in the south.",
  "Odesa: schools go remote 23–27 Nov after strikes wreck power grid.",
  "Brussels: EU–Indonesia trade pact signed; 90% of tariffs gone.",
  "Paris: Le Pen declines Zelenskyy's invitation; will meet in Paris.",
  "Science: Lean and Mathlib confirm the Riemann Hypothesis proof.",
  "Bratislava: Slovakia rejects a new 45bn-euro EU loan for Ukraine.",
  "United Nations: Britain, France, China block Nusseibeh's UN bid.",
  "Brussels: Belgian airports shut as a national strike grounds flights.",
  "London: Titanic survivor's diamond ring sells for £150,000.",
  "Centurion: rain delays toss; Markram captains, South Africa top (75.00%).",
  "Jakarta: Indonesia seizes a ship carrying 405 tonnes of sodium perchlorate.",
];
const DATE_CHECK = "Wires as of about 14:30 UTC, Monday 23 November 2026. Not repeated from Sunday's edition: the Sparta II Baltic ship fire, the Peru 6.8 quake, Eisenkot's mandate ceremony, Verstappen's Las Vegas pole, England's 37–12 rugby win, Arsenal 2–2 and Leeds 4–1 Chelsea. Left out as earlier news: the ICJ's Myanmar genocide ruling (19 Nov) and Korea crossing $1tn in exports (19 Nov; Monday's news is the Nov 1–20 customs data). New on Monday: NATO's council convenes in Brussels; Wall Street opens sharply higher; Iran vows to break the US naval blockade (wire 19); EU and Indonesia sign a trade pact (wire 28). Still to come at press time: Wall Street's close, the Centurion result, the rest of Monday. Played Sunday, led Monday: Liverpool 4–0 Man Utd.";
const SOURCES = "Sources: Reuters, AP, CNN, BBC, Korea Customs, UKMTO, FT, WSJ, wire reports. Every story happened, or was first reported, on Monday 23 November 2026 (UTC).";

// ---------- dotted world map ----------
// Continents as ellipses in lon/lat; dots sampled on a grid inside map rect.
const LAND: [number, number, number, number][] = [
  [-100, 48, 42, 16], [-88, 30, 18, 8], [-60, -12, 14, 20], [-65, -32, 8, 8],
  [10, 52, 16, 8], [18, 8, 16, 16], [24, -18, 12, 12],
  [55, 52, 55, 16], [90, 62, 35, 10], [105, 25, 18, 14], [122, 12, 10, 8],
  [134, -24, 16, 9], [-18, 65, 12, 8], [75, 68, 20, 7], [-42, 74, 10, 6],
];
const PINS: [number, number, number, number, number][] = [ // [lon, lat, story, dx, dy] — offsets spread the dense Europe/US clusters
  [30.7, 36.9, 1, 0, 0], [20.1, 32.1, 2, -9, 6], [30.0, 50.8, 3, -7, -9], [-77, 38.9, 4, 0, 0], [139.7, 35.7, 5, 9, -4],
  [106.2, -6.3, 6, 0, 0], [56.5, 26.6, 7, 7, 7], [127, 37.5, 8, -9, -7], [21, 52.2, 9, 9, -9], [-3, 53.4, 10, -9, 5],
  [40, 48, 11, 11, 5], [-77, 38.9, 12, -11, 10], [-74, 40.7, 13, 12, -8],
];
function drawMap(mx: number, my: number, mw: number, mh: number): void {
  const step = 6;
  for (let gy = my; gy < my + mh; gy += step) {
    for (let gx = mx; gx < mx + mw; gx += step) {
      const lon = -180 + (gx - mx) / mw * 360;
      const lat = 78 - (gy - my) / mh * 156;
      let land = false;
      for (const e of LAND) { const dx = (lon - e[0]) / e[2], dy = (lat - e[1]) / e[3]; if (dx * dx + dy * dy <= 1) { land = true; break; } }
      if (land) circle(gx + 2, gy + 2, 2, NAVY);
    }
  }
  for (const p of PINS) {
    const px2 = mx + (p[0] + 180) / 360 * mw + p[3];
    const py2 = my + (78 - p[1]) / 156 * mh + p[4];
    circle(px2, py2, 6, RED); ring(px2, py2, 6, WHITE, 1);
    drawText("sansB9", px2, py2 + 3, String(p[2]), WHITE, "center");
  }
}

// ---------- layout ----------
function main(): void {
  fillAll(CREAM);
  // 1 top strip
  drawText("sansB10", 8, 13, "THE WORLD IN ONE DAY — FULL-DAY EDITION", INK);
  drawText("sansB10", 1016, 13, "36 STORIES - 7 REGIONS - MONDAY 23 NOVEMBER 2026", INK, "right");
  hline(8, 1016, 20, RED, 2);
  // 2 masthead
  drawText("mast", 512, 91, "Monday 23 November 2026", INK, "center");
  hline(8, 1016, 108, RED, 2);
  // 3 sub-deck
  drawText("serifB16", 512, 130, "Democrats clinch 258 House seats — COP31 ends with no deal — Ukraine's sea drones sink Russian warship", RED, "center");
  // 4 stats strip
  const stats: [string, string][] = [
    ["258", "Democrats' House seats"], ["−5.06%", "Nikkei fall"], ["11", "killed in Dymer strike"],
    ["24", "dead in Banten factory fire"], ["$77.4bn", "Korea Nov 1–20 exports"], ["+3.6%", "Nasdaq 100, early trade"],
  ];
  for (let i = 0; i < 6; i++) {
    const cx = 8 + i * 168 + 84;
    drawText("serifB34", cx, 168, stats[i][0], RED, "center");
    drawText("sansB10", cx, 184, stats[i][1], INK, "center");
    if (i > 0) vline(8 + i * 168, 140, 186, LIGHT, 1);
  }
  // 5 timeline (two lines, NATO hour not verified — labelled MONDAY)
  rect(8, 194, 1008, 30, NAVY);
  drawText("sansB10", 16, 207, "THE DAY IN UTC   00:53 Korea customs data out · 02:22 Ukraine hits 3 Russian oil sites · 06:27 Dymer toll reaches 11 · 07:28 Russia's 153-drone attack reported ·", WHITE);
  drawText("sansB10", 16, 220, "09:30 Wall Street opens higher · MONDAY NATO council meets in Brussels · 14:30 Press time.", WHITE);
  // 6 leads
  const leadX = [8, 348, 688], leadW = 328;
  for (let i = 0; i < 3; i++) {
    const L = LEADS[i], x = leadX[i];
    L.scene(x, 230, leadW, 92);
    numCircle(x + 14, 244, L.n);
    const cw = measure("sansB9", L.chipTxt) + 10;
    chip(x + leadW - cw - 4, 234, L.chipTxt, L.chipBg);
    drawText("sansB10", x + 2, 338, L.kicker, RED);
    drawWrapped("serifB21", x + 2, 360, L.head, leadW - 4, 24, INK);
    drawWrapped("serifR12", x + 2, 402, L.body, leadW - 4, 15, INK);
    drawText("sansB9", x + 2, 462, L.src, GREY);
  }
  // 7 grid of 10
  const gridX = [8, 211, 414, 617, 820], gridW = 195;
  const gridY = [470, 614];
  for (let i = 0; i < 10; i++) {
    const G = GRID[i], x = gridX[i % 5], y = gridY[Math.floor(i / 5)];
    G.scene(x, y, gridW, 58);
    numCircle(x + 12, y + 12, G.n);
    const cw = measure("sansB9", G.chipTxt) + 10;
    chip(x + gridW - cw - 3, y + 4, G.chipTxt, i % 2 ? NAVY : RED);
    drawText("sansB9", x + 2, y + 72, G.kicker, RED);
    drawWrapped("serifB15", x + 2, y + 90, G.head, gridW - 4, 18, INK);
    drawWrapped("serifR11", x + 2, y + 124, G.body, gridW - 4, 13, INK);
  }
  // 8 wires heading + band
  drawText("sansB13", 8, 772, "ALSO IN MONDAY'S FULL-DAY WIRES — 23 MORE STORIES", RED);
  drawText("sansB13", 798, 772, "WHERE IT HAPPENED", RED);
  for (let i = 0; i < 12; i++) {
    drawText("sansB11", 8, 786 + i * 11, String(14 + i) + ".", RED);
    drawText("sansR11", 34, 786 + i * 11, WIRES[i], INK);
  }
  for (let i = 0; i < 11; i++) {
    drawText("sansB11", 402, 786 + i * 11, String(26 + i) + ".", RED);
    drawText("sansR11", 428, 786 + i * 11, WIRES[12 + i], INK);
  }
  drawMap(798, 782, 220, 96);
  const legend = ["1 Antalya · 2 Benghazi · 3 Dymer · 4 Washington", "5 Tokyo · 6 Banten · 7 Hormuz · 8 Seoul · 9 Warsaw", "10 Liverpool · 11 Russia · 12 Washington", "13 New York"];
  legend.forEach((ln, i) => drawText("sansB9", 798, 884 + i * 11, ln, INK));
  // 9 date check
  rect(8, 926, 1008, 72, CREAM);
  // border
  hline(8, 1016, 926, RED, 2); hline(8, 1016, 998, RED, 2);
  vline(8, 926, 998, RED, 2); vline(1016, 926, 998, RED, 2);
  drawText("sansB12", 16, 942, "DATE CHECK", RED);
  drawText("sansB9", 1008, 942, "FULL-DAY EDITION", RED, "right");
  drawWrapped("serifR11", 16, 955, DATE_CHECK, 992, 12, INK);
  // 10 sources
  drawText("sansB9", 512, 1005, SOURCES, INK, "center");
  // 11 footer
  rect(8, 1010, 1008, 14, NAVY);
  drawText("sansB10", 16, 1021, "THE WORLD IN ONE DAY", WHITE);
  drawText("sansB10", 1008, 1021, "MONDAY 23 NOVEMBER 2026 · ONE PAGE", WHITE, "right");

  fs.mkdirSync("/output", { recursive: true });
  fs.writeFileSync(OUT, encodePNG(W, H, px));
}
main();
