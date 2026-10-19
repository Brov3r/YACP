import { strict as assert } from 'assert';
import { applyContextFilters } from '../../src/colorFilters';
import {
  findColorAtOffset,
  parseColorLiteral,
  parseColors
} from '../../src/colorParser';
import { ParsedColor, RgbaColor } from '../../src/types';

function parseOne(text: string): ParsedColor {
  const colors = parseColors(text);
  assert.equal(
    colors.length,
    1,
    `Expected exactly one color in ${JSON.stringify(text)}, got ${colors.length}`
  );
  return colors[0];
}

function assertColor(
  actual: RgbaColor,
  expected: RgbaColor,
  epsilon = 0.002
): void {
  assert.ok(
    Math.abs(actual.r - expected.r) <= epsilon,
    `red ${actual.r} != ${expected.r}`
  );
  assert.ok(
    Math.abs(actual.g - expected.g) <= epsilon,
    `green ${actual.g} != ${expected.g}`
  );
  assert.ok(
    Math.abs(actual.b - expected.b) <= epsilon,
    `blue ${actual.b} != ${expected.b}`
  );
  assert.ok(
    Math.abs(actual.a - expected.a) <= epsilon,
    `alpha ${actual.a} != ${expected.a}`
  );
}

describe('YACP color parser', () => {
  describe('HEX', () => {
    it('parses every supported HEX length', () => {
      assertColor(parseOne('#f00').color, { r: 1, g: 0, b: 0, a: 1 });
      assertColor(parseOne('#f008').color, {
        r: 1,
        g: 0,
        b: 0,
        a: 0x88 / 255
      });
      assertColor(parseOne('#FF0080').color, {
        r: 1,
        g: 0,
        b: 128 / 255,
        a: 1
      });
      assertColor(parseOne('#FF008080').color, {
        r: 1,
        g: 0,
        b: 128 / 255,
        a: 128 / 255
      });
    });

    it('records uppercase and shorthand style', () => {
      const upper = parseOne('#FF0080');
      assert.equal(upper.style.uppercase, true);
      assert.equal(upper.style.shorthand, false);

      const lower = parseOne('#ff0080');
      assert.equal(lower.style.uppercase, false);

      const shorthand = parseOne('#f00');
      assert.equal(shorthand.style.shorthand, true);
      assert.equal(shorthand.style.hasAlpha, false);
    });

    it('reports exact ranges', () => {
      const text = 'x = "#ABC";';
      const color = parseOne(text);
      assert.equal(color.start, 5);
      assert.equal(color.end, 9);
      assert.equal(text.slice(color.start, color.end), '#ABC');
    });

    it('rejects invalid lengths and longer tokens', () => {
      for (const text of [
        '#',
        '#f',
        '#ff',
        '#12345',
        '#1234567',
        '#fffffffff',
        '#fffzz',
        '#fff-bar',
        '##fff',
        'x#fff',
        'C#fff',
        'https://example.com/#fff'
      ]) {
        assert.equal(parseColors(text).length, 0, `Should reject ${text}`);
      }
    });

    it('accepts colors in surrounding punctuation', () => {
      assert.equal(parseColors('color: #fff;').length, 1);
      assert.equal(parseColors('(#fff)').length, 1);
      assert.equal(parseColors('["#fff"]').length, 1);
    });
  });

  describe('RGB / RGBA', () => {
    it('parses legacy comma syntax', () => {
      const color = parseOne('rgb(255, 0, 128)');
      assertColor(color.color, { r: 1, g: 0, b: 128 / 255, a: 1 });
      assert.equal(color.syntax, 'rgb');
      assert.equal(color.style.separator, 'comma');
    });

    it('parses rgba with alpha', () => {
      const color = parseOne('rgba(255, 0, 128, 0.5)');
      assert.equal(color.syntax, 'rgba');
      assertColor(color.color, { r: 1, g: 0, b: 128 / 255, a: 0.5 });
      assert.equal(color.style.hasAlpha, true);
    });

    it('parses modern space and slash syntax', () => {
      const color = parseOne('rgb(255 0 128 / 50%)');
      assertColor(color.color, { r: 1, g: 0, b: 128 / 255, a: 0.5 });
      assert.equal(color.style.separator, 'space');
      assert.equal(color.style.alphaPercent, true);
    });

    it('parses percentage channels', () => {
      assertColor(parseOne('rgba(100%, 0%, 50%, 25%)').color, {
        r: 1,
        g: 0,
        b: 0.5,
        a: 0.25
      });
      assertColor(parseOne('rgb(100% 0% 50%)').color, {
        r: 1,
        g: 0,
        b: 0.5,
        a: 1
      });
    });

    it('is case-insensitive and preserves the function name', () => {
      const color = parseOne('RGB(255, 0, 128)');
      assert.equal(color.style.functionName, 'RGB');
      assert.equal(color.syntax, 'rgb');
    });

    it('accepts an alpha channel in rgb() (CSS Color 4 alias)', () => {
      assertColor(parseOne('rgb(1, 2, 3, 0.5)').color, {
        r: 1 / 255,
        g: 2 / 255,
        b: 3 / 255,
        a: 0.5
      });
    });

    it('clamps out-of-range channels and alpha like CSS', () => {
      assertColor(parseOne('rgb(256, -10, 128)').color, {
        r: 1,
        g: 0,
        b: 128 / 255,
        a: 1
      });
      assertColor(parseOne('rgb(101% 0% 50%)').color, {
        r: 1,
        g: 0,
        b: 0.5,
        a: 1
      });
      assert.equal(parseOne('rgba(0, 0, 0, 1.5)').color.a, 1);
      assert.equal(parseOne('rgba(0, 0, 0, -0.1)').color.a, 0);
      assert.equal(parseOne('rgba(0, 0, 0, 200%)').color.a, 1);
    });

    it('rejects malformed values', () => {
      for (const text of [
        'rgb(1, 2)',
        'rgba(1, 2, 3,)',
        'rgb(1, 2 3)',
        'rgb(1 2 3 0.5)',
        'rgb(1, 2, 3)extra',
        'myrgb(1, 2, 3)',
        '_rgb(1, 2, 3)',
        '$rgb(1, 2, 3)',
        'foo-rgb(1, 2, 3)',
        'rgb (1, 2, 3)'
      ]) {
        assert.equal(parseColors(text).length, 0, `Should reject ${text}`);
      }
    });
  });

  describe('HSL / HSLA', () => {
    it('parses comma syntax', () => {
      const color = parseOne('hsl(270, 60%, 50%)');
      assertColor(
        color.color,
        { r: 0.5, g: 0.2, b: 0.8, a: 1 },
        0.01
      );
      assert.equal(color.style.hueUnit, 'deg');
      assert.equal(color.style.separator, 'comma');
    });

    it('parses hsla with alpha', () => {
      const color = parseOne('hsla(270, 60%, 50%, 0.75)');
      assertColor(
        color.color,
        { r: 0.5, g: 0.2, b: 0.8, a: 0.75 },
        0.01
      );
      assert.equal(color.syntax, 'hsla');
    });

    it('parses modern syntax and percentage alpha', () => {
      const color = parseOne('hsl(270 60% 50% / 25%)');
      assertColor(
        color.color,
        { r: 0.5, g: 0.2, b: 0.8, a: 0.25 },
        0.01
      );
      assert.equal(color.style.separator, 'space');
      assert.equal(color.style.alphaPercent, true);
    });

    it('parses angle units', () => {
      assertColor(parseOne('hsl(0.75turn 60% 50%)').color, {
        r: 0.5,
        g: 0.2,
        b: 0.8,
        a: 1
      }, 0.01);
      assertColor(parseOne('hsl(300deg, 100%, 50%)').color, {
        r: 1,
        g: 0,
        b: 1,
        a: 1
      }, 0.01);
      const color = parseOne('hsl(3.14159rad 100% 50%)');
      assert.equal(color.style.hueUnit, 'rad');
    });

    it('rejects malformed HSL', () => {
      for (const text of [
        'hsl(270, 60, 50%)',
        'hsl(270, 60%, 50)',
        'hsl(abc, 60%, 50%)',
        'hsl(270, 60%, 50%,)',
        'myhsl(270, 60%, 50%)'
      ]) {
        assert.equal(parseColors(text).length, 0, `Should reject ${text}`);
      }
    });

    it('clamps saturation, lightness and alpha', () => {
      const over = parseOne('hsl(270, 120%, 50%)');
      assertColor(over.color, { r: 0.5, g: 0, b: 1, a: 1 }, 0.01);
      const tooLight = parseOne('hsl(270, 60%, 120%)');
      assertColor(tooLight.color, { r: 1, g: 1, b: 1, a: 1 }, 0.01);
      assert.equal(parseOne('hsla(270, 60%, 50%, 1.5)').color.a, 1);
      assert.equal(parseOne('hsla(270, 60%, 50%, -1)').color.a, 0);
    });
  });

  describe('HWB', () => {
    it('parses hwb with and without alpha', () => {
      const color = parseOne('hwb(270 20% 30%)');
      assertColor(color.color, { r: 0.45, g: 0.2, b: 0.7, a: 1 }, 0.01);
      assert.equal(color.syntax, 'hwb');

      const withAlpha = parseOne('hwb(270 20% 30% / 50%)');
      assertColor(
        withAlpha.color,
        { r: 0.45, g: 0.2, b: 0.7, a: 0.5 },
        0.01
      );
    });

    it('rejects comma syntax and malformed values', () => {
      for (const text of [
        'hwb(270, 20%, 30%)',
        'hwb(270 20% 30% /)',
        'hwb(270 20 30%)'
      ]) {
        assert.equal(parseColors(text).length, 0, `Should reject ${text}`);
      }
    });

    it('clamps whiteness and alpha', () => {
      assertColor(parseOne('hwb(270 120% 0%)').color, {
        r: 1,
        g: 1,
        b: 1,
        a: 1
      });
      assert.equal(parseOne('hwb(270 20% 30% / 1.5)').color.a, 1);
    });
  });

  describe('hex() function', () => {
    it('parses hex() with and without a hash prefix', () => {
      const withHash = parseOne('hex(#FF0080)');
      assertColor(withHash.color, { r: 1, g: 0, b: 128 / 255, a: 1 });
      assert.equal(withHash.syntax, 'hex-function');
      assert.equal(withHash.style.hexPrefix, true);
      assert.equal(withHash.style.uppercase, true);

      const withoutHash = parseOne('hex(ff0080)');
      assert.equal(withoutHash.style.hexPrefix, false);
      assert.equal(withoutHash.style.uppercase, false);
    });

    it('does not report the inner hash separately', () => {
      assert.equal(parseColors('hex(#fff)').length, 1);
      assert.equal(parseColors('HEX(#f00)')[0].style.functionName, 'HEX');
    });

    it('rejects invalid hex() arguments', () => {
      for (const text of [
        'hex(#ff)',
        'hex(#fffff)',
        'hex(12345)',
        'hex(#fff)extra',
        'myhex(#fff)'
      ]) {
        assert.equal(parseColors(text).length, 0, `Should reject ${text}`);
      }
    });
  });

  describe('CSS Color 4 color spaces', () => {
    it('parses lab(), lch(), oklab() and oklch()', () => {
      const expectedRed: RgbaColor = { r: 1, g: 0, b: 0, a: 1 };
      assertColor(parseOne('lab(53.24 80.09 67.2)').color, expectedRed, 0.02);
      assertColor(parseOne('lch(53.24 104.55 40)').color, expectedRed, 0.02);
      assertColor(
        parseOne('oklab(0.62796 0.22486 0.12585)').color,
        expectedRed,
        0.02
      );
      assertColor(
        parseOne('oklch(0.62796 0.25768 29.2)').color,
        expectedRed,
        0.02
      );
    });

    it('supports percentages and alpha in modern color functions', () => {
      assertColor(parseOne('lab(100% 0% 0%)').color, {
        r: 1,
        g: 1,
        b: 1,
        a: 1
      }, 0.01);
      assertColor(parseOne('oklab(100% 0 0)').color, {
        r: 1,
        g: 1,
        b: 1,
        a: 1
      }, 0.01);
      const transparentLab = parseOne('lab(53.24 80.09 67.2 / 25%)');
      assert.equal(transparentLab.color.a, 0.25);
      assert.equal(transparentLab.style.alphaPercent, true);
    });

    it('parses color() in srgb, srgb-linear and display-p3', () => {
      assertColor(parseOne('color(srgb 0.5 0.2 0.8 / 0.5)').color, {
        r: 0.5,
        g: 0.2,
        b: 0.8,
        a: 0.5
      });
      assertColor(parseOne('color(srgb 100% 0% 50%)').color, {
        r: 1,
        g: 0,
        b: 0.5,
        a: 1
      });
      assertColor(parseOne('color(srgb-linear 1 0 0)').color, {
        r: 1,
        g: 0,
        b: 0,
        a: 1
      }, 0.01);
      assertColor(parseOne('color(display-p3 1 0 0)').color, {
        r: 1,
        g: 0,
        b: 0,
        a: 1
      }, 0.02);
      const p3 = parseOne('color(display-p3 0 0.5 0 / 0.5)');
      assert.equal(p3.style.colorSpace, 'display-p3');
      assert.equal(p3.color.a, 0.5);
    });

    it('rejects unsupported color spaces and malformed functions', () => {
      for (const text of [
        'color(rec2020 1 0 0)',
        'color(srgb 1 0)',
        'color(srgb 1 0 0 /)',
        'lab(53.24 80.09)',
        'oklch(0.5 0.2)',
        'color(srgb 1 0 0)extra'
      ]) {
        assert.equal(parseColors(text).length, 0, `Should reject ${text}`);
      }
    });
  });

  describe('named colors', () => {
    it('is opt-in and parses CSS named colors', () => {
      assert.equal(parseColors('color: red;').length, 0);

      const red = parseColors('color: red;', { namedColors: true })[0];
      assertColor(red.color, { r: 1, g: 0, b: 0, a: 1 });
      assert.equal(red.syntax, 'named');
      assert.equal(red.style.functionName, 'red');

      const rebecca = parseColors('color: rebeccapurple;', {
        namedColors: true
      })[0];
      assertColor(rebecca.color, {
        r: 0x66 / 255,
        g: 0x33 / 255,
        b: 0x99 / 255,
        a: 1
      });
    });

    it('parses transparent and preserves case metadata', () => {
      const transparent = parseColors('background: transparent;', {
        namedColors: true
      })[0];
      assert.equal(transparent.color.a, 0);
      assert.equal(transparent.style.hasAlpha, true);

      const upper = parseColors('color: RED;', { namedColors: true })[0];
      assert.equal(upper.style.uppercase, true);
      assert.equal(upper.style.functionName, 'RED');
    });

    it('does not match identifiers, hashes, or class-like tokens', () => {
      for (const text of [
        'redd',
        'colorRed',
        '#red',
        '.red',
        '--red',
        '$red'
      ]) {
        assert.equal(
          parseColors(text, { namedColors: true }).length,
          0,
          `Should reject ${text}`
        );
      }
    });
  });

  describe('CSS context filters', () => {
    it('ignores ID selectors but keeps declaration values', () => {
      const text = '#fff { color: #000; background: linear-gradient(#abc, #def); }';
      const filtered = applyContextFilters(text, parseColors(text), {
        cssLike: true,
        namedContext: false
      });
      assert.deepEqual(
        filtered.map((color) => text.slice(color.start, color.end)),
        ['#000', '#abc', '#def']
      );
    });

    it('ignores selector lists but keeps colors in comma declarations', () => {
      const text = '#fff, #000 { box-shadow: 0 0 0 #123, 0 0 0 #456; }';
      const filtered = applyContextFilters(text, parseColors(text), {
        cssLike: true,
        namedContext: false
      });
      assert.deepEqual(
        filtered.map((color) => text.slice(color.start, color.end)),
        ['#123', '#456']
      );
    });

    it('filters named colors to value-like CSS positions', () => {
      const text = 'red { color: blue; } .white { background: white; }';
      const colors = parseColors(text, { namedColors: true });
      const filtered = applyContextFilters(text, colors, {
        cssLike: true,
        namedContext: true
      });
      assert.deepEqual(
        filtered.map((color) => text.slice(color.start, color.end)),
        ['blue', 'white']
      );
    });

    it('keeps named colors inside functions and multi-line values', () => {
      const text =
        'a { background: linear-gradient(red, blue); }\n' +
        'b { color: var(--x, transparent); }\n' +
        'c {\n  color:\n    rebeccapurple;\n}';
      const colors = parseColors(text, { namedColors: true });
      const filtered = applyContextFilters(text, colors, {
        cssLike: true,
        namedContext: true
      });
      assert.deepEqual(
        filtered.map((color) => text.slice(color.start, color.end)),
        ['red', 'blue', 'transparent', 'rebeccapurple']
      );
    });
  });

  describe('scanning behavior', () => {
    it('finds multiple colors on one line', () => {
      const text = '#fff #000 #ABCDEF';
      const colors = parseColors(text);
      assert.equal(colors.length, 3);
      assert.deepEqual(
        colors.map((color) => text.slice(color.start, color.end)),
        ['#fff', '#000', '#ABCDEF']
      );
    });

    it('finds colors embedded in different kinds of text', () => {
      assert.equal(
        parseColors('const c = "#1e90ff"; // rgba(0, 0, 0, 0.25)').length,
        2
      );
      assert.equal(
        parseColors('fill="#abc"\nstroke = (0, 0, 0)').length,
        1
      );
      assert.equal(
        parseColors('{"color": "hsl(270, 60%, 50%)", "id": 3}').length,
        1
      );
      assert.equal(parseColors('Inline `#ff0080` in Markdown').length, 1);
    });

    it('handles incomplete values while typing', () => {
      for (const text of [
        '#f',
        '#ff',
        '#fffff',
        '#fffffff',
        'rgb(255, 0, 128',
        'rgba(255, 0, 0,',
        'hsl(270, 60%,',
        'hwb(',
        'hex(#ff'
      ]) {
        assert.equal(parseColors(text).length, 0, `Should reject ${text}`);
      }
    });

    it('does not interpret arbitrary numbers as colors', () => {
      assert.equal(parseColors('255, 0, 128').length, 0);
      assert.equal(parseColors('rgb 255 0 128').length, 0);
      assert.equal(parseColors('not-a-color #1234567').length, 0);
    });

    it('stays responsive on documents with many colors', () => {
      const text = '#fff '.repeat(5000);
      assert.equal(parseColors(text).length, 5000);
    });

    it('respects cancellation', () => {
      const colors = parseColors('#fff #000', {
        token: { isCancellationRequested: true }
      });
      assert.equal(colors.length, 0);
    });

    it('parses only complete literals with parseColorLiteral', () => {
      assert.ok(parseColorLiteral('#fff'));
      assert.equal(parseColorLiteral(' #fff'), null);
      assert.equal(parseColorLiteral('#fff '), null);
      assert.equal(parseColorLiteral('x#fff'), null);
    });

    it('finds the color under a cursor offset', () => {
      const colors = parseColors('a #fff b');
      assert.ok(findColorAtOffset(colors, 0) === null);
      assert.ok(findColorAtOffset(colors, 2));
      assert.ok(findColorAtOffset(colors, 4));
      assert.ok(findColorAtOffset(colors, 6));
      assert.ok(findColorAtOffset(colors, 7) === null);
    });
  });
});
