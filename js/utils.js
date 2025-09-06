// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * Simplifies a geometry's coordinates (LineString or MultiLineString) using a provided configuration.
 *
 * @param {Array} coordinates The array of coordinates from a GeoJSON geometry, expected in [lng, lat] format.
 * @param {string} type The geometry type ('LineString' or 'MultiLineString').
 * @param {object} config The configuration object (e.g., pathSimplificationConfig or routeSimplificationConfig).
 * @returns {{simplified: boolean, coords: Array}} An object containing a flag indicating if simplification occurred
 * and the new (or original) coordinates.
 */
function simplifyPath(coordinates, type, config) {
  let overallSimplified = false;
  let newCoordinates;

  // Helper function to simplify a single path
  const simplifySinglePath = (pathCoords) => {
    // 1. Check against the minimum point threshold from the passed config.
    if (pathCoords.length <= config.MIN_POINTS) {
      return { simplified: false, coords: pathCoords };
    }

    // 2. Convert to the format simplify.js expects: {x, y}
    const points = pathCoords.map((c) => ({ x: c[0], y: c[1] }));

    // 3. Apply simplify.js with the tolerance from the passed config.
    const simplifiedPoints = simplify(points, config.TOLERANCE, true);

    // 4. Check if simplification actually happened.
    if (simplifiedPoints.length < pathCoords.length) {
      console.log(
        `Path segment simplified: ${pathCoords.length} -> ${simplifiedPoints.length} points`
      );
      // 5. Convert back to the original coordinate format.
      return { simplified: true, coords: simplifiedPoints.map((p) => [p.x, p.y]) };
    }

    return { simplified: false, coords: pathCoords };
  };

  if (type === "LineString") {
    const result = simplifySinglePath(coordinates);
    overallSimplified = result.simplified;
    newCoordinates = result.coords;
  } else if (type === "MultiLineString") {
    newCoordinates = coordinates.map((line) => {
      const result = simplifySinglePath(line);
      if (result.simplified) {
        overallSimplified = true;
      }
      return result.coords;
    });
  } else {
    // Return original coordinates for unhandled types (e.g., Polygon)
    return { simplified: false, coords: coordinates };
  }

  return { simplified: overallSimplified, coords: newCoordinates };
}

/**
 * FIX #1: Adds a robust, mobile-friendly clipboard copy function.
 * Uses the modern async Clipboard API if available (in secure contexts),
 * with a fallback to the legacy `document.execCommand` for broader compatibility.
 * @param {string} text The string to be copied to the clipboard.
 * @returns {Promise<void>} A promise that resolves on success and rejects on failure.
 */
function copyToClipboard(text) {
  // Use modern API if available and in a secure context
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for older browsers or insecure contexts (like HTTP)
  return new Promise((resolve, reject) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Make the textarea out of sight
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand("copy");
      if (successful) {
        resolve();
      } else {
        reject(new Error("Copy command failed."));
      }
    } catch (err) {
      reject(err);
    }
    document.body.removeChild(textArea);
  });
}

// Triggers a browser download for a text-based file.
// @param {string} filename - The desired name of the file.
// @param {string} text - The content of the file.
function downloadFile(filename, text) {
  const element = document.createElement("a");
  element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
  element.setAttribute("download", filename);
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

/**
 * A lightweight helper function to calculate the total distance of a path.
 * This replaces the calculation that was part of the label creation.
 * @param {L.Polyline | L.Polygon} path The layer to measure.
 * @returns {number} The total distance in meters.
 */
function calculatePathDistance(path) {
  if (!(path instanceof L.Polyline) && !(path instanceof L.Polygon)) return 0;
  let latlngs = path.getLatLngs();
  // Flatten array if needed for MultiPolyline
  while (latlngs.length > 0 && Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
    latlngs = latlngs[0];
  }
  if (latlngs.length < 2) return 0;

  let cumulativeDistance = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const p1 = latlngs[i];
    const p2 = latlngs[i + 1];
    if (p1 && typeof p1.distanceTo === "function" && p2) {
      cumulativeDistance += p1.distanceTo(p2);
    }
  }
  return cumulativeDistance;
}

/**
 * Downsamples a path to a maximum number of points using a step interval.
 *
 * @param {Array<L.LatLng>} latlngs The original array of points.
 * @param {number} maxPoints The maximum number of points for the output array.
 * @returns {Array<L.LatLng>} The downsampled array of points, or the original if it's within the limit.
 */
function downsamplePath(latlngs, maxPoints) {
  if (!latlngs || latlngs.length <= maxPoints) {
    return latlngs;
  }

  console.warn(`Path has ${latlngs.length} points. Downsampling to ${maxPoints}.`);
  const pointsToSend = [];
  const step = Math.floor(latlngs.length / (maxPoints - 1));
  for (let i = 0; i < maxPoints - 1; i++) {
    pointsToSend.push(latlngs[i * step]);
  }
  pointsToSend.push(latlngs[latlngs.length - 1]); // Always include the last point
  return pointsToSend;
}

/**
 * Sets up autocomplete functionality for a text input field using a geocoding provider.
 * @param {HTMLInputElement} inputEl The input element to attach the autocomplete to.
 * @param {HTMLElement} suggestionsEl The container element to display suggestions in.
 * @param {function(L.LatLng, string): void} callback The function to call when a location is selected. It receives the LatLng object and the location's label.
 */
function setupAutocomplete(inputEl, suggestionsEl, callback) {
  const geocoder = new GeoSearch.OpenStreetMapProvider({
    // params: {
    //   email: "your-email@example.com",
    // },
  });
  let debounceTimeout;
  let activeSuggestionIndex = -1;

  function updateActiveSuggestion() {
    const items = suggestionsEl.querySelectorAll(".autocomplete-suggestion-item");
    items.forEach((item, index) => {
      item.classList.toggle("active", index === activeSuggestionIndex);
    });
  }

  inputEl.addEventListener("input", () => {
    clearTimeout(debounceTimeout);
    activeSuggestionIndex = -1; // Reset on new input
    const query = inputEl.value;
    if (query.length < 3) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.style.display = "none";
      return;
    }
    debounceTimeout = setTimeout(async () => {
      const results = await geocoder.search({ query });
      suggestionsEl.innerHTML = "";
      if (results && results.length > 0) {
        suggestionsEl.style.display = "block";
        results.forEach((result) => {
          const item = document.createElement("div");
          item.className = "autocomplete-suggestion-item";
          item.textContent = result.label;
          item.addEventListener("click", (e) => {
            L.DomEvent.stop(e);
            inputEl.value = result.label;
            callback(L.latLng(result.y, result.x), result.label); // Pass latlng and label
            suggestionsEl.innerHTML = "";
            suggestionsEl.style.display = "none";
          });
          suggestionsEl.appendChild(item);
        });
      } else {
        suggestionsEl.style.display = "none";
      }
    }, 300);
  });

  // START: ADDED KEYDOWN LISTENER
  inputEl.addEventListener("keydown", (e) => {
    const items = suggestionsEl.querySelectorAll(".autocomplete-suggestion-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
      updateActiveSuggestion();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
      updateActiveSuggestion();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestionIndex > -1) {
        items[activeSuggestionIndex].click();
        activeSuggestionIndex = -1;
      }
    } else if (e.key === "Escape") {
      suggestionsEl.style.display = "none";
      activeSuggestionIndex = -1;
    }
  });
  // END: ADDED KEYDOWN LISTENER

  document.addEventListener("click", (e) => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      suggestionsEl.style.display = "none";
    }
  });
}

/**
 * Formats a distance in meters into a human-readable string,
 * respecting the global 'useImperialUnits' setting.
 * @param {number} meters The distance in meters.
 * @param {boolean} [includeSecondary=false] - If true, adds the other unit system in parentheses.
 * @returns {string} The formatted distance string (e.g., "10.54 km" or "6.55 mi").
 */
function formatDistance(meters, includeSecondary = false) {
  if (typeof meters !== "number" || isNaN(meters)) {
    return "";
  }

  const METERS_TO_FEET = 3.28084;
  const METERS_TO_MILES = 0.000621371;

  const km = meters / 1000;
  const miles = meters * METERS_TO_MILES;

  let primaryDisplay, secondaryDisplay;

  if (useImperialUnits) {
    // Imperial is primary
    if (miles < 0.1 && miles > 0) {
      primaryDisplay = `${Math.round(meters * METERS_TO_FEET)} ft`;
    } else {
      primaryDisplay = `${miles.toFixed(2)} mi`;
    }
    secondaryDisplay = km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(2)} km`;
  } else {
    // Metric is primary
    if (km < 1) {
      primaryDisplay = `${Math.round(meters)} m`;
    } else {
      primaryDisplay = `${km.toFixed(2)} km`;
    }
    secondaryDisplay =
      miles < 0.1 ? `${Math.round(meters * METERS_TO_FEET)} ft` : `${miles.toFixed(2)} mi`;
  }

  return includeSecondary ? `${primaryDisplay} (${secondaryDisplay})` : primaryDisplay;
}
