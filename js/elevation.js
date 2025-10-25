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

  // --- START: "SMARTER" HYBRID LOGIC (FIXED) ---

  // 1. Define our desired resolution. 0.04 = 1 point every 25 meters.
  const POINTS_PER_METER = 0.04;

  // 2. Set a safety cap. We won't resample to more than 10,000 points.
  const MAX_RESAMPLE_POINTS = 10000;

  // 3. Use the passed-in realDistance
  const totalDistance = realDistance; // <-- 2. Use the passed-in value
  const desiredPoints = Math.floor(totalDistance * POINTS_PER_METER);
  const actualPoints = latlngs.length;

  let pointsToSend;

  // 4. Compare and Decide
  if (actualPoints < desiredPoints && desiredPoints > 2) {
    // Path is SIMPLE. We need to upsample it.
    const pointsToCreate = Math.min(desiredPoints, MAX_RESAMPLE_POINTS);

    console.log(
      `[Elevation] Path is simple (${actualPoints} points over ${formatDistance(
        totalDistance
      )}). Upsampling to ${pointsToCreate} points (1 per ~${(
        totalDistance / pointsToCreate
      ).toFixed(1)}m).`
    );

    pointsToSend = resamplePath(latlngs, pointsToCreate);
  } else {
    // Path is COMPLEX or very short. Send all original points.
    console.log(
      `[Elevation] Path is complex (${actualPoints} points). Sending all original points in batches for maximum accuracy.`
    );
    pointsToSend = latlngs;
  }
  // --- END: "SMARTER" HYBRID LOGIC (FIXED) ---

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
