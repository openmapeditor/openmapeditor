// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// --- Strava API Configuration ---
const redirectURI = `${window.location.origin}/strava-callback.html`;
const scope = "read,activity:read_all";
const stravaAuthURL = `https://www.strava.com/oauth/authorize?client_id=${stravaClientId}&redirect_uri=${redirectURI}&response_type=code&scope=${scope}`;
const tokenURL = "https://www.strava.com/oauth/token";
const activitiesURL = "https://www.strava.com/api/v3/athlete/activities";
const streamsURL = "https://www.strava.com/api/v3/activities";

// --- DOM Elements ---
let stravaPanelContent;

// NEW: Global variable to store the raw activities data from the API.
let allFetchedActivities = [];

// --- START: Refactored Functions ---
// The following functions have been moved to the top-level scope to prevent
// re-initialization errors and improve code structure.

/**
 * Displays the "Connect with Strava" button.
 */
function showConnectUI() {
  if (!stravaPanelContent) return;
  stravaPanelContent.innerHTML = `
    <p>Connect with Strava to see your activities.</p>
    <button id="strava-connect-btn" class="strava-button-link" style="border: none; background: transparent; padding: 0; cursor: pointer;">
      <img src="img/btn_strava_connect_with_orange.svg" alt="Connect with Strava" />
    </button>
    <p style="font-size: 12px; color: var(--text-color); margin-top: 5px;">
      By connecting, you agree to the OpenMapEditor 
      <a href="privacy.html" target="_blank" style="color: var(--highlight-color);">Privacy Policy</a>
    </p>
  `;

  document.getElementById("strava-connect-btn").addEventListener("click", () => {
    stravaPanelContent.innerHTML = "<p>Waiting for Strava authentication in the new tab...</p>";
    window.open(stravaAuthURL, "_blank");
    window.addEventListener("storage", handleStravaAuthReturn);
  });
}

/**
 * ADDED: Handles the authentication callback from the new tab via localStorage.
 * @param {StorageEvent} event The storage event.
 */
function handleStravaAuthReturn(event) {
  if (event.key === "strava_auth_code" && event.newValue) {
    const authCode = event.newValue;
    localStorage.removeItem("strava_auth_code");
    window.removeEventListener("storage", handleStravaAuthReturn);
    getAccessToken(authCode);
  } else if (event.key === "strava_auth_error") {
    console.error("Strava authentication error:", event.newValue);
    localStorage.removeItem("strava_auth_error");
    window.removeEventListener("storage", handleStravaAuthReturn);
    stravaPanelContent.innerHTML =
      '<p style="color: red;">Authentication was cancelled or failed.</p>';
    setTimeout(showConnectUI, 3000);
  }
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
      <p>Successfully connected to Strava.<br>${message}</p>
      <div id="strava-controls" style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; width: 100%;">
        <select id="strava-fetch-count" class="strava-button-secondary" style="flex: 2; min-width: 120px;">
          <option value="25">Latest 25</option>
          <option value="50">Latest 50</option>
          <option value="100">Latest 100</option>
          <option value="all" selected>All Activities</option>
        </select>
        <button id="fetch-strava-btn" class="strava-button-primary" style="flex: 1; min-width: 80px;">Fetch</button>
        <button id="export-strava-kml-btn" class="strava-button-secondary" style="flex: 1; min-width: 80px;">Export KML</button>
        <button id="export-strava-json-btn" class="strava-button-secondary" style="flex: 1; min-width: 80px;">Export JSON</button>
      </div>
      <p id="strava-progress" style="display: none;"></p>
    `;
  document.getElementById("fetch-strava-btn").addEventListener("click", fetchAllActivities);

  const exportKmlBtn = document.getElementById("export-strava-kml-btn");
  exportKmlBtn.addEventListener("click", exportStravaActivitiesAsKml);
  exportKmlBtn.disabled = activityCount === 0;
  // exportKmlBtn.style.display = "none"; // Temporarily hide the KML button

  const exportJsonBtn = document.getElementById("export-strava-json-btn");
  exportJsonBtn.addEventListener("click", exportStravaActivitiesAsJson);
  exportJsonBtn.disabled = activityCount === 0;
  // exportJsonBtn.style.display = "none"; // Temporarily hide the JSON button
}

/**
 * Exchanges the authorization code for an access token and stores it.
 * @param {string} code The authorization code from Strava.
 */
async function getAccessToken(code) {
  if (!stravaPanelContent) return;
  stravaPanelContent.innerHTML = "<p>Authenticating...</p>";

  if (
    typeof stravaClientId === "undefined" ||
    typeof stravaClientSecret === "undefined" ||
    !stravaClientId ||
    !stravaClientSecret
  ) {
    console.error("Strava client ID or secret is not defined in secrets.js.");
    stravaPanelContent.innerHTML =
      '<p style="color: red;">Configuration Error: Strava keys are missing in secrets.js.</p>';
    setTimeout(showConnectUI, 5000);
    return;
  }

  try {
    const response = await fetch(tokenURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: stravaClientId,
        client_secret: stravaClientSecret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.errors) {
      let errorMessage = data.message || "An unknown authentication error occurred.";
      console.error("Strava API Error:", data);
      if (errorMessage.toLowerCase().includes("invalid client")) {
        errorMessage =
          "Authentication failed: Invalid Client ID or Secret. Please double-check your secrets.js file.";
      }
      throw new Error(errorMessage);
    }

    if (data.access_token) {
      sessionStorage.setItem("strava_access_token", data.access_token);
      sessionStorage.setItem("strava_refresh_token", data.refresh_token);
      sessionStorage.setItem("strava_expires_at", data.expires_at);
      showFetchUI();
    } else {
      throw new Error("Access token was not received from Strava.");
    }
  } catch (error) {
    console.error("Error getting Strava access token:", error);
    stravaPanelContent.innerHTML = `<p style="color: red;">${error.message}</p>`;
    setTimeout(showConnectUI, 5000);
  }
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

  const fetchCountSelect = document.getElementById("strava-fetch-count");
  const limit = fetchCountSelect ? fetchCountSelect.value : "all";
  const fetchLimit = limit === "all" ? Infinity : parseInt(limit, 10);

  const controlsDiv = document.getElementById("strava-controls");
  if (controlsDiv) controlsDiv.style.display = "none";

  const progressText = document.getElementById("strava-progress");
  if (progressText) {
    progressText.style.display = "block";
    progressText.innerText = "Starting activity fetch...";
  }

  let allActivities = [];
  let page = 1;
  const perPage = 100;
  let keepFetching = true;

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
        keepFetching = false;
      }
    } catch (error) {
      console.error("Error fetching Strava activities:", error);
      if (progressText)
        progressText.innerText = "Error fetching activities. See console for details.";
      keepFetching = false;
    }
  }

  if (fetchLimit !== Infinity && allActivities.length > fetchLimit) {
    allActivities = allActivities.slice(0, fetchLimit);
  }

  // NEW: Store the raw API data in the global variable.
  allFetchedActivities = allActivities;

  if (progressText)
    progressText.innerText = `Found ${allActivities.length} total activities. Processing...`;
  displayActivitiesOnMap(allActivities);
}

/**
 * REFACTORED: Generates a timestamped filename for exports.
 * @param {string} baseName - The base name for the file (e.g., "Strava_Export").
 * @param {string} extension - The file extension (e.g., "kml" or "json").
 * @returns {string} - The complete, timestamped filename.
 */
function generateTimestampedFilename(baseName, extension) {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now
    .getDate()
    .toString()
    .padStart(2, "0")}${now.getHours().toString().padStart(2, "0")}${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
  return `${baseName}_${timestamp}.${extension}`;
}

/**
 * MODIFIED: Creates and triggers a download for a KML file containing all loaded Strava activities.
 */
async function exportStravaActivitiesAsKml() {
  if (stravaActivitiesLayer.getLayers().length === 0) {
    return Swal.fire({
      icon: "info",
      iconColor: "var(--swal-color-info)",
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
      iconColor: "var(--swal-color-warning)",
      title: "No Exportable Data",
      text: "Could not generate KML data for the loaded activities.",
    });
  }

  const docName = "Strava Activities";
  const kmlContent = createKmlDocument(docName, stravaPlacemarks);

  try {
    const fileName = generateTimestampedFilename("Strava_Export", "kml");
    downloadFile(fileName, kmlContent);
  } catch (error) {
    console.error("Error generating Strava KML:", error);
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "Export Error",
      text: `Failed to generate KML file: ${error.message}`,
    });
  }
}

/**
 * ADDED: Creates and triggers a download for a JSON file containing all loaded Strava activities.
 */
async function exportStravaActivitiesAsJson() {
  if (allFetchedActivities.length === 0) {
    return Swal.fire({
      icon: "info",
      iconColor: "var(--swal-color-info)",
      title: "No Activities Loaded",
      text: "Please fetch your activities before exporting.",
    });
  }

  const activitiesData = allFetchedActivities;

  // We check if the data has the expected structure.
  if (!activitiesData || activitiesData.length === 0 || !activitiesData[0].id) {
    return Swal.fire({
      icon: "warning",
      iconColor: "var(--swal-color-warning)",
      title: "No Exportable Data",
      text: "Could not find any data to export.",
    });
  }

  // Convert the array of JavaScript objects to a JSON string
  const jsonContent = JSON.stringify(activitiesData, null, 2); // 'null, 2' for pretty printing

  try {
    const fileName = generateTimestampedFilename("Strava_Export", "json");
    downloadFile(fileName, jsonContent);
  } catch (error) {
    console.error("Error generating Strava JSON:", error);
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "Export Error",
      text: `Failed to generate JSON file: ${error.message}`,
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
  showConnectUI();
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

        // --- FIX: Add this line to explicitly map the distance property ---
        // This ensures the info panel uses Strava's authoritative distance
        // instead of recalculating it from the summary polyline.
        polyline.feature = {
          properties: {
            ...activity,
            totalDistance: activity.distance, // <-- THE FIX
            omColorName: "DeepOrange",
            pathType: "strava",
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

  showFetchUI(processedCount);

  const progressText = document.getElementById("strava-progress");
  if (progressText) {
    progressText.innerText = `Displayed ${processedCount} activities on the map.`;
  }
}
