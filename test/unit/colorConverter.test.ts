import { strict as assert } from 'assert';
import {
  formatColor,
  formatHexDigits,
  formatPreserving,
  hslToRgb,
  hwbToRgb,
  isTransparent,
  rgbToHsl,
  rgbToHwb
} from '../../src/colorConverter';
import { parseColorLiteral, parseColors } from '../../src/colorParser';
import { RgbaColor } from '../../src/types';

const RED: RgbaColor = { r: 1, g: 0, b: 0, a: 1 };
const PINK: RgbaColor = { r: 1, g: 0, b: 128 / 255, a: 1 };
const PINK_HALF: RgbaColor = { ...PINK, a: 0.5 };

function assertColor(
  actual: RgbaColor,
  expected: RgbaColor,
  epsilon = 0.01
): void {
  assert.ok(Math.abs(actual.r - expected.r) <= epsilon, `red ${actual.r}`);
  assert.ok(Math.abs(actual.g - expected.g) <= epsilon, `green ${actual.g}`);
  assert.ok(Math.abs(actual.b - expected.b) <= epsilon, `blue ${actual.b}`);
  assert.ok(Math.abs(actual.a - expected.a) <= epsilon, `alpha ${actual.a}`);
}

describe('YACP color converter', () => {
  describe('HEX output', () => {
    it('formats uppercase and lowercase', () => {
      assert.equal(formatColor(PINK, 'hex'), '#FF0080');
      assert.equal(
        formatColor(PINK, 'hex', { hexCase: 'lower' }),
        '#ff0080'
      );
    });

    it('uses shorthand when possible and can disable it', () => {
      assert.equal(formatColor(RED, 'hex'), '#F00');
      assert.equal(
        formatColor(RED, 'hex', { hexShorthand: false }),
        '#FF0000'
      );
    });

    it('preserves alpha transparency', () => {
      assert.equal(formatColor(PINK_HALF, 'hex'), '#FF008080');
      const alphaPair = { r: 1, g: 0, b: 0, a: 0x88 / 255 };
      assert.equal(formatColor(alphaPair, 'hex'), '#F008');
    });

    it('includes opaque alpha when showAlpha is enabled', () => {
      assert.equal(
        formatColor(PINK, 'hex', { showAlpha: true }),
        '#FF0080FF'
      );
    });

    it('formats bare digits for hex()', () => {
      assert.equal(formatHexDigits(PINK), 'FF0080');
      assert.equal(
        formatHexDigits(PINK, { hexCase: 'lower' }),
        'ff0080'
      );
    });
  });

  describe('RGB / RGBA output', () => {
    it('formats rgb() and includes alpha automatically', () => {
      assert.equal(formatColor(PINK, 'rgb'), 'rgb(255, 0, 128)');
      assert.equal(
        formatColor(PINK_HALF, 'rgb'),
        'rgba(255, 0, 128, 0.5)'
      );
    });

    it('can explicitly discard alpha or force RGBA', () => {
      assert.equal(
        formatColor(PINK_HALF, 'rgb', { includeAlpha: 'never' }),
        'rgb(255, 0, 128)'
      );
      assert.equal(
        formatColor(PINK, 'rgba'),
        'rgba(255, 0, 128, 1)'
      );
      assert.equal(
        formatColor(PINK_HALF, 'rgba'),
        'rgba(255, 0, 128, 0.5)'
      );
    });
  });

  describe('HSL / HSLA output', () => {
    it('formats hsl()', () => {
      assert.equal(formatColor(RED, 'hsl'), 'hsl(0, 100%, 50%)');
      assert.equal(
        formatColor(PINK_HALF, 'hsl'),
        'hsla(329.9, 100%, 50%, 0.5)'
      );
    });

    it('formats explicitly requested HSLA', () => {
      assert.equal(
        formatColor(RED, 'hsla'),
        'hsla(0, 100%, 50%, 1)'
      );
    });

    it('round-trips through HSL', () => {
      for (const color of [RED, PINK, PINK_HALF, { r: 0.2, g: 0.4, b: 0.6, a: 1 }]) {
        const text = formatColor(color, 'hsl');
        const parsed = parseColorLiteral(text);
        assert.ok(parsed, text);
        assertColor(parsed.color, color);
      }
    });
  });

  describe('HWB output', () => {
    it('formats hwb() including alpha through the slash syntax', () => {
      assert.equal(formatColor(RED, 'hwb'), 'hwb(0 0% 0%)');
      assert.equal(
        formatColor(PINK_HALF, 'hwb'),
        'hwb(329.9 0% 0% / 0.5)'
      );
    });

    it('round-trips through HWB', () => {
      for (const color of [RED, PINK, PINK_HALF, { r: 0.2, g: 0.4, b: 0.6, a: 0.25 }]) {
        const text = formatColor(color, 'hwb');
        const parsed = parseColorLiteral(text);
        assert.ok(parsed, text);
        assertColor(parsed.color, color);
      }
    });
  });

  describe('CSS Color 4 output', () => {
    it('formats lab(), lch(), oklab(), oklch() and color()', () => {
      assert.equal(formatColor(RED, 'lab'), 'lab(53.24 80.09 67.2)');
      assert.equal(formatColor(RED, 'lch'), 'lch(53.24 104.55 40)');
      assert.equal(formatColor(RED, 'oklab'), 'oklab(0.62796 0.22486 0.12585)');
      assert.equal(formatColor(RED, 'oklch'), 'oklch(0.62796 0.25768 29.2)');
      assert.equal(formatColor(RED, 'color'), 'color(srgb 1 0 0)');
    });

    it('round-trips through modern color spaces', () => {
      const samples: RgbaColor[] = [
        RED,
        PINK,
        PINK_HALF,
        { r: 0.2, g: 0.4, b: 0.6, a: 0.25 }
      ];
      for (const color of samples) {
        for (const format of ['lab', 'lch', 'oklab', 'oklch', 'color'] as const) {
          const text = formatColor(color, format, {
            includeAlpha: 'always'
          });
          const parsed = parseColors(text);
          assert.equal(parsed.length, 1, `Expected one color in ${text}`);
          assertColor(parsed[0].color, color, 0.03);
        }
      }
    });

    it('preserves modern syntax, color space and alpha notation', () => {
      const lab = parseColorLiteral('lab(50 20 30)');
      assert.ok(lab);
      assert.equal(
        formatPreserving(lab.color, lab.style),
        'lab(50 20 30)'
      );

      const colorFunction = parseColorLiteral(
        'color(display-p3 0.5 0.2 0.8 / 50%)'
      );
      assert.ok(colorFunction);
      assert.equal(
        formatPreserving(colorFunction.color, colorFunction.style),
        'color(display-p3 0.5 0.2 0.8 / 50%)'
      );
    });
  });

  describe('named color preservation', () => {
    it('keeps the original name when the value is unchanged', () => {
      const red = parseColors('color: red;', { namedColors: true })[0];
      assert.equal(formatPreserving(red.color, red.style), 'red');

      const transparent = parseColors('x: transparent;', {
        namedColors: true
      })[0];
      assert.equal(
        formatPreserving(transparent.color, transparent.style),
        'transparent'
      );
    });

    it('uses another named color when one matches exactly', () => {
      const red = parseColors('color: red;', { namedColors: true })[0];
      assert.equal(
        formatPreserving({ r: 0, g: 0, b: 1, a: 1 }, red.style),
        'blue'
      );
    });

    it('falls back to HEX when no named color matches', () => {
      const red = parseColors('color: red;', { namedColors: true })[0];
      assert.equal(
        formatPreserving({ r: 0.1, g: 0.2, b: 0.3, a: 1 }, red.style),
        '#1a334d'
      );
    });
  });

  describe('format preservation', () => {
    it('preserves HEX case and shorthand', () => {
      const lower = parseColorLiteral('#ff0080');
      assert.ok(lower);
      assert.equal(
        formatPreserving({ r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255, a: 1 }, lower.style),
        '#aabbcc'
      );

      const upper = parseColorLiteral('#FF0080');
      assert.ok(upper);
      assert.equal(
        formatPreserving({ r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255, a: 1 }, upper.style),
        '#AABBCC'
      );

      const shorthand = parseColorLiteral('#f00');
      assert.ok(shorthand);
      assert.equal(
        formatPreserving({ r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255, a: 1 }, shorthand.style),
        '#abc'
      );
    });

    it('does not shorten a full HEX literal unnecessarily', () => {
      const full = parseColorLiteral('#ffffff');
      assert.ok(full);
      assert.equal(
        formatPreserving({ r: 1, g: 1, b: 1, a: 1 }, full.style),
        '#ffffff'
      );
    });

    it('preserves RGBA separators, function name and alpha', () => {
      const comma = parseColorLiteral('rgba(255, 0, 128, 0.5)');
      assert.ok(comma);
      assert.equal(
        formatPreserving({ ...PINK, a: 0.25 }, comma.style),
        'rgba(255, 0, 128, 0.25)'
      );

      const uppercase = parseColorLiteral('RGBA(255, 0, 128, 0.5)');
      assert.ok(uppercase);
      assert.equal(
        formatPreserving({ ...PINK, a: 0.25 }, uppercase.style),
        'RGBA(255, 0, 128, 0.25)'
      );

      const modern = parseColorLiteral('rgba(255 0 128 / 0.5)');
      assert.ok(modern);
      assert.equal(
        formatPreserving({ ...PINK, a: 0.25 }, modern.style),
        'rgba(255 0 128 / 0.25)'
      );
    });

    it('adds alpha when the preserved syntax needs it', () => {
      const rgb = parseColorLiteral('rgb(255, 0, 128)');
      assert.ok(rgb);
      assert.equal(
        formatPreserving({ ...PINK, a: 0.5 }, rgb.style),
        'rgba(255, 0, 128, 0.5)'
      );
    });

    it('preserves HSL style and percentage alpha', () => {
      const hsl = parseColorLiteral('hsl(270, 60%, 50%)');
      assert.ok(hsl);
      assert.equal(
        formatPreserving({ r: 0.5, g: 0.2, b: 0.8, a: 0.5 }, hsl.style),
        'hsla(270, 60%, 50%, 0.5)'
      );

      const percent = parseColorLiteral('hsl(270 60% 50% / 25%)');
      assert.ok(percent);
      assert.equal(
        formatPreserving({ r: 0.5, g: 0.2, b: 0.8, a: 0.5 }, percent.style),
        'hsl(270 60% 50% / 50%)'
      );
    });

    it('preserves hex() wrapper and hash prefix', () => {
      const hexFunction = parseColorLiteral('hex(#FF0080)');
      assert.ok(hexFunction);
      assert.equal(
        formatPreserving({ r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255, a: 1 }, hexFunction.style),
        'hex(#AABBCC)'
      );

      const noHash = parseColorLiteral('hex(ff0080)');
      assert.ok(noHash);
      assert.equal(
        formatPreserving({ r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255, a: 1 }, noHash.style),
        'hex(aabbcc)'
      );
    });
  });

  describe('color math', () => {
    it('converts HSL to RGB and back', () => {
      const rgb = hslToRgb(270, 60, 50);
      assertColor(rgb, { r: 0.5, g: 0.2, b: 0.8, a: 1 });
      const hsl = rgbToHsl(rgb);
      assert.ok(Math.abs(hsl.h - 270) < 0.01);
      assert.ok(Math.abs(hsl.s - 60) < 0.01);
      assert.ok(Math.abs(hsl.l - 50) < 0.01);
    });

    it('converts HWB to RGB and back', () => {
      const rgb = hwbToRgb(270, 20, 30);
      assertColor(rgb, { r: 0.45, g: 0.2, b: 0.7, a: 1 });
      const hwb = rgbToHwb(rgb);
      assert.ok(Math.abs(hwb.h - 270) < 0.01);
      assert.ok(Math.abs(hwb.w - 20) < 0.01);
      assert.ok(Math.abs(hwb.b - 30) < 0.01);
    });

    it('handles fully saturated and achromatic values', () => {
      assertColor(hslToRgb(0, 0, 50), { r: 0.5, g: 0.5, b: 0.5, a: 1 });
      assertColor(hwbToRgb(0, 60, 60), { r: 0.5, g: 0.5, b: 0.5, a: 1 });
    });

    it('detects transparency with 8-bit rounding', () => {
      assert.equal(isTransparent(PINK_HALF), true);
      assert.equal(isTransparent(PINK), false);
      assert.equal(isTransparent({ ...PINK, a: 0.999 }), false);
    });
  });

  describe('all formats round-trip', () => {
    it('parses the output of every target format', () => {
      const samples: RgbaColor[] = [
        PINK,
        PINK_HALF,
        { r: 0.2, g: 0.4, b: 0.6, a: 0.25 },
        { r: 0, g: 0, b: 0, a: 0 },
        { r: 1, g: 1, b: 1, a: 1 }
      ];

      for (const color of samples) {
        for (const format of ['hex', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb'] as const) {
          const text = formatColor(color, format, {
            includeAlpha: format === 'rgb' || format === 'hsl' ? 'auto' : 'always'
          });
          const parsed = parseColors(text);
          assert.equal(parsed.length, 1, `Expected one color in ${text}`);
          assertColor(parsed[0].color, color, 0.02);
        }
      }
    });
  });
});
