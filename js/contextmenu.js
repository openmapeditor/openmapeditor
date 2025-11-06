// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// Context Menu Module
// This module handles the right-click context menu on the map,
// providing options to copy coordinates, set routing points, and edit on OpenStreetMap.

/**
 * Queries the Overpass API for nearby points of interest and displays them in a SweetAlert.
 * @param {L.LatLng} latlng - The coordinates to search around
 */
async function findNearbyPlaces(latlng) {
  const radius = 500; // Search radius in meters
  const lat = latlng.lat;
  const lng = latlng.lng;

  // Show loading alert
  Swal.fire({
    title: "Searching nearby places...",
    text: "Querying OpenStreetMap data",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  // Overpass API query for various POI types
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"cafe|restaurant|bar|pub|fast_food|ice_cream|food_court"](around:${radius},${lat},${lng});
      node["tourism"~"viewpoint|attraction|artwork|museum|gallery|information"](around:${radius},${lat},${lng});
      node["leisure"~"park|playground|pitch|sports_centre"](around:${radius},${lat},${lng});
      node["shop"~"supermarket|convenience|bakery"](around:${radius},${lat},${lng});
    );
    out body;
  `;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const elements = data.elements;

    if (elements.length === 0) {
      Swal.fire({
        icon: "info",
        iconColor: "var(--swal-color-info)",
        title: "No Places Found",
        text: `No points of interest found within ${radius}m of this location.`,
      });
      return;
    }

    // Group places by category
    const categories = {
      "Food & Drink": [],
      Tourism: [],
      Leisure: [],
      Shopping: [],
      Other: [],
    };

    elements.forEach((element) => {
      const tags = element.tags || {};
      const name = tags.name || "Unnamed";
      const amenity = tags.amenity;
      const tourism = tags.tourism;
      const leisure = tags.leisure;
      const shop = tags.shop;

      const place = {
        name,
        lat: element.lat,
        lon: element.lon,
        type: amenity || tourism || leisure || shop || "unknown",
        tags,
      };

      if (
        amenity &&
        ["cafe", "restaurant", "bar", "pub", "fast_food", "ice_cream", "food_court"].includes(
          amenity
        )
      ) {
        categories["Food & Drink"].push(place);
      } else if (tourism) {
        categories["Tourism"].push(place);
      } else if (leisure) {
        categories["Leisure"].push(place);
      } else if (shop) {
        categories["Shopping"].push(place);
      } else {
        categories["Other"].push(place);
      }
    });

    // Build HTML for the SweetAlert
    let html = '<div style="max-height: 400px; overflow-y: auto; text-align: left;">';

    Object.keys(categories).forEach((category) => {
      if (categories[category].length > 0) {
        html += `<h4 style="margin: 15px 0 5px 0; color: var(--highlight-color);">${category}</h4>`;
        categories[category].forEach((place) => {
          const typeLabel = place.type.replace(/_/g, " ");
          html += `
            <div class="poi-item" data-place='${JSON.stringify(place)}' style="
              padding: 8px;
              margin: 5px 0;
              cursor: pointer;
              border-radius: 4px;
              border: 1px solid var(--divider-color);
              background: var(--panel-bg);
              transition: background 0.2s;
            " onmouseover="this.style.background='var(--highlight-color-fade)'" onmouseout="this.style.background='var(--panel-bg)'">
              <div style="font-weight: bold;">${place.name}</div>
              <div style="font-size: 12px; color: var(--text-secondary-color);">${typeLabel}</div>
            </div>
          `;
        });
      }
    });

    html += "</div>";

    Swal.fire({
      title: `Found ${elements.length} place${elements.length === 1 ? "" : "s"}`,
      html,
      width: "500px",
      showCloseButton: true,
      showConfirmButton: false,
      didOpen: () => {
        // Add click handlers to each POI item
        document.querySelectorAll(".poi-item").forEach((item) => {
          item.addEventListener("click", () => {
            const placeData = JSON.parse(item.getAttribute("data-place"));
            addPlaceAsMarker(placeData);
            Swal.close();
          });
        });
      },
    });
  } catch (error) {
    console.error("Overpass API error:", error);
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "Search Failed",
      text: "Could not retrieve nearby places. Please try again.",
    });
  }
}

/**
 * Adds a selected place from Overpass API as a marker on the map.
 * @param {Object} place - The place data from Overpass API
 */
function addPlaceAsMarker(place) {
  const defaultDrawColorName = "Red";
  const defaultDrawColorData = ORGANIC_MAPS_COLORS.find((c) => c.name === defaultDrawColorName);

  const newMarker = L.marker([place.lat, place.lon], {
    icon: createMarkerIcon(defaultDrawColorData.css, STYLE_CONFIG.marker.default.opacity),
  });

  newMarker.pathType = "drawn";
  newMarker.feature = {
    properties: {
      name: place.name,
      omColorName: defaultDrawColorName,
      osmType: place.type,
      osmTags: place.tags,
    },
  };

  drawnItems.addLayer(newMarker);
  editableLayers.addLayer(newMarker);

  newMarker.on("click", (ev) => {
    L.DomEvent.stopPropagation(ev);
    selectItem(newMarker);
  });

  // Update UI
  updateDrawControlStates();
  updateOverviewList();
  selectItem(newMarker);

  // Optionally pan to the marker
  map.setView([place.lat, place.lon], map.getZoom() < 16 ? 16 : map.getZoom());

  Swal.fire({
    toast: true,
    position: "center",
    icon: "success",
    iconColor: "var(--swal-color-success)",
    title: "Place Added!",
    text: place.name,
    showConfirmButton: false,
    timer: 2000,
  });
}

function initializeContextMenu(map) {
  /**
   * Creates and displays the map's context menu in a popup.
   * @param {L.LeafletEvent} e - The map event object
   */
  const showMapContextMenu = (e) => {
    const latlng = e.latlng;
    const displayedCoordString = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    const fullCoordString = `${latlng.lat}, ${latlng.lng}`;

    const popupContent = document.createElement("div");
    popupContent.style.textAlign = "center";
    popupContent.style.cursor = "default";

    const showRoutingPanel = () => {
      document.getElementById("main-right-container").classList.remove("hidden");
      const toggleButton = document.querySelector(".leaflet-control-toggle-panels");
      if (toggleButton) {
        toggleButton.classList.add("panels-visible");
        toggleButton.classList.remove("panels-hidden");
      }
      document.getElementById("tab-btn-routing").click();
      map.closePopup();
    };

    const coordsDiv = document.createElement("div");
    coordsDiv.innerHTML = `<span style="font-size: 13px;">${displayedCoordString}</span>`;
    popupContent.appendChild(coordsDiv);

    const divider = document.createElement("hr");
    divider.style.margin = "5px 0";
    divider.style.border = "none";
    divider.style.borderTop = "1px solid var(--divider-color)";
    popupContent.appendChild(divider);

    const createMenuItem = (text, onClick) => {
      const div = document.createElement("div");
      div.textContent = text;
      div.style.cursor = "pointer";
      div.style.padding = "5px 0";
      div.addEventListener("click", onClick);
      return div;
    };

    popupContent.appendChild(
      createMenuItem("Copy Coordinates", () => {
        copyToClipboard(fullCoordString)
          .then(() => {
            map.closePopup();
            Swal.fire({
              toast: true,
              position: "center",
              icon: "success",
              iconColor: "var(--swal-color-success)",
              title: "Coordinates Copied!",
              html: fullCoordString,
              showConfirmButton: false,
              timer: 1500,
            });
          })
          .catch((err) => {
            console.error("Could not copy text: ", err);
            map.closePopup();
            Swal.fire({
              toast: true,
              position: "center",
              icon: "error",
              iconColor: "var(--swal-color-error)",
              title: "Failed to Copy",
              showConfirmButton: false,
              timer: 2000,
            });
          });
      })
    );

    popupContent.appendChild(
      createMenuItem("Route from here", () => {
        if (window.app && typeof window.app.updateRoutingPoint === "function") {
          window.app.updateRoutingPoint(latlng, "start");
        }
        showRoutingPanel();
      })
    );

    popupContent.appendChild(
      createMenuItem("Route to here", () => {
        if (window.app && typeof window.app.updateRoutingPoint === "function") {
          window.app.updateRoutingPoint(latlng, "end");
        }
        showRoutingPanel();
      })
    );

    popupContent.appendChild(
      createMenuItem("Find nearby places", () => {
        map.closePopup();
        findNearbyPlaces(latlng);
      })
    );

    popupContent.appendChild(
      createMenuItem("Edit on OpenStreetMap", () => {
        const zoom = map.getZoom();
        const url = `https://www.openstreetmap.org/edit?editor=id#map=${zoom}/${latlng.lat}/${latlng.lng}`;
        window.open(url, "_blank");
        map.closePopup();
      })
    );

    L.popup({ closeButton: false }).setLatLng(latlng).setContent(popupContent).openOn(map);
  };

  // This single event listener handles both desktop right-click and mobile long-press
  map.on("contextmenu", (e) => {
    // A list of UI container selectors where the context menu should NOT appear.
    const uiSelectors = [
      "#search-container",
      "#main-right-container",
      "#custom-layers-panel",
      "#elevation-div",
      ".leaflet-control-container",
      ".leaflet-popup-pane",
      //   ".leaflet-overlay-pane",
      //   ".leaflet-marker-pane",
    ];

    // Check if the click originated inside any of the specified UI containers.
    const clickedOnUi = e.originalEvent.target.closest(uiSelectors.join(", "));

    if (!clickedOnUi) {
      // Close any existing popups before opening the context menu
      map.closePopup();
      showMapContextMenu(e);
    }
  });
}
