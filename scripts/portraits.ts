// Pixel-art portrait generator: five hand-authored 64x64 busts -> public/portraits/*.png.
// Zero-dependency PNG encoder (Node zlib). Regenerate with: npm run portraits
// Art direction: dark parchment backgrounds, single left key light, 1px auto-outline,
// distinct silhouettes per §6.3 briefs. Display with image-rendering: pixelated.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcBuf = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcBuf));
  return out;
}

function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1);
  }
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  return new Uint8Array([
    ...sig,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', idat),
    ...chunk('IEND', new Uint8Array(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Pixel toolkit
// ---------------------------------------------------------------------------

const W = 64;
const H = 64;

type Hex = string;

function hex(c: Hex): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

class Px {
  buf = new Uint8Array(W * H); // palette indexes
  pal: [number, number, number][] = [];
  names = new Map<string, number>();
  bgSet = new Set<number>();

  color(name: string, c: Hex, isBg = false): number {
    if (this.names.has(name)) return this.names.get(name)!;
    const idx = this.pal.length;
    this.pal.push(hex(c));
    this.names.set(name, idx);
    if (isBg) this.bgSet.add(idx);
    return idx;
  }
  n(name: string): number {
    const idx = this.names.get(name);
    if (idx === undefined) throw new Error(`unknown color ${name}`);
    return idx;
  }
  set(x: number, y: number, name: string): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.buf[y * W + x] = this.n(name);
  }
  get(x: number, y: number): number {
    return this.buf[y * W + x];
  }
  rect(x: number, y: number, w: number, h: number, name: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, name);
  }
  hline(x0: number, x1: number, y: number, name: string): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, name);
  }
  vline(x: number, y0: number, y1: number, name: string): void {
    for (let y = y0; y <= y1; y++) this.set(x, y, name);
  }
  disc(cx: number, cy: number, rx: number, ry: number, name: string): void {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, name);
      }
  }
  /** rows: array of [y, x0, x1] runs */
  runs(rows: [number, number, number][], name: string): void {
    for (const [y, x0, x1] of rows) this.hline(x0, x1, y, name);
  }
  dither(x: number, y: number, w: number, h: number, a: string, b: string): void {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) this.set(i, j, (i + j) % 2 === 0 ? a : b);
  }
  /** replace color a with b inside a rect region */
  swap(x: number, y: number, w: number, h: number, a: string, b: string): void {
    const ai = this.n(a);
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        if (this.buf[j * W + i] === ai) this.buf[j * W + i] = this.n(b);
      }
  }
  /** darken background pixels adjacent to figure pixels — the classic 1px sprite outline */
  autoOutline(name: string): void {
    const o = this.n(name);
    const src = this.buf.slice();
    const isBg = (v: number) => this.bgSet.has(v) || v === o;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = src[y * W + x];
        if (!this.bgSet.has(v)) continue;
        const nb = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        ].some(([i, j]) => i >= 0 && j >= 0 && i < W && j < H && !isBg(src[j * W + i]));
        if (nb) this.buf[y * W + x] = o;
      }
  }
  vignette(dark: string): void {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - 32, y - 30);
        if (d > 34 && this.bgSet.has(this.buf[y * W + x])) this.buf[y * W + x] = this.n(dark);
      }
  }
  png(): Uint8Array {
    const rgba = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const [r, g, b] = this.pal[this.buf[i]];
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = 255;
    }
    return encodePng(W, H, rgba);
  }
}

interface SkinTones {
  skin: Hex;
  shade: Hex;
  dark: Hex;
  light: Hex;
}

function base(glow: Hex, tones: SkinTones): Px {
  const p = new Px();
  p.color('bg', '#241d13', true);
  p.color('bgDark', '#191510', true);
  p.color('glow', glow, true);
  p.color('outline', '#0c0a07');
  p.color('skin', tones.skin);
  p.color('shade', tones.shade);
  p.color('dark', tones.dark);
  p.color('light', tones.light);
  p.color('white', '#e8e2d0');
  p.color('ink', '#1a140e');
  p.rect(0, 0, W, H, 'bg');
  p.disc(32, 26, 26, 24, 'glow');
  p.vignette('bgDark');
  return p;
}

/** Shared face core: neck, head block, right-side shading, ears. Characters reshape after. */
function headCore(p: Px, opts: { jawY: number; headW: number; earY: number; ears?: boolean }): void {
  const { jawY, headW, earY } = opts;
  // neck + trap shadow
  p.rect(28, jawY - 2, 9, 10, 'skin');
  p.swap(28, jawY - 2, 9, 10, 'skin', 'shade');
  p.rect(29, jawY - 2, 6, 9, 'skin');
  // skull
  p.disc(32, 20, headW, 12, 'skin');
  // cheeks->jaw taper
  p.rect(32 - headW + 2, 24, headW * 2 - 4, jawY - 24, 'skin');
  p.hline(32 - headW + 4, 32 + headW - 5, jawY, 'skin');
  p.hline(32 - headW + 6, 32 + headW - 7, jawY + 1, 'skin');
  p.hline(30, 35, jawY + 2, 'skin'); // chin
  // key light from the left: shade the right third of the face
  for (let y = 9; y <= jawY + 2; y++)
    for (let x = 32 + Math.floor(headW * 0.45); x <= 32 + headW; x++) {
      if (p.get(x, y) === p.n('skin')) p.set(x, y, 'shade');
    }
  // under-jaw AO
  p.hline(29, 36, jawY + 3, 'shade');
  if (opts.ears !== false) {
    p.rect(32 - headW - 1, earY, 2, 4, 'skin');
    p.rect(32 + headW - 1, earY, 2, 4, 'shade');
    p.set(32 - headW, earY + 2, 'shade');
  }
}

function eyes(
  p: Px,
  y: number,
  opts: { lx?: number; rx?: number; browTilt?: 'level' | 'in' | 'sad'; narrow?: boolean; browC?: string; whites?: boolean },
): void {
  const lx = opts.lx ?? 27;
  const rx = opts.rx ?? 36;
  const browC = opts.browC ?? 'dark';
  for (const [x, shadeName] of [
    [lx, 'skin'],
    [rx, 'shade'],
  ] as const) {
    // socket
    p.hline(x - 1, x + 2, y - 1, shadeName === 'skin' ? 'shade' : 'dark');
    if (!opts.narrow && opts.whites !== false) {
      p.set(x, y, 'white');
      p.set(x + 1, y, 'ink');
    } else if (opts.narrow) {
      p.hline(x, x + 1, y, 'ink');
    } else {
      p.set(x, y, 'ink');
      p.set(x + 1, y, 'ink');
    }
  }
  // brows
  const tilt = opts.browTilt ?? 'level';
  if (tilt === 'level') {
    p.hline(lx - 1, lx + 2, y - 2, browC);
    p.hline(rx - 1, rx + 2, y - 2, browC);
  } else if (tilt === 'in') {
    p.hline(lx - 1, lx + 2, y - 2, browC);
    p.set(lx + 2, y - 1, browC);
    p.hline(rx - 1, rx + 2, y - 2, browC);
    p.set(rx - 1, y - 1, browC);
  } else {
    p.set(lx - 1, y - 1, browC);
    p.hline(lx, lx + 2, y - 2, browC);
    p.hline(rx - 1, rx + 1, y - 2, browC);
    p.set(rx + 2, y - 1, browC);
  }
}

function nose(p: Px, y0: number, y1: number): void {
  p.vline(33, y0, y1, 'shade');
  p.set(34, y1, 'shade');
  p.set(32, y1, 'light');
}

function mouth(p: Px, y: number, kind: 'flat' | 'smirkL' | 'smirkR' | 'grim' | 'pursed'): void {
  if (kind === 'flat') p.hline(29, 34, y, 'dark');
  if (kind === 'grim') {
    p.hline(29, 35, y, 'dark');
    p.hline(30, 34, y + 1, 'shade');
  }
  if (kind === 'smirkL') {
    p.hline(29, 34, y, 'dark');
    p.set(28, y - 1, 'dark');
  }
  if (kind === 'smirkR') {
    p.hline(29, 34, y, 'dark');
    p.set(35, y - 1, 'dark');
  }
  if (kind === 'pursed') {
    p.hline(30, 33, y, 'dark');
    p.set(29, y, 'shade');
    p.set(34, y, 'shade');
  }
  p.hline(30, 33, y + 1, kind === 'grim' ? 'dark' : 'light'); // lower lip light
}

/** Shoulders: trapezoid from yTop widening to bottom in garment base color. */
function shoulders(p: Px, yTop: number, name: string, halfTop = 12, halfBot = 26): void {
  for (let y = yTop; y < H; y++) {
    const t = (y - yTop) / (H - yTop);
    const half = Math.round(halfTop + (halfBot - halfTop) * Math.min(1, t * 1.6));
    p.hline(32 - half, 32 + half, y, name);
  }
}

const dir = fileURLToPath(new URL('../public/portraits/', import.meta.url));
mkdirSync(dir, { recursive: true });

function save(name: string, p: Px): void {
  p.autoOutline('outline');
  writeFileSync(`${dir}${name}.png`, p.png());
  console.log(`portraits/${name}.png`);
}

// ---------------------------------------------------------------------------
// SERAH the Anvil — steel-grey crop, scarred brow, gorget & pauldrons, level stare
// ---------------------------------------------------------------------------
{
  const p = base('#2a251c', { skin: '#c09468', shade: '#93694a', dark: '#684732', light: '#dcb488' });
  p.color('steel', '#525c68');
  p.color('steelD', '#333a44');
  p.color('steelL', '#8b98a6');
  p.color('steelXL', '#c2ccd6');
  p.color('leather', '#5c4630');
  p.color('sash', '#7e3025');
  p.color('hairG', '#9aa0a2');
  p.color('hairGD', '#6d7375');
  p.color('hairGL', '#c5cbcd');
  p.color('scar', '#a4705a');

  shoulders(p, 44, 'steelD');
  // pauldron plates
  p.runs([[46, 10, 24], [47, 9, 25], [48, 8, 26], [50, 8, 26], [52, 9, 27], [55, 10, 28]], 'steel');
  p.runs([[46, 40, 54], [47, 39, 55], [48, 38, 56], [50, 38, 56], [52, 37, 55], [55, 36, 54]], 'steel');
  p.swap(38, 44, 26, 20, 'steel', 'steelD'); // shade right pauldron back down
  p.runs([[47, 10, 20], [51, 9, 21], [56, 11, 23]], 'steelL'); // plate edges, lit side
  // gorget
  p.runs([[44, 26, 38], [45, 25, 39], [46, 25, 39], [47, 26, 38]], 'steel');
  p.hline(26, 36, 44, 'steelL');
  p.set(27, 45, 'steelXL');
  // sash knot at left shoulder
  p.rect(22, 47, 5, 4, 'sash');
  p.set(23, 51, 'sash');

  headCore(p, { jawY: 33, headW: 10, earY: 22 });
  // strong jaw
  p.hline(26, 39, 31, 'skin');
  p.swap(37, 26, 5, 8, 'skin', 'shade');
  // cropped grey hair — spiky top line
  p.runs([[8, 27, 36], [9, 25, 39], [10, 24, 40], [11, 23, 41], [12, 23, 42], [13, 22, 42], [14, 22, 42]], 'hairG');
  for (let x = 23; x <= 41; x += 3) p.set(x, 7 + (x % 2), 'hairG'); // spiky crop
  p.swap(33, 7, 11, 9, 'hairG', 'hairGD');
  p.hline(23, 30, 9, 'hairGL');
  p.runs([[15, 22, 24], [16, 22, 23], [17, 22, 23], [18, 22, 22]], 'hairG'); // temple left
  p.runs([[15, 40, 42], [16, 41, 42], [17, 41, 42], [18, 42, 42]], 'hairGD'); // temple right
  eyes(p, 22, { browTilt: 'level', browC: 'hairGD' });
  nose(p, 24, 28);
  mouth(p, 31, 'grim');
  // the scar: brow through cheek, left side
  p.set(26, 18, 'scar');
  p.set(26, 19, 'scar');
  p.set(27, 21, 'scar');
  p.set(27, 24, 'scar');
  p.set(28, 26, 'scar');
  // weathering
  p.set(29, 28, 'shade');
  p.set(36, 28, 'dark');
  p.hline(28, 30, 34, 'shade'); // set jaw line
  save('serah', p);
}

// ---------------------------------------------------------------------------
// KAEL the Ember — dark auburn swept hair, ember scarf, half-smirk, a glint
// ---------------------------------------------------------------------------
{
  const p = base('#2c2015', { skin: '#c89b6d', shade: '#9a6f4c', dark: '#6f4b34', light: '#e6c091 '.trim() as Hex });
  p.color('hair', '#5a3323');
  p.color('hairD', '#3c2117');
  p.color('hairL', '#8a5233');
  p.color('scarf', '#a33c2e');
  p.color('scarfD', '#6f271e');
  p.color('scarfL', '#cf6a4f');
  p.color('jerkin', '#4f3a28');
  p.color('jerkinD', '#37281b');
  p.color('jerkinL', '#6f5439');
  p.color('buckle', '#c9a23f');

  shoulders(p, 44, 'jerkinD');
  p.runs([[44, 22, 42], [45, 20, 44], [46, 18, 46], [47, 17, 47]], 'jerkin');
  p.swap(34, 44, 14, 20, 'jerkin', 'jerkinD');
  p.vline(21, 46, 63, 'jerkinL'); // lit seam
  // scarf: one solid wrap high on the neck, tail a connected band over the right shoulder
  p.runs([[39, 27, 37], [40, 25, 39], [41, 24, 40], [42, 24, 41], [43, 25, 42], [44, 26, 42]], 'scarf');
  for (let i = 0; i < 11; i++) {
    const y = 45 + i;
    const x = 37 + Math.floor(i * 0.8);
    p.hline(x, x + 4 - Math.floor(i / 5), y, 'scarf');
  }
  p.swap(34, 39, 16, 24, 'scarf', 'scarfD');
  p.hline(25, 33, 40, 'scarfL');
  p.hline(24, 30, 42, 'scarfL');
  p.set(38, 46, 'scarfL');
  p.set(40, 49, 'scarfL');
  p.set(25, 43, 'buckle');

  headCore(p, { jawY: 32, headW: 9, earY: 22 });
  // narrower young jaw
  p.hline(28, 36, 33, 'skin');
  p.hline(30, 34, 34, 'shade');
  // swept-back hair with a falling strand
  p.runs(
    [
      [6, 27, 37], [7, 25, 40], [8, 24, 42], [9, 23, 43], [10, 23, 44], [11, 22, 44],
      [12, 22, 44], [13, 22, 43], [14, 22, 27], [14, 39, 43], [15, 22, 25], [15, 41, 43],
      [16, 22, 24], [16, 41, 43], [17, 22, 23], [17, 42, 43], [18, 42, 43],
    ],
    'hair',
  );
  p.swap(33, 5, 12, 10, 'hair', 'hairD');
  p.runs([[7, 26, 33], [8, 25, 30]], 'hairL'); // swept sheen
  // loose strand over brow, right
  p.vline(38, 13, 16, 'hair');
  p.set(39, 15, 'hairD');
  eyes(p, 22, { browTilt: 'in', browC: 'hairD' });
  p.set(28, 22, 'white'); // the glint
  nose(p, 24, 27);
  mouth(p, 30, 'smirkR');
  p.set(36, 29, 'shade'); // smirk crease
  save('kael', p);
}

// ---------------------------------------------------------------------------
// MOTHER ROOKE the Ledger — moss hood, pale coif, heavy-lidded eyes, iron key
// ---------------------------------------------------------------------------
{
  const p = base('#232418', { skin: '#c9a98a', shade: '#9c7c61', dark: '#6f5443', light: '#e5cbae' });
  p.color('hood', '#48583b');
  p.color('hoodD', '#2f3b27');
  p.color('hoodL', '#69805a');
  p.color('coif', '#cfc6ae');
  p.color('coifD', '#a29a82');
  p.color('robe', '#3a4030');
  p.color('robeD', '#282d21');
  p.color('iron', '#7d8288');
  p.color('ironD', '#4c5055');
  p.color('cord', '#5c4630');

  // robe: solid, softly widening
  shoulders(p, 43, 'robe');
  p.swap(34, 43, 16, 21, 'robe', 'robeD');
  p.swap(10, 58, 44, 6, 'robe', 'robeD');
  // hood: one solid silhouette — dome over the head flowing into the shoulders
  p.disc(32, 16, 13, 12, 'hood');
  for (let y = 16; y <= 46; y++) {
    const t = (y - 16) / 30;
    const half = Math.round(13 + t * 7);
    p.hline(32 - half, 32 + half, y, 'hood');
  }
  p.swap(35, 4, 16, 44, 'hood', 'hoodD'); // right side in shadow
  // hood highlight ridge, lit side
  p.runs([[7, 28, 33], [8, 25, 30], [10, 22, 25], [13, 20, 22], [17, 19, 20], [22, 19, 19]], 'hoodL');
  // face opening — smaller and rounder than the other casts
  p.disc(32, 22, 8, 9, 'bg');
  p.rect(26, 26, 13, 7, 'bg');
  // coif: a warm cream ring framing the opening
  for (let y = 13; y <= 33; y++)
    for (let x = 22; x <= 42; x++) {
      const dx = (x - 32) / 9;
      const dy = (y - 22.5) / 10.5;
      const dx2 = (x - 32) / 8;
      const dy2 = (y - 22) / 9;
      const inOuter = dx * dx + dy * dy <= 1;
      const inInner = dx2 * dx2 + (y <= 31 ? dy2 * dy2 : 1.1) <= 1;
      if (inOuter && !inInner && p.get(x, y) !== p.n('bg')) p.set(x, y, 'coif');
    }
  p.swap(35, 12, 8, 23, 'coif', 'coifD');
  // the face: round, aged, knowing
  p.disc(32, 23, 7, 8, 'skin');
  p.rect(27, 27, 11, 4, 'skin');
  p.hline(28, 36, 31, 'skin');
  p.hline(30, 35, 32, 'skin'); // soft chin
  for (let y = 15; y <= 32; y++)
    for (let x = 35; x <= 40; x++) if (p.get(x, y) === p.n('skin')) p.set(x, y, 'shade');
  p.hline(29, 34, 33, 'shade'); // under-chin
  eyes(p, 22, { narrow: true, browTilt: 'level', browC: 'dark' });
  p.hline(26, 28, 20, 'shade'); // heavy lids
  p.hline(35, 37, 20, 'dark');
  p.set(25, 23, 'shade'); // crow's feet
  p.set(39, 23, 'dark');
  nose(p, 24, 26);
  mouth(p, 29, 'pursed');
  p.set(27, 26, 'shade'); // cheek fullness
  p.set(28, 27, 'light');
  p.set(37, 26, 'dark');
  p.hline(29, 30, 27, 'shade'); // smile line
  // iron key on a cord, over the robe
  p.vline(30, 44, 46, 'cord');
  p.vline(34, 44, 46, 'cord');
  p.rect(30, 47, 5, 3, 'iron');
  p.set(32, 48, 'robeD'); // bow hole
  p.vline(32, 50, 55, 'iron');
  p.set(33, 52, 'iron');
  p.set(33, 55, 'iron');
  p.set(30, 47, 'ironD');
  p.set(32, 56, 'ironD');
  save('rooke', p);
}

// ---------------------------------------------------------------------------
// BROTHER HALE of the Returning Sun — shaved head, gaunt zeal, sun-disc, mail
// ---------------------------------------------------------------------------
{
  const p = base('#2d2513', { skin: '#b98e62', shade: '#8c6344', dark: '#63432e', light: '#d9b184' });
  p.color('mail', '#4a4f57');
  p.color('mailD', '#33373d');
  p.color('mailL', '#6e747e');
  p.color('mantle', '#a8842c');
  p.color('mantleD', '#7a5f1d');
  p.color('mantleL', '#d0ab4a');
  p.color('sun', '#e3b83f');
  p.color('sunL', '#f4dc8a');
  p.color('scarB', '#8c5340');

  shoulders(p, 44, 'mailD');
  p.dither(14, 45, 36, 19, 'mail', 'mailD'); // ring mail texture
  p.dither(16, 45, 10, 4, 'mailL', 'mail'); // lit rings, left
  // mail collar so the neck reads armored, not bare
  p.runs([[41, 28, 36], [42, 27, 37], [43, 26, 38]], 'mail');
  p.dither(27, 42, 11, 2, 'mail', 'mailL');
  // gold half-mantle: one SOLID drape over the left shoulder, with fold shading
  for (let y = 44; y < H; y++) {
    const t = (y - 44) / (H - 44);
    const x0 = 10 + Math.round(t * 3);
    const x1 = 31 - Math.round(t * 4);
    p.hline(x0, x1, y, 'mantle');
  }
  p.swap(22, 44, 10, 20, 'mantle', 'mantleD'); // inner edge falls to shadow
  p.vline(15, 46, 62, 'mantleD'); // fold
  p.vline(19, 45, 63, 'mantleD'); // fold
  p.vline(11, 46, 61, 'mantleL'); // lit rim
  p.hline(11, 27, 44, 'mantleL'); // shoulder hem
  p.hline(12, 24, 45, 'mantle');
  // sun-disc pendant on the mail
  p.disc(38, 52, 3, 3, 'sun');
  p.set(37, 51, 'sunL');
  for (const [dx, dy] of [[0, -5], [0, 5], [-5, 0], [5, 0], [-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
    p.set(38 + dx, 52 + dy, 'sun');
  }

  headCore(p, { jawY: 33, headW: 9, earY: 22 });
  // shaved skull: just a stubble shadow band
  p.runs([[9, 27, 37], [10, 25, 39], [11, 24, 40]], 'shade');
  p.swap(24, 9, 17, 3, 'shade', 'dark');
  p.hline(26, 31, 9, 'shade');
  // gaunt: hollow cheeks
  p.vline(26, 26, 29, 'shade');
  p.vline(38, 26, 29, 'dark');
  p.set(27, 30, 'shade');
  p.set(37, 30, 'dark');
  // burning stare: whites showing, brows pinched in
  eyes(p, 21, { browTilt: 'in', whites: true, browC: 'dark' });
  p.set(27, 20, 'white');
  p.set(36, 20, 'white');
  nose(p, 23, 28);
  mouth(p, 31, 'flat');
  p.hline(29, 34, 32, 'shade'); // drawn mouth line
  // old burn scar at the right temple
  p.set(39, 17, 'scarB');
  p.set(40, 18, 'scarB');
  p.set(39, 19, 'scarB');
  save('hale', p);
}

// ---------------------------------------------------------------------------
// VEX Coinsworn — widow's peak, stubble, earring, violet doublet, sly grin
// ---------------------------------------------------------------------------
{
  const p = base('#242031', { skin: '#c39a72', shade: '#95704f', dark: '#6a4c36', light: '#e0bd92' });
  p.color('hair', '#241a16');
  p.color('hairL', '#4a362c');
  p.color('doublet', '#4b4f7e');
  p.color('doubletD', '#33365a');
  p.color('doubletL', '#6f74a8');
  p.color('slash', '#8a4f9e');
  p.color('coin', '#d8b24a');
  p.color('coinL', '#f0d98c');
  p.color('collar', '#cfc6ae');

  shoulders(p, 45, 'doubletD');
  p.runs([[45, 21, 43], [46, 19, 45], [47, 18, 46], [48, 17, 47]], 'doublet');
  p.swap(34, 45, 14, 19, 'doublet', 'doubletD');
  // slashed sleeves hint
  for (const y of [50, 53, 56, 59]) {
    p.hline(13, 17, y, 'slash');
    p.hline(46, 50, y, 'slash');
  }
  p.vline(20, 46, 63, 'doubletL');
  // thin collar
  p.runs([[44, 27, 37], [45, 26, 30], [45, 34, 38]], 'collar');
  // a coin, mid-flip by his shoulder
  p.disc(48, 42, 2, 2, 'coin');
  p.set(47, 41, 'coinL');

  headCore(p, { jawY: 32, headW: 9, earY: 22 });
  // lean face: cheek shade
  p.vline(37, 25, 30, 'shade');
  p.set(27, 28, 'shade');
  // slicked hair with widow's peak
  p.runs(
    [
      [7, 26, 38], [8, 24, 40], [9, 23, 41], [10, 23, 42], [11, 22, 42], [12, 22, 43],
      [13, 22, 24], [13, 31, 33], [13, 40, 43], [14, 22, 23], [14, 32, 32], [14, 41, 43],
      [15, 22, 23], [15, 42, 43], [16, 42, 43],
    ],
    'hair',
  );
  p.swap(33, 6, 12, 11, 'hair', 'hair'); // keep dark; sheen next
  p.hline(25, 31, 8, 'hairL');
  // gold earring, left ear (lit side)
  p.set(21, 26, 'coin');
  p.set(21, 27, 'coinL');
  // sly narrow eyes + raised brow
  eyes(p, 22, { narrow: true, browC: 'hair' });
  p.hline(26, 29, 19, 'hair'); // raised left brow
  p.hline(35, 38, 20, 'hair');
  nose(p, 24, 27);
  mouth(p, 30, 'smirkL');
  p.set(27, 29, 'shade'); // grin crease
  // stubble dither along jaw
  p.dither(27, 31, 11, 3, 'shade', 'skin');
  p.hline(29, 34, 33, 'dark');
  save('vex', p);
}

// contact sheet for visual iteration
const sheet = `<!doctype html><meta charset="utf-8"><title>portrait sheet</title>
<body style="background:#14110d;display:flex;gap:24px;flex-wrap:wrap;padding:30px;font-family:monospace;color:#8f8570">
${['serah', 'kael', 'rooke', 'hale', 'vex']
  .map(
    (n) =>
      `<figure style="margin:0;text-align:center"><img src="./${n}.png" style="width:256px;image-rendering:pixelated;border:1px solid #3a3226"><figcaption>${n}</figcaption></figure>`,
  )
  .join('\n')}
</body>`;
writeFileSync(`${dir}_sheet.html`, sheet);
console.log('portraits/_sheet.html (dev-only contact sheet)');
