// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// Strava Integration Module
// This module handles the integration with Strava's API, including OAuth authentication,
// activity fetching, and exporting activities to various formats.

// Strava API Configuration
const redirectURI = `${window.location.origin}/strava-callback.html`;
const scope = "read,activity:read_all";
const tokenURL = "https://www.strava.com/oauth/token";
const activitiesURL = "https://www.strava.com/api/v3/athlete/activities";
const streamsURL = "https://www.strava.com/api/v3/activities";

// DOM Elements
let stravaPanelContent;

// Global variable to store the raw activities data from the API
let allFetchedActivities = [];

// Temporary storage for user-provided API keys (memory only, not persisted)
let tempUserClientId = "";
let tempUserClientSecret = "";

// Core Authentication and Data Fetching

/**
 * Exchanges an authorization code for an access token using the provided credentials.
 * @param {string} code - The authorization code from Strava
 * @param {string} clientId - The Strava Client ID
 * @param {string} clientSecret - The Strava Client Secret
 * @returns {Promise<boolean>} True on success, false on failure
 */
async function getAccessToken(code, clientId, clientSecret) {
  try {
    const response = await fetch(tokenURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.errors) {
      let errorMessage = data.message || "An unknown authentication error occurred.";
      if (String(errorMessage).toLowerCase().includes("invalid client")) {
        errorMessage = "Authentication failed: Invalid Client ID or Secret provided.";
      }
      throw new Error(errorMessage);
    }

    if (data.access_token) {
      sessionStorage.setItem("strava_access_token", data.access_token);
      sessionStorage.setItem("strava_refresh_token", data.refresh_token);
      sessionStorage.setItem("strava_expires_at", data.expires_at);
      return true;
    } else {
      throw new Error("Access token was not received from Strava.");
    }
  } catch (error) {
    console.error("Error getting Strava access token:", error);
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "Authentication Failed",
      text: `Please check your API keys and try again. Error: ${error.message}`,
    });
    return false;
  }
}

/**
 * Fetches activities from the Strava API, handling pagination and user limits.
 */
async function fetchAllActivities() {
  const accessToken = sessionStorage.getItem("strava_access_token");
  if (!accessToken) {
    // Determine which UI to show if the token is missing.
    if (
      typeof stravaClientId !== "undefined" &&
      stravaClientId &&
      typeof stravaClientSecret !== "undefined" &&
      stravaClientSecret
    ) {
      showConnectUI();
    } else {
      renderUserKeysPanel();
    }
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

  let activitiesBuffer = [];
  let page = 1;
  const perPage = 100;
  let keepFetching = true;

  while (keepFetching && activitiesBuffer.length < fetchLimit) {
    try {
      const url = `${activitiesURL}?access_token=${accessToken}&per_page=${perPage}&page=${page}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const activities = await response.json();
      if (activities.length > 0) {
        activitiesBuffer.push(...activities);
        if (progressText)
          progressText.innerText = `Fetched ${activitiesBuffer.length} activities...`;
        page++;
      } else {
        keepFetching = false;
      }
    } catch (error) {
      console.error("Error fetching Strava activities:", error);
      if (progressText) progressText.innerText = "Error fetching activities.";
      keepFetching = false;
    }
  }
  if (fetchLimit !== Infinity && activitiesBuffer.length > fetchLimit) {
    activitiesBuffer = activitiesBuffer.slice(0, fetchLimit);
  }

  allFetchedActivities = activitiesBuffer;

  if (progressText)
    progressText.innerText = `Found ${activitiesBuffer.length} total activities. Processing...`;
  displayActivitiesOnMap(activitiesBuffer);
}

// UI Rendering and Event Handling

/**
 * Displays the "Connect with Strava" button (for developer keys flow).
 */
function showConnectUI() {
  if (!stravaPanelContent) return;
  stravaPanelContent.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <p>Connect with Strava to see your activities on the map.</p>
      <button id="strava-connect-btn" class="strava-button-link" style="border: none; background: transparent; padding: 0; cursor: pointer;">
        <img src="/img/btn_strava_connect_with_orange.svg" alt="Connect with Strava" />
      </button>
      <p style="font-size: 12px; color: var(--text-color); margin-top: 5px;">
        By connecting, you agree to the ${APP_NAME}<br>
        <a href="/privacy.html" target="_blank" style="color: var(--highlight-color);">Privacy Policy</a>
      </p>
    </div>
  `;

  document.getElementById("strava-connect-btn").addEventListener("click", () => {
    stravaPanelContent.innerHTML = "<p>Waiting for Strava authentication in the new tab...</p>";
    const stravaAuthURL = `https://www.strava.com/oauth/authorize?client_id=${stravaClientId}&redirect_uri=${redirectURI}&response_type=code&scope=${scope}`;
    window.open(stravaAuthURL, "_blank");
    window.addEventListener("storage", handleStravaAuthReturn);
  });
}

/**
 * Renders the Strava panel for user-provided keys.
 */
function renderUserKeysPanel() {
  if (!stravaPanelContent) return;
  const accessToken = sessionStorage.getItem("strava_access_token");

  const apiKeysHtml = `
    <div style="padding: 0; text-align: center;">
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 5px; font-size: 14px;">
      <span>Provide Strava API Keys to see your activities on the map.</span>
      <span id="strava-info-icon" class="material-symbols" title="Why is this needed?" style="font-size: 14px; line-height: 1;">info</span>
      </div>
      <div class="routing-input-group">
        <input type="password" id="user-strava-client-id" placeholder="Your Strava Client ID" autocomplete="off" value="${tempUserClientId}" />
      </div>
      <div class="routing-input-group">
        <input type="password" id="user-strava-client-secret" placeholder="Your Strava Client Secret" autocomplete="off" value="${tempUserClientSecret}" />
      </div>
      <button id="strava-connect-btn-user" class="strava-button-primary" style="width: 100%; margin-top: 10px; margin-bottom: 0;">Connect with Strava</button>
    </div>
  `;

  let actionHtml = accessToken
    ? _getFetchControlsHTML(stravaActivitiesLayer.getLayers().length)
    : "";

  stravaPanelContent.innerHTML = apiKeysHtml + actionHtml;
  addEventListenersForUserKeysPanel();

  if (accessToken) {
    _addFetchControlsListeners(fetchAllActivities, stravaActivitiesLayer.getLayers().length);
  }
}

/**
 * Generates HTML for the Strava fetch/export controls.
 * @param {number} activityCount - The number of currently loaded activities
 * @returns {string} The HTML string for the controls
 */
function _getFetchControlsHTML(activityCount = 0) {
  const message =
    activityCount > 0
      ? `${activityCount} activities loaded.`
      : "Select how many activities to fetch.";
  return `
      <p>Successfully connected to Strava.<br>${message}</p>
      <div id="strava-controls" style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; width: 100%;">
        <select id="strava-fetch-count" class="strava-button-secondary" style="flex: 2; min-width: 120px;">
          <option value="25">Latest 25</option>
          <option value="50">Latest 50</option>
          <option value="100">Latest 100</option>
          <option value="all" selected>All Activities</option>
        </select>
        <button id="fetch-strava-btn" class="strava-button-primary" style="flex: 1; min-width: 80px;">Fetch</button>        
        <div class="strava-export-buttons">
          <button id="export-strava-kml-btn" class="strava-button-secondary" style="flex: 1; min-width: 80px;">Export KML</button>
          <button id="export-strava-json-btn" class="strava-button-secondary" style="flex: 1; min-width: 80px;">Export JSON</button>
        </div>
      </div>
      <p id="strava-progress" style="display: none;"></p>
    `;
}

/**
 * Attaches event listeners to the fetch/export controls.
 * @param {function} fetchFunction - The fetch function to call
 * @param {number} activityCount - The number of loaded activities
 */
function _addFetchControlsListeners(fetchFunction, activityCount = 0) {
  document.getElementById("fetch-strava-btn").addEventListener("click", fetchFunction);
  const exportKmlBtn = document.getElementById("export-strava-kml-btn");
  exportKmlBtn.addEventListener("click", exportStravaActivitiesAsKml);
  exportKmlBtn.disabled = activityCount === 0;
  const exportJsonBtn = document.getElementById("export-strava-json-btn");
  exportJsonBtn.addEventListener("click", exportStravaActivitiesAsJson);
  exportJsonBtn.disabled = activityCount === 0;
}

/**
 * Displays the UI for fetching/exporting (developer keys flow).
 * @param {number} [activityCount=0] - The number of loaded activities
 */
function showFetchUI(activityCount = 0) {
  if (!stravaPanelContent) return;
  stravaPanelContent.innerHTML = _getFetchControlsHTML(activityCount);
  _addFetchControlsListeners(fetchAllActivities, activityCount);
}

/**
 * Adds event listeners for the user-provided keys panel.
 */
function addEventListenersForUserKeysPanel() {
  const clientIdInput = document.getElementById("user-strava-client-id");
  const clientSecretInput = document.getElementById("user-strava-client-secret");

  clientIdInput.addEventListener("focus", () => clientIdInput.select());
  clientSecretInput.addEventListener("focus", () => clientSecretInput.select());

  document.getElementById("strava-info-icon").addEventListener("click", () => {
    const mainAlertOptions = {
      title: "Using Your Own Strava API Keys",
      icon: "info",
      iconColor: "var(--swal-color-info)",
      html: `
        <p style="text-align: left;">This application uses your personal Strava API credentials for performance and data control.</p>
        <p style="text-align: left; margin-top: 15px;"><strong>How to get your keys:</strong></p>
        <ol style="text-align: left; padding-left: 20px;">
          <li>Go to your <a href="https://www.strava.com/settings/api" target="_blank" id="strava-api-link" style="color: var(--highlight-color);">Strava API Settings</a>.</li>
          <li>Create a new app. For "Authorization Callback Domain", enter <strong id="auth-callback-domain-wrapper" style="cursor:pointer; text-decoration: underline;" title="Click to copy">${APP_DOMAIN}<span id="auth-callback-domain-copy-icon" class="copy-icon material-symbols">content_copy</span></strong>.</li>
          <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> and paste them here.</li>
        </ol>
        <p style="text-align: left; margin-top: 15px;"><strong>Security:</strong> Your keys are kept in memory for this session only and are not saved in your browser.</p>`,
      confirmButtonText: "Got it!",
      didOpen: () => {
        document.getElementById("auth-callback-domain-wrapper")?.addEventListener("click", () => {
          copyToClipboard(`${APP_DOMAIN}`).then(() => {
            Swal.fire({
              toast: true,
              position: "center",
              icon: "success",
              iconColor: "var(--swal-color-success)",
              title: "Domain Copied!",
              showConfirmButton: false,
              timer: 1500,
            }).then(() => {
              Swal.fire(mainAlertOptions);
            });
          });
        });
      },
    };
    Swal.fire(mainAlertOptions);
  });

  document.getElementById("strava-connect-btn-user").addEventListener("click", () => {
    sessionStorage.removeItem("strava_access_token");
    const clientId = clientIdInput.value.trim();
    const clientSecret = clientSecretInput.value.trim();
    if (!clientId || !clientSecret) {
      return Swal.fire({
        icon: "warning",
        iconColor: "var(--swal-color-warning)",
        title: "Missing Keys",
        text: "Please enter both a Client ID and a Client Secret.",
      });
    }
    // Store keys in memory for authentication (kept for reconnection)
    tempUserClientId = clientId;
    tempUserClientSecret = clientSecret;

    renderUserKeysPanel();
    stravaPanelContent.lastChild.innerHTML = `<div style="padding:15px; text-align:center;"><p>Waiting for Strava authentication...</p></div>`;
    const userAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${tempUserClientId}&redirect_uri=${redirectURI}&response_type=code&scope=${scope}`;
    window.open(userAuthUrl, "_blank");
    window.addEventListener("storage", handleStravaAuthReturnForUserKeys);
  });
}

// Authentication Callback Handlers

/**
 * Handles the auth callback from the new tab (developer keys flow).
 * @param {StorageEvent} event - The storage event
 */
async function handleStravaAuthReturn(event) {
  if (event.key === "stravaAuthCode" && event.newValue) {
    const authCode = event.newValue;
    localStorage.removeItem("stravaAuthCode");
    window.removeEventListener("storage", handleStravaAuthReturn);
    stravaPanelContent.innerHTML = "<p>Authenticating...</p>";

    const success = await getAccessToken(authCode, stravaClientId, stravaClientSecret);
    if (success) {
      showFetchUI();
    } else {
      setTimeout(showConnectUI, 5000);
    }
  } else if (event.key === "stravaAuthError") {
    console.error("Strava authentication error:", event.newValue);
    localStorage.removeItem("stravaAuthError");
    window.removeEventListener("storage", handleStravaAuthReturn);
    stravaPanelContent.innerHTML =
      '<p style="color: red;">Authentication was cancelled or failed.</p>';
    setTimeout(showConnectUI, 3000);
  }
}

/**
 * Handles the auth callback from the new tab (user keys flow).
 * @param {StorageEvent} event - The storage event
 */
async function handleStravaAuthReturnForUserKeys(event) {
  if (event.key === "stravaAuthCode" && event.newValue) {
    const authCode = event.newValue;
    localStorage.removeItem("stravaAuthCode");
    window.removeEventListener("storage", handleStravaAuthReturnForUserKeys);
    stravaPanelContent.lastChild.innerHTML = `<div style="padding:15px; text-align:center;"><p>Authenticating...</p></div>`;

    await getAccessToken(authCode, tempUserClientId, tempUserClientSecret);

    renderUserKeysPanel();
  } else if (event.key === "stravaAuthError") {
    console.error("Strava authentication error:", event.newValue);
    localStorage.removeItem("stravaAuthError");
    window.removeEventListener("storage", handleStravaAuthReturnForUserKeys);

    renderUserKeysPanel();
  }
}

// Data Processing, Export, and Initialization

/**
 * Processes activities and adds them to the map layer.
 * @param {Array} activities - The array of activity objects from Strava
 */
function displayActivitiesOnMap(activities) {
  if (!stravaActivitiesLayer) return;
  stravaActivitiesLayer.clearLayers();
  const stravaColorData = ORGANIC_MAPS_COLORS.find((c) => c.name === "DeepOrange");
  const stravaColor = stravaColorData ? stravaColorData.css : "#f06432";
  let processedCount = 0;

  activities.forEach((activity) => {
    if (activity.map && activity.map.summary_polyline) {
      try {
        const latlngs = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
        const polyline = L.polyline(latlngs, { ...STYLE_CONFIG.path.default, color: stravaColor });
        polyline.feature = {
          properties: {
            ...activity,
            totalDistance: activity.distance,
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
  updateDrawControlStates();

  // Determine which UI needs updating
  if (
    typeof stravaClientId !== "undefined" &&
    stravaClientId &&
    typeof stravaClientSecret !== "undefined" &&
    stravaClientSecret
  ) {
    showFetchUI(processedCount);
  } else {
    renderUserKeysPanel();
  }

  const progressText = document.getElementById("strava-progress");
  if (progressText) {
    progressText.innerText = `Displayed ${processedCount} activities on the map.`;
  }
}

/**
 * Creates and triggers a download for a KML file of all loaded Strava activities.
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
    if (kmlSnippet) stravaPlacemarks.push(kmlSnippet);
  });
  if (stravaPlacemarks.length === 0) {
    return Swal.fire({
      icon: "warning",
      iconColor: "var(--swal-color-warning)",
      title: "No Exportable Data",
      text: "Could not generate KML for loaded activities.",
    });
  }
  const kmlContent = createKmlDocument("Strava Activities", stravaPlacemarks);
  downloadFile(generateTimestampedFilename("Strava_Export", "kml"), kmlContent);
}

/**
 * Creates and triggers a download for a JSON file of all loaded Strava activities.
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
  const jsonContent = JSON.stringify(allFetchedActivities, null, 2);
  downloadFile(generateTimestampedFilename("Strava_Export", "json"), jsonContent);
}

/**
 * Triggers a browser download of the original GPX file from Strava's website.
 * @param {string} activityId - The ID of the Strava activity
 * @param {string} activityName - The name of the activity, used for the filename
 */
function downloadOriginalStravaGpx(activityId, activityName) {
  const link = document.createElement("a");
  link.href = `https://www.strava.com/activities/${activityId}/export_gpx`;
  link.download = `${activityName.replace(/[^a-z0-9]/gi, "_")}.gpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Initializes the Strava integration.
 */
function initializeStrava() {
  stravaPanelContent = document.getElementById("strava-panel-content");
  sessionStorage.removeItem("strava_access_token");

  // This logic checks if developer keys are provided in secrets.js.
  if (
    typeof stravaClientId !== "undefined" &&
    stravaClientId &&
    typeof stravaClientSecret !== "undefined" &&
    stravaClientSecret
  ) {
    showConnectUI();
  } else {
    renderUserKeysPanel();
  }
}
