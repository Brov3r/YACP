# YACP — Yet Another Color Picker

YACP is a universal color picker for Visual Studio Code. It finds color literals in **any text document**, shows a native color swatch next to each one, opens VS Code's built-in color picker when a swatch is selected, and converts colors between HEX, RGB(A), HSL(A), HWB, LAB/LCH, OKLAB/OKLCH and `color()` without changing their visual meaning.

YACP's parser and commands do **not** depend on a file's language mode or syntax grammar. A Python script, a Markdown note, a JSON config, an untitled buffer, and a file with a custom extension are all scanned the same way. In CSS/SCSS/LESS, VS Code's own CSS extension also supplies color decorations; YACP defers to it to avoid duplicate swatches (its commands still parse those files).

## Features

- Language-independent detection of color literals, including CSS Color 4 spaces and named colors.
- Native VS Code color swatches and picker integration.
- Multiple colors per line and per document.
- Alpha/transparency support, including alpha in HEX, `hwb()` and modern color functions.
- Native picker presentations for multiple target formats; the picker's header shows a checkerboard opacity background.
- A separate `YACP: Convert Color Format` command for explicit conversion.
- Minimal document edits that preserve the rest of the file and work with undo/redo.
- Format/style preservation when only the color value changes.
- CSS-compliant clamping of out-of-range channel, alpha and percentage values.
- Named colors (`red`, `rebeccapurple`, `transparent`) with context-aware detection.
- Context filtering for CSS ID selectors and selector lists.
- Works in files, untitled documents, remote/virtual file systems, and notebook text documents where VS Code exposes them.
- Live update while typing; incomplete color values are ignored without errors.
- Cancellation-aware, linear-time scanner; VS Code debounces scans while typing.
- No runtime dependencies beyond the VS Code API.

## Installation

### From a VSIX package

```bash
code --install-extension yacp-0.1.0.vsix
```

Alternatively, open the Extensions view in VS Code, choose **Views and More Actions → Install from VSIX…**, and select the `.vsix` file.

### From source

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch an Extension Development Host, or package the extension:

```bash
npm run package
```

## Usage

### Swatches and the native picker

Open any document containing a supported color literal. VS Code renders a small swatch immediately before the literal. Click (or hover, depending on the `editor.colorDecoratorActivatedOn` setting) to open the native color picker.

The picker shows format presentations provided by YACP:

- **Preserve** — keeps the original syntax, HEX case, shorthand style, separators, function name, color space, named-color word, and alpha notation. This is the default while `yacp.defaultFormat` is `auto`.
- **HEX / RGB / RGBA / HSL / HSLA / HWB** — explicit conversions.
- **LAB / LCH / OKLAB / OKLCH / COLOR** — opt-in modern CSS Color 4 targets (see `yacp.supportedFormats`).

Choosing a presentation and confirming the picker applies a minimal `TextEdit` to the exact color range. Undo and redo work normally.

In CSS/SCSS/LESS the built-in VS Code CSS extension registers its own color provider. If YACP also returned the same ranges, two swatches would overlap. YACP therefore lets the built-in provider render standard CSS swatches and picker presentations in those languages; YACP's **commands** still find and convert every format. In all other languages YACP is the color provider.

### Commands

| Command | Description |
| --- | --- |
| **YACP: Pick Color** | Opens the native standalone color picker for the color under the cursor or selection. Also available in the editor context menu. |
| **YACP: Convert Color Format** | Finds the color under the cursor (or in the selection), then offers target formats in a `QuickPick`. If the selection contains several colors, YACP asks which one to convert. |

The native swatch interaction is the primary way to pick colors. **YACP: Pick Color** is a fallback for keyboard/command-palette use and relies on VS Code's built-in `editor.action.showOrFocusStandaloneColorPicker` command, which uses registered color providers such as YACP.

### Transparency

- HEX output uses 8 digits (`#RRGGBBAA`) or 4-digit shorthand (`#RGBA`) when possible.
- `rgba()` and `hsla()` preserve alpha.
- `hwb()` uses the modern slash syntax: `hwb(210 20% 10% / 0.5)`.
- Selecting the plain **RGB** or **HSL** target for a transparent color would discard alpha. YACP marks this in the QuickPick and requires explicit confirmation before converting.

## Supported color grammar

YACP recognizes the following syntaxes case-insensitively where applicable. Whitespace is allowed inside functions.

### HEX

| Form | Example |
| --- | --- |
| `#RGB` | `#f00` |
| `#RGBA` | `#f008` |
| `#RRGGBB` | `#FF0080` |
| `#RRGGBBAA` | `#FF008080` |

Only exactly 3, 4, 6, or 8 hexadecimal digits are accepted. A match must not be part of a longer token: `#fffff`, `#ffffffzz`, `x#fff`, `##fff`, and the fragment in `https://example.com/#fff` are ignored.

### RGB / RGBA

Legacy comma syntax:

```css
rgb(255, 0, 128)
rgba(255, 0, 128, 0.5)
rgba(100%, 0%, 50%, 25%)
rgb(1, 2, 3, 0.5)          /* CSS Color 4 alias */
```

Modern space syntax:

```css
rgb(255 0 128)
rgb(255 0 128 / 50%)
rgba(255 0 128 / 0.5)
```

- Red/green/blue channels: numbers in `0..255` or percentages in `0..100%`.
- Alpha: number in `0..1` or percentage in `0..100%`.
- Comma and space separators cannot be mixed.
- Out-of-range channels and alpha are clamped at parsed-value time, matching CSS.

### HSL / HSLA

```css
hsl(270, 60%, 50%)
hsla(270, 60%, 50%, 0.75)
hsl(270 60% 50% / 25%)
hsl(0.75turn 60% 50%)
hsl(300deg, 100%, 50%)
hsl(3.14159rad 100% 50%)
hsl(200grad 100% 50%)
```

- Hue: unitless number or `deg`, `grad`, `rad`, or `turn`.
- Saturation/lightness: required percentage; values outside `0..100%` are clamped.
- Alpha: number in `0..1` or percentage in `0..100%`; clamped.
- Both legacy comma and modern space/slash forms are accepted.

### HWB

```css
hwb(270 20% 30%)
hwb(270 20% 30% / 0.5)
hwb(0.75turn 20% 30%)
```

- Hue uses the same grammar as HSL.
- Whiteness/blackness: percentages; values outside `0..100%` are clamped.
- Comma syntax for `hwb()` is not part of the supported grammar.

### LAB / LCH / OKLAB / OKLCH

```css
lab(53.24 80.09 67.2)
lab(53.24 80.09 67.2 / 50%)
lch(53.24 104.55 40)
lch(53.24 104.55 40 / 0.5)
oklab(0.62796 0.22486 0.12585)
oklab(62.8% 56.18% 31.46% / 25%)
oklch(0.62796 0.25768 29.2)
oklch(0.62796 0.25768 29.2 / 0.5)
```

- `lab`/`lch` lightness uses numbers in `0..100` or percentages; `a`/`b` and chroma accept numbers or percentages (CSS percentage reference: 125 for Lab, 150 for LCH).
- `oklab`/`oklch` lightness uses numbers in `0..1` or percentages; `a`/`b` and chroma percentages use the CSS reference of 0.4.
- Hue accepts `deg`, `grad`, `rad`, or `turn` (or a unitless number).
- Alpha is a number in `0..1` or a percentage, written with `/`.
- Values are converted to normalized sRGB; out-of-gamut results are clamped when displayed.

### `color()`

```css
color(srgb 1 0 0)
color(srgb 100% 0% 50% / 0.5)
color(srgb-linear 1 0 0)
color(display-p3 1 0 0)
color(display-p3 0.5 0.2 0.8 / 50%)
```

Supported color spaces: `srgb`, `srgb-linear`, and `display-p3`. Channels may be numbers or percentages and are converted to sRGB with proper transfer functions and matrices. Other spaces (`rec2020`, `a98-rgb`, `prophoto-rgb`, `xyz`, …) are not recognized.

### Named colors

```css
color: red;
background: rebeccapurple;
outline: transparent;
```

All 148 CSS named colors plus `transparent` are available. Detection is controlled by `yacp.namedColors`:

- `auto` (default): only in stylesheet languages, and only when the word looks like a value (after a property colon, inside a function such as `linear-gradient(...)`, or in a multi-line value). This avoids matching class names such as `.red`.
- `always`: detect named colors in any document. This can produce false positives in prose and identifiers.
- `never`: disable named-color and `transparent` detection.

Named colors are preserved by name when the new value matches a named color exactly; otherwise the preserve presentation falls back to HEX.

### `hex(...)`

YACP supports a clearly defined `hex()` helper:

```css
hex(#FF0080)
hex(FF0080)
hex(#f008)
```

The argument is an optional `#` followed by exactly 3, 4, 6, or 8 hexadecimal digits. Function names are case-insensitive. This is useful for template languages and custom notations; it is not standard CSS.

### Not interpreted

- CSS variables (`var(--color)`), `currentColor`, system colors, and other computed values.
- Relative color syntax (`rgb(from #fff r g b)`).
- `color()` spaces other than `srgb`, `srgb-linear`, and `display-p3`; `none` channel keywords.
- Arbitrary number tuples not wrapped in a recognized function.

## Format conversion

The converter writes canonical, mathematically correct values:

| From | To | Example |
| --- | --- | --- |
| `#FF0080` | RGB | `rgb(255, 0, 128)` |
| `rgb(255, 0, 128)` | HEX | `#FF0080` |
| `rgba(255, 0, 128, 0.5)` | HEX | `#FF008080` |
| `hsl(270, 60%, 50%)` | HEX | `#8033CC` |
| `lab(53.24 80.09 67.2)` | HEX | `#FF0000` |
| `color(display-p3 1 0 0)` | HEX | `#FF0000` (gamut-clipped) |

`#8033CC` is the mathematically correct conversion of `hsl(270, 60%, 50%)`, not the illustrative value from the original specification.

The Convert command offers HEX, RGB, RGBA, HSL, HSLA and HWB by default. Add `lab`, `lch`, `oklab`, `oklch`, or `color` to `yacp.supportedFormats` to offer those targets too.

### Style preservation

When the native picker changes a color and the **Preserve** presentation is used:

- The original syntax is kept (`hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()`, `hex()`).
- Uppercase HEX stays uppercase; lowercase stays lowercase.
- Shorthand HEX stays shorthand when the new value permits it; full HEX is not shortened.
- Comma/space separators, function-name case, color space, hue units, and percentage alpha notation are preserved.
- `rgb()`/`hsl()` switches to the alpha-aware alias (`rgba()`/`hsla()`) only when legacy comma syntax must gain an alpha channel.
- Named colors stay named when the new value has an exact named equivalent; otherwise the preserve presentation uses HEX.

The **Convert Color Format** command intentionally uses the configured target format and does not preserve the source syntax.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `yacp.enable` | `true` | Enable/disable swatches, picker integration, and YACP commands. |
| `yacp.defaultFormat` | `"auto"` | `auto` preserves the original literal's format. A specific format (`hex`, `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color`) is offered first in the picker and means color changes from the picker use that format. |
| `yacp.hexCase` | `"upper"` | `upper` or `lower` for generated HEX values. Existing literals keep their own case when preserved. |
| `yacp.showAlpha` | `false` | Include alpha in generated HEX/RGB/HSL values even for fully opaque colors. Transparent colors always include alpha. Explicit RGBA/HSLA targets always include alpha. |
| `yacp.supportedFormats` | six classic formats | Target formats offered by the picker and the Convert command: `hex`, `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, plus opt-in `lab`, `lch`, `oklab`, `oklch`, `color`. Detection of every supported syntax stays enabled. |
| `yacp.namedColors` | `"auto"` | `auto` detects named colors only in stylesheet value positions; `always` detects them everywhere (higher false-positive risk); `never` disables named colors and `transparent`. |

Settings are resource-scoped. Changing them re-registers the color provider so open editors refresh their swatches without a window reload.

## Architecture

```text
src/
  extension.ts       Activation, provider registration, config refresh
  colorParser.ts     Language-independent scanner and grammar recognition
  colorConverter.ts  Color math, CSS color spaces and textual formatting
  colorFilters.ts    CSS selector / named-color context filtering
  colorProvider.ts   DocumentColorProvider and provider registration behavior
  namedColors.ts     CSS named-color table and reverse lookup
  commands.ts        Native picker fallback + format conversion command
  config.ts          Settings reading, validation, ordering
  types.ts           Normalized RGBA model, syntax/style metadata
test/
  unit/              Parser and converter tests (plain Node/Mocha)
  integration/       VS Code extension-host tests
```

Parsing, conversion, and editor integration are independent. The parser and converter are pure TypeScript modules with no VS Code imports, so they are tested directly in Node.

The scanner walks the document once. Candidate starts are `#` tokens and identifier-like function calls; each candidate is validated with bounded sticky regular expressions. Named colors are found with a single keyword pass and merged without overlaps. Successful matches are consumed whole, preventing prefixes of longer invalid tokens from matching. Regexes and validation bounds also avoid catastrophic backtracking. Cancellation is checked during scans.

## Development and testing

```bash
npm install
npm run compile       # TypeScript build
npm run lint          # ESLint
npm test              # 73 unit tests
npm run test:integration  # 10 extension-host tests (downloads VS Code on first run)
npm run package       # produces yacp-0.1.0.vsix
```

Unit tests cover every HEX length, RGB/RGBA/HSL/HSLA/HWB, LAB/LCH/OKLAB/OKLCH/`color()` and `hex()` parsing, named colors, CSS context filters, valid/invalid input, clamping, boundaries and false positives, multiple colors, embedded text, incomplete values, alpha conversion, style preservation, color math, and format round trips.

Integration tests verify activation, universal detection across many language IDs (including an unknown custom language), a real file on disk, modern color spaces, exact ranges including multi-line functions, live updates after edits, preservation/conversion presentations, minimal edits, alpha conversion to HEX, and undo.

### Current test status

- TypeScript compilation: passing
- ESLint: passing
- Unit tests: **73 passing**
- Integration tests: **10 passing** (VS Code 1.142.0)

## Known limitations

- **VS Code controls swatch rendering and activation.** YACP supplies `ColorInformation`; the editor draws the swatch, places it before the literal, and opens the picker. Whether a click, hover, or both activate the picker is controlled by the built-in `editor.colorDecoratorActivatedOn` setting. Decorations are not clickable by extension code. The native in-editor swatch has no checkerboard layer: transparent colors are rendered as an RGBA fill blended with the editor background. The native picker's header does use a checkerboard opacity background.
- **The picker UI is VS Code's native picker.** Format choice uses `ColorPresentation` entries. The exact label/dropdown presentation depends on the VS Code version.
- **`YACP: Pick Color` uses a built-in command.** VS Code does not expose a public `showColorPicker` API. The fallback command invokes `editor.action.showOrFocusStandaloneColorPicker` (available in VS Code 1.90+), which uses registered color providers. If that command is unavailable, YACP offers the conversion command instead.
- **CSS/SCSS/LESS swatches are delegated to VS Code's built-in CSS provider.** Both providers would otherwise return the same ranges and render duplicate swatches. YACP's commands still parse and convert these files, and its non-CSS provider remains universal. This delegation requires VS Code's bundled CSS language-features extension; if that extension is disabled, YACP commands still work but those four languages have no swatches. YACP's picker-format settings and `yacp.namedColors` cannot override the built-in CSS provider's presentations in those languages.
- **Ambiguous text remains inherently ambiguous.** YACP filters CSS ID selectors/selector lists and URL fragments, and in `auto` mode named colors must look like CSS values. A plain-text hash or a color-like word in prose can still be a valid color literal; colors inside comments and strings are detected by design.
- **Some CSS Color 5 syntax is intentionally not recognized:** relative colors (`rgb(from …)`), `none` channel keywords, system colors, `currentColor`, and `color()` spaces other than `srgb`, `srgb-linear`, and `display-p3`.
- **Wide-gamut colors are gamut-clipped.** YACP normalizes every color to sRGB. Colors from `display-p3`, LAB/LCH or OKLAB/OKLCH that lie outside the sRGB gamut are clipped for display and may not round-trip to the exact original wide-gamut coordinates when preserved.
- **`yacp.namedColors: always` can produce false positives** because color words are common identifiers in prose and code. `auto` is the default for this reason.
- **VS Code's color decorator limit applies.** `editor.colorDecoratorsLimit` (default 500) limits how many swatches are rendered per editor. Detection is not limited, but rendering is.
- **Read-only documents** can display swatches, but applying edits fails; YACP reports an error.

## License

MIT. See the `LICENSE` file in the project root.
