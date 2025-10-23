// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// --- D3 Elevation Chart Module ---
// This module contains all logic for our custom D3 elevation chart.
// It uses an HTML <foreignObject> to render the summary text,
// allowing for dynamic text wrapping and automatic margin adjustment.

// --- 1. Module-level variables ---
let svg, chartGroup;
let x, y, xAxis, yAxis; // D3 scales and axes
let width, height; // Chart dimensions (dynamically calculated)
let currentData = [];
let useImperial = false;
let chartTargetDivId;
let totalWidth, totalHeight; // Container dimensions

// --- D3 elements for hover interaction ---
let verticalLine, hoverOverlay;

// --- Responsive & Margin constants ---
const BREAKPOINT_NARROW = 768; // 768px matches your style.css
const MARGIN_BOTTOM_NARROW = 60;
const MARGIN_BOTTOM_WIDE = 30;
const SUMMARY_PADDING_BOTTOM = 10; // Space between summary text and chart
const MIN_TOP_MARGIN = 10; // Minimum top margin even if text is empty

const margin = {
  // top is now set dynamically
  right: 65,
  bottom: MARGIN_BOTTOM_WIDE, // Default to wide margin
  left: 55,
};

/**
 * --- 2. Data Formatting Helper ---
 * Converts our Leaflet data (L.latLng(lat, lng, alt)) into what D3 needs.
 * [ {distance: 0, elevation: 100, latlng: L.LatLng}, {distance: 50, elevation: 110, latlng: L.LatLng}, ... ]
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
    latlng: pointsWithElev[0], // Store the original LatLng
  });

  // Loop through the rest of the points
  for (let i = 1; i < pointsWithElev.length; i++) {
    const p1 = pointsWithElev[i - 1];
    const p2 = pointsWithElev[i];
    cumulativeDistance += p1.distanceTo(p2); // Use Leaflet's built-in distance calc

    formattedData.push({
      distance: cumulativeDistance,
      elevation: p2.alt || 0,
      latlng: p2, // Store the original LatLng
    });
  }
  return formattedData;
}

/**
 * --- 3. Layout & Drawing Helpers ---
 */

/**
 * (HELPER) Updates the chart's bottom margin based on the container width.
 * @param {number} containerWidth The current width of the target div.
 */
function updateBottomMargin(containerWidth) {
  const isNarrow = containerWidth < BREAKPOINT_NARROW;
  margin.bottom = isNarrow ? MARGIN_BOTTOM_NARROW : MARGIN_BOTTOM_WIDE;
}

/**
 * (HELPER) Measures the summary text and recalculates ALL chart dimensions.
 * This is the core of the dynamic layout.
 */
function updateChartLayout() {
  if (!svg || !chartTargetDivId) return;

  const targetDiv = document.getElementById(chartTargetDivId);
  if (!targetDiv) return;

  totalWidth = targetDiv.clientWidth;
  totalHeight = targetDiv.clientHeight;

  if (totalHeight === 0 || totalWidth === 0) return;

  // 1. Update bottom margin based on width
  updateBottomMargin(totalWidth);

  // 2. Calculate available width for chart & summary
  width = totalWidth - margin.left - margin.right;
  if (width < 0) width = 0;

  // 3. Update the summary container's width to match the chart
  const summaryContainer = svg.select("#d3-summary-container");
  summaryContainer.attr("width", width);

  // 4. Measure the *actual* height of the HTML text inside
  const summaryDiv = svg.select("#d3-summary-html").node();
  const summaryHeight = summaryDiv ? summaryDiv.getBoundingClientRect().height : 0;

  // 5. Set dynamic top margin based on text height
  margin.top = Math.max(MIN_TOP_MARGIN, summaryHeight + SUMMARY_PADDING_BOTTOM);

  // 6. Calculate final chart height
  height = totalHeight - margin.top - margin.bottom;
  if (height < 0) height = 0;

  // 7. Update ALL SVG/D3 components with new dimensions
  svg.attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
  chartGroup.attr("transform", `translate(${margin.left}, ${margin.top})`);
  summaryContainer.attr("height", margin.top); // Make FO container fit content

  x.range([0, width]);
  y.range([height, 0]);

  yAxis.attr("transform", `translate(${width}, 0)`);
  xAxis.attr("transform", `translate(0, ${height})`);

  // Update the hover overlay to match the chart size
  if (hoverOverlay) {
    hoverOverlay.attr("width", width).attr("height", height);
  }
}

/**
 * (HELPER) Draws the chart area path and axes based on currentData.
 */
function redrawChartData() {
  if (currentData.length < 2) {
    drawEmptyAxes();
    return;
  }

  // 1. Update domain (min/max) of our scales
  const maxDistance = currentData[currentData.length - 1].distance;
  const [minElev, maxElev] = d3.extent(currentData, (d) => d.elevation);

  x.domain([0, maxDistance]);
  y.domain([minElev, maxElev]);

  // 2. Create the "Area Generator"
  const areaGenerator = d3
    .area()
    .x((d) => x(d.distance))
    .y0(height) // Bottom of the area
    .y1((d) => y(d.elevation)); // Top of the area

  // 3. Bind the data and draw the path
  chartGroup.select(".altitude-area").datum(currentData).attr("d", areaGenerator);

  // 4. Update the Axes
  const distanceFormatter = (meters) => formatDistance(meters);
  const elevationFormatter = (meters) => {
    const feet = meters * 3.28084;
    return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
  };

  // X-Axis
  const tickValues = [0, maxDistance / 2, maxDistance];
  xAxis.call(d3.axisBottom(x).tickValues(tickValues).tickFormat(distanceFormatter));
  xAxis.selectAll(".tick text").style("text-anchor", (d, i, nodes) => {
    if (i === 0) return "start";
    if (i === nodes.length - 1) return "end";
    return "middle";
  });

  // Y-Axis
  const yTickValues = [minElev, (minElev + maxElev) / 2, maxElev];
  yAxis.call(d3.axisRight(y).tickValues(yTickValues).tickFormat(elevationFormatter));
  yAxis
    .selectAll(".tick text")
    .attr("dy", null)
    .style("dominant-baseline", (d) => {
      if (d === minElev) return "baseline";
      if (d === maxElev) return "hanging";
      return "middle";
    });
}

/**
 * (HELPER) Draws empty axes when no data is present.
 */
function drawEmptyAxes() {
  const elevationFormatter = (meters) => {
    const feet = meters * 3.28084;
    return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
  };
  xAxis.call(d3.axisBottom(x).ticks(0).tickFormat(""));
  // Draw an empty Y axis to maintain layout
  yAxis.call(d3.axisRight(y).ticks(4).tickFormat(elevationFormatter));
  yAxis.selectAll("text").text(""); // Clear labels
}

/**
 * --- 4. The Public API ---
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

  // Clear any old content
  d3.select(targetDiv).html("");

  // Create the main SVG element
  svg = d3
    .select(targetDiv)
    .append("svg")
    .attr("class", "d3-elevation-svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("preserveAspectRatio", "xMinYMin meet");

  // --- Add HTML Summary Container ---
  svg
    .append("foreignObject")
    .attr("id", "d3-summary-container")
    .attr("x", margin.left) // Align with chart group
    .attr("y", 0) // Start at the very top
    .attr("width", 1) // Temp, will be set by updateChartLayout
    .attr("height", 1) // Temp, will be set by updateChartLayout
    .append("xhtml:div")
    .attr("id", "d3-summary-html")
    .style("color", "var(--text-color)")
    .style("font-size", "12px")
    .style("line-height", "1.4")
    .style("text-align", "center")
    .style("width", "100%")
    .style("padding-top", "5px");

  // Create a 'g' (group) element to hold the chart
  chartGroup = svg.append("g").attr("class", "d3-chart-group");

  // --- Initialize Scales (range set by layout) ---
  x = d3.scaleLinear();
  y = d3.scaleLinear();

  // Add a <path> element for our area chart.
  chartGroup.append("path").attr("class", "altitude-area");

  // --- Add the vertical hover line (initially hidden) ---
  verticalLine = chartGroup
    .append("line")
    .attr("class", "elevation-hover-line")
    .style("stroke", "var(--text-color)")
    .style("stroke-width", 1)
    // .style("stroke-dasharray", "3,3") // <<<<< MODIFICATION: Removed this line >>>>>
    .style("display", "none")
    .style("pointer-events", "none");
  // --- END Add Vertical Line ---

  // --- Initialize Axes (position set by layout) ---
  xAxis = chartGroup.append("g").attr("class", "x axis");
  yAxis = chartGroup.append("g").attr("class", "y axis");

  // --- Add the hover/touch capture rectangle ---
  hoverOverlay = chartGroup
    .append("rect")
    .attr("class", "elevation-hover-overlay")
    .attr("x", 0)
    .attr("y", 0)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mousemove", onHoverMove)
    .on("touchmove", onHoverMove)
    .on("mouseout", onHoverEnd)
    .on("touchend", onHoverEnd);
  // --- END Add Overlay ---

  // --- Perform initial layout ---
  updateChartLayout();
  drawEmptyAxes();

  // --- Add Resize Listener ---
  let debounceTimer;
  window.addEventListener("resize", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateChartLayout();
      redrawChartData();
    }, 100);
  });
}

/**
 * Draws the elevation profile on the chart.
 * This is the main function to call when data changes.
 * @param {Array<L.LatLng>} pointsWithElev The raw data from fetchElevationForPath
 */
function drawElevationProfile(pointsWithElev) {
  currentData = formatDataForD3(pointsWithElev);
  if (currentData.length < 2) {
    clearElevationProfile();
    return;
  }

  // --- 1. Calculate Summary Stats ---
  const [minElev, maxElev] = d3.extent(currentData, (d) => d.elevation);
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

  const elevationFormatter = (meters) => {
    const feet = meters * 3.28084;
    return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
  };

  // --- 2. Update Summary HTML ---
  const summaryDiv = svg.select("#d3-summary-html");
  if (summaryDiv) {
    const itemStyle = "display: inline-block; white-space: nowrap; margin: 0 4px;";
    summaryDiv.html(
      `<span style="${itemStyle}">Ascent: ${elevationFormatter(ascent)}</span>` +
        `<span style="${itemStyle}">Descent: ${elevationFormatter(descent)}</span>` +
        `<span style="${itemStyle}">Highest point: ${elevationFormatter(maxElev)}</span>` +
        `<span style="${itemStyle}">Lowest point: ${elevationFormatter(minElev)}</span>`
    );
  }

  // --- 3. Update Layout & Redraw Chart ---
  updateChartLayout();
  redrawChartData();
}

/**
 * Clears the elevation profile from the chart.
 */
function clearElevationProfile() {
  currentData = [];

  // Clear summary text
  const summaryDiv = svg.select("#d3-summary-html");
  if (summaryDiv) {
    summaryDiv.html("");
  }

  // Clear chart area
  chartGroup.select(".altitude-area").attr("d", null);

  // Hide hover elements
  if (verticalLine) verticalLine.style("display", "none");
  if (window.mapInteractions) window.mapInteractions.hideElevationMarker();

  // Update layout to shrink margin
  updateChartLayout();

  // Draw empty axes
  drawEmptyAxes();
}

/**
 * Updates the chart's units and redraws.
 * @param {boolean} isImperial
 */
function updateElevationChartUnits(isImperial) {
  useImperial = isImperial;
  if (currentData.length > 0) {
    // Re-run the full draw function to update text and scales
    drawElevationProfile(currentData.map((d) => d.latlng));
  } else {
    // Just redraw the empty axes with the new unit format
    updateChartLayout();
    drawEmptyAxes();
  }
}

// --- Event Handlers for Chart Hover ---

/**
 * Handles mousemove and touchmove events on the chart overlay.
 * Finds the corresponding data point and shows the marker and line.
 * Clamps the visual feedback to the chart boundaries.
 * @param {Event} event The mouse or touch event
 */
function onHoverMove(event) {
  // Prevent default behavior like page scrolling on touch
  event.preventDefault();
  // Stop the event from bubbling up to the map (important for touch drag)
  event.stopPropagation();

  if (!currentData || currentData.length === 0) return;

  let pointerX;

  // Explicit Touch Coordinate Handling
  if (event.touches && event.touches.length > 0) {
    const touch = event.touches[0];
    const [xCoord] = d3.pointer(touch, chartGroup.node());
    pointerX = xCoord;
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    // Handle cases like touchend that might use changedTouches
    const touch = event.changedTouches[0];
    const [xCoord] = d3.pointer(touch, chartGroup.node());
    pointerX = xCoord;
  } else {
    // Assume mouse event or other pointer type
    const [xCoord] = d3.pointer(event, chartGroup.node());
    pointerX = xCoord;
  }

  // --- Clamp pointerX to the visual chart bounds [0, width] ---
  const clampedPointerX = Math.max(0, Math.min(width, pointerX));

  // Convert the *clamped* X coordinate back to a "distance" value within the domain
  const hoverDistance = x.invert(clampedPointerX);

  // Use D3's bisector to find the *index* of the closest actual data point
  const bisector = d3.bisector((d) => d.distance).left;
  let index = bisector(currentData, hoverDistance, 1); // Start searching from index 1

  // Determine the closest point: the one before or the one at the bisector index
  const d0 = currentData[index - 1];
  const d1 = currentData[index];

  // Check if d1 exists before accessing its distance property
  if (d0 && d1) {
    index = hoverDistance - d0.distance > d1.distance - hoverDistance ? index : index - 1;
  } else if (d0) {
    // Only d0 exists, must be the last point
    index = currentData.length - 1;
  } else {
    // Neither exists or only d1 exists, must be the first point
    index = 0;
  }

  // Clamp index just in case (shouldn't be needed with proper bisect logic but safe)
  index = Math.max(0, Math.min(currentData.length - 1, index));

  const dataPoint = currentData[index];

  if (dataPoint) {
    // Update the vertical line's position using the *actual* data point's distance
    // This ensures it snaps precisely to the start/end points.
    const lineX = x(dataPoint.distance);

    verticalLine
      .attr("x1", lineX)
      .attr("x2", lineX)
      .attr("y1", 0) // Full height
      .attr("y2", height) // Full height
      .style("display", "block");

    // Tell the map to show the marker at this point's lat/lng
    if (window.mapInteractions) {
      window.mapInteractions.showElevationMarker(dataPoint.latlng);
    }
  } else {
    // Fallback if no data point is found (shouldn't happen with clamping)
    console.warn("Could not find dataPoint in onHoverMove");
    onHoverEnd(); // Hide if something went wrong
  }
}

/**
 * Handles mouseout and touchend events *leaving the overlay rectangle*.
 * Hides the marker and the vertical line.
 */
function onHoverEnd() {
  // Hide the vertical line
  if (verticalLine) {
    verticalLine.style("display", "none");
  }
  // Tell the map to hide the marker
  if (window.mapInteractions) {
    window.mapInteractions.hideElevationMarker();
  }
}
// --- END Event Handlers ---

// Export the functions we want other files to use
window.elevationProfile = {
  createElevationChart,
  drawElevationProfile,
  clearElevationProfile,
  updateElevationChartUnits,
};
