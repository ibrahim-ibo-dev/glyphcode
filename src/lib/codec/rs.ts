/**
 * Reed–Solomon over GF(2^8), primitive polynomial 0x11D, generator 2.
 * Errors-only correction (no erasure support needed yet).
 * Port of the classic reference algorithm (reedsolo / Wikiversity).
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function div(a: number, b: number): number {
  if (b === 0) throw new Error("RS div by zero");
  if (a === 0) return 0;
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

function inv(a: number): number {
  return EXP[255 - LOG[a]];
}

function pow2(n: number): number {
  return EXP[((n % 255) + 255) % 255];
}

/** Polynomials are Uint8Array/number[] with the highest-degree coefficient first. */
function polyAdd(p: ArrayLike<number>, q: ArrayLike<number>): number[] {
  const r = new Array<number>(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i++) r[i + r.length - p.length] = p[i];
  for (let i = 0; i < q.length; i++) r[i + r.length - q.length] ^= q[i];
  return r;
}

function polyScale(p: ArrayLike<number>, x: number): number[] {
  const r = new Array<number>(p.length);
  for (let i = 0; i < p.length; i++) r[i] = mul(p[i], x);
  return r;
}

function polyMul(p: ArrayLike<number>, q: ArrayLike<number>): number[] {
  const r = new Array<number>(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j++) {
    if (q[j] === 0) continue;
    for (let i = 0; i < p.length; i++) {
      if (p[i] !== 0) r[i + j] ^= mul(p[i], q[j]);
    }
  }
  return r;
}

function polyEval(poly: ArrayLike<number>, x: number): number {
  let y = poly[0];
  for (let i = 1; i < poly.length; i++) y = mul(y, x) ^ poly[i];
  return y;
}

function polyDiv(dividend: ArrayLike<number>, divisor: ArrayLike<number>): { q: number[]; r: number[] } {
  const out = Array.from(dividend);
  const sep = dividend.length - (divisor.length - 1);
  for (let i = 0; i < sep; i++) {
    const coef = out[i];
    if (coef === 0) continue;
    for (let j = 1; j < divisor.length; j++) {
      if (divisor[j] !== 0) out[i + j] ^= mul(divisor[j], coef);
    }
  }
  return { q: out.slice(0, sep), r: out.slice(sep) };
}

const genCache = new Map<number, number[]>();
function generatorPoly(nsym: number): number[] {
  let g = genCache.get(nsym);
  if (!g) {
    g = [1];
    for (let i = 0; i < nsym; i++) g = polyMul(g, [1, EXP[i]]);
    genCache.set(nsym, g);
  }
  return g;
}

/** Append nsym parity bytes to msg. Returns msg||parity. */
export function rsEncode(msg: Uint8Array, nsym: number): Uint8Array {
  if (msg.length + nsym > 255) throw new Error("RS block too large");
  const gen = generatorPoly(nsym);
  const out = new Uint8Array(msg.length + nsym);
  out.set(msg);
  for (let i = 0; i < msg.length; i++) {
    const coef = out[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) out[i + j] ^= mul(gen[j], coef);
    }
  }
  out.set(msg);
  return out;
}

/** Syndromes S_0..S_{nsym-1} preceded by a leading zero, like the reference impl. */
function calcSyndromes(msg: ArrayLike<number>, nsym: number): number[] {
  const s = new Array<number>(nsym + 1).fill(0);
  for (let i = 0; i < nsym; i++) s[i + 1] = polyEval(msg, EXP[i]);
  return s;
}

function findErrorLocator(synd: number[], nsym: number): number[] {
  // synd here is the trimmed array S_0..S_{nsym-1} (leading zero removed).
  let errLoc: number[] = [1];
  let oldLoc: number[] = [1];
  for (let i = 0; i < nsym; i++) {
    let delta = synd[i];
    for (let j = 1; j < errLoc.length; j++) {
      delta ^= mul(errLoc[errLoc.length - 1 - j], synd[i - j]);
    }
    oldLoc = [...oldLoc, 0];
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, inv(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length && errLoc[0] === 0) errLoc.shift();
  const errs = errLoc.length - 1;
  if (errs * 2 > nsym) throw new Error("RS: too many errors to correct");
  return errLoc;
}

function findErrors(errLocRev: number[], nmess: number): number[] {
  const errs = errLocRev.length - 1;
  const pos: number[] = [];
  for (let i = 0; i < nmess; i++) {
    if (polyEval(errLocRev, pow2(i)) === 0) pos.push(nmess - 1 - i);
  }
  if (pos.length !== errs) throw new Error("RS: could not locate errors");
  return pos;
}

function findErrataLocator(ePos: number[]): number[] {
  let loc: number[] = [1];
  for (const i of ePos) loc = polyMul(loc, polyAdd([1], [pow2(i), 0]));
  return loc;
}

function correctErrata(msg: number[], synd: number[], errPos: number[]): number[] {
  const coefPos = errPos.map((p) => msg.length - 1 - p);
  const errLoc = findErrataLocator(coefPos);
  // Omega = (reversed synd * errLoc) mod x^deg(errLoc), reversed back
  const { r: rem } = polyDiv(polyMul([...synd].reverse(), errLoc), [1, ...new Array<number>(errLoc.length).fill(0)]);
  const errEval = rem.reverse();

  const X: number[] = coefPos.map((c) => pow2(-(255 - c)));
  const E = new Array<number>(msg.length).fill(0);
  for (let i = 0; i < X.length; i++) {
    const XiInv = inv(X[i]);
    let denom = 1;
    for (let j = 0; j < X.length; j++) {
      if (j !== i) denom = mul(denom, 1 ^ mul(XiInv, X[j]));
    }
    let y = polyEval([...errEval].reverse(), XiInv);
    y = mul(X[i], y);
    if (denom === 0) throw new Error("RS: could not find error magnitude");
    E[errPos[i]] = div(y, denom);
  }
  return polyAdd(msg, E);
}

/**
 * Correct a message in-place (msg includes parity). Throws on failure.
 * Returns the corrected full codeword (data+parity).
 */
export function rsDecode(msg: Uint8Array, nsym: number): Uint8Array {
  const synd = calcSyndromes(msg, nsym);
  if (Math.max(...synd) === 0) return msg.slice();
  const errLoc = findErrorLocator(synd.slice(1), nsym);
  const errPos = findErrors([...errLoc].reverse(), msg.length);
  const corrected = correctErrata(Array.from(msg), synd, errPos);
  const synd2 = calcSyndromes(corrected, nsym);
  if (Math.max(...synd2) > 0) throw new Error("RS: correction failed");
  return Uint8Array.from(corrected);
}
