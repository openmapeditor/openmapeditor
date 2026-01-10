# System Architecture & Data Specifications

**Complete documentation of the system architecture, file handling, and internal data structures.**

---

## Table of Contents

1. [Vision](#vision)
2. [Data Storage](#data-storage)
3. [Format Compatibility Matrix](#format-compatibility-matrix)
4. [Coordinate Precision](#coordinate-precision)
5. [Color System](#color-system)
6. [Import System](#import-system)
7. [Export System](#export-system)
8. [URL Sharing System](#url-sharing-system)
9. [WMS Layers System](#wms-layers-system)
10. [Editing Behavior](#editing-behavior)
11. [Known Issues](#known-issues)

---

## Vision

All imported and drawn items store **full-precision coordinates**, **name**, **description**, **color**, and **stravaId** (if available).

All formats (GeoJSON, GPX, KML, KMZ) are fully compatible - data imported in one format can be exported to any other format without data loss.

**Property edits** (name, color) work on all items without duplication. **Geometry edits** require duplication to the drawing layer (via the "Duplicate" button in the Contents tab). **Non-palette colors** default to Red on import and export for maximum compatibility.

---

## Data Storage

### Layer Groups (Leaflet FeatureGroups)

All map features are managed in specific [Leaflet FeatureGroups](https://github.com/openmapeditor/openmapeditor/search?q=L.featureGroup+path:js/main.js) to maintain clear separation:

| Layer Group             | Purpose                                                  | Can Edit Geometry?   |
| ----------------------- | -------------------------------------------------------- | -------------------- |
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
    colorName: "Red",         // One of 16 ORGANIC_MAPS_COLORS
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

Beyond the GeoJSON object, layers store additional runtime metadata:

```javascript
layer.pathType = "drawn" | "gpx" | "kml" | "kmz" | "geojson" | "route" | "strava";
layer.originalKmzPath = "files/routes.kml"; // For KMZ structure preservation
layer.isManuallyHidden = false; // Visibility override (Eye icon)
layer.isDeletedFromToolbar = true; // Flag for toolbar synchronization
```

---

## Format Compatibility Matrix

| Property              | GeoJSON                      | GPX                    | KML/KMZ                     |
| --------------------- | ---------------------------- | ---------------------- | --------------------------- |
| **Coordinates**       | ✅ Full precision            | ✅ Full precision      | ✅ Full precision           |
| **Name**              | ✅ `properties.name`         | ✅ `<name>`            | ✅ `<name>`                 |
| **Description**       | ✅ `properties.description`  | ✅ `<desc>`            | ✅ `<description>`          |
| **Color**             | ✅ `colorName` + Style props | ✅ `<gpx_style:color>` | ✅ `<color>` / `<styleUrl>` |
| **StravaId**          | ✅ `properties.stravaId`     | ✅ `<extensions>`      | ✅ `<ExtendedData>`         |
| **Elevation**         | ✅ Coordinates[2]            | ✅ `<ele>`             | ✅ Coordinates (3rd value)  |
| **Custom Properties** | ✅ All preserved             | ❌ Not supported       | ⚠️ Via ExtendedData         |

---

## Coordinate Precision

| Context              | Precision      | Format                                     |
| -------------------- | -------------- | ------------------------------------------ |
| **Internal Storage** | Full precision | JavaScript Number (~15 significant digits) |
| **GeoJSON Export**   | Full precision | Manually extracted from geometry           |
| **GPX Export**       | Full precision | From `getLatLng()` coordinates             |
| **KML Export**       | Full precision | Serialized from coordinate array           |
| **URL Sharing**      | 5 decimals     | ~1.1m accuracy, Polyline encoded           |

**Elevation handling:**

- Stored as the third coordinate element: `[lng, lat, alt]`.
- GPX: Exported using `<ele>` tags within `<trkpt>` or `<wpt>`.
- KML: Part of the coordinate string `lng,lat,alt`.
- Elevation is preserved through all import/export round-trips.

---

## Color System

### Palette

The app uses **16 Organic Maps Colors** defined in `ORGANIC_MAPS_COLORS` in [js/config.js](https://github.com/openmapeditor/openmapeditor/blob/main/js/config.js) (e.g., Red, Pink, Purple, Blue, etc.).

Each color has three representations:

- **`name`**: String ID (e.g., `"Red"`).
- **`css`**: Hex format for standard web/GeoJSON (e.g., `"#E51B23"`).
- **`kml`**: `AABBGGRR` hex format for KML compatibility (e.g., `"FF231BE5"`).

### Color Matching Logic

1.  **Direct Match**: Checks for `colorName` property (optimal for round-trips).
2.  **Hex Match**: Scans incoming style hex codes against our CSS palette.
3.  **Defaulting**: If no match is found, it defaults to **Red**.

---

## Import System

**File:** [js/file-handlers.js](https://github.com/openmapeditor/openmapeditor/blob/main/js/file-handlers.js)

### Supported Formats & Entry Points

- **GeoJSON** (`.geojson`, `.json`): [`importGeoJsonFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importGeoJsonFile+path:js/file-handlers.js)
- **GPX** (`.gpx`): [`importGpxFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importGpxFile+path:js/file-handlers.js)
- **KML** (`.kml`): [`importKmlFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importKmlFile+path:js/file-handlers.js)
- **KMZ** (`.kmz`): [`importKmzFile(file)`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:importKmzFile+path:js/file-handlers.js)

### Import Strategy

1.  **toGeoJSON**: GPX and KML are converted to GeoJSON using the [`toGeoJSON`](https://github.com/mapbox/togeojson) library.
2.  **Validation**: Filters for supported geometry types (Point, LineString, Polygon).
3.  **Enrichment**: Extracts `stravaId` and `colorName` from format-specific extensions.
4.  **Integration**: Features are added to the `importedItems` group and the global contents list.

---

## Export System

**File:** [js/file-handlers.js](https://github.com/openmapeditor/openmapeditor/blob/main/js/file-handlers.js)

### GeoJSON Export ([`exportGeoJson`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:exportGeoJson+path:js/file-handlers.js))

- Exports all or selected items.
- Injects standard GeoJSON styling properties (`stroke`, `fill`, `marker-color`) for compatibility with external tools (like geojson.io).
- Excludes calculated metadata like `totalDistance`.

### GPX Export ([`convertLayerToGpx`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:convertLayerToGpx+path:js/file-handlers.js))

- Markers become `<wpt>` (waypoints).
- Paths and Areas become `<trk>` (tracks).
- Colors are stored in the `<gpx_style:color>` extension.
- `stravaId` is stored in the `<extensions>` block.

### KMZ Export ([`exportKmz`](https://github.com/openmapeditor/openmapeditor/search?q=symbol:exportKmz+path:js/file-handlers.js))

- **Structure Preservation**: If features were imported from a KMZ, the app preserves the original file structure (grouped by `originalKmzPath`).
- **File Organization**:
  - `files/Drawn_Features.kml`
  - `files/Imported_Features.kml`
  - `files/Strava_Activities.kml`
- **doc.kml**: The root file uses `<NetworkLink>` to reference child KML files.

---

## URL Sharing System

The "Share Map" feature encodes the entire map state into an LZ-String compressed URL parameter (`&data=`).

**Encoding Pipeline:**

1.  **Coordinate Compression**: Coordinates are encoded using the **Google Polyline Algorithm** (Precision 5) via [Leaflet.encoded](https://github.com/jieter/Leaflet.encoded/blob/0.0.9/Polyline.encoded.js).
2.  **Property Minification**: Property names are shortened (`n` for name, `s` for style, `t` for type).
3.  **Omission**: Defaults (like color "Red") and empty fields are omitted.
4.  **LZ-String**: The resulting JSON is compressed into a URI-safe string.

This allows sharing complex maps with multiple paths and markers while staying within most URL length limits.

---

## WMS Layers System

**File:** [js/wms-import.js](https://github.com/openmapeditor/openmapeditor/blob/main/js/wms-import.js)

Users can import custom WMS (Web Map Service) layers.

- **Persistence**: Layer definitions are saved in `localStorage`.
- **Order**: Layers are sortable in the layer control; order is persisted.
- **Z-Index**: WMS layers are kept in a dedicated `wmsPane` (z-index 250) but always remain below the "User Content" layers (markers/paths).

---

## Editing Behavior

### Property vs. Geometry

- **Read-Only Geometry**: Imported files and Strava activities cannot have their points moved directly. This prevents accidental corruption of source data.
- **Editable Properties**: You can change the `name` and `color` of _any_ item (drawn or imported) at any time.

### Duplication Flow

To edit the geometry of an imported item:

1.  Go to the **Contents** tab.
2.  Click the **Duplicate** (copy) icon next to the item.
3.  A copy is created in the "Drawn Items" group.
4.  The copy is fully editable (geometry and properties).

---

## Known Issues

### 1. Description Editing UI Missing

- **Status**: Valid.
- **Symptom**: Descriptions are imported and exported correctly but cannot be edited in the UI.
- **Planned Fix**: Add a text area for descriptions in the Info Panel ([js/ui-handlers.js](https://github.com/openmapeditor/openmapeditor/blob/main/js/ui-handlers.js)).

### 2. Multi-Geometry Filtering

- **Status**: Valid.
- **Symptom**: `MultiLineString` and `MultiPolygon` geometries are often simplified to single instances on import or filtered out.
- **Recommendation**: Map sources should use simple FeatureCollections for best results.

---

## Summary

The OpenMapEditor file system is designed around **GeoJSON as the internal truth** with robust translators for GPX and KML. By prioritizing coordinate precision and color matching, it ensures that your data remains consistent across different mapping ecosystems.
