// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// --- START: Organic Maps Color Configuration ---
// Centralized configuration for the 16 Organic Maps colors.
// KML format is AABBGGRR, which we convert to standard CSS #RRGGBB.
const ORGANIC_MAPS_COLORS = [
  { name: "Red", kml: "ff231be5", css: "#e51b23" },
  { name: "Blue", kml: "ffc76e00", css: "#006ec7" },
  { name: "Purple", kml: "ffb0279c", css: "#9c27b0" },
  { name: "Yellow", kml: "ff00c8ff", css: "#ffc800" },
  { name: "Pink", kml: "ff8241ff", css: "#ff4182" },
  { name: "Brown", kml: "ff485579", css: "#795548" },
  { name: "Green", kml: "ff3c8e38", css: "#388e3c" },
  { name: "Orange", kml: "ff00a0ff", css: "#ffa000" },
  { name: "DeepPurple", kml: "ffbf3966", css: "#6639bf" },
  { name: "LightBlue", kml: "fff29c24", css: "#249cf2" },
  { name: "Cyan", kml: "ffcdbe14", css: "#14becd" },
  { name: "Teal", kml: "ff8ca500", css: "#00a58c" },
  { name: "Lime", kml: "ff39bf93", css: "#93bf39" },
  { name: "DeepOrange", kml: "ff3264f0", css: "#f06432" },
  { name: "Gray", kml: "ff737373", css: "#737373" },
  { name: "BlueGray", kml: "ff807359", css: "#597380" },
];
// --- END: Organic Maps Color Configuration ---

// --- START: Elevation API Configuration ---
// This variable will be dynamically set from localStorage in initializeMap()
let elevationProvider;

// Global setting to downsample long paths BEFORE sending to the elevation service.
// This can help avoid hitting API limits and reduce costs. Set to false if you want
// to send all points of a path to the provider (up to provider limits).
const enablePreFetchDownsampling = true;
const MAX_DOWNSAMPLE_POINTS = 500; // Max points after downsampling (Google's hard limit is 512 per request)
// --- END: Elevation API Configuration ---

// Global settings
let enablePathSimplification = true;

// --- NEW: Centralized Style Configuration ---
const STYLE_CONFIG = {
  path: {
    default: {
      weight: 10,
      opacity: 0.75,
    },
    highlight: {
      weight: 10,
      opacity: 1,
      outline: {
        enabled: true,
        color: "black",
        weightOffset: 4, // Final weight will be highlight.weight + weightOffset
      },
    },
  },
  marker: {
    baseSize: 50, // Base width of marker in pixels - MUST match font-size in .material-symbols-map-marker
    default: {
      opacity: 0.75,
    },
    highlight: {
      opacity: 1,
      outline: {
        enabled: true,
        color: "black",
        sizeOffset: 4, // Final size will be baseSize + sizeOffset
        // A negative Y offset moves the anchor up on the icon, making the icon render lower on the map.
        anchorOffsetY: -4, // Vertical offset in pixels for the outline effect
      },
    },
  },
};
// --- END NEW ---

// Centralized color configuration
const rootStyles = getComputedStyle(document.documentElement);

const routingColorStart = rootStyles.getPropertyValue("--routing-color-start").trim();
const routingColorEnd = rootStyles.getPropertyValue("--routing-color-end").trim();
const routingColorVia = rootStyles.getPropertyValue("--routing-color-via").trim();

const colorScheme = {
  drawn: {
    primary: rootStyles.getPropertyValue("--color-magenta").trim(),
    highlight: rootStyles.getPropertyValue("--color-magenta").trim(),
  },
  imported: {
    primary: rootStyles.getPropertyValue("--color-orange").trim(),
    highlight: rootStyles.getPropertyValue("--color-orange").trim(),
  },
  kmz: {
    primary: rootStyles.getPropertyValue("--color-blue").trim(),
    highlight: rootStyles.getPropertyValue("--color-blue").trim(),
  },
  route: {
    primary: rootStyles.getPropertyValue("--color-magenta").trim(),
    highlight: rootStyles.getPropertyValue("--color-magenta").trim(),
  },
};

// --- Simplification Settings ---

// Simplification settings for IMPORTED PATHS (GPX, KML, KMZ).
// These files can be very dense, so a moderate simplification is often helpful.
const pathSimplificationConfig = {
  // The tolerance for simplification in decimal degrees. A higher value means more simplification.
  // Note: 0.00005 degrees is roughly 5.5 meters at the equator.
  TOLERANCE: 0.00015,
  // Paths with a point count at or below this number will not be simplified.
  MIN_POINTS: 100,
};

// Simplification settings for GENERATED ROUTES.
// Routes from engines like OSRM are often algorithmically generated and can benefit from
// a slightly more aggressive simplification to reduce point count without losing shape.
const routeSimplificationConfig = {
  TOLERANCE: 0.00015,
  MIN_POINTS: 100,
};
