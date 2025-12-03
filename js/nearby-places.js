// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * Nearby Places Module
 * Handles searching for nearby POIs using Overpass API and displaying them in a searchable dialog
 */

const NearbyPlaces = (function () {
  // Configuration
  const CONFIG = {
    DEFAULT_RADIUS: 1000, // 1km in meters
    MAX_RADIUS: 10000, // 10km limit for Overpass API performance
    MAX_RESULTS_PER_CATEGORY: 50, // Limit results per category
    OVERPASS_TIMEOUT: 25, // Timeout in seconds
  };

  // Category definitions with Material Symbols icons
  const CATEGORIES = {
    "Food & Drink": {
      icon: "restaurant",
      tags: {
        amenity: [
          "cafe",
          "restaurant",
          "bar",
          "pub",
          "fast_food",
          "ice_cream",
          "food_court",
          "biergarten",
        ],
      },
      color: "Orange",
    },
    Tourism: {
      icon: "attractions",
      tags: {
        tourism: [
          "viewpoint",
          "attraction",
          "artwork",
          "museum",
          "gallery",
          "information",
          "hotel",
          "hostel",
          "motel",
          "guest_house",
        ],
      },
      color: "Purple",
    },
    Leisure: {
      icon: "sports_soccer",
      tags: {
        leisure: ["park", "playground", "pitch", "sports_centre", "swimming_pool", "garden"],
      },
      color: "Green",
    },
    Shopping: {
      icon: "shopping_bag",
      tags: {
        shop: ["supermarket", "convenience", "bakery", "mall", "department_store"],
      },
      color: "Blue",
    },
    Services: {
      icon: "local_hospital",
      tags: {
        amenity: ["hospital", "pharmacy", "clinic", "doctors", "dentist", "veterinary"],
      },
      color: "Red",
    },
    Transport: {
      icon: "directions_bus",
      tags: {
        amenity: ["fuel", "charging_station", "parking", "bicycle_parking"],
        public_transport: ["station", "stop_position"],
      },
      color: "Yellow",
    },
  };

  /**
   * Calculates distance between two coordinates using Haversine formula
   * @param {number} lat1 - First latitude
   * @param {number} lon1 - First longitude
   * @param {number} lat2 - Second latitude
   * @param {number} lon2 - Second longitude
   * @returns {number} Distance in meters
   */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Formats distance for display, respecting imperial/metric setting
   * @param {number} meters - Distance in meters
   * @returns {string} Formatted distance string
   */
  function formatDistance(meters) {
    // Check if imperial units are enabled (global variable from main.js)
    const isImperial = typeof useImperialUnits !== "undefined" && useImperialUnits;

    if (isImperial) {
      const feet = meters * 3.28084;
      const miles = meters * 0.000621371;

      if (miles < 0.1 && miles > 0) {
        return `${Math.round(feet)} ft`;
      } else {
        return `${miles.toFixed(1)} mi`;
      }
    } else {
      if (meters < 1000) {
        return `${Math.round(meters)} m`;
      } else {
        return `${(meters / 1000).toFixed(1)} km`;
      }
    }
  }

  /**
   * Builds Overpass API query for all POI categories
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} radius - Search radius in meters
   * @returns {string} Overpass API query
   */
  function buildOverpassQuery(lat, lng, radius) {
    let queries = [];

    Object.values(CATEGORIES).forEach((category) => {
      Object.entries(category.tags).forEach(([key, values]) => {
        const valuesStr = values.join("|");
        queries.push(`node["${key}"~"${valuesStr}"](around:${radius},${lat},${lng});`);
        queries.push(`way["${key}"~"${valuesStr}"](around:${radius},${lat},${lng});`);
      });
    });

    return `
      [out:json][timeout:${CONFIG.OVERPASS_TIMEOUT}];
      (
        ${queries.join("\n        ")}
      );
      out body center;
    `;
  }

  /**
   * Categorizes a POI based on its tags
   * @param {Object} tags - OSM tags
   * @returns {string|null} Category name or null
   */
  function categorizePlace(tags) {
    for (const [categoryName, categoryData] of Object.entries(CATEGORIES)) {
      for (const [key, values] of Object.entries(categoryData.tags)) {
        if (tags[key] && values.includes(tags[key])) {
          return categoryName;
        }
      }
    }
    return null;
  }

  /**
   * Main function to find and display nearby places
   * @param {L.LatLng} latlng - Center coordinates
   * @param {L.Map} map - Leaflet map instance
   */
  async function findNearbyPlaces(latlng, map) {
    const radius = CONFIG.DEFAULT_RADIUS;
    const lat = latlng.lat;
    const lng = latlng.lng;

    // Show loading alert
    Swal.fire({
      title: "Searching nearby places...",
      text: `Querying OpenStreetMap data within ${formatDistance(radius)}`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const query = buildOverpassQuery(lat, lng, radius);

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
          text: `No points of interest found within ${formatDistance(radius)} of this location.`,
        });
        return;
      }

      // Process and categorize places
      const categorizedPlaces = {};
      Object.keys(CATEGORIES).forEach((cat) => {
        categorizedPlaces[cat] = [];
      });

      elements.forEach((element) => {
        const tags = element.tags || {};
        const name = tags.name || "Unnamed";

        // Get coordinates (for ways, use center)
        const placeLat = element.lat || (element.center && element.center.lat);
        const placeLon = element.lon || (element.center && element.center.lon);

        if (!placeLat || !placeLon) return;

        const distance = calculateDistance(lat, lng, placeLat, placeLon);
        const category = categorizePlace(tags);

        if (category) {
          const place = {
            name,
            lat: placeLat,
            lon: placeLon,
            distance,
            tags,
            category,
          };

          categorizedPlaces[category].push(place);
        }
      });

      // Sort by distance and limit results
      Object.keys(categorizedPlaces).forEach((category) => {
        categorizedPlaces[category].sort((a, b) => a.distance - b.distance);
        categorizedPlaces[category] = categorizedPlaces[category].slice(
          0,
          CONFIG.MAX_RESULTS_PER_CATEGORY
        );
      });

      await showPlacesDialog(categorizedPlaces, map);
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
   * Shows the places selection dialog with categories and search
   * @param {Object} categorizedPlaces - Places organized by category
   * @param {L.Map} map - Leaflet map instance
   */
  async function showPlacesDialog(categorizedPlaces, map) {
    // Count total places
    let totalPlaces = 0;
    Object.values(categorizedPlaces).forEach((places) => {
      totalPlaces += places.length;
    });

    // Build HTML for categories
    let categoriesHtml = "";
    Object.entries(categorizedPlaces).forEach(([categoryName, places]) => {
      if (places.length === 0) return;

      const categoryData = CATEGORIES[categoryName];
      const categoryId = categoryName.toLowerCase().replace(/\s+/g, "-");

      categoriesHtml += `
        <div class="nearby-category" data-category="${categoryName.toLowerCase()}">
          <div class="nearby-category-header" data-category-id="${categoryId}">
            <span class="material-symbols nearby-category-icon">${categoryData.icon}</span>
            <span class="nearby-category-title">${categoryName}</span>
            <span class="nearby-category-count">(${places.length})</span>
            <span class="material-symbols nearby-category-toggle">keyboard_arrow_down</span>
          </div>
          <div class="nearby-category-content" id="nearby-category-${categoryId}" style="display: none;">
            ${places
              .map((place, index) => {
                const placeId = `${categoryId}-${index}`;
                const typeLabel = getPlaceTypeLabel(place.tags);
                const hasDetails = hasPlaceDetails(place.tags);

                return `
                  <div class="nearby-place-item" data-place-id="${placeId}">
                    <div class="nearby-place-main">
                      <div class="nearby-place-info">
                        <div class="nearby-place-name">${place.name}</div>
                        <div class="nearby-place-meta">
                          <span class="nearby-place-type">${typeLabel}</span>
                          <span class="nearby-place-distance">${formatDistance(
                            place.distance
                          )}</span>
                        </div>
                      </div>
                      <div class="nearby-place-actions">
                        ${
                          hasDetails
                            ? `<span class="material-symbols nearby-place-info-icon" data-place-id="${placeId}" title="Show details">info</span>`
                            : ""
                        }
                        <span class="material-symbols material-symbols-fill nearby-place-marker-icon" data-place-data='${JSON.stringify(
                          place
                        ).replace(
                          /'/g,
                          "&#39;"
                        )}' data-category="${categoryName}" title="Add marker to map">location_on</span>
                      </div>
                    </div>
                    ${
                      hasDetails
                        ? `<div class="nearby-place-details" id="nearby-details-${placeId}" style="display: none;">
                            ${buildPlaceDetailsHtml(place.tags)}
                          </div>`
                        : ""
                    }
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    });

    const result = await Swal.fire({
      title: "Nearby Places",
      html: `
        <div style="text-align: left; display: flex; flex-direction: column; height: 100%; min-height: 0;">
          <div id="nearby-search-header" style="flex-shrink: 0; background-color: var(--background-color); z-index: 10; padding-bottom: 0px;">
            <input
              type="text"
              id="nearby-search-input"
              class="swal2-input swal-input-field"
              placeholder="Search places"
              style="margin-bottom: 10px;"
            />
            <p style="margin-bottom: 5px;">
              Found <strong id="nearby-places-count">${totalPlaces}</strong> place(s):
            </p>
          </div>
          <div id="nearby-places-container" style="flex: 1 1 auto; overflow-y: auto; padding: 10px; min-height: 0;">
            ${categoriesHtml}
          </div>
        </div>
      `,
      showCloseButton: false,
      showConfirmButton: true,
      confirmButtonText: "Close",
      width: "600px",
      customClass: {
        popup: "nearby-places-popup",
      },
      didOpen: () => {
        setupDialogInteractions(map);
      },
    });
  }

  /**
   * Sets up all interactive elements in the dialog
   * @param {L.Map} map - Leaflet map instance
   */
  function setupDialogInteractions(map) {
    const searchInput = document.getElementById("nearby-search-input");
    const placesCountEl = document.getElementById("nearby-places-count");

    // Category collapse/expand
    document.querySelectorAll(".nearby-category-header").forEach((header) => {
      header.addEventListener("click", () => {
        const categoryId = header.dataset.categoryId;
        const content = document.getElementById(`nearby-category-${categoryId}`);
        const toggle = header.querySelector(".nearby-category-toggle");

        if (content.style.display === "none") {
          content.style.display = "block";
          toggle.textContent = "keyboard_arrow_up";
        } else {
          content.style.display = "none";
          toggle.textContent = "keyboard_arrow_down";
        }
      });
    });

    // Info icon toggle
    document.querySelectorAll(".nearby-place-info-icon").forEach((icon) => {
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        const placeId = icon.dataset.placeId;
        const details = document.getElementById(`nearby-details-${placeId}`);

        if (details) {
          const isHidden = details.style.display === "none";
          details.style.display = isHidden ? "block" : "none";

          if (isHidden) {
            icon.classList.add("material-symbols-fill");
          } else {
            icon.classList.remove("material-symbols-fill");
          }
        }
      });
    });

    // Add marker icon click
    document.querySelectorAll(".nearby-place-marker-icon").forEach((icon) => {
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        const placeData = JSON.parse(icon.getAttribute("data-place-data"));
        const category = icon.getAttribute("data-category");
        addPlaceAsMarker(placeData, category, map);
        Swal.close();
      });
    });

    // Search functionality
    searchInput.addEventListener("input", () => {
      const searchTerm = searchInput.value.toLowerCase().trim();
      let visibleCount = 0;

      document.querySelectorAll(".nearby-place-item").forEach((item) => {
        const nameEl = item.querySelector(".nearby-place-name");
        const typeEl = item.querySelector(".nearby-place-type");
        const name = nameEl ? nameEl.textContent.toLowerCase() : "";
        const type = typeEl ? typeEl.textContent.toLowerCase() : "";

        if (name.includes(searchTerm) || type.includes(searchTerm)) {
          item.style.display = "block";
          visibleCount++;
        } else {
          item.style.display = "none";
        }
      });

      // Update category visibility
      document.querySelectorAll(".nearby-category").forEach((category) => {
        const visibleItems = category.querySelectorAll(
          '.nearby-place-item[style="display: block;"], .nearby-place-item:not([style*="display"])'
        );
        category.style.display = visibleItems.length > 0 ? "block" : "none";
      });

      placesCountEl.textContent = visibleCount;
    });
  }

  /**
   * Gets a human-readable type label for a place
   * @param {Object} tags - OSM tags
   * @returns {string} Formatted type label
   */
  function getPlaceTypeLabel(tags) {
    const type =
      tags.amenity || tags.tourism || tags.leisure || tags.shop || tags.public_transport || "place";
    return type.replace(/_/g, " ");
  }

  /**
   * Checks if place has additional details worth showing
   * @param {Object} tags - OSM tags
   * @returns {boolean} True if place has details
   */
  function hasPlaceDetails(tags) {
    return !!(
      tags.opening_hours ||
      tags.phone ||
      tags.website ||
      tags.cuisine ||
      tags["addr:street"] ||
      tags.wheelchair
    );
  }

  /**
   * Builds HTML for place details
   * @param {Object} tags - OSM tags
   * @returns {string} HTML string
   */
  function buildPlaceDetailsHtml(tags) {
    let html = '<div class="nearby-place-details-content">';

    if (tags.cuisine) {
      html += `<div><strong>Cuisine:</strong> ${tags.cuisine}</div>`;
    }

    if (tags.opening_hours) {
      html += `<div><strong>Hours:</strong> ${tags.opening_hours}</div>`;
    }

    if (tags.phone) {
      html += `<div><strong>Phone:</strong> <a href="tel:${tags.phone}">${tags.phone}</a></div>`;
    }

    if (tags.website) {
      const websiteUrl = tags.website.startsWith("http") ? tags.website : `https://${tags.website}`;
      html += `<div><strong>Website:</strong> <a href="${websiteUrl}" target="_blank" rel="noopener noreferrer">Link</a></div>`;
    }

    if (tags["addr:street"] || tags["addr:housenumber"]) {
      const street = tags["addr:street"] || "";
      const number = tags["addr:housenumber"] || "";
      html += `<div><strong>Address:</strong> ${number} ${street}</div>`;
    }

    if (tags.wheelchair) {
      const accessible =
        tags.wheelchair === "yes" ? "Yes" : tags.wheelchair === "no" ? "No" : "Limited";
      html += `<div><strong>Wheelchair accessible:</strong> ${accessible}</div>`;
    }

    html += "</div>";
    return html;
  }

  /**
   * Adds a selected place as a marker on the map
   * @param {Object} place - Place data
   * @param {string} categoryName - Category name
   * @param {L.Map} map - Leaflet map instance
   */
  function addPlaceAsMarker(place, categoryName, map) {
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
        osmType: getPlaceTypeLabel(place.tags),
        osmTags: place.tags,
        nearbyPlaceCategory: categoryName,
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

    // Pan to the marker
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

  // Public API
  return {
    findNearbyPlaces,
    CONFIG, // Expose config for easy adjustments
  };
})();

// Export to window for global access
window.NearbyPlaces = NearbyPlaces;
