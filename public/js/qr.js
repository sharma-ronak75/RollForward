'use strict';

/*
 * Minimal QR Code generator (no dependencies).
 * Byte mode, error-correction level M, versions 1-10 (up to 213 bytes),
 * which comfortably fits a UPI payment link.
 *
 *   qrMatrix(text) -> boolean[][]   (true = dark module)
 *   qrSvg(text)    -> SVG markup string
 */
const QR = (() => {
    const MAX_VERSION = 10;
    // Error-correction level M: [ecc codewords per block, number of blocks], index = version
    const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
    const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
    const FORMAT_BITS_M = 0;

    const bit = (value, i) => ((value >>> i) & 1) !== 0;

    function rawDataModules(ver) {
        let result = (16 * ver + 128) * ver + 64;
        if (ver >= 2) {
            const numAlign = Math.floor(ver / 7) + 2;
            result -= (25 * numAlign - 10) * numAlign - 55;
            if (ver >= 7) {
                result -= 36;
            }
        }
        return result;
    }

    const dataCodewords = ver => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

    function alignmentPositions(ver) {
        if (ver === 1) {
            return [];
        }
        const size = ver * 4 + 17;
        const numAlign = Math.floor(ver / 7) + 2;
        const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
        const result = [6];
        for (let pos = size - 7; result.length < numAlign; pos -= step) {
            result.splice(1, 0, pos);
        }
        return result;
    }

    // ---- Reed-Solomon over GF(256), polynomial 0x11D ----
    function gfMul(x, y) {
        let z = 0;
        for (let i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11d);
            z ^= ((y >>> i) & 1) * x;
        }
        return z;
    }

    function rsDivisor(degree) {
        const result = new Array(degree).fill(0);
        result[degree - 1] = 1;
        let root = 1;
        for (let i = 0; i < degree; i++) {
            for (let j = 0; j < result.length; j++) {
                result[j] = gfMul(result[j], root);
                if (j + 1 < result.length) {
                    result[j] ^= result[j + 1];
                }
            }
            root = gfMul(root, 2);
        }
        return result;
    }

    function rsRemainder(data, divisor) {
        const result = divisor.map(() => 0);
        for (const b of data) {
            const factor = b ^ result.shift();
            result.push(0);
            divisor.forEach((coef, i) => {
                result[i] ^= gfMul(coef, factor);
            });
        }
        return result;
    }

    // ---- Data encoding ----
    function utf8Bytes(text) {
        return [...new TextEncoder().encode(text)];
    }

    function buildDataCodewords(bytes, ver) {
        const bits = [];
        const push = (value, len) => {
            for (let i = len - 1; i >= 0; i--) {
                bits.push((value >>> i) & 1);
            }
        };
        push(0b0100, 4);
        push(bytes.length, ver < 10 ? 8 : 16);
        bytes.forEach(b => push(b, 8));
        const capacityBits = dataCodewords(ver) * 8;
        push(0, Math.min(4, capacityBits - bits.length));
        push(0, (8 - (bits.length % 8)) % 8);
        for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
            push(pad, 8);
        }
        const codewords = [];
        for (let i = 0; i < bits.length; i += 8) {
            codewords.push(parseInt(bits.slice(i, i + 8).join(''), 2));
        }
        return codewords;
    }

    function addEccAndInterleave(data, ver) {
        const numBlocks = NUM_BLOCKS[ver];
        const eccLen = ECC_PER_BLOCK[ver];
        const raw = Math.floor(rawDataModules(ver) / 8);
        const numShort = numBlocks - (raw % numBlocks);
        const shortLen = Math.floor(raw / numBlocks);
        const divisor = rsDivisor(eccLen);
        const blocks = [];
        for (let i = 0, k = 0; i < numBlocks; i++) {
            const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
            k += dat.length;
            const ecc = rsRemainder(dat, divisor);
            if (i < numShort) {
                dat.push(0);
            }
            blocks.push(dat.concat(ecc));
        }
        const result = [];
        for (let i = 0; i < blocks[0].length; i++) {
            blocks.forEach((block, j) => {
                if (i !== shortLen - eccLen || j >= numShort) {
                    result.push(block[i]);
                }
            });
        }
        return result;
    }

    // ---- Matrix construction ----
    function buildMatrix(codewords, ver) {
        const size = ver * 4 + 17;
        const modules = Array.from({ length: size }, () => new Array(size).fill(false));
        const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
        const setFunction = (x, y, dark) => {
            modules[y][x] = dark;
            isFunction[y][x] = true;
        };

        for (let i = 0; i < size; i++) {
            setFunction(6, i, i % 2 === 0);
            setFunction(i, 6, i % 2 === 0);
        }
        const finder = (cx, cy) => {
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    const x = cx + dx;
                    const y = cy + dy;
                    if (x >= 0 && x < size && y >= 0 && y < size) {
                        setFunction(x, y, dist !== 2 && dist !== 4);
                    }
                }
            }
        };
        finder(3, 3);
        finder(size - 4, 3);
        finder(3, size - 4);

        const align = alignmentPositions(ver);
        const last = align.length - 1;
        align.forEach((ax, i) => {
            align.forEach((ay, j) => {
                if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) {
                    return;
                }
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        setFunction(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                    }
                }
            });
        });

        const drawFormat = mask => {
            const data = (FORMAT_BITS_M << 3) | mask;
            let rem = data;
            for (let i = 0; i < 10; i++) {
                rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
            }
            const bits = ((data << 10) | rem) ^ 0x5412;
            for (let i = 0; i <= 5; i++) {
                setFunction(8, i, bit(bits, i));
            }
            setFunction(8, 7, bit(bits, 6));
            setFunction(8, 8, bit(bits, 7));
            setFunction(7, 8, bit(bits, 8));
            for (let i = 9; i < 15; i++) {
                setFunction(14 - i, 8, bit(bits, i));
            }
            for (let i = 0; i < 8; i++) {
                setFunction(size - 1 - i, 8, bit(bits, i));
            }
            for (let i = 8; i < 15; i++) {
                setFunction(8, size - 15 + i, bit(bits, i));
            }
            setFunction(8, size - 8, true);
        };
        drawFormat(0); // reserve the format area before placing data

        if (ver >= 7) {
            let rem = ver;
            for (let i = 0; i < 12; i++) {
                rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
            }
            const bits = (ver << 12) | rem;
            for (let i = 0; i < 18; i++) {
                const dark = bit(bits, i);
                const a = size - 11 + (i % 3);
                const b = Math.floor(i / 3);
                setFunction(a, b, dark);
                setFunction(b, a, dark);
            }
        }

        // Zig-zag placement of data bits
        let i = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) {
                right = 5;
            }
            for (let vert = 0; vert < size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? size - 1 - vert : vert;
                    if (!isFunction[y][x] && i < codewords.length * 8) {
                        modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
                        i++;
                    }
                }
            }
        }

        const maskFns = [
            (x, y) => (x + y) % 2 === 0,
            (x, y) => y % 2 === 0,
            (x, y) => x % 3 === 0,
            (x, y) => (x + y) % 3 === 0,
            (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
            (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
            (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
            (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
        ];
        const applyMask = mask => {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (!isFunction[y][x] && maskFns[mask](x, y)) {
                        modules[y][x] = !modules[y][x];
                    }
                }
            }
        };

        let bestMask = 0;
        let bestPenalty = Infinity;
        for (let mask = 0; mask < 8; mask++) {
            applyMask(mask);
            drawFormat(mask);
            const p = penalty(modules, size);
            if (p < bestPenalty) {
                bestPenalty = p;
                bestMask = mask;
            }
            applyMask(mask); // undo (XOR)
        }
        applyMask(bestMask);
        drawFormat(bestMask);
        return modules;
    }

    function penalty(modules, size) {
        let total = 0;
        const lines = [];
        for (let a = 0; a < size; a++) {
            lines.push(modules[a].map(Number).join(''));
            lines.push(modules.map(row => Number(row[a])).join(''));
        }
        // N1: runs of 5+ same-colour modules; N3: finder-like patterns
        for (const line of lines) {
            const runs = line.match(/0+|1+/g);
            runs.forEach(run => {
                if (run.length >= 5) {
                    total += run.length - 2;
                }
            });
            total += 40 * (line.match(/(?=(10111010000|00001011101))/g) || []).length;
        }
        // N2: 2x2 blocks of one colour
        for (let y = 0; y < size - 1; y++) {
            for (let x = 0; x < size - 1; x++) {
                const c = modules[y][x];
                if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
                    total += 3;
                }
            }
        }
        // N4: dark/light balance
        const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
        total += Math.floor(Math.abs((dark * 20) - (size * size * 10)) / (size * size)) * 10;
        return total;
    }

    function matrix(text) {
        const bytes = utf8Bytes(String(text));
        for (let ver = 1; ver <= MAX_VERSION; ver++) {
            const lengthBits = ver < 10 ? 8 : 16;
            if (4 + lengthBits + bytes.length * 8 <= dataCodewords(ver) * 8) {
                const data = buildDataCodewords(bytes, ver);
                return buildMatrix(addEccAndInterleave(data, ver), ver);
            }
        }
        throw new Error('QR payload too long.');
    }

    function svg(text, { quiet = 4, label = 'QR code' } = {}) {
        const m = matrix(text);
        const size = m.length + quiet * 2;
        let path = '';
        m.forEach((row, y) => {
            row.forEach((dark, x) => {
                if (dark) {
                    path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
                }
            });
        });
        // Fixed black-on-white (not theme colours) so every scanner can read it.
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    }

    return { matrix, svg };
})();

const qrMatrix = QR.matrix;
const qrSvg = QR.svg;
