// Tiny stack VM for make.fun tiny-stack-vm-01 (ISA v1).
// Runs every /input/<id>/program.bin + input.bin and writes
// /output/<id>/stdout.bin + exit.txt. Node 22 type-stripping:
// erasable syntax only.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Run one program on one input. Returns [output bytes, exit code].
function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = p.length;
  const S = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const o = new Uint8Array(65536);
  let ol = 0;
  let ip = 0;
  let pc = 0;
  let st = 0;
  const fin = (e: number): [Uint8Array, number] => [o.slice(0, ol), e];

  for (;;) {
    if (st === 1000000) return fin(10);
    if (pc < 0 || pc >= n) return fin(9);
    const k = p[pc];
    const ok =
      k < 8 ||
      (k >= 0x10 && k <= 0x22 && k !== 0x1f) ||
      (k >= 0x30 && k <= 0x34) ||
      k === 0x40 ||
      k === 0x41 ||
      (k >= 0x50 && k <= 0x53);
    if (!ok) return fin(5);
    const im = k === 1 ? 1 : k === 2 ? 4 : k >= 0x30 && k <= 0x33 ? 2 : 0;
    if (pc + im >= n) return fin(9);
    const po =
      k === 7
        ? 3
        : k === 5 ||
            k === 6 ||
            (k >= 0x10 && k <= 0x16) ||
            (k >= 0x18 && k <= 0x1a) ||
            (k >= 0x1c && k <= 0x1e) ||
            (k >= 0x20 && k <= 0x22) ||
            k === 0x41
          ? 2
          : k === 3 ||
              k === 4 ||
              k === 0x17 ||
              k === 0x1b ||
              k === 0x31 ||
              k === 0x32 ||
              k === 0x40 ||
              k === 0x50 ||
              k === 0x51 ||
              k === 0x53
            ? 1
            : 0;
    const pu =
      k === 6 || k === 7
        ? 3
        : k === 4 || k === 5
          ? 2
          : k === 1 ||
              k === 2 ||
              k === 0x17 ||
              k === 0x1b ||
              k === 0x40 ||
              k === 0x52 ||
              (k >= 0x10 && k <= 0x16) ||
              (k >= 0x18 && k <= 0x1a) ||
              (k >= 0x1c && k <= 0x1e) ||
              (k >= 0x20 && k <= 0x22)
            ? 1
            : 0;
    st++;
    const nx = pc + 1 + im;
    if (sp < po) return fin(2);
    if (sp - po + pu > 256) return fin(3);
    pc = nx;
    switch (k) {
      case 0x00:
        return fin(0);
      case 0x01:
        S[sp++] = (p[nx - 1] << 24) >> 24;
        break;
      case 0x02:
        S[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24);
        break;
      case 0x03:
        sp--;
        break;
      case 0x04:
        S[sp] = S[sp - 1];
        sp++;
        break;
      case 0x05: {
        const t = S[sp - 1];
        S[sp - 1] = S[sp - 2];
        S[sp - 2] = t;
        break;
      }
      case 0x06:
        S[sp] = S[sp - 2];
        sp++;
        break;
      case 0x07: {
        const a = S[sp - 3];
        S[sp - 3] = S[sp - 2];
        S[sp - 2] = S[sp - 1];
        S[sp - 1] = a;
        break;
      }
      case 0x17:
        S[sp - 1] = -S[sp - 1] | 0;
        break;
      case 0x1b:
        S[sp - 1] = ~S[sp - 1];
        break;
      case 0x10:
      case 0x11:
      case 0x12:
      case 0x13:
      case 0x14:
      case 0x15:
      case 0x16:
      case 0x18:
      case 0x19:
      case 0x1a:
      case 0x1c:
      case 0x1d:
      case 0x1e:
      case 0x20:
      case 0x21:
      case 0x22: {
        const b = S[sp - 1];
        const a = S[sp - 2];
        let r = 0;
        if (k === 0x10) r = (a + b) | 0;
        else if (k === 0x11) r = (a - b) | 0;
        else if (k === 0x12) r = Math.imul(a, b);
        else if (k === 0x13) {
          if (b === 0) return fin(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (k === 0x14) {
          if (b === 0) return fin(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (k === 0x15) {
          if (b === 0) return fin(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (k === 0x16) {
          if (b === 0) return fin(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (k === 0x18) r = a & b;
        else if (k === 0x19) r = a | b;
        else if (k === 0x1a) r = a ^ b;
        else if (k === 0x1c) r = a << (b & 31);
        else if (k === 0x1d) r = a >> (b & 31);
        else if (k === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (k === 0x20) r = a === b ? 1 : 0;
        else if (k === 0x21) r = a < b ? 1 : 0;
        else r = a >>> 0 < (b >>> 0) ? 1 : 0;
        sp -= 2;
        S[sp++] = r;
        break;
      }
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (k !== 0x30) {
          const v = S[--sp];
          take = k === 0x31 ? v === 0 : v !== 0;
        }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return fin(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return fin(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const a = S[sp - 1];
        if (a < 0 || a >= 256) return fin(6);
        S[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = S[sp - 1];
        const v = S[sp - 2];
        if (a < 0 || a >= 256) return fin(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 0x50: {
        const bs = Buffer.from(String(S[sp - 1]));
        if (ol + bs.length > 65536) return fin(11);
        sp--;
        o.set(bs, ol);
        ol += bs.length;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return fin(11);
        o[ol++] = S[--sp] & 255;
        break;
      case 0x52:
        S[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 0x53:
        return fin(S[--sp] & 255);
    }
  }
}

for (const id of readdirSync(IN_DIR).sort()) {
  let prog: Buffer;
  try {
    prog = readFileSync(join(IN_DIR, id, 'program.bin'));
  } catch {
    continue;
  }
  let inp = Buffer.alloc(0);
  try {
    inp = readFileSync(join(IN_DIR, id, 'input.bin'));
  } catch {
    inp = Buffer.alloc(0);
  }
  const [out, exit] = run(prog, inp);
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), out);
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), String(exit) + '\n');
}
