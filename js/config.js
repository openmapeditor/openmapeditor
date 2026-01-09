// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

const APP_NAME = "OpenMapEditor"; // Used throughout the app as name
// prettier-ignore
const APP_TITLE = "OpenMapEditor: GPS, GPX, KML, GeoJSON & Strava Editor"; // Used in the HTML <title> tag
// prettier-ignore
const APP_DESCRIPTION = "Free online GPX, KML, KMZ & GeoJSON editor for hiking & biking. Draw, view & edit GPS tracks with routing, elevation profiles & Strava integration."; // Used in <meta name="description">
// prettier-ignore
const APP_CREDITS_DESCRIPTION = "OpenMapEditor is a simple, powerful web-based editor for creating, viewing, and managing geographic data like paths, areas, and markers. Built with Leaflet.js, it supports interactive drawing, file import/export (GeoJSON, GPX, KML, KMZ), routing, elevation profiles, custom styling, and Strava activity integration."; // Used in credits modal
const APP_DOMAIN = "www.openmapeditor.com"; // Used for Strava setup instructions

/**
 * Converts a CSS hex color to KML AABBGGRR format for Organic Maps compatibility.
 * @see https://github.com/organicmaps/organicmaps/blob/master/libs/kml/serdes.cpp
 * @param {string} cssColor - CSS color string (e.g., "#E51B23")
 * @returns {string} KML color string (e.g., "FF231BE5")
 */
function cssToKmlColor(cssColor) {
  const rr = cssColor.substring(1, 3);
  const gg = cssColor.substring(3, 5);
  const bb = cssColor.substring(5, 7);
  return `FF${bb}${gg}${rr}`.toUpperCase();
}

/**
 * The 16 official Organic Maps colors with their CSS hex values.
 * @see https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/dark/style.mapcss
 * @see https://github.com/organicmaps/organicmaps/blob/master/data/styles/default/light/style.mapcss
 */
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
