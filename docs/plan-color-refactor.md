# Color System Refactor Plan

## Goals

1. **Switch to CSS standard colors** - 16 colors with official CSS names and hex values
2. **Support custom colors** - preserve imported colors that don't match the 16
3. **Parse 140 CSS color names on import** - not just hex values
4. **Remove Organic Maps dependency** - no external icon URLs in KML export
5. **No backwards compatibility** - clean slate

---

## Architecture Change

### Current: Name-based storage

```
feature.properties.colorName = "Pink"  // then lookup hex from ORGANIC_MAPS_COLORS
```

### New: Hex-based storage

```
feature.properties.color = "#FFC0CB"   // store hex directly
```

This is simpler because:

- No lookup needed for rendering
- Custom colors work naturally
- Export uses stored value directly

---

## File Structure

```
js/
├── config.js          // App config + 16-color palette + DEFAULT_COLOR
├── css-colors.js      // 140 color names + parseColor() + normalizeHexColor() (NEW)
├── file-handlers.js
├── map-interactions.js
├── ui-handlers.js
└── main.js
```

---

## File Changes

### 1. css-colors.js (NEW FILE)

Contains all 140 CSS color names → hex mapping and color parsing utilities.

```javascript
// All 140 CSS color names → hex
const CSS_COLOR_NAMES = {
  aliceblue: "#F0F8FF",
  antiquewhite: "#FAEBD7",
  aqua: "#00FFFF",
  // ... all 140 colors
  yellowgreen: "#9ACD32",
};

// Normalize hex color (handles #RGB, #RRGGBB, #AARRGGBB)
function normalizeHexColor(raw) { ... }

// Parse any color input (hex or name) to normalized hex
function parseColor(input) { ... }
```

---

### 2. config.js

**Remove:**

- `ORGANIC_MAPS_COLORS_DATA` (old OM colors)
- `ORGANIC_MAPS_COLORS` (with KML format)
- `cssToKmlColor()` function

**Add:**

```javascript
// 16 standard CSS colors for the picker palette
const COLOR_PALETTE = [
  { name: "red", hex: "#FF0000" },
  { name: "pink", hex: "#FFC0CB" },
  { name: "purple", hex: "#800080" },
  { name: "indigo", hex: "#4B0082" },
  { name: "blue", hex: "#0000FF" },
  { name: "lightblue", hex: "#ADD8E6" },
  { name: "cyan", hex: "#00FFFF" },
  { name: "teal", hex: "#008080" },
  { name: "green", hex: "#008000" },
  { name: "lime", hex: "#00FF00" },
  { name: "yellow", hex: "#FFFF00" },
  { name: "orange", hex: "#FFA500" },
  { name: "orangered", hex: "#FF4500" },
  { name: "brown", hex: "#A52A2A" },
  { name: "gray", hex: "#808080" },
  { name: "slategray", hex: "#708090" },
];

const DEFAULT_COLOR = "#FF0000"; // red

// Check if color is in the 16-color palette
function isInPalette(hex) {
  return COLOR_PALETTE.some((c) => c.hex.toLowerCase() === hex?.toLowerCase());
}
```

---

### 3. file-handlers.js

**Import changes:**

Replace `parseColorFromGeoJsonStyle()`:

```javascript
function parseColorFromGeoJsonStyle(properties) {
  const raw = properties?.stroke || properties?.["marker-color"];
  return parseColor(raw) || DEFAULT_COLOR;
}
```

Replace `parseColorFromKmlStyle()`:

```javascript
function parseColorFromKmlStyle(properties) {
  // Try styleUrl first (e.g., #placemark-red)
  if (properties.styleUrl) {
    const match = properties.styleUrl.match(/#placemark-(\w+)/i);
    if (match) {
      const parsed = parseColor(match[1]);
      if (parsed) return parsed;
    }
  }

  // Try inline stroke color
  if (properties.stroke) {
    return parseColor(properties.stroke) || DEFAULT_COLOR;
  }

  return DEFAULT_COLOR;
}
```

**Export changes (GeoJSON):**

- Already uses hex, just change property name from `colorName` lookup to direct `color` property

**Export changes (KML):**

For **lines/polygons** - already uses inline style, no change needed

For **markers** - replace external icon URL with inline IconStyle:

```xml
<Style>
  <IconStyle>
    <color>FF0000FF</color>  <!-- KML format: AABBGGRR -->
    <scale>1.0</scale>
    <Icon>
      <href>http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png</href>
    </Icon>
  </IconStyle>
</Style>
```

Or use a simple colored circle (no external dependency):

```xml
<Style>
  <IconStyle>
    <color>FF0000FF</color>
    <scale>1.0</scale>
    <Icon>
      <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
    </Icon>
  </IconStyle>
</Style>
```

**Remove:**

- `GEOJSON_EXPORT_EXCLUDED_PROPERTIES` entry for `colorName`
- References to `ORGANIC_MAPS_COLORS`

**Change property name:**

- `colorName` → `color` everywhere

---

### 4. ui-handlers.js

**`populateColorPicker()`** - Update to use `COLOR_PALETTE` and add custom swatch:

```javascript
function populateColorPicker() {
  colorPicker.innerHTML = ""; // Clear existing

  // Add 16 palette colors
  COLOR_PALETTE.forEach((color) => {
    const swatch = createSwatch(color.hex, color.name);
    colorPicker.appendChild(swatch);
  });

  // Add custom swatch placeholder (hidden initially)
  const customSwatch = document.createElement("div");
  customSwatch.id = "custom-color-swatch";
  customSwatch.className = "color-swatch";
  customSwatch.style.display = "none";
  customSwatch.title = "Custom color";
  colorPicker.appendChild(customSwatch);
}
```

**`updateColorPickerSelection()`** - Update to work with hex:

```javascript
function updateColorPickerSelection(hex) {
  const swatches = colorPicker.querySelectorAll(".color-swatch");
  const customSwatch = document.getElementById("custom-color-swatch");

  let matched = false;
  swatches.forEach((swatch) => {
    if (swatch.id === "custom-color-swatch") return;

    if (swatch.dataset.hex?.toLowerCase() === hex?.toLowerCase()) {
      swatch.classList.add("selected");
      matched = true;
    } else {
      swatch.classList.remove("selected");
    }
  });

  // Show custom swatch if color not in palette
  if (!matched && hex) {
    customSwatch.style.display = "block";
    customSwatch.style.backgroundColor = hex;
    customSwatch.dataset.hex = hex;
    customSwatch.classList.add("selected");
  } else {
    customSwatch.style.display = "none";
    customSwatch.classList.remove("selected");
  }
}
```

**`showInfoPanel()`** - Update color handling:

```javascript
const color = layer.feature?.properties?.color || DEFAULT_COLOR;
infoPanelColorSwatch.style.backgroundColor = color;
updateColorPickerSelection(color);
```

---

### 5. map-interactions.js

**Update rendering to use hex directly:**

- Change `colorName` references to `color`
- Use stored hex directly instead of looking up from palette

---

### 6. buildKmlDocument() in file-handlers.js

**Remove the shared styles block** that references omaps.app icons

**Use inline styles for each marker** with Google's generic icons or no external icons

---

## KML Marker Icon Options

Option A: **Google Maps icons** (reliable, well-supported)

```
http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png
http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png
```

Option B: **No icon, just color** (simplest, some apps may not render well)

```xml
<IconStyle>
  <color>FF0000FF</color>
</IconStyle>
```

Option C: **Data URI** (no external dependency, but verbose)

```xml
<Icon>
  <href>data:image/png;base64,...</href>
</Icon>
```

**Recommendation:** Option A with Google's circle icon - it's been stable for 15+ years and the color tint will still apply.

---

## Implementation Order

1. **css-colors.js** - Create new file with 140 color names + parseColor()
2. **config.js** - Replace color definitions with CSS standard palette
3. **file-handlers.js** - Update import parsing to use new system
4. **map-interactions.js** - Update rendering to use `color` property
5. **ui-handlers.js** - Update picker to show custom swatch
6. **file-handlers.js** - Update exports (GeoJSON, KML, GPX)
7. **index.html** - Add script tag for css-colors.js
8. **Test** - Import/export round-trips
9. **README.md** - Update any color/Organic Maps references
10. **Cleanup** - Remove this plan file, delete docs/reference/organicmaps if no longer needed

---

## Test Cases

1. Import GeoJSON with `"stroke": "#FF4182"` (OM pink) → shows as custom color
2. Import GeoJSON with `"stroke": "pink"` → parses to `#FFC0CB`
3. Import GeoJSON with `"marker-color": "rebeccapurple"` → parses to `#663399`
4. Import KML with `styleUrl="#placemark-blue"` → parses to blue hex
5. Export GeoJSON → uses stored hex in `stroke`/`marker-color`
6. Export KML markers → inline style with Google icon, no omaps.app reference
7. Draw new feature → defaults to red (`#FF0000`)
8. Change color via picker → updates `color` property to selected hex

---

## Files Summary

| File                        | Changes                                      |
| --------------------------- | -------------------------------------------- |
| js/css-colors.js            | NEW - 140 color names + parseColor utilities |
| js/config.js                | Replace color definitions with CSS standard  |
| js/file-handlers.js         | Update import/export, remove OM references   |
| js/map-interactions.js      | Use `color` property instead of `colorName`  |
| js/ui-handlers.js           | Update picker with custom swatch support     |
| index.html                  | Add script tag for css-colors.js             |
| README.md                   | Update color/OM references                   |
| docs/reference/organicmaps  | DELETE - no longer needed                    |
| docs/plan-color-refactor.md | DELETE - after merge                         |
| style.css                   | Maybe add custom swatch styling              |
