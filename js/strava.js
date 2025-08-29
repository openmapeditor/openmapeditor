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
 * MODIFIED: Displays the UI for fetching and exporting activities after a successful connection.
 * Includes a dropdown to select the number of activities to fetch.
 * @param {number} [activityCount=0] - The number of currently loaded activities.
 */
function showFetchUI(activityCount = 0) {
  if (!stravaPanelContent) return;
  const message =
    activityCount > 0
      ? `${activityCount} activities loaded.`
      : "Select how many activities to fetch.";
  stravaPanelContent.innerHTML = `
      <p style="padding: 15px; text-align: center;">Successfully connected to Strava.<br>${message}</p>
      <div id="strava-controls" style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; width: 100%;">
        <select id="strava-fetch-count" class="strava-button-secondary" style="flex: 2; min-width: 120px;">
          <option value="25">Latest 25</option>
          <option value="50">Latest 50</option>
          <option value="100">Latest 100</option>
          <option value="all" selected>All Activities</option>
        </select>
        <button id="fetch-strava-btn" class="strava-button-primary" style="flex: 1; min-width: 80px;">Fetch</button>
        <button id="export-strava-kml-btn" class="strava-button-secondary" style="flex: 1; min-width: 80px;">Export KML</button>
      </div>
      <p id="strava-progress" style="text-align: center; padding: 10px; display: none;"></p>
    `;
  document.getElementById("fetch-strava-btn").addEventListener("click", fetchAllActivities);

  const exportBtn = document.getElementById("export-strava-kml-btn");
  exportBtn.addEventListener("click", exportStravaActivitiesAsKml);
  exportBtn.disabled = activityCount === 0;

  // MODIFIED: Removed inline styling for the disabled state, as it's now handled by CSS.
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
 * MODIFIED: Fetches activities from the Strava API, handling pagination and respecting a user-defined limit.
 */
async function fetchAllActivities() {
  const accessToken = sessionStorage.getItem("strava_access_token");
  if (!accessToken) {
    alert("Strava connection expired. Please connect again.");
    showConnectUI();
    return;
  }

  // --- MODIFIED: Read the desired activity count from the new dropdown ---
  const fetchCountSelect = document.getElementById("strava-fetch-count");
  const limit = fetchCountSelect ? fetchCountSelect.value : "all";
  const fetchLimit = limit === "all" ? Infinity : parseInt(limit, 10);

  // --- MODIFIED: Hide the entire control group during the fetch process ---
  const controlsDiv = document.getElementById("strava-controls");
  if (controlsDiv) controlsDiv.style.display = "none";

  const progressText = document.getElementById("strava-progress");
  if (progressText) {
    progressText.style.display = "block";
    progressText.innerText = "Starting activity fetch...";
  }

  let allActivities = [];
  let page = 1;
  const perPage = 100; // Fetch in efficient chunks of 100
  let keepFetching = true;

  // --- MODIFIED: The loop now also checks if the fetch limit has been reached ---
  while (keepFetching && allActivities.length < fetchLimit) {
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
        keepFetching = false; // No more activities available from the API
      }
    } catch (error) {
      console.error("Error fetching Strava activities:", error);
      if (progressText)
        progressText.innerText = "Error fetching activities. See console for details.";
      keepFetching = false;
    }
  }

  // --- MODIFIED: Trim the results to the exact limit if we fetched more than needed on the last page ---
  if (fetchLimit !== Infinity && allActivities.length > fetchLimit) {
    allActivities = allActivities.slice(0, fetchLimit);
  }

  if (progressText)
    progressText.innerText = `Found ${allActivities.length} total activities. Processing...`;
  displayActivitiesOnMap(allActivities);
}

/**
 * MODIFIED: Creates and triggers a download for a KML file containing all loaded Strava activities.
 */
async function exportStravaActivitiesAsKml() {
  if (stravaActivitiesLayer.getLayers().length === 0) {
    return Swal.fire({
      icon: "info",
      title: "No Activities Loaded",
      text: "Please fetch your activities before exporting.",
    });
  }

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

  try {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now
      .getDate()
      .toString()
      .padStart(2, "0")}${now.getHours().toString().padStart(2, "0")}${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;

    // MODIFIED: Changed file extension
    const fileName = `Strava_Export_${timestamp}.kml`;

    // MODIFIED: Use the downloadFile utility directly, no JSZip needed
    downloadFile(fileName, kmlContent);
  } catch (error) {
    console.error("Error generating Strava KML:", error);
    Swal.fire({
      icon: "error",
      title: "Export Error",
      text: `Failed to generate KML file: ${error.message}`,
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
 * Triggers a direct browser download of the original GPX file from Strava's website.
 * Note: This requires the user to have an active login session with Strava in their browser.
 * @param {string} activityId The ID of the Strava activity.
 * @param {string} activityName The name of the activity, used for the filename.
 */
function downloadOriginalStravaGpx(activityId, activityName) {
  // 1. Create a temporary, invisible link element.
  const link = document.createElement("a");

  // 2. Set the link's destination to Strava's direct GPX export URL.
  link.href = `https://www.strava.com/activities/${activityId}/export_gpx`;

  // 3. Set the 'download' attribute. This tells the browser to download the file
  //    instead of navigating to it, using a sanitized version of the activity name.
  link.download = `${activityName.replace(/[^a-z0-9]/gi, "_")}.gpx`;

  // 4. Append the link to the document so it can be clicked.
  document.body.appendChild(link);

  // 5. Programmatically click the link to start the download.
  link.click();

  // 6. Remove the temporary link from the document to keep things clean.
  document.body.removeChild(link);
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
