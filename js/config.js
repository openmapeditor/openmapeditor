// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

const APP_NAME = "OpenMapEditor";
const APP_SHORT_NAME = "OpenMapEditor";
// prettier-ignore
const APP_DESCRIPTION = "OpenMapEditor is a simple, powerful web-based editor for creating, viewing, and managing geographic data like paths and markers. Built with Leaflet.js, it supports interactive drawing, file import/export (GPX, KML, KMZ), routing, elevation profiles, custom styling, and Strava activity integration.";
// prettier-ignore
const APP_SHORT_DESCRIPTION = "A simple, powerful web-based editor for creating, viewing, and managing geographic data like paths and markers, built with Leaflet.js.";
const APP_DOMAIN = "www.openmapeditor.com"; // Used for Strava setup instructions

// --- START: Organic Maps Color Configuration ---
// Centralized configuration for the 16 Organic Maps colors.
// Maps KML (AABBGGRR) colors to CSS (#RRGGBB).
// Found the CSS colors here:
// https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/dark/style.mapcss
// https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/light/style.mapcss
const ORGANIC_MAPS_COLORS = [
  { name: "Red", kml: "FF231BE5", css: "#E51B23" },
  { name: "Pink", kml: "FF8241FF", css: "#FF4182" },
  { name: "Purple", kml: "FFB2249B", css: "#9B24B2" },
  { name: "DeepPurple", kml: "FFBF3966", css: "#6639BF" },
  { name: "Blue", kml: "FFCC6600", css: "#0066CC" },
  { name: "LightBlue", kml: "FFF29C24", css: "#249CF2" },
  { name: "Cyan", kml: "FFCDBE14", css: "#14BECD" },
  { name: "Teal", kml: "FF8CA500", css: "#00A58C" },
  { name: "Green", kml: "FF3C8C3C", css: "#3C8C3C" },
  { name: "Lime", kml: "FF39BF93", css: "#93BF39" },
  { name: "Yellow", kml: "FF00C8FF", css: "#FFC800" },
  { name: "Orange", kml: "FF0096FF", css: "#FF9600" },
  { name: "DeepOrange", kml: "FF3264F0", css: "#F06432" },
  { name: "Brown", kml: "FF334680", css: "#804633" },
  { name: "Gray", kml: "FF737373", css: "#737373" },
  { name: "BlueGray", kml: "FF807359", css: "#597380" },
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
