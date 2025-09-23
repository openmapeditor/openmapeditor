// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

const APP_NAME = "OpenMapEditor";
const APP_SHORT_NAME = "OpenMapEditor";
// prettier-ignore
const APP_DESCRIPTION = "OpenMapEditor is a simple, powerful web-based editor for creating, viewing, and managing geographic data like paths and markers. Built with Leaflet.js, it supports interactive drawing, file import/export (GPX, KML, KMZ), routing, elevation profiles, custom styling, and Strava activity integration.";
// prettier-ignore
const APP_SHORT_DESCRIPTION = "A simple, powerful web-based editor for creating, viewing, and managing geographic data like paths and markers, built with Leaflet.js.";
const APP_DOMAIN = "www.openmapeditor.com"; // Used for Strava setup instructions

/**
 * Converts a CSS hex color (#RRGGBB) to a KML color (AABBGGRR).
 * This logic is similar to the SaveColorToABGR function in Organic Maps' C++ code:
 * https://github.com/organicmaps/organicmaps/blob/master/libs/kml/serdes.cpp
 * It assumes full opacity (AA = FF).
 * @param {string} cssColor The CSS color string (e.g., "#E51B23").
 * @returns {string} The KML color string (e.g., "FF231BE5").
 */
function cssToKmlColor(cssColor) {
  const rr = cssColor.substring(1, 3);
  const gg = cssColor.substring(3, 5);
  const bb = cssColor.substring(5, 7);
  return `FF${bb}${gg}${rr}`.toUpperCase();
}

// --- START: Organic Maps Color Configuration ---
// Centralized configuration for the 16 Organic Maps colors.
// KML colors are generated automatically to match the format used by Organic Maps.
// The source for the CSS hex values can be found here:
// https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/dark/style.mapcss
// https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/light/style.mapcss
const ORGANIC_MAPS_COLORS_DATA = [
  { name: "Red", css: "#E51B23" },
  { name: "Pink", css: "#FF4182" },
  { name: "Purple", css: "#9B24B2" },
  { name: "DeepPurple", css: "#6639BF" },
  { name: "Blue", css: "#0066CC" },
  { name: "LightBlue", css: "#249CF2" },
  { name: "Cyan", css: "#14BECD" },
  { name: "Teal", css: "#00A58C" },
  { name: "Green", css: "#3C8C3C" },
  { name: "Lime", css: "#93BF39" },
  { name: "Yellow", css: "#FFC800" },
  { name: "Orange", css: "#FF9600" },
  { name: "DeepOrange", css: "#F06432" },
  { name: "Brown", css: "#804633" },
  { name: "Gray", css: "#737373" },
  { name: "BlueGray", css: "#597380" },
];

const ORGANIC_MAPS_COLORS = ORGANIC_MAPS_COLORS_DATA.map((color) => ({
  ...color,
  kml: cssToKmlColor(color.css),
}));
// --- END: Organic Maps Color Configuration ---

// --- START: Elevation API Configuration ---
// This variable will be dynamically set from localStorage in initializeMap()
let elevationProvider;

// Global setting to optionally downsample long paths for providers that support it (like Google).
const enablePreFetchDownsampling = true;

// Provider-specific point limits for downsampling.
// These are maximums to prevent API errors.
const ELEVATION_PROVIDER_CONFIG = {
  google: {
    // Google's hard limit is 512, 500 provides a safe buffer.
    limit: 500,
  },
  openTopo: {
    // OpenTopoData has URL length limits, 100 is a safe maximum.
    limit: 100,
  },
  mapbox: {
    // Mapbox Tilequery API is rate-limited, 100 is a safe maximum.
    limit: 100,
  },
};
// --- END: Elevation API Configuration ---

// Global settings
let enablePathSimplification = localStorage.getItem("enablePathSimplification") !== "false";

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
