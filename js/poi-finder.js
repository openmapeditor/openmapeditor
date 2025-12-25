// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * POI Finder
 *
 * Simple category-based search for OpenStreetMap features using Overpass API.
 * Displays results as read-only markers on the map.
 */

// POI Categories with OSM tags and material symbols
const POI_CATEGORIES = [
  // Outdoor Activities (Priority)
  {
    id: "park",
    name: "Park",
    icon: "park",
    overpassQuery: ["leisure=park", "leisure=nature_reserve"],
  },
  {
    id: "viewpoint",
    name: "Viewpoint",
    icon: "landscape",
    overpassQuery: "tourism=viewpoint",
  },
  {
    id: "fireplace",
    name: "Fireplace / BBQ",
    icon: "local_fire_department",
    overpassQuery: ["amenity=bbq", "leisure=firepit"],
  },
  {
    id: "drinking_water",
    name: "Drinking Water",
    icon: "water_drop",
    overpassQuery: "amenity=drinking_water",
  },
  {
    id: "bench",
    name: "Bench",
    icon: "chair",
    overpassQuery: "amenity=bench",
  },
  {
    id: "toilet",
    name: "Toilet",
    icon: "wc",
    overpassQuery: "amenity=toilets",
  },
  // Transport & Supplies
  {
    id: "parking",
    name: "Parking",
    icon: "local_parking",
    overpassQuery: "amenity=parking",
  },
  {
    id: "public_transport",
    name: "Public Transport",
    icon: "commute",
    overpassQuery: [
      "highway=bus_stop",
      "railway=tram_stop",
      "railway=station",
      "public_transport=station",
    ],
  },
  {
    id: "gas_station",
    name: "Gas Station",
    icon: "local_gas_station",
    overpassQuery: "amenity=fuel",
  },
  {
    id: "supermarket",
    name: "Supermarket/Shop",
    icon: "shopping_cart",
    overpassQuery: ["shop=supermarket", "shop=convenience"],
  },
  // Food & Drink
  {
    id: "restaurant",
    name: "Restaurant",
    icon: "restaurant",
    overpassQuery: "amenity=restaurant",
  },
  {
    id: "cafe",
    name: "Cafe",
    icon: "local_cafe",
    overpassQuery: "amenity=cafe",
  },
  {
    id: "fast_food",
    name: "Fast Food",
    icon: "fastfood",
    overpassQuery: "amenity=fast_food",
  },
  {
    id: "pub",
    name: "Pub",
    icon: "sports_bar",
    overpassQuery: "amenity=pub",
  },
  {
    id: "bar",
    name: "Bar",
    icon: "local_bar",
    overpassQuery: "amenity=bar",
  },
  {
    id: "atm",
    name: "ATM",
    icon: "local_atm",
    overpassQuery: "amenity=atm",
  },
];

// Global POI layer group and abort controller
let poiSearchResults = null;
let currentAbortController = null;

/**
 * Initialize POI finder
 */
function initPoiFinder() {
  // Create POI layer group
  poiSearchResults = L.featureGroup().addTo(map);

  // Add to layer control
  if (window.layerControl) {
    window.layerControl.addOverlay(poiSearchResults, "Search Results");
  }

  // Update button text based on whether there are results
  updateFinderButton();
}

/**
 * Update the Find/Clear button text
 */
function updateFinderButton() {
  const button = document.getElementById("poi-finder-btn");
  if (!button) return;

  const hasResults = poiSearchResults && poiSearchResults.getLayers().length > 0;
  button.textContent = hasResults ? "Clear Places" : "Find Places";
}

/**
 * Show POI finder modal
 */
async function showPoiFinder() {
  const categoryButtons = POI_CATEGORIES.map(
    (cat) => `
    <button
      class="poi-category-btn"
      data-category="${cat.id}"
      style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px; margin: 4px 0; border: 1px solid var(--border-color); border-radius: 4px; background: var(--panel-bg-color); color: var(--text-color); cursor: pointer; font-size: var(--font-size-14);"
    >
      <span class="material-symbols" style="font-size: 20px;">${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `
  ).join("");

  await Swal.fire({
    html: `
      <div style="text-align: left;">
        <p style="font-size: var(--font-size-12); color: var(--text-color); margin: 0 0 12px 0; text-align: center;">
          Find places in current view
        </p>
        ${categoryButtons}
      </div>
    `,
    confirmButtonText: "Close",
    customClass: {
      popup: "poi-finder-modal",
    },
    didOpen: () => {
      // Add click handlers to category buttons
      document.querySelectorAll(".poi-category-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const categoryId = btn.dataset.category;
          const category = POI_CATEGORIES.find((c) => c.id === categoryId);
          if (category) {
            Swal.close();
            await searchPOICategory(category);
          }
        });
      });
    },
  });
}

/**
 * Search for POIs in a category
 */
async function searchPOICategory(category) {
  // Create new abort controller
  currentAbortController = new AbortController();

  // Show loading indicator with cancel button
  Swal.fire({
    title: "Searching...",
    html: `
      <div style="text-align: center;">
        <p style="margin-bottom: 20px;">Looking for ${category.name}</p>
        <div class="swal2-loader" style="display: block; margin: 0 auto 20px;"></div>
        <button id="poi-cancel-btn" class="swal2-cancel swal2-styled" style="display: inline-block;">Cancel</button>
      </div>
    `,
    allowOutsideClick: false,
    showCancelButton: false,
    showConfirmButton: false,
    didOpen: () => {
      // Add cancel button handler
      document.getElementById("poi-cancel-btn").addEventListener("click", () => {
        if (currentAbortController) {
          currentAbortController.abort();
        }
        Swal.close();
      });
    },
  });

  try {
    const bounds = map.getBounds();
    const results = await queryOverpass(
      category.overpassQuery,
      bounds,
      currentAbortController.signal
    );

    Swal.close();

    if (results.length === 0) {
      Swal.fire({
        title: "No Results",
        text: `No ${category.name} found in current map view`,
        timer: 2000,
        showConfirmButton: false,
      });
      return;
    }

    // Clear existing POI results
    clearPOIResults();

    // Display results on map
    displayPOIResults(results, category);

    // Update button to show "Clear"
    updateFinderButton();

    // Show success message
    Swal.fire({
      title: "Found!",
      text: `${results.length} ${category.name}${results.length !== 1 ? "s" : ""} found`,
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      // Request was cancelled
      Swal.fire({
        title: "Cancelled",
        text: "Search was cancelled",
        timer: 1500,
        showConfirmButton: false,
      });
    } else {
      Swal.fire({
        icon: "error",
        title: "Search Failed",
        text: error.message || "Could not complete search. Please try again.",
        confirmButtonText: "OK",
      });
    }
  }
}

/**
 * Query Overpass API
 */
async function queryOverpass(osmQuery, bounds, signal) {
  // Handle both single query strings and arrays of queries
  const queries = Array.isArray(osmQuery) ? osmQuery : [osmQuery];

  // Build query parts for each tag
  const queryParts = queries
    .flatMap((q) => [
      `node[${q}](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});`,
      `way[${q}](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});`,
      `relation[${q}](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});`,
    ])
    .join("\n      ");

  const query = `
    [out:json][timeout:25];
    (
      ${queryParts}
    );
    out center;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
    signal: signal,
  });

  if (!response.ok) {
    throw new Error(`Overpass API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.elements || [];
}

/**
 * Display POI results on map
 */
function displayPOIResults(results, category) {
  results.forEach((element) => {
    let lat, lon;

    // Get coordinates based on element type
    if (element.type === "node") {
      lat = element.lat;
      lon = element.lon;
    } else if (element.center) {
      lat = element.center.lat;
      lon = element.center.lon;
    } else {
      return; // Skip if no coordinates
    }

    // Create circle marker - bigger, red, transparent center
    const marker = L.circleMarker([lat, lon], {
      radius: 10,
      fillColor: "#E53935",
      color: "#E53935",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.2,
    });

    // Create popup content
    const name = element.tags?.name || category.name;
    const tags = element.tags || {};

    let popupContent = `
      <div style="overflow-wrap: break-word; text-align: center;">
        <strong><span class="material-symbols" style="font-size: 16px; vertical-align: middle;">${category.icon}</span> ${name}</strong><br>
    `;

    // Add relevant tags
    const interestingTags = ["operator", "opening_hours", "website", "phone", "description"];
    interestingTags.forEach((tag) => {
      if (tags[tag]) {
        const tagLabel = tag.replace("_", " ");
        popupContent += `<small>${tagLabel}: ${tags[tag]}</small><br>`;
      }
    });

    popupContent += `
        <small style="color: var(--text-color-secondary);">
          <a href="https://www.openstreetmap.org/${element.type}/${element.id}" target="_blank" style="color: var(--link-color);">
            View on OpenStreetMap
          </a>
        </small>
      </div>
      <div style="text-align: center; margin-top: 8px;">
        <button id="save-poi-marker-${element.id}" style="padding: 5px 10px; border: 1px solid #ccc; border-radius: var(--border-radius); cursor: pointer; background-color: #f0f0f0;">
          Save to Map
        </button>
      </div>
    `;

    const popup = L.popup({ maxWidth: 150 });
    popup.setContent(popupContent);
    marker.bindPopup(popup);

    // Add event listener for "Save as Marker" button when popup opens
    marker.on("popupopen", () => {
      const saveButton = document.getElementById(`save-poi-marker-${element.id}`);
      if (saveButton) {
        saveButton.addEventListener("click", () => {
          createAndSaveMarker(lat, lon, name);
          marker.closePopup();
        });
      }
    });

    marker.addTo(poiSearchResults);
  });

  // Fit map to show all results
  if (poiSearchResults.getLayers().length > 0) {
    map.fitBounds(poiSearchResults.getBounds(), { padding: [50, 50] });
  }
}

/**
 * Clear all POI results from map
 */
function clearPOIResults() {
  if (poiSearchResults) {
    poiSearchResults.clearLayers();
  }
  // Update button to show "Find"
  updateFinderButton();
}

// Make functions globally available
window.initPoiFinder = initPoiFinder;
window.showPoiFinder = showPoiFinder;
window.clearPOIResults = clearPOIResults;
window.updateFinderButton = updateFinderButton;
