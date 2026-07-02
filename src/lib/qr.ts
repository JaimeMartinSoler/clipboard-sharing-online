/**
 * Tiny, self-contained QR encoder — byte mode, error-correction level M,
 * versions 1–10. Vendored (no dependency, no network) so a share link can be
 * turned into a scannable code entirely in the browser: nothing about the URL
 * or the password it carries ever leaves the page.
 *
 * The algorithm is a faithful, trimmed port of Project Nayuki's public-domain QR
 * generator (https://www.nayuki.io/page/qr-code-generator-library). Geometry,
 * Reed–Solomon divisors, alignment positions, and the format/version BCH bits
 * are all computed programmatically rather than transcribed from big tables, so
 * the only hand-entered data are the two level-M error-correction arrays below
 * (cross-checked against the standard's data-codeword totals).
 *
 * Pure module: no DOM beyond producing an SVG string. Returns null when the
 * input is too large for version 10 (the caller falls back to a copyable link).
 *
 * Note: `noUncheckedIndexedAccess` is on, so array reads are asserted (`!`) or
 * defaulted only where an index is provably in range.
 */

// Error-correction codewords per block and number of blocks, level M, indexed
// by version (1..10). Cross-checked: rawCodewords - eccPerBlock*numBlocks yields
// the standard data-codeword totals [16,28,44,64,86,108,124,154,182,216].
const ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

const MIN_VERSION = 1;
const MAX_VERSION = 10;

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

function eccPerBlock(ver: number): number {
  return ECC_PER_BLOCK_M[ver] ?? 0;
}

function numBlocks(ver: number): number {
  return NUM_BLOCKS_M[ver] ?? 1;
}

/** Total data+ecc module bits available on a version (excludes function areas). */
function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number): number {
  const raw = Math.floor(getNumRawDataModules(ver) / 8);
  return raw - eccPerBlock(ver) * numBlocks(ver);
}

function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function reedSolomonComputeDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j] ?? 0, root);
      if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(
  data: number[],
  divisor: number[],
): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

function getAlignmentPatternPositions(ver: number): number[] {
  if (ver === 1) return [];
  const size = ver * 4 + 17;
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/** Bit buffer: appends the low `len` bits of `val`, most-significant first. */
class BitBuffer {
  readonly bits: boolean[] = [];
  append(val: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) this.bits.push(getBit(val, i));
  }
}

interface EncodeResult {
  size: number;
  /** dark[y][x] — true where a module is dark. */
  dark: boolean[][];
}

/** Encode UTF-8 text into a QR module matrix, or null if it does not fit v10-M. */
export function encodeQrMatrix(text: string): EncodeResult | null {
  const bytes = Array.from(new TextEncoder().encode(text));

  // Smallest version whose data capacity holds the byte segment.
  let version = -1;
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const charCountBits = v <= 9 ? 8 : 16;
    const need = 4 + charCountBits + 8 * bytes.length;
    if (getNumDataCodewords(v) * 8 >= need) {
      version = v;
      break;
    }
  }
  if (version === -1) return null;

  const numDataCodewords = getNumDataCodewords(version);
  const capacityBits = numDataCodewords * 8;

  const bb = new BitBuffer();
  bb.append(0x4, 4); // byte mode
  bb.append(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) bb.append(b, 8);

  // Terminator + bit/byte padding.
  bb.append(0, Math.min(4, capacityBits - bb.bits.length));
  bb.append(0, (8 - (bb.bits.length % 8)) % 8);
  for (let pad = 0xec; bb.bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
    bb.append(pad, 8);
  }

  // Pack bits into data codewords.
  const dataCodewords: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bb.bits[i + j] ? 1 : 0);
    dataCodewords.push(byte);
  }

  const codewords = addEccAndInterleave(dataCodewords, version);
  return new QrMatrix(version, codewords).finish();
}

function addEccAndInterleave(data: number[], ver: number): number[] {
  const blocks = numBlocks(ver);
  const blockEccLen = eccPerBlock(ver);
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks = blocks - (rawCodewords % blocks);
  const shortBlockLen = Math.floor(rawCodewords / blocks);

  const groups: number[][] = [];
  const rsDiv = reedSolomonComputeDivisor(blockEccLen);
  for (let i = 0, k = 0; i < blocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + datLen);
    k += dat.length;
    const ecc = reedSolomonComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0); // padding for uniform interleaving
    groups.push(dat.concat(ecc));
  }

  const rowLen = groups[0]?.length ?? 0;
  const result: number[] = [];
  for (let i = 0; i < rowLen; i++) {
    for (let j = 0; j < groups.length; j++) {
      // Skip the padding byte that only short blocks carry.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result.push(groups[j]?.[i] ?? 0);
      }
    }
  }
  return result;
}

/** Builds and masks the module matrix for one version + codeword stream. */
class QrMatrix {
  private readonly size: number;
  private readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(
    private readonly version: number,
    private readonly codewords: number[],
  ) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
  }

  private get(x: number, y: number): boolean {
    return this.modules[y]?.[x] ?? false;
  }

  private set(x: number, y: number, v: boolean): void {
    const row = this.modules[y];
    if (row) row[x] = v;
  }

  private fn(x: number, y: number): boolean {
    return this.isFunction[y]?.[x] ?? false;
  }

  finish(): EncodeResult {
    this.drawFunctionPatterns();
    this.drawCodewords();

    // Pick the mask with the lowest penalty.
    let bestMask = 0;
    let minPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask);
      this.drawFormatBits(mask);
      const penalty = this.getPenaltyScore();
      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestMask = mask;
      }
      this.applyMask(mask); // undo (XOR is its own inverse)
    }
    this.applyMask(bestMask);
    this.drawFormatBits(bestMask);

    return { size: this.size, dark: this.modules };
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.set(x, y, isDark);
    const row = this.isFunction[y];
    if (row) row[x] = true;
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const align = getAlignmentPatternPositions(this.version);
    const n = align.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === n - 1) ||
            (i === n - 1 && j === 0)
          )
        ) {
          this.drawAlignmentPattern(align[i] ?? 0, align[j] ?? 0);
        }
      }
    }

    this.drawFormatBits(0); // reserve; real bits drawn after masking
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(
          x + dx,
          y + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
        );
      }
    }
  }

  private drawFormatBits(mask: number): void {
    // Level M format bits = 0; combine with the mask, then BCH(15,5).
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) {
      this.setFunctionModule(14 - i, 8, getBit(bits, i));
    }

    for (let i = 0; i < 8; i++) {
      this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    }
    for (let i = 8; i < 15; i++) {
      this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    }
    this.setFunctionModule(8, this.size - 8, true); // dark module
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  }

  private drawCodewords(): void {
    const data = this.codewords;
    let i = 0; // bit index
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.fn(x, y) && i < data.length * 8) {
            this.set(x, y, getBit(data[i >>> 3] ?? 0, 7 - (i & 7)));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            invert = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
            break;
        }
        if (!this.fn(x, y) && invert) this.set(x, y, !this.get(x, y));
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;

    // Rows.
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        const cell = this.get(x, y);
        if (cell === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, history);
          if (!runColor) {
            result += this.finderPenaltyCountPatterns(history) * PENALTY_N3;
          }
          runColor = cell;
          runX = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(runColor, runX, history) *
        PENALTY_N3;
    }
    // Columns.
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runY = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        const cell = this.get(x, y);
        if (cell === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, history);
          if (!runColor) {
            result += this.finderPenaltyCountPatterns(history) * PENALTY_N3;
          }
          runColor = cell;
          runY = 1;
        }
      }
      result +=
        this.finderPenaltyTerminateAndCount(runColor, runY, history) *
        PENALTY_N3;
    }

    // 2x2 blocks of one color.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.get(x, y);
        if (
          c === this.get(x + 1, y) &&
          c === this.get(x, y + 1) &&
          c === this.get(x + 1, y + 1)
        ) {
          result += PENALTY_N2;
        }
      }
    }

    // Balance of dark vs light.
    let dark = 0;
    for (const row of this.modules) for (const cell of row) if (cell) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  private finderPenaltyCountPatterns(history: number[]): number {
    const n = history[1] ?? 0;
    const core =
      n > 0 &&
      history[2] === n &&
      history[3] === n * 3 &&
      history[4] === n &&
      history[5] === n;
    const h0 = history[0] ?? 0;
    const h6 = history[6] ?? 0;
    return (
      (core && h0 >= n * 4 && h6 >= n ? 1 : 0) +
      (core && h6 >= n * 4 && h0 >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminateAndCount(
    currentRunColor: boolean,
    currentRunLength: number,
    history: number[],
  ): number {
    let runLen = currentRunLength;
    if (currentRunColor) {
      this.finderPenaltyAddHistory(runLen, history);
      runLen = 0;
    }
    runLen += this.size; // add light border
    this.finderPenaltyAddHistory(runLen, history);
    return this.finderPenaltyCountPatterns(history);
  }

  private finderPenaltyAddHistory(
    currentRunLength: number,
    history: number[],
  ): void {
    let runLen = currentRunLength;
    if ((history[0] ?? 0) === 0) runLen += this.size; // light border on first run
    history.pop();
    history.unshift(runLen);
  }
}

export interface QrSvgOptions {
  /** Quiet-zone width in modules (spec minimum is 4). */
  border?: number;
  dark?: string;
  light?: string;
}

/**
 * Render text as an inline SVG QR code (module-unit viewBox; the caller sizes it
 * with CSS). Returns null when the text is too large to encode. The SVG has no
 * external references, so it is safe under the strict CSP.
 */
export function qrSvg(text: string, opts: QrSvgOptions = {}): string | null {
  const qr = encodeQrMatrix(text);
  if (!qr) return null;
  const border = opts.border ?? 4;
  const dark = opts.dark ?? "#000000";
  const light = opts.light ?? "#ffffff";
  const dim = qr.size + border * 2;

  let path = "";
  for (let y = 0; y < qr.size; y++) {
    const row = qr.dark[y];
    if (!row) continue;
    for (let x = 0; x < qr.size; x++) {
      if (row[x]) path += `M${x + border},${y + border}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `width="100%" height="100%" shape-rendering="crispEdges" ` +
    `role="img" aria-label="QR code">` +
    `<rect width="${dim}" height="${dim}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    `</svg>`
  );
}
