// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// --- Strava API Configuration ---
const redirectURI = window.location.origin + window.location.pathname;
const scope = "read,activity:read_all";
const stravaAuthURL = `https://www.strava.com/oauth/authorize?client_id=${stravaClientId}&redirect_uri=${redirectURI}&response_type=code&scope=${scope}`;
const tokenURL = "https://www.strava.com/oauth/token";
const activitiesURL = "https://www.strava.com/api/v3/athlete/activities";

// --- DOM Elements ---
let stravaPanelContent;

/**
 * Initializes the Strava integration.
 * This is the main entry point, setting up UI and handling the OAuth callback.
 */
function initializeStrava() {
  stravaPanelContent = document.getElementById("strava-panel-content");
  const urlParams = new URLSearchParams(window.location.search);
  const authCode = urlParams.get("code");

  // If a Strava authorization code is present in the URL, exchange it for a token.
  // This happens when the user is redirected back from Strava after authorization.
  if (authCode) {
    // Automatically switch to the Strava tab to show the progress.
    document.getElementById("tab-btn-strava").click();
    getAccessToken(authCode);
  } else {
    // In all other cases (e.g., initial page load, page reload),
    // show the 'Connect' button to ensure a fresh authentication flow.
    // This avoids issues with expired tokens from a previous session.
    showConnectUI();
  }
}

/**
 * Displays the "Connect with Strava" button.
 */
function showConnectUI() {
  stravaPanelContent.innerHTML = `
    <p style="padding: 15px; text-align: center;">Connect with Strava to see your activities.</p>
    <a href="${stravaAuthURL}" class="strava-button-link">
      <img src="https://openmapeditor.github.io/openmapeditor-assets/btn_strava_connect_with_orange.svg" alt="Connect with Strava" />
    </a>
  `;
}

/**
 * Displays the UI for fetching activities after a successful connection.
 */
function showFetchUI(activityCount = 0) {
  const message =
    activityCount > 0 ? `${activityCount} activities loaded.` : "Ready to fetch your activities.";
  stravaPanelContent.innerHTML = `
      <p style="padding: 15px; text-align: center;">Successfully connected to Strava.<br>${message}</p>
      <button id="fetch-strava-btn" class="strava-button">Fetch Activities</button>
      <p id="strava-progress" style="text-align: center; padding: 10px; display: none;"></p>
    `;
  document.getElementById("fetch-strava-btn").addEventListener("click", fetchAllActivities);
}

/**
 * Exchanges the authorization code for an access token and stores it.
 * @param {string} code The authorization code from Strava.
 */
function getAccessToken(code) {
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
        // Store tokens in sessionStorage for this browser session.
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

  document.getElementById("fetch-strava-btn").style.display = "none";
  const progressText = document.getElementById("strava-progress");
  progressText.style.display = "block";
  progressText.innerText = "Starting activity fetch...";

  let allActivities = [];
  let page = 1;
  const perPage = 100; // Strava API can return up to 200, but 100 is safer.
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
        progressText.innerText = `Fetched ${allActivities.length} activities...`;
        page++;
      } else {
        keepFetching = false; // No more activities to fetch
      }
    } catch (error) {
      console.error("Error fetching Strava activities:", error);
      progressText.innerText = "Error fetching activities. See console for details.";
      keepFetching = false;
    }
  }

  progressText.innerText = `Found ${allActivities.length} total activities. Processing...`;
  displayActivitiesOnMap(allActivities);
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
  stravaActivitiesLayer.clearLayers(); // Clear any previous activities

  // --- MODIFIED: Use "DeepOrange" from the color config for consistency ---
  const stravaColorData = ORGANIC_MAPS_COLORS.find((c) => c.name === "DeepOrange");
  const stravaColor = stravaColorData ? stravaColorData.css : "#f06432"; // Fallback color

  let processedCount = 0;
  activities.forEach((activity) => {
    // We only care about activities that have a polyline
    if (activity.map && activity.map.summary_polyline) {
      try {
        // Use the Polyline.encoded.js library to decode the geometry
        const latlngs = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
        const polyline = L.polyline(latlngs, {
          ...STYLE_CONFIG.path.default, // Use default path style
          color: stravaColor, // Use the consistent orange color
        });

        // Attach feature data for selection and UI integration
        polyline.feature = {
          properties: {
            name: activity.name,
            type: activity.type, // e.g., "Ride", "Run"
            totalDistance: activity.distance, // In meters, from Strava
            omColorName: "DeepOrange", // MODIFIED: Default color for duplication and selection highlight
          },
        };
        polyline.pathType = "strava"; // Custom type for identification

        // Make the polyline selectable
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

  // Zoom the map to fit all loaded activities
  if (stravaActivitiesLayer.getLayers().length > 0) {
    map.fitBounds(stravaActivitiesLayer.getBounds());
  }

  // After adding all layers, update the overview list to show them
  updateOverviewList();
  showFetchUI(processedCount); // Update UI with the final count
  document.getElementById(
    "strava-progress"
  ).innerText = `Displayed ${processedCount} activities on the map.`;
}
