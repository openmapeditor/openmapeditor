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
let chartTargetDivId;

// --- MODIFICATION: Responsive & Margin constants ---
const BREAKPOINT_NARROW = 768; // 768px matches your style.css
const MARGIN_BOTTOM_NARROW = 60;
const MARGIN_BOTTOM_WIDE = 30;
// --- END MODIFICATION ---

const margin = {
  top: 30,
  right: 65,
  bottom: MARGIN_BOTTOM_WIDE, // Default to wide margin
  left: 55,
};

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
 * --- (NEW HELPER) 2.5. Margin Helper ---
 * Updates the chart's bottom margin based on the container width.
 * @param {number} containerWidth The current width of the target div.
 */
function updateBottomMargin(containerWidth) {
  const isNarrow = containerWidth < BREAKPOINT_NARROW;
  margin.bottom = isNarrow ? MARGIN_BOTTOM_NARROW : MARGIN_BOTTOM_WIDE;
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
  chartTargetDivId = targetDivId;
  const targetDiv = document.getElementById(targetDivId);

  // Get dimensions from the container
  const totalWidth = targetDiv.clientWidth;
  const totalHeight = targetDiv.clientHeight;

  // --- MODIFICATION: Set initial bottom margin ---
  updateBottomMargin(totalWidth);
  // --- END MODIFICATION ---

  width = totalWidth - margin.left - margin.right;
  height = totalHeight - margin.top - margin.bottom;

  // Clear any old content (like the old plugin's SVG)
  d3.select(targetDiv).html("");

  // Create the main SVG element
  svg = d3
    .select(targetDiv)
    .append("svg")
    .attr("class", "d3-elevation-svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`) // Set initial coordinate system
    .attr("preserveAspectRatio", "xMinYMin meet");

  // Create a 'g' (group) element to hold the chart, applying margins
  chartGroup = svg
    .append("g")
    .attr("class", "d3-chart-group")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // --- Initialize Scales ---
  // X scale (distance)
  x = d3.scaleLinear().range([0, width]);
  // Y scale (elevation)
  y = d3.scaleLinear().range([height, 0]);

  // Add a <path> element for our area chart.
  chartGroup.append("path").attr("class", "altitude-area");

  // --- Initialize Axes ---
  // X axis (at the bottom)
  xAxis = chartGroup
    .append("g")
    .attr("class", "x axis")
    .attr("transform", `translate(0, ${height})`); // Position at bottom

  // Y axis (at the right)
  yAxis = chartGroup
    .append("g")
    .attr("class", "y axis")
    .attr("transform", `translate(${width}, 0)`); // Position at right

  // Add summary text element
  chartGroup
    .append("text")
    .attr("id", "d3-summary-text")
    .attr("x", width / 2) // Center it
    .attr("y", -10) // Position above the chart
    .attr("text-anchor", "middle")
    .attr("fill", "var(--text-color)")
    .attr("font-size", "12px");

  // --- Add Resize Listener ---
  let debounceTimer;
  window.addEventListener("resize", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleResize, 100);
  });
}

/**
 * --- 4. Resize Handler ---
 * Recalculates dimensions and redraws the chart when the window size changes.
 */
function handleResize() {
  // Guard clause: Do nothing if the chart hasn't been created yet
  if (!svg || !chartTargetDivId) {
    return;
  }

  // --- 1. Get new dimensions ---
  const targetDiv = document.getElementById(chartTargetDivId);
  if (!targetDiv) return;

  const newTotalWidth = targetDiv.clientWidth;
  const newTotalHeight = targetDiv.clientHeight;

  // --- *** MODIFICATION: Guard Clause *** ---
  // If the chart is hidden (height: 0), don't recalculate.
  if (newTotalHeight === 0) {
    return;
  }
  // --- *** END MODIFICATION *** ---

  // --- MODIFICATION: Update bottom margin ---
  updateBottomMargin(newTotalWidth);
  // --- END MODIFICATION ---

  // Update module-level dimensions
  width = newTotalWidth - margin.left - margin.right;
  height = newTotalHeight - margin.top - margin.bottom;

  // --- 2. Update SVG and Scales ---
  svg.attr("viewBox", `0 0 ${newTotalWidth} ${newTotalHeight}`);
  x.range([0, width]);
  y.range([height, 0]);

  // --- 3. Reposition static elements ---
  yAxis.attr("transform", `translate(${width}, 0)`);
  xAxis.attr("transform", `translate(0, ${height})`);
  chartGroup.select("#d3-summary-text").attr("x", width / 2);

  // --- 4. Redraw data ---
  if (currentData.length > 0) {
    drawElevationProfile(currentData.map((d) => d.latlng));
  } else {
    const elevationFormatter = (meters) => {
      const feet = meters * 3.28084;
      return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
    };
    xAxis.call(d3.axisBottom(x).ticks(0).tickFormat(""));
    yAxis.call(d3.axisRight(y).ticks(4).tickFormat(elevationFormatter));
    yAxis.selectAll("text").text("");
  }
}

/**
 * Draws the elevation profile on the chart.
 * @param {Array<L.LatLng>} pointsWithElev The raw data from fetchElevationForPath
 */
function drawElevationProfile(pointsWithElev) {
  currentData = formatDataForD3(pointsWithElev);
  if (currentData.length < 2) {
    clearElevationProfile();
    return;
  }

  // --- 1. Update domain (min/max) of our scales ---
  const maxDistance = currentData[currentData.length - 1].distance;
  const [minElev, maxElev] = d3.extent(currentData, (d) => d.elevation);
  // const elevPadding = (maxElev - minElev) * 0.1; // 10% padding // MODIFICATION: Removed padding

  x.domain([0, maxDistance]);
  y.domain([minElev, maxElev]); // MODIFICATION: Use exact min/max

  // --- 2. Create the "Area Generator" ---
  const areaGenerator = d3
    .area()
    .x((d) => x(d.distance))
    .y0(height) // Bottom of the area
    .y1((d) => y(d.elevation)); // Top of the area

  // --- 3. Bind the data and draw the path ---
  chartGroup.select(".altitude-area").datum(currentData).attr("d", areaGenerator);

  // --- 4. Update the Axes ---
  const distanceFormatter = (meters) => {
    return formatDistance(meters);
  };

  const elevationFormatter = (meters) => {
    const feet = meters * 3.28084;
    return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
  };

  // --- X-Axis with custom ticks and alignment ---
  const tickValues = [0, maxDistance / 2, maxDistance];

  xAxis.call(d3.axisBottom(x).tickValues(tickValues).tickFormat(distanceFormatter));

  xAxis.selectAll(".tick text").style("text-anchor", (d, i, nodes) => {
    if (i === 0) {
      return "start"; // First tick (0)
    } else if (i === nodes.length - 1) {
      return "end"; // Last tick (max distance)
    } else {
      return "middle"; // Middle tick
    }
  });
  // --- END X-Axis ---

  // --- MODIFICATION: Update Y-Axis with custom ticks and alignment ---
  // Use the minElev and maxElev variables we already found
  const yTickValues = [minElev, (minElev + maxElev) / 2, maxElev];

  yAxis.call(d3.axisRight(y).tickValues(yTickValues).tickFormat(elevationFormatter));

  // Apply custom vertical text alignment
  // Note: 'text-anchor' is already 'start' (left-aligned) by default for axisRight
  yAxis
    .selectAll(".tick text")
    .attr("dy", null) // <-- Remove D3's default vertical nudge
    .style("dominant-baseline", (d) => {
      // Check against the tick value 'd'
      if (d === minElev) {
        return "baseline"; // Aligns text so its baseline is on the tick
      } else if (d === maxElev) {
        return "hanging"; // Aligns text so it "hangs" from the tick
      } else {
        return "middle"; // "centered" alignment
      }
    });
  // --- END MODIFICATION ---

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
    .text(
      `Ascent: ${elevationFormatter(ascent)} · Descent: ${elevationFormatter(
        descent
      )} · Highest point: ${elevationFormatter(maxElev)} · Lowest point: ${elevationFormatter(
        minElev
      )}`
    );
}

/**
 * Clears the elevation profile from the chart.
 */
function clearElevationProfile() {
  currentData = [];
  chartGroup.select(".altitude-area").attr("d", null);
  xAxis.call(d3.axisBottom(x).ticks(0).tickFormat(""));
  yAxis.call(d3.axisRight(y).ticks(0).tickFormat(""));
  chartGroup.select("#d3-summary-text").text("");
}

/**
 * Updates the chart's units and redraws.
 * @param {boolean} isImperial
 */
function updateElevationChartUnits(isImperial) {
  useImperial = isImperial;
  if (currentData.length > 0) {
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
