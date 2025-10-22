// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.
//
// --- NEW: D3 Elevation Chart Module ---
//
// This module will contain all logic for our custom D3 elevation chart.

// --- 1. Module-level variables ---
// We define these here so all functions in this file can access them.
let svg, chartGroup;
let x, y, xAxis, yAxis; // D3 scales and axes
let width, height; // Chart dimensions
let currentData = [];
let useImperial = false;

// We can get these from main.js or define them here.
const margin = { top: 30, right: 0, bottom: -10, left: 0 };

/**
 * --- 2. Data Formatting Helper ---
 * Converts our Leaflet data (L.latLng(lat, lng, alt)) into what D3 needs.
 * D3 works best with simple objects, like:
 * [ {distance: 0, elevation: 100}, {distance: 50, elevation: 110}, ... ]
 */
function formatDataForD3(pointsWithElev) {
  let cumulativeDistance = 0;
  const formattedData = [];

  if (!pointsWithElev || pointsWithElev.length < 2) {
    return [];
  }

  // Add the first point
  formattedData.push({
    distance: 0,
    elevation: pointsWithElev[0].alt || 0,
    latlng: pointsWithElev[0],
  });

  // Loop through the rest of the points
  for (let i = 1; i < pointsWithElev.length; i++) {
    const p1 = pointsWithElev[i - 1];
    const p2 = pointsWithElev[i];
    cumulativeDistance += p1.distanceTo(p2); // Use Leaflet's built-in distance calc

    formattedData.push({
      distance: cumulativeDistance,
      elevation: p2.alt || 0,
      latlng: p2,
    });
  }
  return formattedData;
}

/**
 * --- 3. The Public API ---
 * These are the functions we'll call from our other files.
 */

/**
 * Initializes the D3 chart. Called once from main.js on load.
 * @param {string} targetDivId The ID of the div to draw in (e.g., "elevation-div")
 * @param {boolean} isImperial The initial unit setting.
 */
function createElevationChart(targetDivId, isImperial) {
  useImperial = isImperial;
  const targetDiv = document.getElementById(targetDivId);

  // Get dimensions from the container
  const totalWidth = document.getElementById("map").clientWidth;
  const totalHeight = 200; // You can set a fixed height

  width = totalWidth - margin.left - margin.right;
  height = totalHeight - margin.top - margin.bottom;

  // Clear any old content (like the old plugin's SVG)
  d3.select(targetDiv).html("");

  // Create the main SVG element
  svg = d3
    .select(targetDiv)
    .append("svg")
    .attr("width", "50%") // Make SVG responsive
    .attr("height", totalHeight)
    .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`) // For responsive scaling
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Create a 'g' (group) element to hold the chart, applying margins
  chartGroup = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

  // --- Initialize Scales ---
  // X scale (distance)
  x = d3.scaleLinear().range([0, width]);
  // Y scale (elevation)
  y = d3.scaleLinear().range([height, 0]);

  // --- Initialize Axes ---
  // X axis (at the top, as per your old plugin style)
  xAxis = chartGroup
    .append("g")
    .attr("class", "x axis top time") // Use old class names to get some style
    .attr("transform", `translate(0, 0)`); // Position at top

  // Y axis (at the right)
  yAxis = chartGroup
    .append("g")
    .attr("class", "y axis")
    .attr("transform", `translate(${width}, 0)`); // Position at right

  // Add a <path> element for our area chart.
  // It's empty now, but we'll add data to it later.
  chartGroup.append("path").attr("class", "altitude-area");

  // Add summary text element (replaces the old summary div)
  chartGroup
    .append("text")
    .attr("id", "d3-summary-text")
    .attr("x", width / 2) // Center it
    .attr("y", -10) // Position above the chart
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-color)")
    .attr("font-size", "12px");
}

/**
 * Draws the elevation profile on the chart.
 * @param {Array<L.LatLng>} pointsWithElev The raw data from fetchElevationForPath
 */
function drawElevationProfile(pointsWithElev) {
  currentData = formatDataForD3(pointsWithElev);
  if (currentData.length < 2) {
    clearElevationProfile(); // Not enough data to draw
    return;
  }

  // --- 1. Update domain (min/max) of our scales ---
  const maxDistance = currentData[currentData.length - 1].distance;
  const [minElev, maxElev] = d3.extent(currentData, (d) => d.elevation);
  const elevPadding = (maxElev - minElev) * 0.1; // 10% padding

  x.domain([0, maxDistance]);
  y.domain([minElev - elevPadding, maxElev + elevPadding]);

  // --- 2. Create the "Area Generator" ---
  // This is a D3 function that turns our data array into an SVG path string
  const areaGenerator = d3
    .area()
    .x((d) => x(d.distance))
    .y0(height) // Bottom of the area
    .y1((d) => y(d.elevation)); // Top of the area

  // --- 3. Bind the data and draw the path ---
  chartGroup
    .select(".altitude-area")
    .datum(currentData) // Bind the *entire* array as one object
    .attr("d", areaGenerator);

  // --- 4. Update the Axes ---
  const distanceFormatter = (meters) => {
    // We can reuse our global formatter
    return formatDistance(meters);
  };

  const elevationFormatter = (meters) => {
    const feet = meters * 3.28084;
    return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
  };

  xAxis.call(d3.axisTop(x).ticks(5).tickFormat(distanceFormatter));
  yAxis.call(d3.axisRight(y).ticks(4).tickFormat(elevationFormatter));

  // --- 5. Update Summary Text ---
  const ascent = d3.sum(currentData, (d, i) => {
    if (i === 0) return 0;
    const diff = d.elevation - currentData[i - 1].elevation;
    return diff > 0 ? diff : 0;
  });

  const descent = d3.sum(currentData, (d, i) => {
    if (i === 0) return 0;
    const diff = d.elevation - currentData[i - 1].elevation;
    return diff < 0 ? -diff : 0;
  });

  chartGroup
    .select("#d3-summary-text")
    .text(`Ascent: ${elevationFormatter(ascent)} · Descent: ${elevationFormatter(descent)}`);
}

/**
 * Clears the elevation profile from the chart.
 */
function clearElevationProfile() {
  currentData = [];
  // Clear the path
  chartGroup.select(".altitude-area").attr("d", null);
  // Clear the axes
  xAxis.call(d3.axisTop(x).ticks(0).tickFormat(""));
  yAxis.call(d3.axisRight(y).ticks(0).tickFormat(""));
  // Clear the summary text
  chartGroup.select("#d3-summary-text").text("");
}

/**
 * Updates the chart's units and redraws.
 * @param {boolean} isImperial
 */
function updateElevationChartUnits(isImperial) {
  useImperial = isImperial;
  // If we have data, just redraw it to update the axes and summary
  if (currentData.length > 0) {
    // Re-call draw with the *unformatted* data
    drawElevationProfile(currentData.map((d) => d.latlng));
  }
}

// Export the functions we want other files to use
window.d3Elevation = {
  createElevationChart,
  drawElevationProfile,
  clearElevationProfile,
  updateElevationChartUnits,
};
