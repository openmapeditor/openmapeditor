// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// ===================================================================================
// --- ELEVATION FUNCTIONALITY ---
// ===================================================================================

// At the top of elevation.js, initialize a cache object.
const elevationCache = new Map();

// We assume proj4 has been loaded globally (e.g., via <script> tag)
// 1. Define our coordinate system names
const WGS84 = "EPSG:4326"; // Standard Lat/Lng
const LV95 = "EPSG:2056"; // Swiss Grid

// 2. Teach proj4js what LV95 is. This is the official definition.
// This only needs to be done once when the script loads.
if (typeof proj4 !== "undefined") {
  // Safety check
  // matrix is coming from https://epsg.io/2056.proj4
  proj4.defs(
    LV95,
    "+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs"
  );
} else {
  console.error("proj4js is not loaded. Coordinate conversion will fail.");
}

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
 * Converts an array of points between coordinate systems LOCALLY using proj4js.
 * This is a synchronous and very fast operation.
 *
 * @param {L.LatLng[]} latlngs - An array of Leaflet LatLng objects. (p.lng/p.lat)
 * @param {string} inSr - The input EPSG code (e.g., '4326' or '2056').
 * @param {string} outSr - The output EPSG code (e.g., '2056' or '4326').
 * @returns {Array<[number, number]>} An array of [lng, lat] or [easting, northing] coordinates.
 */
function convertPath(latlngs, inSr, outSr) {
  if (typeof proj4 === "undefined") {
    throw new Error("proj4js is not loaded. Cannot convert coordinates.");
  }

  let fromProj, toProj;

  // 1. Configure transformation
  if (inSr === "4326" && outSr === "2056") {
    fromProj = WGS84;
    toProj = LV95;
  } else if (inSr === "2056" && outSr === "4326") {
    fromProj = LV95;
    toProj = WGS84;
  } else {
    throw new Error(`Unsupported conversion: ${inSr} to ${outSr}`);
  }

  // 2. Get the transformation function from proj4
  const transformer = proj4(fromProj, toProj);

  // 3. Perform the conversion by mapping over the array

  // Case A: WGS84 (Lng, Lat) -> LV95 (Easting, Northing)
  if (toProj === LV95) {
    return latlngs.map((p) => {
      // Input for WGS84 is [lng, lat]
      const coords = transformer.forward([p.lng, p.lat]);
      return [coords[0], coords[1]]; // [easting, northing]
    });
  }

  // Case B: LV95 (Easting, Northing) -> WGS84 (Lng, Lat)
  // Note: The caller stores Easting in p.lng, Northing in p.lat
  else {
    return latlngs.map((p) => {
      // Input for LV95 is [easting, northing]
      const coords = transformer.forward([p.lng, p.lat]);
      return [coords[0], coords[1]]; // [lng, lat]
    });
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
  // --- START: Debug Toggle ---
  // Set this to true to activate the debug output in the console
  const ENABLE_GEOADMIN_DEBUG = true;
  // --- END: Debug Toggle ---

  console.log("Fetching elevation data from: GeoAdmin (geo.admin.ch)");

  try {
    // --- Step 1: Convert our WGS 84 path to LV95 ---
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
    let debugDataForTable = []; // --- Debug: Initialize array ---

    for (let i = 0; i < validSwissPoints.length; i++) {
      const swissPoint = validSwissPoints[i]; // Use the valid point
      const wgs84Coord = profileWgs84Coords[i]; // [lng, lat]

      // Get altitude, default to 0 if 'COMB' (combined) model isn't present
      // Also check if alts is null, or if COMB is null/not finite
      const altitude = swissPoint.alts && isFinite(swissPoint.alts.COMB) ? swissPoint.alts.COMB : 0;

      pointsWithElev.push(
        L.latLng(wgs84Coord[1], wgs84Coord[0], altitude) // L.latLng(lat, lng, alt)
      );

      // --- START: Debug data capture (inside loop) ---
      if (ENABLE_GEOADMIN_DEBUG) {
        debugDataForTable.push({
          Distance: swissPoint.dist,
          Altitude: altitude,
          Easting: swissPoint.easting,
          Northing: swissPoint.northing,
          Longitude: wgs84Coord[0],
          Latitude: wgs84Coord[1],
        });
      }
      // --- END: Debug data capture ---
    }

    // --- START: Debug output (after loop) ---
    if (ENABLE_GEOADMIN_DEBUG) {
      console.log("--- GeoAdmin Debug Data (View Only) ---");
      console.table(debugDataForTable);

      // 3. Create a CSV string you can copy
      let csvContent = "Distance;Altitude;Easting;Northing;Longitude;Latitude\n";
      debugDataForTable.forEach((row) => {
        csvContent += `${row.Distance};${row.Altitude};${row.Easting};${row.Northing};${row.Longitude};${row.Latitude}\n`;
      });

      // 4. Create a helper function to copy the CSV string to your clipboard
      window.copyGeoAdminCSV = () => {
        copy(csvContent); // 'copy()' is a built-in console helper
        console.log("CSV data copied to clipboard!");
      };

      console.log(
        "%cTo copy data as CSV, type copyGeoAdminCSV() in the console and press Enter.",
        "color: blue; font-size: 14px;"
      );
    }
    // --- END: Debug output ---

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

  // Get the selected elevation provider from localStorage (default to "google")
  const elevationProvider = localStorage.getItem("elevationProvider") || "google";

  let pointsWithElev;
  if (elevationProvider === "geoadmin") {
    pointsWithElev = await fetchElevationForPathGeoAdminAPI(latlngs);
  } else {
    pointsWithElev = await fetchElevationForPathGoogle(latlngs, realDistance);
  }

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
