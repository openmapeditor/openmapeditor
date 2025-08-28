// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// --- Strava API Configuration ---
const redirectURI = window.location.origin + window.location.pathname;
const scope = "read,activity:read_all";
const stravaAuthURL = `https://www.strava.com/oauth/authorize?client_id=${stravaClientId}&redirect_uri=${redirectURI}&response_type=code&scope=${scope}`;
const tokenURL = "https://www.strava.com/oauth/token";
const activitiesURL = "https://www.strava.com/api/v3/athlete/activities";
const streamsURL = "https://www.strava.com/api/v3/activities";

// --- DOM Elements ---
let stravaPanelContent;

// --- START: Refactored Functions ---
// The following functions have been moved to the top-level scope to prevent
// re-initialization errors and improve code structure.

/**
 * Displays the "Connect with Strava" button.
 */
function showConnectUI() {
  if (!stravaPanelContent) return;
  stravaPanelContent.innerHTML = `
    <p style="padding: 15px; text-align: center;">Connect with Strava to see your activities.</p>
    <a href="${stravaAuthURL}" class="strava-button-link">
      <img src="https://openmapeditor.github.io/openmapeditor-assets/btn_strava_connect_with_orange.svg" alt="Connect with Strava" />
    </a>
  `;
}

/**
 * Displays the UI for fetching and exporting activities after a successful connection.
 * @param {number} [activityCount=0] - The number of currently loaded activities.
 */
function showFetchUI(activityCount = 0) {
  if (!stravaPanelContent) return;
  const message =
    activityCount > 0 ? `${activityCount} activities loaded.` : "Ready to fetch your activities.";
  stravaPanelContent.innerHTML = `
      <p style="padding: 15px; text-align: center;">Successfully connected to Strava.<br>${message}</p>
      <div style="display: flex; gap: 10px; justify-content: center; width: 100%;">
        <button id="fetch-strava-btn" class="strava-button" style="flex: 1;">Fetch Activities</button>
        <button id="export-strava-kmz-btn" class="strava-button" style="flex: 1;">Export as KMZ</button>
      </div>
      <p id="strava-progress" style="text-align: center; padding: 10px; display: none;"></p>
    `;
  document.getElementById("fetch-strava-btn").addEventListener("click", fetchAllActivities);

  const exportBtn = document.getElementById("export-strava-kmz-btn");
  exportBtn.addEventListener("click", exportStravaActivitiesAsKmz);
  exportBtn.disabled = activityCount === 0;
  if (activityCount === 0) {
    exportBtn.style.backgroundColor = "#aaa";
    exportBtn.style.cursor = "not-allowed";
  }
}

/**
 * Exchanges the authorization code for an access token and stores it.
 * @param {string} code The authorization code from Strava.
 */
function getAccessToken(code) {
  if (!stravaPanelContent) return;
  stravaPanelContent.innerHTML =
    '<p style="padding: 15px; text-align: center;">Authenticating...</p>';

  fetch(tokenURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: stravaClientId,
      client_secret: stravaClientSecret,
      code: code,
      grant_type: "authorization_code",
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.access_token) {
        sessionStorage.setItem("strava_access_token", data.access_token);
        sessionStorage.setItem("strava_refresh_token", data.refresh_token);
        sessionStorage.setItem("strava_expires_at", data.expires_at);
        showFetchUI();
      } else {
        throw new Error("Access token not received.");
      }
    })
    .catch((error) => {
      console.error("Error getting Strava access token:", error);
      stravaPanelContent.innerHTML =
        '<p style="padding: 15px; text-align: center; color: red;">Authentication failed. Please try again.</p>';
      setTimeout(showConnectUI, 3000);
    })
    .finally(() => {
      const cleanURL =
        window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({}, document.title, cleanURL);
    });
}

/**
 * Fetches all activities from the Strava API, handling pagination.
 */
async function fetchAllActivities() {
  const accessToken = sessionStorage.getItem("strava_access_token");
  if (!accessToken) {
    alert("Strava connection expired. Please connect again.");
    showConnectUI();
    return;
  }

  const fetchBtn = document.getElementById("fetch-strava-btn");
  const exportBtn = document.getElementById("export-strava-kmz-btn");
  if (fetchBtn) fetchBtn.style.display = "none";
  if (exportBtn) exportBtn.style.display = "none";

  const progressText = document.getElementById("strava-progress");
  if (progressText) {
    progressText.style.display = "block";
    progressText.innerText = "Starting activity fetch...";
  }

  let allActivities = [];
  let page = 1;
  const perPage = 100;
  let keepFetching = true;

  while (keepFetching) {
    try {
      const url = `${activitiesURL}?access_token=${accessToken}&per_page=${perPage}&page=${page}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const activities = await response.json();

      if (activities.length > 0) {
        allActivities.push(...activities);
        if (progressText) progressText.innerText = `Fetched ${allActivities.length} activities...`;
        page++;
      } else {
        keepFetching = false;
      }
    } catch (error) {
      console.error("Error fetching Strava activities:", error);
      if (progressText)
        progressText.innerText = "Error fetching activities. See console for details.";
      keepFetching = false;
    }
  }

  if (progressText)
    progressText.innerText = `Found ${allActivities.length} total activities. Processing...`;
  displayActivitiesOnMap(allActivities);
}

/**
 * Creates and triggers a download for a KMZ file containing all loaded Strava activities.
 */
async function exportStravaActivitiesAsKmz() {
  if (stravaActivitiesLayer.getLayers().length === 0) {
    return Swal.fire({
      icon: "info",
      title: "No Activities Loaded",
      text: "Please fetch your activities before exporting.",
    });
  }

  const zip = new JSZip();
  const stravaPlacemarks = [];

  stravaActivitiesLayer.eachLayer((layer) => {
    const defaultName = layer.feature?.properties?.name || "Strava Activity";
    const kmlSnippet = generateKmlForLayer(layer, defaultName);
    if (kmlSnippet) {
      stravaPlacemarks.push(kmlSnippet);
    }
  });

  if (stravaPlacemarks.length === 0) {
    return Swal.fire({
      icon: "warning",
      title: "No Exportable Data",
      text: "Could not generate KML data for the loaded activities.",
    });
  }

  const docName = "Strava Activities";
  const kmlContent = createKmlDocument(docName, stravaPlacemarks);
  // --- FIX: Use a descriptive filename inside the KMZ ---
  zip.file("Strava_Activities.kml", kmlContent);

  try {
    const content = await zip.generateAsync({ type: "blob" });
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now
      .getDate()
      .toString()
      .padStart(2, "0")}${now.getHours().toString().padStart(2, "0")}${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
    const fileName = `Strava_Export_${timestamp}.kmz`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error("Error generating Strava KMZ:", error);
    Swal.fire({
      icon: "error",
      title: "Export Error",
      text: `Failed to generate KMZ file: ${error.message}`,
    });
  }
}

// --- END: Refactored Functions ---

/**
 * Initializes the Strava integration.
 * This is the main entry point, setting up UI and handling the OAuth callback.
 */
function initializeStrava() {
  stravaPanelContent = document.getElementById("strava-panel-content");
  const urlParams = new URLSearchParams(window.location.search);
  const authCode = urlParams.get("code");

  if (authCode) {
    document.getElementById("tab-btn-strava").click();
    getAccessToken(authCode);
  } else {
    showConnectUI();
  }
}

/**
 * Fetches the original data stream for a Strava activity and initiates a GPX download.
 * @param {string} activityId The ID of the Strava activity.
 * @param {string} activityName The name of the activity, used for the filename.
 */
async function downloadOriginalStravaGpx(activityId, activityName) {
  const accessToken = sessionStorage.getItem("strava_access_token");
  if (!accessToken) {
    return Swal.fire({
      icon: "warning",
      title: "Connection Expired",
      text: "Your Strava connection has expired. Please reconnect via the Strava panel.",
    });
  }

  const startTime = Date.now();
  const MIN_DISPLAY_TIME_MS = 1000;

  Swal.fire({
    title: "Fetching Original Data",
    text: "Please wait while we download the high-resolution track from Strava...",
    didOpen: () => {
      Swal.showLoading();
    },
    allowOutsideClick: false,
  });

  try {
    const response = await fetch(
      `${streamsURL}/${activityId}/streams?keys=latlng,altitude&key_by_type=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Strava API responded with status ${response.status}`);
    }

    const streams = await response.json();

    if (!streams.latlng || streams.latlng.data.length === 0) {
      return Swal.fire({
        icon: "info",
        title: "No GPS Data",
        text: "This Strava activity does not contain any GPS data to download.",
      });
    }

    const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`;

    const trackPoints = streams.latlng.data
      .map((p, i) => {
        let pt = `<trkpt lat="${p[0]}" lon="${p[1]}">`;
        if (streams.altitude && streams.altitude.data[i] !== undefined) {
          pt += `<ele>${streams.altitude.data[i]}</ele>`;
        }
        pt += `</trkpt>`;
        return pt;
      })
      .join("\n      ");

    const content = `
  <trk>
    <name>${activityName}</name>
    <trkseg>
      ${trackPoints}
    </trkseg>
  </trk>`;

    const footer = "\n</gpx>";
    const gpxData = header + content + footer;

    downloadFile(`${activityName.replace(/[^a-z0-9]/gi, "_")}.gpx`, gpxData);

    const elapsedTime = Date.now() - startTime;
    const timeToWait = MIN_DISPLAY_TIME_MS - elapsedTime;

    if (timeToWait > 0) {
      setTimeout(() => {
        Swal.close();
      }, timeToWait);
    } else {
      Swal.close();
    }
  } catch (error) {
    console.error("Error downloading original Strava GPX:", error);
    Swal.fire({
      icon: "error",
      title: "Download Failed",
      text: `Could not fetch the original file from Strava. ${error.message}`,
    });
  }
}

/**
 * Processes activities and adds them to the map layer.
 * @param {Array} activities - The array of activity objects from Strava.
 */
function displayActivitiesOnMap(activities) {
  if (!stravaActivitiesLayer) {
    console.error("Strava layer group not initialized in main.js");
    return;
  }
  stravaActivitiesLayer.clearLayers();

  const stravaColorData = ORGANIC_MAPS_COLORS.find((c) => c.name === "DeepOrange");
  const stravaColor = stravaColorData ? stravaColorData.css : "#f06432";

  let processedCount = 0;
  activities.forEach((activity) => {
    if (activity.map && activity.map.summary_polyline) {
      try {
        const latlngs = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
        const polyline = L.polyline(latlngs, {
          ...STYLE_CONFIG.path.default,
          color: stravaColor,
        });

        polyline.feature = {
          properties: {
            name: activity.name,
            type: activity.type,
            totalDistance: activity.distance,
            omColorName: "DeepOrange",
            stravaId: activity.id,
          },
        };
        polyline.pathType = "strava";

        polyline.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectItem(polyline);
        });

        stravaActivitiesLayer.addLayer(polyline);
        processedCount++;
      } catch (e) {
        console.warn("Could not decode polyline for activity:", activity.id, e);
      }
    }
  });

  if (stravaActivitiesLayer.getLayers().length > 0) {
    map.fitBounds(stravaActivitiesLayer.getBounds());
  }

  updateOverviewList();

  // --- FIX: Update UI first, then update the progress text ---
  // This ensures the #strava-progress element exists before we try to modify it.
  showFetchUI(processedCount);

  const progressText = document.getElementById("strava-progress");
  if (progressText) {
    progressText.innerText = `Displayed ${processedCount} activities on the map.`;
  }
}
