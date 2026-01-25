// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

const APP_NAME = "OpenMapEditor"; // Used throughout the app as name
// prettier-ignore
const APP_TITLE = "OpenMapEditor: GPS, GPX, KML, GeoJSON & Strava Editor"; // Used in the HTML <title> tag
// prettier-ignore
const APP_DESCRIPTION = "Free online GPX, KML, KMZ & GeoJSON viewer & editor. Draw, view & edit GPS tracks with routing, elevation profiles & Strava integration."; // Used in <meta name="description">
// prettier-ignore
const APP_CREDITS_DESCRIPTION = "OpenMapEditor is a simple, powerful web-based editor for creating, viewing, and managing geographic data like paths, areas, and markers. Built with Leaflet.js, it supports interactive drawing, file import/export (GeoJSON, GPX, KML, KMZ), routing, elevation profiles, custom styling, and Strava activity integration."; // Used in credits modal
const APP_DOMAIN = "www.openmapeditor.com"; // Used for Strava setup instructions

/**
 * Default color for new features.
 */
const DEFAULT_COLOR = "#DC143C"; // Crimson

/**
 * Route path color.
 */
const ROUTE_COLOR = "#FFD700"; // Gold

/**
 * Strava activity color.
 */
const STRAVA_COLOR = "#FC5200"; // Official Strava orange

/**
 * 16 standard CSS colors for the picker palette.
 * Uses official CSS color names with their correct hex values.
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/named-color
 * @see https://www.w3schools.com/tags/ref_colornames.asp
 */
const COLOR_PALETTE = [
  { name: "Crimson", hex: "#DC143C" },
  { name: "Deep Pink", hex: "#FF1493" },
  { name: "Dark Orchid", hex: "#9932CC" },
  { name: "Slate Blue", hex: "#6A5ACD" },
  { name: "Royal Blue", hex: "#4169E1" },
  { name: "Dodger Blue", hex: "#1E90FF" },
  { name: "Dark Turquoise", hex: "#00CED1" },
  { name: "Light Sea Green", hex: "#20B2AA" },
  { name: "Forest Green", hex: "#228B22" },
  { name: "Yellow Green", hex: "#9ACD32" },
  { name: "Gold", hex: "#FFD700" },
  { name: "Dark Orange", hex: "#FF8C00" },
  { name: "Tomato", hex: "#FF6347" },
  { name: "Sienna", hex: "#A0522D" },
  { name: "Dim Gray", hex: "#696969" },
  { name: "Slate Gray", hex: "#708090" },
];

/**
 * Checks if a hex color is in the 16-color palette.
 * @param {string} hex - Hex color to check
 * @returns {boolean} True if color is in palette
 */
function isInPalette(hex) {
  if (!hex) return false;
  const normalized = hex.toUpperCase();
  return COLOR_PALETTE.some((c) => c.hex.toUpperCase() === normalized);
}

let enablePathSimplification = localStorage.getItem("enablePathSimplification") !== "false";

/**
 * Centralized style configuration for paths and markers.
 */
const STYLE_CONFIG = {
  path: {
    default: {
      weight: 10,
      opacity: 0.75,
      fill: false,
    },
    highlight: {
      weight: 10,
      opacity: 1,
      fill: false,
      outline: {
        enabled: true,
        color: "black",
        weightOffset: 4,
        fillOpacity: 0.15,
      },
    },
  },
  marker: {
    baseSize: 50,
    default: {
      opacity: 0.75,
    },
    highlight: {
      opacity: 1,
      outline: {
        enabled: true,
        color: "black",
        sizeOffset: 4,
        anchorOffsetY: -4,
      },
    },
  },
};

const rootStyles = getComputedStyle(document.documentElement);

const routingColorStart = rootStyles.getPropertyValue("--routing-color-start").trim();
const routingColorEnd = rootStyles.getPropertyValue("--routing-color-end").trim();
const routingColorVia = rootStyles.getPropertyValue("--routing-color-via").trim();

/**
 * Simplification settings for imported paths (GPX, KML, KMZ).
 * Tolerance is in decimal degrees (~0.00005° ≈ 5.5m at equator).
 */
const pathSimplificationConfig = {
  TOLERANCE: 0.00015,
  MIN_POINTS: 100,
};

/**
 * Simplification settings for generated routes from routing engines.
 */
const routeSimplificationConfig = {
  TOLERANCE: 0.00015,
  MIN_POINTS: 100,
};
