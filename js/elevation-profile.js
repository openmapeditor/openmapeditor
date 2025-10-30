// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// --- D3 Elevation Chart Module ---
// This module contains all logic for our custom D3 elevation chart.
// It uses an HTML <foreignObject> to render the summary text,
// allowing for dynamic text wrapping and automatic margin adjustment.

// --- 1. Module-level variables ---
let svg, chartGroup;
let x, y, xAxis, yAxis; // D3 scales and axes
let width, height; // Chart dimensions (dynamically calculated)
let useImperial = false;
let chartTargetDivId;
let totalWidth, totalHeight; // Container dimensions
let currentRealDistance = 0;

// --- START: MODIFIED DATA VARIABLES ---
// We now only store raw data.
// Stats and the chart area are both drawn from currentRawData.
let currentRawData = [];
// --- END: MODIFIED DATA VARIABLES ---

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

// --- START: Added functions from map.geo.admin.ch ---
// The following two functions are adapted from the map.geo.admin.ch repository
// Source: https://github.com/geoadmin/web-mapviewer/blob/develop/packages/geoadmin-elevation-profile/src/utils.ts

/**
 * Calculates hiking time in minutes based on the Swiss hiking time formula.
 * Adapted from map.geo.admin.ch
 * @param {Array} points The elevation profile data, sorted by distance.
 * Expected format: [{distance: number, elevation: number}, ...]
 * @returns {number} The total hiking time in minutes.
 */
function calculateSwissHikingTime(points) {
  if (!points || points.length < 2) {
    return 0;
  }

  // Constants of the formula (Schweizmobil)
  const arrConstants = [
    14.271, 3.6991, 2.5922, -1.4384, 0.32105, 0.81542, -0.090261, -0.20757, 0.010192, 0.028588,
    -0.00057466, -0.0021842, 1.5176e-5, 8.6894e-5, -1.3584e-7, -1.4026e-6,
  ];

  // Data is assumed to be pre-sorted by distance
  const timeInMinutes = points
    .map((currentPoint, index, points) => {
      // --- START BUG FIX ---
      // Was `points.length - 2`, which skipped the final segment of the path.
      if (index < points.length - 1) {
        // --- END BUG FIX ---
        const nextPoint = points[index + 1];

        // Use 'distance' property from our data structure
        const distanceDelta = (nextPoint.distance || 0) - (currentPoint.distance || 0);
        if (!distanceDelta) {
          return 0;
        }
        const elevationDelta = (nextPoint.elevation || 0) - (currentPoint.elevation || 0);

        // Slope value between the 2 points
        // 10ths (Schweizmobil formula) instead of % (official formula)
        const slope = (elevationDelta * 10.0) / distanceDelta;

        // The swiss hiking formula is used between -25% and +25%
        // but Schweizmobil use -40% and +40%
        let minutesPerKilometer = 0;
        if (slope > -4 && slope < 4) {
          arrConstants.forEach((constants, i) => {
            minutesPerKilometer += constants * Math.pow(slope, i);
          });
          // outside the -40% to +40% range, we use a linear formula
        } else if (slope > 0) {
          minutesPerKilometer = 17 * slope;
        } else {
          minutesPerKilometer = -9 * slope;
        }
        return (distanceDelta * minutesPerKilometer) / 1000;
      }
      return 0;
    })
    .reduce((a, b) => a + b);

  return Math.round(timeInMinutes);
}

/**
 * Formats minutes to hours and minutes (if more than one hour) e.g. 1230 -> '20h 30min', 55 -> '55min'
 * Adapted from map.geo.admin.ch
 * @returns {string} Time in 'Hh Mmin' or '-'
 */
function formatHikingTime(minutes) {
  if (!minutes || isNaN(minutes)) {
    return "-";
  }
  let result = "";
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    minutes = minutes - hours * 60;
    result += `${hours}h`;
    if (minutes > 0) {
      result += ` ${minutes}min`;
    }
  } else {
    result += `${minutes}min`;
  }
  return result;
}
// --- END: Added functions from map.geo.admin.ch ---

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
  // --- START: MODIFIED ---
  // Use raw data for domains and drawing
  if (currentRawData.length < 2) {
    // --- END: MODIFIED ---
    drawEmptyAxes();
    return;
  }

  // --- START: MODIFIED ---
  // 1. Update domain (min/max) of our scales FROM RAW DATA
  const maxDistance = currentRawData[currentRawData.length - 1].distance;
  const [minElev, maxElev] = d3.extent(currentRawData, (d) => d.elevation);
  // --- END: MODIFIED ---

  x.domain([0, maxDistance]);
  y.domain([minElev, maxElev]);

  // 2. Create the "Area Generator"
  const areaGenerator = d3
    .area()
    .x((d) => x(d.distance))
    .y0(height) // Bottom of the area
    .y1((d) => y(d.elevation)); // Top of the area

  // --- START: MODIFIED ---
  // 3. Bind the RAW data and draw the path
  chartGroup.select(".altitude-area").datum(currentRawData).attr("d", areaGenerator);
  // --- END: MODIFIED ---

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
  // Use the raw min/max for Y-axis ticks
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
    .style("display", "none")
    .style("pointer-events", "none");
  // --- END Add Vertical Line ---

  // --- START: Add the hover tooltip "flag" (initially hidden) ---
  const hoverTooltipGroup = chartGroup
    .append("g")
    .attr("class", "elevation-hover-tooltip-group")
    .style("display", "none")
    .style("pointer-events", "none");

  // The flag's path (shape)
  hoverTooltipGroup.append("path").attr("class", "elevation-hover-tooltip-path");

  // Text for Distance
  hoverTooltipGroup
    .append("text")
    .attr("class", "elevation-hover-tooltip-text")
    .attr("id", "tooltip-distance-text");

  // Text for Elevation
  hoverTooltipGroup
    .append("text")
    .attr("class", "elevation-hover-tooltip-text")
    .attr("id", "tooltip-elevation-text");
  // --- END: Add Tooltip ---

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
 * @param {number} [realDistance] The optional, true distance from the original path
 */
function drawElevationProfile(pointsWithElev, realDistance) {
  // --- START: MODIFIED LOGIC ---

  // 1. Format data
  currentRawData = formatDataForD3(pointsWithElev);
  if (currentRawData.length < 2) {
    clearElevationProfile();
    return;
  }

  // 2. Apply scaling logic
  currentRealDistance = realDistance || 0;
  const calculatedMaxDistance =
    currentRawData.length > 0 ? currentRawData[currentRawData.length - 1].distance : 0;

  if (currentRealDistance > 0 && calculatedMaxDistance > 0) {
    const scaleFactor = currentRealDistance / calculatedMaxDistance;
    if (scaleFactor !== 1) {
      for (let i = 1; i < currentRawData.length; i++) {
        currentRawData[i].distance *= scaleFactor;
      }
    }
  }

  // 3. Calculate Summary Stats FROM RAW DATA
  // This is the key change to match map.geo.admin.ch
  const [minElev, maxElev] = d3.extent(currentRawData, (d) => d.elevation);

  const ascent = d3.sum(currentRawData, (d, i) => {
    if (i === 0) return 0;
    const diff = d.elevation - currentRawData[i - 1].elevation;
    return diff > 0 ? diff : 0;
  });
  const descent = d3.sum(currentRawData, (d, i) => {
    if (i === 0) return 0;
    const diff = d.elevation - currentRawData[i - 1].elevation;
    return diff < 0 ? -diff : 0;
  });

  // Calculate Hiking Time FROM RAW DATA
  const hikingTimeMinutes = calculateSwissHikingTime(currentRawData);
  const hikingTimeFormatted = formatHikingTime(hikingTimeMinutes);

  const elevationFormatter = (meters) => {
    const feet = meters * 3.28084;
    return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
  };

  // 4. Update Summary HTML
  const summaryDiv = svg.select("#d3-summary-html");
  if (summaryDiv) {
    const itemStyle = "display: inline-block; white-space: nowrap; margin: 0 4px;";
    summaryDiv.html(
      `<span style="${itemStyle}">Ascent: ${elevationFormatter(ascent)}</span>` +
        `<span style="${itemStyle}">Descent: ${elevationFormatter(descent)}</span>` +
        `<span style="${itemStyle}">Highest point: ${elevationFormatter(maxElev)}</span>` +
        `<span style="${itemStyle}">Lowest point: ${elevationFormatter(minElev)}</span>` +
        `<span style="${itemStyle}">Hiking time: ${hikingTimeFormatted}</span>`
    );
  }

  // 5. Update Layout & Redraw Chart
  updateChartLayout();
  redrawChartData();

  // --- END: MODIFIED LOGIC ---
}

/**
 * Clears the elevation profile from the chart.
 */
function clearElevationProfile() {
  // --- START: MODIFIED ---
  currentRawData = [];
  // --- END: MODIFIED ---
  currentRealDistance = 0;

  // Clear summary text
  const summaryDiv = svg.select("#d3-summary-html");
  if (summaryDiv) {
    summaryDiv.html("");
  }

  // Clear chart area
  chartGroup.select(".altitude-area").attr("d", null);

  // Hide hover elements
  if (verticalLine) verticalLine.style("display", "none");
  if (chartGroup) chartGroup.select(".elevation-hover-tooltip-group").style("display", "none"); // Hide tooltip
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
  // --- START: MODIFIED ---
  if (currentRawData.length > 0) {
    // --- END: MODIFIED ---
    // Re-run the full draw function to update text and scales
    // Pass the original latlngs AND our stored, correct distance
    drawElevationProfile(
      // --- START: MODIFIED ---
      currentRawData.map((d) => d.latlng),
      // --- END: MODIFIED ---
      currentRealDistance
    );
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

  // --- START: MODIFIED ---
  if (!currentRawData || currentRawData.length === 0) return;
  // --- END: MODIFIED ---

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

  // --- START: MODIFIED ---
  // Use D3's bisector to find the *index* of the closest actual data point
  // in the RAW data.
  const bisector = d3.bisector((d) => d.distance).left;
  let index = bisector(currentRawData, hoverDistance, 1); // Start searching from index 1

  // Determine the closest point: the one before or the one at the bisector index
  const d0 = currentRawData[index - 1];
  const d1 = currentRawData[index];

  // Check if d1 exists before accessing its distance property
  if (d0 && d1) {
    index = hoverDistance - d0.distance > d1.distance - hoverDistance ? index : index - 1;
  } else if (d0) {
    // Only d0 exists, must be the last point
    index = currentRawData.length - 1;
  } else {
    // Neither exists or only d1 exists, must be the first point
    index = 0;
  }

  // Clamp index just in case (shouldn't be needed with proper bisect logic but safe)
  index = Math.max(0, Math.min(currentRawData.length - 1, index));

  const dataPoint = currentRawData[index];
  // --- END: MODIFIED ---

  if (dataPoint) {
    // --- START: MODIFIED TOOLTIP LOGIC ---

    // 1. Format text (shows the raw elevation)
    const distanceText = `Distance: ${formatDistance(dataPoint.distance)}`;
    const elevationFormatter = (meters) => {
      const feet = meters * 3.28084;
      return useImperial ? `${Math.round(feet)} ft` : `${Math.round(meters)} m`;
    };
    const elevationText = `Elevation: ${elevationFormatter(dataPoint.elevation)}`;

    // 2. Update text elements
    const textDist = chartGroup.select("#tooltip-distance-text").text(distanceText);
    const textElev = chartGroup.select("#tooltip-elevation-text").text(elevationText);

    // 3. Get text dimensions (must be done *after* setting text)
    const distBBox = textDist.node().getBBox();
    const elevBBox = textElev.node().getBBox();
    const textWidth = Math.max(distBBox.width, elevBBox.width);

    // Use a fixed line height for stable calculations
    const singleLineHeight = 12; // A bit more than 10px font size

    // 4. Define flag parameters
    const padding = 5;
    const flagWidth = textWidth + 2 * padding;
    const flagHeight = singleLineHeight * 2 + 2 * padding; // 2 lines of text
    const textY1 = padding + singleLineHeight - 2; // -2 for font alignment
    const textY2 = textY1 + singleLineHeight + 2; // +2 for line spacing
    let textX = padding; // Default for right-pointing flag
    let flagPathD = "";
    const lineX = x(dataPoint.distance);
    let groupTransformX = lineX; // Default X position
    const groupTransformY = 0; // At the top of the chart

    // 5. Check direction (left/right half)
    const pointsRight = lineX < width / 2;

    if (pointsRight) {
      // Flag is on the left (at lineX), points right
      textX = padding;
      groupTransformX = lineX;

      // Draw path: Simple rectangle starting at (0,0) and extending right
      flagPathD = [
        `M 0,0`, // Top-left (at lineX)
        `h ${flagWidth}`, // Top-right
        `v ${flagHeight}`, // Bottom-right
        `h ${-flagWidth}`, // Bottom-left
        `Z`, // Close
      ].join(" ");
    } else {
      // Flag is on the right (at lineX), points left
      textX = -flagWidth + padding;
      groupTransformX = lineX;

      // Draw path: Simple rectangle starting at (0,0) and extending left
      flagPathD = [
        `M 0,0`, // Top-right (at lineX)
        `h ${-flagWidth}`, // Top-left
        `v ${flagHeight}`, // Bottom-left
        `h ${flagWidth}`, // Bottom-right
        `Z`, // Close
      ].join(" ");
    }

    // 6. Apply updates to D3 elements
    const tooltip = chartGroup.select(".elevation-hover-tooltip-group");

    tooltip
      .attr("transform", `translate(${groupTransformX}, ${groupTransformY})`)
      .style("display", "block");

    tooltip.select(".elevation-hover-tooltip-path").attr("d", flagPathD);

    // --- START: MODIFIED LINES ---
    // Swapped textY1 and textY2 to show Elevation first
    textElev.attr("x", textX).attr("y", textY1);
    textDist.attr("x", textX).attr("y", textY2);
    // --- END: MODIFIED LINES ---

    // --- END: MODIFIED TOOLTIP LOGIC ---

    // Update the vertical line's position
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

  // --- START: NEW ---
  // Hide the tooltip flag
  if (chartGroup) {
    chartGroup.select(".elevation-hover-tooltip-group").style("display", "none");
  }
  // --- END: NEW ---

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
