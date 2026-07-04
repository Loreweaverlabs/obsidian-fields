// Pixel-art portrait generator: five chest-up PFP busts in the Forgotten Runes Warriors
// Guild idiom -> public/portraits/*.png. Regenerate with: npm run portraits
//
// Style study (tokens 16/777/2500/4444/9999/13000 via forgottenrunes.com/api/art/warriors):
//   50x50 canvas · near-black background with a faint hue · hard black outline ·
//   flat 2-tone materials (no gradients, no dither) · one or two loud saturated hues
//   per figure · gold trim accents · tiny high-contrast faces · pale rune glyph corner.
// Ours are chest-up crops at the same logical resolution, displayed at 1x/2x integer scale.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// PNG encoding (zero-dep)
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
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1);
  }
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  return new Uint8Array([...sig, ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array(0))]);
}

// ---------------------------------------------------------------------------
// Pixel toolkit
// ---------------------------------------------------------------------------

const W = 50;
const H = 50;

type Hex = string;
const hex = (c: Hex): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

class Px {
  buf = new Uint8Array(W * H);
  pal: [number, number, number][] = [];
  names = new Map<string, number>();
  bgSet = new Set<number>();

  color(name: string, c: Hex, isBg = false): void {
    if (this.names.has(name)) return;
    const idx = this.pal.length;
    this.pal.push(hex(c));
    this.names.set(name, idx);
    if (isBg) this.bgSet.add(idx);
  }
  n(name: string): number {
    const i = this.names.get(name);
    if (i === undefined) throw new Error(`unknown color ${name}`);
    return i;
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
  runs(rows: [number, number, number][], name: string): void {
    for (const [y, x0, x1] of rows) this.hline(x0, x1, y, name);
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
  /** classic 1px black sprite outline over background */
  autoOutline(name: string): void {
    const o = this.n(name);
    const src = this.buf.slice();
    const isBgLike = (v: number) => this.bgSet.has(v) || v === o;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!this.bgSet.has(src[y * W + x])) continue;
        const touchesFigure = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        ].some(([i, j]) => i >= 0 && j >= 0 && i < W && j < H && !isBgLike(src[j * W + i]));
        if (touchesFigure) this.buf[y * W + x] = o;
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

interface Tones {
  skin: Hex;
  shade: Hex;
}

/** FRWC-style base: flat hued near-black bg + shared face colors. */
function base(bg: Hex, tones: Tones): Px {
  const p = new Px();
  p.color('bg', bg, true);
  p.color('outline', '#06060a');
  p.color('skin', tones.skin);
  p.color('shade', tones.shade);
  p.color('rune', '#c9d6c4'); // the pale glyph mint used on warrior tokens
  p.color('white', '#ede8d8');
  p.color('ink', '#14101c');
  p.rect(0, 0, W, H, 'bg');
  return p;
}

/**
 * Chest-up head block, FRWC proportions: wide flat face, hard side-shadow band,
 * 2px eyes under a 1px brow line, 2px mouth. Head spans roughly x17..x33, crown y6, chin y26.
 */
function head(p: Px, opts: { crown?: number; chin?: number; wide?: number }): { crown: number; chin: number; l: number; r: number } {
  const crown = opts.crown ?? 7;
  const chin = opts.chin ?? 26;
  const wide = opts.wide ?? 8; // half-width
  const l = 25 - wide;
  const r = 25 + wide;
  // skull: flat-topped, slight rounding at crown and jaw (chunky, not oval)
  p.rect(l + 1, crown, wide * 2 - 1, chin - crown, 'skin');
  p.rect(l, crown + 2, wide * 2 + 1, chin - crown - 4, 'skin');
  p.hline(l + 2, r - 3, chin, 'skin');
  p.hline(l + 3, r - 4, chin + 1, 'skin'); // chin
  // flat right shadow band (key light left) — one hard-edged tone, warrior-style
  p.rect(r - 3, crown + 1, 4, chin - crown, 'shade');
  p.hline(l + 3, r - 4, chin + 1, 'skin');
  p.rect(r - 4, chin, 2, 2, 'shade');
  // neck
  p.rect(22, chin + 1, 7, 4, 'skin');
  p.rect(27, chin + 1, 2, 4, 'shade');
  return { crown, chin, l, r };
}

function face(
  p: Px,
  opts: {
    eyeY: number;
    style?: 'dots' | 'narrow' | 'zeal';
    browC?: string;
    mouth?: 'flat' | 'smirkL' | 'smirkR' | 'grim' | 'small';
    mouthY?: number;
  },
): void {
  const y = opts.eyeY;
  const browC = opts.browC ?? 'ink';
  // brows: single bold line, warrior-style
  p.hline(19, 22, y - 2, browC);
  p.hline(27, 30, y - 2, browC);
  if (opts.style === 'narrow') {
    p.hline(19, 21, y, 'ink');
    p.hline(28, 30, y, 'ink');
  } else if (opts.style === 'zeal') {
    p.set(19, y, 'white');
    p.set(20, y, 'ink');
    p.set(21, y, 'white');
    p.set(28, y, 'white');
    p.set(29, y, 'ink');
    p.set(30, y, 'white');
  } else {
    p.rect(20, y, 2, 2, 'ink');
    p.rect(28, y, 2, 2, 'ink');
  }
  // nose: one shadow notch only (tokens mostly skip noses)
  p.set(25, y + 4, 'shade');
  const my = opts.mouthY ?? y + 7;
  if (opts.mouth === 'smirkR') {
    p.hline(23, 27, my, 'ink');
    p.set(28, my - 1, 'ink');
  } else if (opts.mouth === 'smirkL') {
    p.hline(23, 27, my, 'ink');
    p.set(22, my - 1, 'ink');
  } else if (opts.mouth === 'grim') {
    p.hline(22, 28, my, 'ink');
  } else if (opts.mouth === 'small') {
    p.hline(24, 26, my, 'ink');
  } else {
    p.hline(23, 27, my, 'ink');
  }
}

/** Rune glyph, top-left corner — every warrior token carries one. 5x7-ish, pale mint. */
function rune(p: Px, kind: 'anvil' | 'ember' | 'key' | 'sun' | 'coin'): void {
  const g = 'rune';
  if (kind === 'anvil') {
    p.hline(5, 9, 6, g);
    p.hline(6, 8, 7, g);
    p.vline(7, 8, 9, g);
    p.hline(5, 9, 10, g);
  } else if (kind === 'ember') {
    p.set(7, 5, g);
    p.set(6, 6, g);
    p.set(8, 6, g);
    p.vline(7, 6, 8, g);
    p.set(5, 8, g);
    p.set(9, 8, g);
    p.hline(6, 8, 9, g);
    p.set(7, 10, g);
  } else if (kind === 'key') {
    p.rect(5, 5, 3, 3, g);
    p.set(6, 6, 'bg');
    p.vline(6, 8, 11, g);
    p.set(7, 9, g);
    p.set(7, 11, g);
  } else if (kind === 'sun') {
    p.rect(6, 6, 3, 3, g);
    p.set(7, 4, g);
    p.set(7, 10, g);
    p.set(4, 7, g);
    p.set(10, 7, g);
    p.set(5, 5, g);
    p.set(9, 5, g);
    p.set(5, 9, g);
    p.set(9, 9, g);
  } else {
    p.rect(5, 6, 4, 4, g);
    p.set(6, 7, 'bg');
    p.set(7, 8, 'bg');
    p.set(9, 5, g);
    p.set(4, 10, g);
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
// SERAH the Anvil — steel-grey crop, brow scar, plate + gold trim, company sash
// ---------------------------------------------------------------------------
{
  const p = base('#10101c', { skin: '#d29a6c', shade: '#a06a48' });
  p.color('steel', '#8e9aa8');
  p.color('steelD', '#5a6474');
  p.color('steelL', '#c6d0da');
  p.color('gold', '#e8a832');
  p.color('goldD', '#a87418');
  p.color('sash', '#c03a2c');
  p.color('sashD', '#8a2418');
  p.color('hair', '#a8a49c');
  p.color('hairD', '#6e6a64');

  // torso: steel breastplate, flat 2-tone with gold trim line
  p.rect(12, 34, 27, 16, 'steel');
  p.rect(29, 34, 10, 16, 'steelD');
  p.rect(14, 33, 23, 1, 'steel');
  // pauldrons: big chunky slabs
  p.runs([[33, 9, 17], [34, 8, 18], [35, 8, 18], [36, 8, 18], [37, 9, 17], [38, 10, 16]], 'steel');
  p.runs([[33, 33, 41], [34, 32, 42], [35, 32, 42], [36, 32, 42], [37, 33, 41], [38, 34, 40]], 'steelD');
  p.hline(9, 15, 33, 'steelL');
  p.hline(8, 12, 34, 'steelL');
  // gold trim across the chest + collar rivets
  p.hline(15, 35, 40, 'gold');
  p.hline(15, 35, 41, 'goldD');
  p.set(17, 44, 'gold');
  p.set(33, 44, 'gold');
  // company sash, over one shoulder
  p.runs([[34, 30, 34], [35, 29, 34], [36, 28, 33], [38, 26, 31], [40, 24, 29], [42, 22, 27], [44, 20, 25], [46, 19, 24], [48, 18, 23]], 'sash');
  p.runs([[37, 27, 32], [39, 25, 30], [41, 23, 28], [43, 21, 26], [45, 20, 25], [47, 18, 24], [49, 18, 23]], 'sashD');
  // gorget
  p.rect(20, 31, 11, 3, 'steelD');
  p.hline(20, 30, 31, 'steelL');

  const h = head(p, { crown: 8, chin: 26, wide: 8 });
  // cropped grey hair: chunky crop with a notched top edge — hair, not helmet
  p.rect(h.l, h.crown - 2, 17, 4, 'hair');
  for (let x = h.l; x <= h.r; x += 3) p.set(x, h.crown - 3, 'hair'); // notched crop top
  p.set(h.l + 4, h.crown - 3, 'hair');
  p.runs([[h.crown + 2, h.l, h.l + 2], [h.crown + 2, h.r - 3, h.r], [h.crown + 3, h.l, h.l + 1], [h.crown + 3, h.r - 2, h.r], [h.crown + 4, h.l, h.l], [h.crown + 4, h.r - 1, h.r]], 'hair');
  p.swap(25, h.crown - 3, 10, 7, 'hair', 'hairD');
  p.hline(h.l + 1, 22, h.crown - 2, 'white'); // silver streak, one row only
  face(p, { eyeY: 16, style: 'dots', mouth: 'grim', mouthY: 23 });
  // the scar: hard light notch through left brow to cheek
  p.set(20, 13, 'shade');
  p.vline(20, 14, 15, 'white');
  p.set(20, 18, 'white');
  p.set(21, 19, 'shade');
  rune(p, 'anvil');
  save('serah', p);
}

// ---------------------------------------------------------------------------
// KAEL the Ember — swept auburn hair, ember scarf, leather + gold clasp, smirk
// ---------------------------------------------------------------------------
{
  const p = base('#170d0c', { skin: '#d8a276', shade: '#a87050' });
  p.color('hair', '#7c3a20');
  p.color('hairD', '#521f10');
  p.color('hairL', '#b06034');
  p.color('scarf', '#e04824');
  p.color('scarfD', '#9c2814');
  p.color('scarfL', '#ff7c3c');
  p.color('leather', '#6a4a2e');
  p.color('leatherD', '#48301c');
  p.color('gold', '#e8a832');

  // leather jerkin
  p.rect(13, 36, 25, 14, 'leather');
  p.rect(28, 36, 10, 14, 'leatherD');
  p.runs([[34, 12, 20], [35, 11, 21], [36, 12, 22]], 'leather');
  p.runs([[34, 30, 38], [35, 29, 39], [36, 28, 39]], 'leatherD');
  // strap across chest
  for (let i = 0; i < 12; i++) p.set(16 + i, 49 - i, 'leatherD');
  // the ember scarf: big flat wrap + wind-caught tail (their loud-hue move)
  p.runs([[30, 20, 31], [31, 18, 32], [32, 17, 33], [33, 17, 34], [34, 18, 33], [35, 20, 30]], 'scarf');
  p.runs([[31, 29, 32], [32, 29, 33], [33, 30, 34], [34, 29, 33]], 'scarfD');
  p.hline(18, 25, 31, 'scarfL');
  // tail flying to the right
  p.runs([[33, 35, 40], [34, 36, 43], [35, 38, 46], [36, 40, 44], [37, 42, 47], [38, 44, 47]], 'scarf');
  p.runs([[36, 44, 46], [37, 45, 47], [39, 45, 47], [40, 46, 47]], 'scarfD');
  p.set(41, 34, 'scarfL');
  p.set(46, 35, 'scarfL');
  p.set(19, 33, 'gold'); // clasp

  const h = head(p, { crown: 8, chin: 25, wide: 8 });
  // swept-back hair: tall flame-flick silhouette, warrior hard edges
  p.rect(h.l, h.crown - 3, 17, 5, 'hair');
  p.runs([[h.crown - 4, h.l + 3, h.r - 6], [h.crown - 5, h.l + 5, h.r - 9]], 'hair');
  p.runs([[h.crown - 4, h.r - 5, h.r - 2], [h.crown - 3, h.r - 1, h.r + 1], [h.crown - 2, h.r + 1, h.r + 1]], 'hair'); // wind flick
  p.runs([[h.crown + 2, h.l, h.l + 1], [h.crown + 3, h.l, h.l], [h.crown + 2, h.r - 1, h.r + 1], [h.crown + 3, h.r, h.r + 1], [h.crown + 4, h.r, h.r + 1]], 'hair'); // temples
  p.swap(26, h.crown - 5, 12, 9, 'hair', 'hairD');
  p.hline(h.l + 2, 24, h.crown - 3, 'hairL'); // sheen
  p.set(22, h.crown + 1, 'hairL');
  // one loose strand over the brow
  p.vline(30, h.crown + 3, h.crown + 5, 'hairD');
  face(p, { eyeY: 16, style: 'dots', mouth: 'smirkR', mouthY: 22, browC: 'hairD' });
  p.hline(19, 22, 14, 'hairD'); // cocked left brow, one px higher
  p.hline(19, 22, 15, 'skin');
  rune(p, 'ember');
  save('kael', p);
}

// ---------------------------------------------------------------------------
// MOTHER ROOKE the Ledger — moss hood, cream coif, round face, the iron key
// ---------------------------------------------------------------------------
{
  const p = base('#0c120d', { skin: '#d8b28c', shade: '#a8805c' });
  p.color('hood', '#5c7a3c');
  p.color('hoodD', '#3a5426');
  p.color('hoodL', '#84a45c');
  p.color('coif', '#e4dcc4');
  p.color('coifD', '#b4ac90');
  p.color('robe', '#474f38');
  p.color('robeD', '#2f3524');
  p.color('iron', '#9aa2ac');
  p.color('ironD', '#5c646e');
  p.color('cord', '#6a4a2e');

  // robe
  p.rect(12, 36, 27, 14, 'robe');
  p.rect(28, 36, 11, 14, 'robeD');
  // hood: one big chunky bell around the head, flat 2-tone
  p.runs(
    [
      [4, 21, 29], [5, 19, 31], [6, 17, 33], [7, 16, 34], [8, 15, 35], [9, 14, 36],
      [10, 14, 36], [11, 13, 37], [12, 13, 37], [13, 13, 37], [14, 12, 38], [15, 12, 38],
      [16, 12, 38], [17, 12, 38], [18, 12, 38], [19, 12, 38], [20, 12, 38], [21, 12, 38],
      [22, 12, 38], [23, 13, 38], [24, 13, 38], [25, 13, 38], [26, 14, 38], [27, 14, 38],
      [28, 14, 38], [29, 15, 38], [30, 13, 39], [31, 12, 40], [32, 11, 40], [33, 10, 41],
      [34, 10, 41], [35, 10, 41],
    ],
    'hood',
  );
  p.swap(29, 4, 13, 32, 'hood', 'hoodD');
  p.vline(15, 8, 30, 'hoodL'); // lit ridge
  p.vline(14, 12, 28, 'hoodL');
  // face opening + coif ring — the cream band must READ under the hood
  p.rect(18, 12, 15, 15, 'coif');
  p.rect(19, 15, 13, 14, 'skin');
  p.swap(28, 12, 6, 18, 'coif', 'coifD');
  p.rect(20, 29, 11, 2, 'coif'); // chin band
  p.swap(28, 29, 4, 2, 'coif', 'coifD');
  p.hline(19, 27, 14, 'coif'); // forehead band, lit side
  p.hline(28, 31, 14, 'coifD');
  // round cheeks: widen mid-face by 1px each side
  p.vline(18, 18, 24, 'skin');
  p.vline(32, 18, 24, 'shade');
  p.rect(29, 13, 3, 16, 'shade'); // face shadow band
  face(p, { eyeY: 19, style: 'narrow', mouth: 'small', mouthY: 26 });
  p.set(18, 22, 'shade'); // cheek crease
  p.set(31, 22, 'shade');
  p.hline(23, 27, 21, 'shade'); // under-eye line — she has seen your ledger
  // the iron key, worn big on the chest (tokens love a big prop)
  p.vline(24, 36, 38, 'cord');
  p.vline(26, 36, 38, 'cord');
  p.rect(22, 39, 7, 5, 'iron');
  p.rect(24, 40, 3, 3, 'bg');
  p.swap(22, 39, 7, 5, 'bg', 'robeD');
  p.vline(25, 44, 48, 'iron');
  p.hline(26, 27, 46, 'iron');
  p.hline(26, 27, 48, 'iron');
  p.swap(27, 39, 2, 10, 'iron', 'ironD');
  rune(p, 'key');
  save('rooke', p);
}

// ---------------------------------------------------------------------------
// BROTHER HALE of the Returning Sun — shaved zealot, gold mantle, mail, sun-disc
// ---------------------------------------------------------------------------
{
  const p = base('#141008', { skin: '#c8905e', shade: '#96603c' });
  p.color('mail', '#6e7686');
  p.color('mailD', '#464c58');
  p.color('mailL', '#9aa4b4');
  p.color('mantle', '#e8a418');
  p.color('mantleD', '#a86e0c');
  p.color('mantleL', '#ffd45c');
  p.color('sun', '#ffd45c');
  p.color('sunD', '#e8a418');

  // mail torso: flat 2-tone with a single facet line (no dither — tokens keep it flat)
  p.rect(13, 34, 25, 16, 'mail');
  p.rect(28, 34, 10, 16, 'mailD');
  p.vline(15, 34, 49, 'mailL');
  p.rect(21, 31, 9, 4, 'mailD'); // collar
  p.hline(21, 29, 31, 'mailL');
  // gold half-mantle over the left shoulder: one solid saturated slab + hard folds
  p.runs([[32, 8, 20], [33, 7, 21], [34, 7, 21], [35, 7, 21], [36, 7, 20]], 'mantle');
  p.rect(7, 36, 13, 14, 'mantle');
  p.vline(11, 37, 49, 'mantleD');
  p.vline(16, 36, 49, 'mantleD');
  p.hline(7, 19, 32, 'mantleL');
  p.vline(7, 33, 49, 'mantleL');
  p.rect(20, 33, 2, 2, 'sun'); // clasp pinning the mantle
  p.set(21, 34, 'sunD');
  // sun-disc pendant, big and proud
  p.rect(31, 40, 5, 5, 'sun');
  p.set(32, 41, 'mantleL');
  p.swap(34, 40, 2, 5, 'sun', 'sunD');
  for (const [dx, dy] of [[2, -3], [2, 7], [-3, 2], [7, 2], [-2, -2], [6, -2], [-2, 6], [6, 6]] as const) {
    p.set(31 + dx, 40 + dy, 'sunD');
  }

  const h = head(p, { crown: 7, chin: 25, wide: 8 });
  // shaved head: bare skull, one hard stubble shadow band at the crown
  p.hline(h.l + 1, h.r - 1, h.crown, 'shade');
  p.hline(h.l, h.r - 2, h.crown + 1, 'shade');
  p.swap(h.l, h.crown, 6, 2, 'shade', 'skin'); // lit side of the scalp stays bare
  // gaunt hollows
  p.vline(19, 19, 22, 'shade');
  p.set(20, 23, 'shade');
  face(p, { eyeY: 16, style: 'zeal', mouth: 'flat', mouthY: 22 });
  p.hline(22, 28, 23, 'shade'); // drawn line under the mouth
  // burn scar at the right temple: hard notch
  p.rect(31, 12, 2, 3, 'shade');
  p.set(30, 14, 'shade');
  rune(p, 'sun');
  save('hale', p);
}

// ---------------------------------------------------------------------------
// VEX Coinsworn — widow's peak, earring, violet doublet, slashed sleeves, a coin
// ---------------------------------------------------------------------------
{
  const p = base('#120d1a', { skin: '#cfa075', shade: '#9c714e' });
  p.color('hair', '#241820');
  p.color('hairL', '#4c3440');
  p.color('doublet', '#6a4f9e');
  p.color('doubletD', '#46326c');
  p.color('doubletL', '#9070cc');
  p.color('slash', '#e8a832');
  p.color('coin', '#ffd45c');
  p.color('coinD', '#c08a1c');
  p.color('collar', '#e4dcc4');

  // violet doublet, loud like their quartered jackets
  p.rect(12, 35, 27, 15, 'doublet');
  p.rect(28, 35, 11, 15, 'doubletD');
  p.runs([[33, 11, 20], [34, 10, 21]], 'doublet');
  p.runs([[33, 30, 39], [34, 29, 40]], 'doubletD');
  p.vline(14, 35, 49, 'doubletL');
  // slashed sleeves: hard gold slits
  for (const y of [38, 41, 44, 47]) {
    p.hline(9, 13, y, 'slash');
    p.hline(37, 41, y, 'slash');
  }
  p.rect(8, 36, 2, 14, 'doubletD');
  p.rect(41, 36, 2, 14, 'doubletD');
  // high thin collar
  p.hline(20, 31, 32, 'collar');
  p.hline(19, 24, 33, 'collar');
  p.hline(27, 31, 33, 'collar');
  // the coin, mid-flip by his right shoulder
  p.rect(41, 28, 4, 4, 'coin');
  p.set(42, 29, 'white');
  p.swap(43, 28, 2, 4, 'coin', 'coinD');

  const h = head(p, { crown: 8, chin: 25, wide: 8 });
  // slicked black hair with a sharp widow's peak
  p.rect(h.l, h.crown - 2, 17, 3, 'hair');
  p.runs([[h.crown + 1, h.l, h.l + 3], [h.crown + 1, h.r - 4, h.r], [h.crown + 2, h.l, h.l + 1], [h.crown + 2, h.r - 2, h.r], [h.crown + 3, h.r - 1, h.r], [h.crown + 4, h.r, h.r]], 'hair');
  // the widow's peak: a bold 3-wide wedge driving down the brow
  p.runs([[h.crown + 1, 24, 26], [h.crown + 2, 24, 26], [h.crown + 3, 25, 25], [h.crown + 4, 25, 25]], 'hair');
  p.hline(h.l + 1, 22, h.crown - 2, 'hairL'); // slick sheen
  // gold earring, lit side
  p.set(16, 22, 'coin');
  p.set(16, 23, 'coinD');
  face(p, { eyeY: 17, style: 'narrow', mouth: 'smirkL', mouthY: 23, browC: 'hair' });
  p.set(30, 15, 'hair'); // arched right brow
  // stubble: solid shadow mass with a notched edge (flat, never dithered)
  p.runs([[24, 20, 30], [25, 21, 29], [26, 23, 27]], 'shade');
  p.set(22, 24, 'shade');
  p.set(31, 24, 'shade');
  rune(p, 'coin');
  save('vex', p);
}

// contact sheet for visual iteration
const sheet = `<!doctype html><meta charset="utf-8"><title>portrait sheet</title>
<body style="background:#14110d;display:flex;gap:24px;flex-wrap:wrap;padding:30px;font-family:monospace;color:#8f8570">
${['serah', 'kael', 'rooke', 'hale', 'vex']
  .map(
    (n) =>
      `<figure style="margin:0;text-align:center"><img src="./${n}.png" style="width:250px;image-rendering:pixelated;border:1px solid #3a3226"><figcaption>${n}</figcaption></figure>`,
  )
  .join('\n')}
</body>`;
writeFileSync(`${dir}_sheet.html`, sheet);
console.log('portraits/_sheet.html (dev-only contact sheet)');
