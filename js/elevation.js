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
  if (elevationControl) {
    elevationControl.clear();
    // Also, hide the elevation div if it's visible
    const elevationDiv = document.getElementById("elevation-div");
    if (elevationDiv) {
      elevationDiv.style.visibility = "hidden";
      isElevationProfileVisible = false;
    }
    updateElevationToggleIconColor();
  }
}

// This promise acts as a signal. It will resolve when the API script is ready.
let resolveGoogleMapsApi;
const googleMapsApiPromise = new Promise((resolve) => {
  resolveGoogleMapsApi = resolve;
});

/**
 * This is our callback function. Google's script will call this function by name
 * once all its internal modules, including ElevationService, are loaded and ready.
 */
function onGoogleMapsApiReady() {
  resolveGoogleMapsApi(); // This gives the "green light" by resolving the promise.
}

/**
 * REPAIRED: Fetches elevation data by dynamically loading the Google Maps script
 * using the key from config.js and waiting for the callback.
 */
async function fetchElevationForPathGoogle(latlngs) {
  console.log("Fetching elevation data from: Google");
  if (!latlngs || latlngs.length < 2) return latlngs;

  // This block runs only once to create and add the script tag to the page.
  // It uses the 'googleApiKey' variable from your config.js file.
  if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
    if (!googleApiKey) {
      console.error("Google API Key is missing from config.js");
      Swal.fire({
        icon: "error",
        iconColor: "var(--swal-color-error)",
        title: "API Key Missing",
        text: "Google API key is not configured in config.js.",
      });
      return null;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&loading=async&libraries=elevation&callback=onGoogleMapsApiReady`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  // The code will pause here and wait for the "green light" from onGoogleMapsApiReady.
  await googleMapsApiPromise;

  // By the time this line runs, we are 100% sure that google.maps.ElevationService exists.
  const elevator = new google.maps.ElevationService();
  const BATCH_SIZE = 512;
  let allResults = [];

  let pointsToSend = latlngs;
  if (enablePreFetchDownsampling) {
    pointsToSend = downsamplePath(latlngs, ELEVATION_PROVIDER_CONFIG.google.limit);
  }

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

// Fetches elevation data for a path from Mapbox Tilequery API.
async function fetchElevationForPathMapbox(latlngs) {
  console.log("Fetching elevation data from: Mapbox");
  if (!latlngs || latlngs.length === 0) return null;

  if (!mapboxAccessToken) {
    console.error("Mapbox Access Token is missing or a placeholder.");
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "API Key Missing",
      text: "Mapbox Access Token is not configured. Please add it to the script.",
    });
    return null;
  }

  let pointsToSend = latlngs;
  if (enablePreFetchDownsampling) {
    pointsToSend = downsamplePath(latlngs, ELEVATION_PROVIDER_CONFIG.mapbox.limit);
  }

  const promises = pointsToSend.map((p) => {
    // CORRECTED: Added &layers=contour and &limit=50 to the URL.
    const url = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${p.lng},${p.lat}.json?layers=contour&limit=50&access_token=${mapboxAccessToken}`;
    return fetch(url).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    });
  });

  try {
    const results = await Promise.all(promises);
    const pointsWithElev = results.map((result, index) => {
      const originalPoint = pointsToSend[index];

      // CORRECTED: Find the highest elevation from all returned features.
      if (result.features && result.features.length > 0) {
        // Get all elevation values from the returned features.
        const elevations = result.features.map((feature) => feature.properties.ele);
        // Find the highest elevation value among them.
        const highestElevation = Math.max(...elevations);
        return L.latLng(originalPoint.lat, originalPoint.lng, highestElevation);
      }

      // If no features were returned, use 0 as a fallback.
      return L.latLng(originalPoint.lat, originalPoint.lng, 0);
    });
    return pointsWithElev;
  } catch (error) {
    console.error("Error fetching elevation data from Mapbox:", error);
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "Mapbox Elevation Error",
      text: `Failed to fetch elevation data: ${error.message}`,
    });
    return null;
  }
}

// Fetches elevation data for a path from Open Topo Data.
async function fetchElevationForPathOpenTopoData(latlngs) {
  console.log("Fetching elevation data from: Open Topo Data");
  if (!latlngs || latlngs.length < 2) {
    if (latlngs && latlngs.length === 1)
      console.warn("Only one point provided for elevation, cannot draw profile.");
    return null;
  }

  // Remove duplicates first
  const uniquePoints = [];
  const seen = new Set();
  latlngs.forEach((p) => {
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (!seen.has(key)) {
      uniquePoints.push(p);
      seen.add(key);
    }
  });

  let pointsToSend = uniquePoints;
  if (enablePreFetchDownsampling) {
    pointsToSend = downsamplePath(uniquePoints, ELEVATION_PROVIDER_CONFIG.openTopo.limit);
  }

  const locations = pointsToSend.map((p) => `${p.lat},${p.lng}`).join("|");
  // We prepend a CORS proxy to the original URL to bypass the browser's security block.
  // WARNING: Public proxies are not for production use.
  const originalUrl = `https://api.opentopodata.org/v1/srtm90m?locations=${locations}`;
  const url = `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const apiResponse = await response.json();
    if (
      apiResponse.status === "OK" &&
      apiResponse.results &&
      apiResponse.results.length === pointsToSend.length
    ) {
      return pointsToSend.map((p, i) => L.latLng(p.lat, p.lng, apiResponse.results[i].elevation));
    } else {
      console.warn("Open Topo Data: API returned non-OK status or data mismatch.", apiResponse);
      return null;
    }
  } catch (error) {
    console.error("Error fetching elevation data from Open Topo Data:", error);
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "Open Topo Data Error",
      text: "Failed to fetch elevation data.",
    });
    return null;
  }
}

// Main dispatcher function for fetching elevation data.
async function fetchElevationForPath(latlngs) {
  const cacheKey = JSON.stringify(latlngs.map((p) => [p.lat.toFixed(5), p.lng.toFixed(5)]));

  if (elevationCache.has(cacheKey)) {
    console.log("Returning cached elevation data.");
    return Promise.resolve(elevationCache.get(cacheKey));
  }

  let pointsWithElev;
  if (elevationProvider === "google") {
    pointsWithElev = await fetchElevationForPathGoogle(latlngs);
  } else if (elevationProvider === "mapbox") {
    pointsWithElev = await fetchElevationForPathMapbox(latlngs);
  } else {
    pointsWithElev = await fetchElevationForPathOpenTopoData(latlngs);
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
    const pointsWithElev = await fetchElevationForPath(latlngs);
    if (pointsWithElev?.length > 0) {
      elevationControl.addData(L.polyline(pointsWithElev).toGeoJSON());
    } else {
      console.warn("No valid elevation data. Adding flat profile.");
      elevationControl.addData(layer.toGeoJSON());
    }
  }
}
