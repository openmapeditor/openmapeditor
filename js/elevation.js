// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// ===================================================================================
// --- ELEVATION FUNCTIONALITY ---
// ===================================================================================

// At the top of elevation.js, initialize a cache object.
const elevationCache = new Map();

/**
 * Clears the elevation data cache and the current elevation profile display.
 */
function clearElevationCache() {
  elevationCache.clear();
  window.elevationProfile.clearElevationProfile();
  // Also, hide the elevation div if it's visible
  const elevationDiv = document.getElementById("elevation-div");
  if (elevationDiv) {
    elevationDiv.style.visibility = "hidden";
    isElevationProfileVisible = false;
  }
  updateElevationToggleIconColor();
}

async function fetchElevationForPathGoogle(latlngs, realDistance) {
  // <-- 1. Accept realDistance
  console.log("Fetching elevation data from: Google");
  if (!latlngs || latlngs.length < 2) return latlngs;

  try {
    // We just ask our central manager to make sure the API is ready.
    await ensureGoogleApiIsLoaded();
  } catch (error) {
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "API Error",
      text: error.message,
    });
    return null;
  }

  // By the time this line runs, the API is guaranteed to be ready.
  const elevator = new google.maps.ElevationService();
  const BATCH_SIZE = 512;
  let allResults = [];

  // --- START: NEW LOGIC based on user request ---
  // This logic implements the "simple" vs. "complex" path strategy.

  // 1. Define our thresholds.
  // "Simple" paths (<= 200 points) will be upsampled to 200.
  // "Complex" paths (> 200 points) will use their exact points.
  const SIMPLE_PATH_THRESHOLD = 200;

  // 2. Keep a safety cap.
  // This is the absolute maximum number of points we will EVER request
  // to prevent errors and high costs, even for "complex" paths.
  const MAX_POINTS_TO_REQUEST = 5000;

  // 3. Get the number of points in the original path.
  const actualPoints = latlngs.length;

  let pointsToSend;

  // 4. Decide what to do.
  if (actualPoints > MAX_POINTS_TO_REQUEST) {
    // CASE 1: Path is TOO complex (e.g., 50,000 points).
    // We MUST downsample it to our absolute cap.
    console.log(
      `[Elevation] Path is too complex (${actualPoints} points). Downsampling to ${MAX_POINTS_TO_REQUEST} points.`
    );
    // We assume `resamplePath` is a function available in your project
    pointsToSend = resamplePath(latlngs, MAX_POINTS_TO_REQUEST);
  } else if (actualPoints > SIMPLE_PATH_THRESHOLD) {
    // CASE 2: Path is "complex" (e.g., 201 to 2000 points).
    // Use the exact points as requested.
    console.log(
      `[Elevation] Path is "complex" (${actualPoints} points). Sending all original points.`
    );
    pointsToSend = latlngs;
  } else {
    // CASE 3: Path is "simple" (e.g., <= 200 points).
    // Upsample to 200 points as requested.
    console.log(
      `[Elevation] Path is "simple" (${actualPoints} points). Upsampling to ${SIMPLE_PATH_THRESHOLD} points.`
    );
    // We assume `resamplePath` is a function available in your project
    pointsToSend = resamplePath(latlngs, SIMPLE_PATH_THRESHOLD);
  }
  // --- END: NEW LOGIC ---

  // This batching loop now works for all cases.
  for (let i = 0; i < pointsToSend.length; i += BATCH_SIZE) {
    const batch = pointsToSend.slice(i, i + BATCH_SIZE);
    try {
      const response = await elevator.getElevationForLocations({ locations: batch });
      if (response && response.results) {
        const batchResults = response.results.map((result) =>
          L.latLng(result.location.lat(), result.location.lng(), result.elevation)
        );
        allResults = allResults.concat(batchResults);
      } else {
        throw new Error("API returned no results or an invalid format.");
      }
    } catch (error) {
      console.error("Error fetching elevation data from Google:", error);
      Swal.fire({
        icon: "error",
        iconColor: "var(--swal-color-error)",
        title: "Google Elevation Error",
        text: `Failed to fetch elevation data: ${error}`,
      });
      return null;
    }
  }
  return allResults;
}

// Main dispatcher function for fetching elevation data.
async function fetchElevationForPath(latlngs, realDistance) {
  // <-- 3. Accept realDistance
  const cacheKey = JSON.stringify(latlngs.map((p) => [p.lat.toFixed(5), p.lng.toFixed(5)]));

  if (elevationCache.has(cacheKey)) {
    console.log("Returning cached elevation data.");
    return Promise.resolve(elevationCache.get(cacheKey));
  }

  // Simplified: Always use Google.
  const pointsWithElev = await fetchElevationForPathGoogle(latlngs, realDistance); // <-- 4. Pass it

  if (pointsWithElev) {
    elevationCache.set(cacheKey, pointsWithElev);
  }

  return pointsWithElev;
}

function updateElevationToggleIconColor() {
  if (elevationToggleControl) {
    const materialSymbolsIcon = elevationToggleControl
      .getContainer()
      .querySelector(".material-symbols");
    if (materialSymbolsIcon) {
      materialSymbolsIcon.style.color = isElevationProfileVisible
        ? "var(--color-red)"
        : "var(--icon-color)";
    }
  }
}

async function addElevationProfileForLayer(layer) {
  if (
    !layer ||
    (!(layer instanceof L.Polyline) && !(layer instanceof L.Polygon)) ||
    !isElevationProfileVisible
  )
    return;

  let latlngs = layer instanceof L.Polyline ? layer.getLatLngs() : layer.getLatLngs()[0];
  if (latlngs?.length > 0) {
    // 1. Calculate the REAL distance using the same function as the info panel
    const realDistance = calculatePathDistance(layer);

    // 2. Fetch the elevation data (this will now use the hybrid logic)
    const pointsWithElev = await fetchElevationForPath(latlngs, realDistance); // <-- 5. Pass it here

    if (pointsWithElev?.length > 0) {
      // 3. Pass BOTH the elevation points AND the real distance to the chart
      window.elevationProfile.drawElevationProfile(pointsWithElev, realDistance);
    } else {
      console.warn("No valid elevation data.");
      window.elevationProfile.clearElevationProfile();
    }
  }
}
