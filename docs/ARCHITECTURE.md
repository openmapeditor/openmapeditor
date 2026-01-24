# System Architecture & Data Specifications

**Complete documentation of the system architecture, file handling, and internal data structures.**

---

## Table of Contents

1. [Vision](#vision)
2. [Document Organization](#document-organization)
3. [System Architecture](#system-architecture)
4. [Data Storage](#data-storage)
5. [Format Compatibility Matrix](#format-compatibility-matrix)
6. [Coordinate Precision](#coordinate-precision)
7. [Color System](#color-system)
8. [Import System](#import-system)
9. [Export System](#export-system)
10. [URL Sharing System](#url-sharing-system)
11. [Performance & Optimization](#performance--optimization)
12. [Error Handling & Validation](#error-handling--validation)
13. [Dependencies](#dependencies)
14. [WMS Layers System](#wms-layers-system)
15. [Editing Behavior](#editing-behavior)
16. [Known Limitations](#known-limitations)

---

## Vision

All imported and drawn items store **full-precision coordinates**, **name**, **description**, **color**, and **stravaId** (if available).

All formats (GeoJSON, GPX, KML, KMZ) are fully compatible - data imported in one format can be exported to any other format without data loss.

**Property edits** (name, color) work on all items without duplication. **Geometry edits** require duplication to the drawing layer (via the "Duplicate" button). **Custom colors** are preserved as hex values for maximum compatibility.

---

## Document Organization

OpenMapEditor is a **Vanilla JavaScript** application with modular organization.

### Core Modules

| Script                 | Responsibility                                                                                  |
| :--------------------- | :---------------------------------------------------------------------------------------------- |
| `main.js`              | **Entry Point**. Orchestrates map initialization, global event listeners, and layer management. |
| `config.js`            | App-wide constants, styling defaults, and color palette definitions.                            |
| `color-utils.js`       | Color parsing and conversion utilities (140 CSS color names, hex normalization, KML format).    |
| `file-handlers.js`     | Complex I/O logic for GeoJSON, GPX, KML, and KMZ.                                               |
| `ui-handlers.js`       | Manages the Sidebar, Contents tab, and interactive UI elements.                                 |
| `elevation.js`         | Data fetching logic for Google and GeoAdmin (Swiss) elevation APIs.                             |
| `elevation-profile.js` | UI rendering of the D3-powered elevation chart.                                                 |
| `routing.js`           | Integration with routing engines and waypoint management.                                       |
| `strava.js`            | Oauth flow and activity fetching from Strava API.                                               |
| `utils.js`             | Geometry calculations (distance, area) and common helpers.                                      |

---

## System Architecture

### Application Flow

1. **Entry Point**: `index.html` loads bundled scripts.
2. **Initialization**: On `DOMContentLoaded`, `js/main.js` calls `initializeMap()`.
3. **Map Setup**: Leaflet instances, panes, and FeatureGroups are created.
4. **State Restoration**: Maps view and shared features are restored from URL hash or localStorage.
5. **Event Handling**: Global listeners for map interactions, UI tabs, and file uploads are attached.

### Global State Management

The application uses **Global Variables** in `main.js` as the single source of truth for the map state:

- `map`: The Leaflet map instance.
- `drawnItems` / `importedItems`: Primary feature storage.
- `globallySelectedItem`: Currently active layer for editing/info display.

---

## Data Storage

### Layer Groups (Leaflet FeatureGroups)

All map features are managed in specific [Leaflet FeatureGroups](https://github.com/openmapeditor/openmapeditor/search?q=L.featureGroup+path:js/main.js) to maintain clear separation:

| Layer Group             | Purpose                                                  | Can Edit Geometry?   |
| :---------------------- | :------------------------------------------------------- | :------------------- |
| `drawnItems`            | User-drawn features (markers, paths, areas)              | ✅ Yes               |
| `importedItems`         | All imported files (GeoJSON, GPX, KML, KMZ)              | ❌ No (Read-only)    |
| `editableLayers`        | Subset of `drawnItems` - only these link to Leaflet.Draw | ✅ Yes               |
| `stravaActivitiesLayer` | Live Strava activity data                                | ❌ No                |
| `currentRoutePath`      | Active routing result (Polyline)                         | ⚠️ Via routing panel |

### Feature Structure

Every layer (Path, Area, or Marker) has a [`.feature` object](https://github.com/openmapeditor/openmapeditor/search?q=layer.feature+path:js/) following the GeoJSON structure:

```javascript
layer.feature = {
  properties: {
    name: "string",           // User-editable, defaults to "Marker"/"Path"/"Area"
    description: "string",    // Optional, preserved in all exports
    color: "#DC143C",         // Hex color value (CSS standard colors or custom)
    stravaId: "123456789",    // Optional, preserved from Strava/import
    totalDistance: 1234.56    // Calculated internally, excluded from standard exports
  },
  geometry: {
    type: "Point" | "LineString" | "Polygon",
    coordinates: [[lng, lat, alt?], ...]  // Full JS precision (~15 digits)
  }
}
```

### Layer Metadata

Beyond the GeoJSON object, [layers store additional metadata](https://github.com/openmapeditor/openmapeditor/search?q=layer.pathType+path:js/) at runtime:

```javascript
layer.pathType = "drawn" | "gpx" | "kml" | "kmz" | "geojson" | "route" | "strava";
layer.originalKmzPath = "files/routes.kml"; // For KMZ structure preservation
layer.isManuallyHidden = false; // Visibility override (Eye icon)
layer.isDeletedFromToolbar = true; // Flag for toolbar synchronization
```

**Note:** `editableLayers` contains only layers from `drawnItems` that are actively linked to Leaflet.Draw for geometry editing. All visual rendering comes from `drawnItems`.

---

## Format Compatibility Matrix

| Property              | GeoJSON                      | GPX                    | KML/KMZ                     |
| :-------------------- | :--------------------------- | :--------------------- | :-------------------------- |
| **Coordinates**       | ✅ Full precision            | ✅ Full precision      | ✅ Full precision           |
| **Name**              | ✅ `properties.name`         | ✅ `<name>`            | ✅ `<name>`                 |
| **Description**       | ✅ `properties.description`  | ✅ `<desc>`            | ✅ `<description>`          |
| **Color**             | ✅ `stroke` / `marker-color` | ✅ `<gpx_style:color>` | ✅ `<color>` / `<styleUrl>` |
| **StravaId**          | ✅ `properties.stravaId`     | ✅ `<extensions>`      | ✅ `<ExtendedData>`         |
| **Elevation**         | ✅ Coordinates[2]            | ✅ `<ele>`             | ✅ Coordinates (3rd value)  |
| **Custom Properties** | ✅ All preserved             | ❌ Not supported       | ⚠️ Via ExtendedData         |

---

## Coordinate Precision

| Context              | Precision      | Format                                         |
| :------------------- | :------------- | :--------------------------------------------- |
| **Internal Storage** | Full precision | JavaScript Number (~15 significant digits)     |
| **GeoJSON Export**   | Full precision | Manually extracted from geometry               |
| **GPX Export**       | Full precision | From `getLatLng()` coordinates                 |
| **KML Export**       | Full precision | Serialized from coordinate array               |
| **URL Sharing**      | 5 decimals     | ~1.1m accuracy, Polyline encoded (Precision 5) |

**Elevation Handling:**

- Stored as the third coordinate element: `[lng, lat, alt]`
- GPX: Exported using `<ele>` tags within `<trkpt>` or `<wpt>`
- KML: Part of the coordinate string `lng,lat,alt`
- Elevation is preserved through all import/export round-trips

---

## Color System

### Architecture

The app uses a **hex-based color system** for maximum flexibility and compatibility:

- **Internal Storage**: Colors stored as hex values (e.g., `"#DC143C"`) in `feature.properties.color`
- **Import Support**: Accepts all 140 CSS color names (e.g., "rebeccapurple", "crimson") plus any custom hex value
- **Export**: Outputs hex values in format-native properties (e.g., `stroke`, `marker-color`, `<color>`)
- **Default Color**: `#DC143C` (Crimson) when color cannot be parsed

### Color Picker Palette

The UI color picker displays **16 CSS standard colors** defined in `COLOR_PALETTE` in [js/config.js](https://github.com/openmapeditor/openmapeditor/blob/main/js/config.js).

### Custom Color Support

Colors outside the 16-color palette are fully supported:

1. **Import**: Any CSS color name or hex value is accepted and preserved exactly
2. **Display**: Custom colors show in a special "custom color swatch" in the picker
3. **Export**: Exact hex values are preserved in all export formats

### Color Utilities

Color parsing and conversion handled by [js/color-utils.js](https://github.com/openmapeditor/openmapeditor/blob/main/js/color-utils.js):

- `parseColor()`: Converts CSS color names or hex values to normalized `#RRGGBB` format
- `normalizeHexColor()`: Handles #RGB, #RRGGBB, #AARRGGBB formats
- `cssToKmlColor()`: Converts CSS hex to KML `AABBGGRR` format

---

## Import System

GPX and KML are converted to GeoJSON using the [`toGeoJSON`](https://github.com/mapbox/togeojson) library.

**Entry Points:**

- **GeoJSON**: [`importGeoJsonFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importGeoJsonFile+path:js/file-handlers.js)
- **GPX**: [`importGpxFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importGpxFile+path:js/file-handlers.js)
- **KML**: [`importKmlFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importKmlFile+path:js/file-handlers.js)
- **KMZ**: [`importKmzFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importKmzFile+path:js/file-handlers.js)

1. **Validation**: Filters for supported geometry types (Point, LineString, Polygon).
2. **Enrichment**: Extracts `stravaId` and `color` from format-specific extensions.
3. **Integration**: Features added to `importedItems`.

### Strava Import

Strava activities are decoded from the API's `summary_polyline` field using the **Google Polyline Algorithm** (Precision 5, same as URL sharing). Activities are added to `stravaActivitiesLayer` with read-only geometry.

---

## Export System

### GeoJSON Export

[`exportGeoJson`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:exportGeoJson+path:js/file-handlers.js) exports all or selected items:

- Injects standard GeoJSON styling properties (`stroke`, `fill`, `marker-color`) for compatibility with external tools (e.g., geojson.io)
- Excludes internal properties like `totalDistance`

### GPX Export

[`convertLayerToGpx`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:convertLayerToGpx+path:js/file-handlers.js) converts layers to GPX format:

- Markers become `<wpt>` (waypoints)
- Paths and Areas become `<trk>` (tracks)
- Colors stored in `<gpx_style:color>` extension (6-character hex without # prefix)
- `stravaId` stored in `<extensions>` block

### KMZ Export

[`exportKmz`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:exportKmz+path:js/file-handlers.js) creates structured KMZ archives:

- **Structure Preservation**: If features were imported from KMZ, the original file structure is preserved (grouped by `originalKmzPath`)
- **File Organization**:
  - `doc.kml` (root file with NetworkLink references)
  - `files/Drawn_Features.kml`
  - `files/Imported_Features.kml`
  - `files/Strava_Activities.kml`

---

## URL Sharing System

Encodes map state into a compressed string parameter (`&data=`).

1. **Polyline Encoding**: Coordinates compressed (Precision 5) via [Leaflet.encoded](https://github.com/jieter/Leaflet.encoded).
2. **Minification**: Property names shortened (`n` for name, `s` for style, `t` for type, `sid` for stravaId).
3. **Omission**: Default values (e.g., Crimson color) and empty fields are excluded.
4. **LZ-String**: JSON payload is compressed for URI safety.

**Size Limits**: The app warns at 2,000 characters; Chrome supports URLs up to 2MB.

---

## Performance & Optimization

### Elevation Caching

The application implements an **Elevation Cache** (`Map` object in `elevation.js`) to prevent redundant API calls for the same coordinates.

- **Adaptive Sampling**:
  - **Google**: Upsamples low-density paths to 200 points; caps high-density paths at 5,000 points.
  - **GeoAdmin**: Batches large tracks into 3,000-point chunks to satisfy backend limits.

### Geometry Optimization

- **Path Simplification**: During duplication, tracks are optimized using the Douglas-Peucker algorithm (`simplify.js`) with a `0.00015` degree tolerance (~15m).
- **Lazy Rendering**: Elevation profiles are only rendered when the profile panel is toggled visible.

---

## Error Handling & Validation

### Validation Layers

1. **File Type**: Client-side extension filtering (`.gpx`, `.kml`, etc.).
2. **Structure**: Schema validation for GeoJSON (checks for `type` and `features`).
3. **Geometry**: filtering for Point, LineString, and Polygon only.
4. **API States**: Real-time monitoring of Google Maps and Strava API availability.
5. **Coordinate Limits**: Swiss elevation queries are validated against the LV95 bounding box.

### Error UI

All errors are handled via **SweetAlert2** modals, providing user-friendly explanations for common failures (CORS issues, invalid XML, API rate limits).

---

## Dependencies

For a complete list of external libraries and plugins with versions, see [Plugins & Libraries Used](https://github.com/openmapeditor/openmapeditor#plugins--libraries-used) in the README.

---

## WMS Layers System

Users can import custom Web Map Service layers.

- **z-Index Control**: Managed via a dedicated `wmsPane` (z-index 250), keeping them above base maps but below user content.
- **Persistence**: Reordered layers and visibility states are stored in `localStorage`.

---

## Editing Behavior

### Property vs. Geometry

- **Read-Only Geometry**: Imported files and Strava activities cannot have their points moved directly. This prevents accidental corruption of source data.
- **Editable Properties**: You can change the `name` and `color` of any item (drawn or imported) at any time.

### Duplication Flow

To edit the geometry of an imported item:

1. Go to the **Contents** tab
2. Click the **Duplicate** (copy) icon next to the item
3. A copy is created in the "Drawn Items" group
4. The copy is fully editable (geometry and properties)
5. Optional path simplification is applied during duplication

---

## Known Limitations

- **Multi-Geometries**: Native editing is not supported (automatically exploded into individual Points, LineStrings, and Polygons on import). See [`SUPPORTED_IMPORT_GEOM_TYPES` constant](https://github.com/openmapeditor/openmapeditor/search?q=SUPPORTED_IMPORT_GEOM_TYPES+path:js/file-handlers.js).
- **Off-grid Elevation**: The GeoAdmin service is restricted to the Swiss border.

---

## Summary

OpenMapEditor uses **GeoJSON as the internal truth** with robust translators for GPX and KML. It balances high-precision data preservation with web performance through intelligent sampling, caching, and compression.
