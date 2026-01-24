# Color System Refactor

## Goals

**Main Objective:**

- **Accept any hex or CSS color name on import** - supports all 140 CSS color names plus any hex value
- **Store as hex internally** - no color name mapping needed
- **Show custom swatch for colors outside my 16-color picker palette**
- **Export hex values** - preserves exact colors
- **Default to Crimson (#DC143C) if color can't be parsed**

**Additional Goals:**

1. **Switch to CSS standard colors** - 16 colors with official CSS names and hex values for the picker palette
2. **Support custom colors** - preserve imported colors that don't match the 16-color palette
3. **Parse 140 CSS color names on import** - not just hex values
4. **Remove Organic Maps dependency** - no external icon URLs in KML export
5. **No backwards compatibility** - clean slate

---

## What Changed

### Architecture

- **Before:** `feature.properties.colorName = "Pink"` (then lookup hex from array)
- **After:** `feature.properties.color = "#FFC0CB"` (store hex directly)

### New Files

- **`js/color-utils.js`** - 140 CSS color names mapping + parsing utilities
  - `normalizeHexColor()` - handles #RGB, #RRGGBB, #AARRGGBB formats
  - `parseColor()` - parses CSS color names or hex values
  - `cssToKmlColor()` - converts CSS hex to KML AABBGGRR format

### Modified Files

- **`js/config.js`** - New `COLOR_PALETTE` with 16 CSS colors + `DEFAULT_COLOR`
- **`js/file-handlers.js`** - Updated import/export for all formats (GPX, KML, GeoJSON)
- **`js/ui-handlers.js`** - Custom color swatch support in picker
- **`js/map-interactions.js`** - Use `color` property for rendering
- **`js/main.js`**, **`js/routing.js`**, **`js/strava.js`**, **`js/utils.js`** - Updated to use hex colors
- **`index.html`** - Added script tag for color-utils.js

---

## Test Cases

1. ✅ Import GeoJSON with `"stroke": "#FF4182"` → shows as custom color
2. ✅ Import GeoJSON with `"stroke": "pink"` → parses to `#FFC0CB`
3. ✅ Import GeoJSON with `"marker-color": "rebeccapurple"` → parses to `#663399`
4. ✅ Import KML with `styleUrl="#placemark-blue"` → parses to blue hex
5. ✅ Export GeoJSON → uses stored hex in `stroke`/`marker-color`
6. ✅ Export KML markers → inline style with color
7. ✅ Draw new feature → defaults to Crimson (`#DC143C`)
8. ✅ Change color via picker → updates `color` property to selected hex
9. ✅ Custom colors show in picker with special swatch

---

## Reference

For implementation details, see:

- [MDN CSS Color Values](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value)
- Source code in `js/color-utils.js` and `js/config.js`
