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

/**
 * Converts an array of points between coordinate systems using the Swisstopo REFRAME API.
 * This function makes parallel API calls, one for each point.
 *
 * NOTE: The API endpoints are part of the 'geodesy.geo.admin.ch' service, which also
 * hosts a user-facing file-upload tool at its root. We are using the REST endpoints
 * documented in the "Geodetic REST Web services (REFRAME Web API)" user manual.
 *
 * This API confusingly uses 'easting'/'northing' as keys for both input and output,
 * even when the output is WGS84 (Lng/Lat).
 *
 * @see https://www.swisstopo.admin.ch/en/rest-api-geoservices-reframe-web (API homepage)
 * @see https://www.swisstopo.admin.ch/dam/fr/sd-web/3xmcWvfxgG6X/Report16-03.pdf (Direct PDF User Manual, see section 4.1)
 *
 * @param {L.LatLng[]} latlngs - An array of Leaflet LatLng objects. (p.lng/p.lat)
 * @param {string} inSr - The input EPSG code (e.g., '4326' or '2056').
 * @param {string} outSr - The output EPSG code (e.g., '2056' or '4326').
 * @returns {Promise<Array<[number, number]>>} A promise that resolves to an array of [lng, lat] or [easting, northing] coordinates.
 */
async function convertPath(latlngs, inSr, outSr) {
  let apiUrl, inputParamsKey, outputKeys;

  // 1. Configure API endpoints and parameter keys
  if (inSr === "4326" && outSr === "2056") {
    apiUrl = "https://geodesy.geo.admin.ch/reframe/wgs84tolv95";
    // Input keys for WGS84
    inputParamsKey = (p) => `easting=${p.lng}&northing=${p.lat}`; // API uses 'easting' for lng, 'northing' for lat
    // Expected output keys
    outputKeys = ["easting", "northing"];
  } else if (inSr === "2056" && outSr === "4326") {
    apiUrl = "https://geodesy.geo.admin.ch/reframe/lv95towgs84";
    // Input keys for LV95 (stored in p.lng/p.lat by the caller)
    inputParamsKey = (p) => `easting=${p.lng}&northing=${p.lat}`;

    // --- START: *** THIS IS THE FIX *** ---
    // The API confusingly returns 'easting' (for Lng) and 'northing' (for Lat)
    outputKeys = ["easting", "northing"];
    // --- END: *** THIS IS THE FIX *** ---
  } else {
    throw new Error(`Unsupported conversion: ${inSr} to ${outSr}`);
  }

  // 2. Create an array of fetch promises
  const promises = latlngs.map((p) => {
    const url = `${apiUrl}?${inputParamsKey(p)}&format=json`;
    return fetch(url) // This is now a GET request (default for fetch)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Reframe API failed (${response.status}) for point ${p.lng},${p.lat}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.error) {
          throw new Error(`Reframe API error: ${data.error.message}`);
        }
        // The API returns strings, convert them to numbers
        const val1 = parseFloat(data[outputKeys[0]]);
        const val2 = parseFloat(data[outputKeys[1]]);

        // --- ADDED SAFETY CHECK ---
        // If parsing fails (e.g., for null or ""), parseFloat returns NaN.
        // We must catch this here, otherwise Promise.all will succeed with bad data.
        if (isNaN(val1) || isNaN(val2)) {
          // Throw the *entire* problematic JSON response so we can see what it is
          throw new Error(`Reframe API returned invalid JSON: ${JSON.stringify(data)}`);
        }
        return [val1, val2]; // [easting, northing] or [lng, lat]
      });
  });

  // 3. Wait for all promises to resolve
  try {
    const coordinates = await Promise.all(promises);
    return coordinates;
  } catch (error) {
    console.error(`Coordinate conversion failed (inSr: ${inSr}, outSr: ${outSr}):`, error);
    throw error; // Re-throw to stop the fetch chain
  }
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

/**
 * Fetches elevation data from the official GeoAdmin API.
 * This mimics the logic from 'profile_helpers.py'.
 *
 * @see https://api3.geo.admin.ch/services/sdiservices.html#profile
 */
async function fetchElevationForPathGeoAdminAPI(latlngs) {
  console.log("Fetching elevation data from: GeoAdmin (geo.admin.ch)");

  try {
    // --- Step 1: Convert our WGS 84 path to LV95 ---
    // This now uses the corrected, parallel 'convertPath' function
    const lv95Coordinates = await convertPath(latlngs, "4326", "2056");
    const lv95GeoJson = JSON.stringify({
      type: "LineString",
      coordinates: lv95Coordinates, // [[easting, northing], ...]
    });

    // --- Step 2: Call the profile.json service ---
    const profileApiUrl = "https://api3.geo.admin.ch/rest/services/profile.json";
    const profileParams = new URLSearchParams();
    profileParams.append("geom", lv95GeoJson);
    profileParams.append("sr", "2056"); // We are providing LV95 coordinates
    profileParams.append("nb_points", "200"); // Mimic PROFILE_DEFAULT_AMOUNT_POINTS

    const profileResponse = await fetch(profileApiUrl, {
      method: "POST", // This API (profile.json) does accept POST
      body: profileParams,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!profileResponse.ok) {
      throw new Error(
        `Profile API failed (${profileResponse.status}): ${await profileResponse.text()}`
      );
    }

    const swissProfilePoints = await profileResponse.json();
    if (!swissProfilePoints || swissProfilePoints.length === 0) {
      throw new Error("Profile API returned no data.");
    }

    // --- START: FIX ---
    // Filter out any points that the API returned without valid, finite numeric coordinates.
    // isFinite() correctly handles null, undefined, NaN, "", and "some-string".
    const validSwissPoints = swissProfilePoints.filter(
      (p) => isFinite(p.easting) && isFinite(p.northing)
    );
    // --- END: FIX ---

    if (validSwissPoints.length === 0) {
      // This can happen if the *entire* line is outside Switzerland
      throw new Error(
        "Profile API returned data, but no valid coordinates (line may be outside data area)."
      );
    }

    // --- Step 3: Convert the *new* 200 points back to WGS 84 ---
    // We need them back in lat/lng for our map hover marker.
    // NOTE: We store LV95 easting in lng, northing in lat
    // Use the filtered 'validSwissPoints' array here
    const profileLv95LatLngs = validSwissPoints.map((p) => L.latLng(p.northing, p.easting));

    const profileWgs84Coords = await convertPath(
      profileLv95LatLngs,
      "2056", // Input is LV95
      "4326" // Output is WGS 84
    );

    // --- Step 4: Merge the data ---
    // We create the final array of L.LatLng objects with altitude,
    // which is exactly what `drawElevationProfile` expects.
    const pointsWithElev = [];
    // Iterate over the 'validSwissPoints' array to match the length of 'profileWgs84Coords'
    for (let i = 0; i < validSwissPoints.length; i++) {
      const swissPoint = validSwissPoints[i]; // Use the valid point
      const wgs84Coord = profileWgs84Coords[i]; // [lng, lat]

      // Get altitude, default to 0 if 'COMB' (combined) model isn't present
      // Also check if alts is null, or if COMB is null/not finite
      const altitude = swissPoint.alts && isFinite(swissPoint.alts.COMB) ? swissPoint.alts.COMB : 0;

      pointsWithElev.push(
        L.latLng(wgs84Coord[1], wgs84Coord[0], altitude) // L.latLng(lat, lng, alt)
      );
    }

    // This array is now in the *exact* same format as the Google one
    // and can be processed by formatDataForD3 in elevation-profile.js
    return pointsWithElev;
  } catch (error) {
    console.error("Error fetching elevation from GeoAdmin API:", error);
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "GeoAdmin Elevation Error",
      text: `Failed to fetch elevation data: ${error.message}`,
    });
    return null;
  }
}

// Main dispatcher function for fetching elevation data.
async function fetchElevationForPath(latlngs, realDistance) {
  // <-- 3. Accept realDistance
  const cacheKey = JSON.stringify(latlngs.map((p) => [p.lat.toFixed(5), p.lng.toFixed(5)]));

  if (elevationCache.has(cacheKey)) {
    console.log("Returning cached elevation data.");
    return Promise.resolve(elevationCache.get(cacheKey));
  }

  // --- START: MODIFICATION FOR TEST ---
  // Simplified: Always use GeoAdminAPI for this test.
  // const pointsWithElev = await fetchElevationForPathGoogle(latlngs, realDistance); // <-- 4. Pass it
  const pointsWithElev = await fetchElevationForPathGeoAdminAPI(latlngs);
  // --- END: MODIFICATION FOR TEST ---

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
