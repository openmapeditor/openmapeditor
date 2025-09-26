// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// Creates a marker icon
function createMarkerIcon(
  color,
  opacity,
  size = STYLE_CONFIG.marker.baseSize,
  anchorOffsetY = 0,
  isOutline = false
) {
  const fillClass = isOutline ? "material-symbols-map-marker-outline" : "material-symbols-fill";

  return L.divIcon({
    html: `<span class="material-symbols ${fillClass} material-symbols-map-marker" style="font-size: ${size}px; color: ${color}; opacity: ${opacity}; line-height: 1;">location_on</span>`,
    className: "svg-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size + anchorOffsetY],
  });
}

// Helper function to keep the marker outline position updated during a drag
function updateMarkerOutlinePosition() {
  if (globallySelectedItem instanceof L.Marker && selectedMarkerOutline) {
    selectedMarkerOutline.setLatLng(globallySelectedItem.getLatLng());
  }
}

function deselectCurrentItem() {
  if (temporarySearchMarker) {
    map.removeLayer(temporarySearchMarker);
    temporarySearchMarker = null;
  }

  // Remove any existing selection outlines
  if (selectedPathOutline) {
    map.removeLayer(selectedPathOutline);
    selectedPathOutline = null;
  }
  if (selectedMarkerOutline) {
    map.removeLayer(selectedMarkerOutline);
    selectedMarkerOutline = null;
  }

  if (!globallySelectedItem) return;

  // Clean up drag listener if the deselected item was a marker
  if (globallySelectedItem instanceof L.Marker) {
    globallySelectedItem.off("drag", updateMarkerOutlinePosition);
  }

  // Reset the overlay pane's z-index to its default value of 400
  const overlayPane = document.querySelector(".leaflet-overlay-pane");
  if (overlayPane) {
    overlayPane.style.zIndex = 400;
  }

  const layerId = L.Util.stamp(globallySelectedItem);
  const listItem = document.querySelector(
    `#overview-panel-list .overview-list-item[data-layer-id='${layerId}']`
  );
  if (listItem) {
    listItem.classList.remove("selected");
  }

  const item = globallySelectedItem;
  if (item.feature?.properties?.omColorName) {
    const colorName = item.feature.properties.omColorName;
    const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
    if (colorData) {
      if (item instanceof L.Polyline || item instanceof L.Polygon) {
        // --- MODIFIED: Removed special case for Strava paths ---
        // It will now correctly use the color defined by its omColorName ("Orange")
        item.setStyle({ ...STYLE_CONFIG.path.default, color: colorData.css });
      } else if (item instanceof L.Marker) {
        item.setIcon(createMarkerIcon(colorData.css, STYLE_CONFIG.marker.default.opacity));
        item.setZIndexOffset(0);
      }
    }
  }

  globallySelectedItem = null;
  selectedElevationPath = null;
  elevationControl.clear();
  document.getElementById("elevation-div").style.visibility = "hidden";
  isElevationProfileVisible = false;
  updateElevationToggleIconColor();
  elevationToggleControl.getContainer().title = "No path selected";
  L.DomUtil.addClass(elevationToggleControl.getContainer(), "disabled");

  const downloadContainer = downloadControl.getContainer();
  const gpxButton = downloadContainer.querySelector("#download-gpx");
  const kmlButton = downloadContainer.querySelector("#download-kml");
  const stravaGpxButton = downloadContainer.querySelector("#download-strava-original-gpx");

  // Reset button visibility to default
  gpxButton.style.display = "block";
  kmlButton.style.display = "block";
  stravaGpxButton.style.display = "none";

  gpxButton.disabled = true;
  kmlButton.disabled = true;

  gpxButton.textContent = "GPX (Selected Item)";
  kmlButton.textContent = "KML (Selected Item)";

  resetInfoPanel();
}

function selectItem(layer) {
  if (isDeleteMode || isEditMode) return;
  if (globallySelectedItem && globallySelectedItem !== layer) {
    deselectCurrentItem();
  }
  globallySelectedItem = layer;

  const layerId = L.Util.stamp(layer);
  const newListItem = document.querySelector(
    `#overview-panel-list .overview-list-item[data-layer-id='${layerId}']`
  );
  if (newListItem) {
    newListItem.classList.add("selected");
    if (document.getElementById("overview-panel").classList.contains("active")) {
      newListItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  const colorName = layer.feature?.properties?.omColorName || "Red";
  const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
  const highlightColor = colorData ? colorData.css : colorScheme.drawn.highlight;

  showInfoPanel(layer);

  if (downloadControl) {
    const gpxButton = downloadControl.getContainer().querySelector("#download-gpx");
    const kmlButton = downloadControl.getContainer().querySelector("#download-kml");
    const stravaGpxButton = downloadControl
      .getContainer()
      .querySelector("#download-strava-original-gpx");

    // Logic to show the correct button(s)
    if (layer.pathType === "strava") {
      gpxButton.style.display = "none"; // Hide standard GPX button
      kmlButton.style.display = "none"; // Hide standard KML button
      stravaGpxButton.style.display = "block"; // Show Strava-specific button
    } else {
      gpxButton.style.display = "block";
      kmlButton.style.display = "block";
      stravaGpxButton.style.display = "none";

      gpxButton.disabled = false;
      kmlButton.disabled = false;
      const itemType = layer instanceof L.Marker ? "Marker" : "Path";
      gpxButton.textContent = `GPX (Selected ${itemType})`;
      kmlButton.textContent = `KML (Selected ${itemType})`;
    }
  }

  if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
    // Set the overlay pane's z-index to a higher value above .leaflet-marker-pane with z-index 600
    if (layer.pathType !== "route") {
      // Don't change z-index for routes, as the path would hide its start/end/via markers
      const overlayPane = document.querySelector(".leaflet-overlay-pane");
      if (overlayPane) {
        overlayPane.style.zIndex = 601;
      }
    }

    // --- Create and add the selection outline if enabled ---
    const { outline } = STYLE_CONFIG.path.highlight;
    if (outline.enabled) {
      if (selectedPathOutline) {
        map.removeLayer(selectedPathOutline); // Clean up just in case
      }
      selectedPathOutline = L.polyline(layer.getLatLngs(), {
        color: outline.color,
        weight: STYLE_CONFIG.path.highlight.weight + outline.weightOffset,
        opacity: STYLE_CONFIG.path.highlight.opacity,
        interactive: false,
      });
      // Only add the outline to the map if the main layer is actually visible
      if (map.hasLayer(layer) && !isEditMode) {
        selectedPathOutline.addTo(map).bringToFront();
      }
    }
    // --- END ---

    selectedElevationPath = layer;
    elevationControl.clear();
    addElevationProfileForLayer(layer);
    layer.setStyle({ ...STYLE_CONFIG.path.highlight, color: highlightColor });
    layer.bringToFront();
    if (elevationToggleControl) {
      elevationToggleControl.getContainer().title = "Toggle elevation profile";
      L.DomUtil.removeClass(elevationToggleControl.getContainer(), "disabled");
    }
    const elevationDiv = document.getElementById("elevation-div");
    if (isElevationProfileVisible || elevationDiv.style.visibility === "visible") {
      elevationDiv.style.visibility = "visible";
      isElevationProfileVisible = true;
    }
  } else if (layer instanceof L.Marker) {
    // --- START: REFINED MARKER OUTLINE LOGIC ---
    const { outline } = STYLE_CONFIG.marker.highlight;
    if (outline.enabled) {
      if (selectedMarkerOutline) {
        map.removeLayer(selectedMarkerOutline);
      }

      // The outline marker is now the SAME size as the base marker.
      const outlineSize = STYLE_CONFIG.marker.baseSize;

      selectedMarkerOutline = L.marker(layer.getLatLng(), {
        // Call the modified function with 'isOutline' set to true.
        icon: createMarkerIcon(outline.color, 1, outlineSize, 0, true), // <-- SET isOutline to true
        zIndexOffset: 1001, // HIGHER z-index to appear ON TOP
        interactive: false,
      });

      if (map.hasLayer(layer) && !isEditMode) {
        selectedMarkerOutline.addTo(map);
      }
    }
    // --- END: REFINED MARKER OUTLINE LOGIC ---

    // The main marker is now styled using the same function, ensuring it's filled.
    layer.setIcon(createMarkerIcon(highlightColor, STYLE_CONFIG.marker.highlight.opacity));
    layer.setZIndexOffset(1000);

    layer.on("drag", updateMarkerOutlinePosition);
  }

  updateElevationToggleIconColor();
}

function updateDrawControlStates() {
  if (!drawControl) return;
  if (!editControlContainer) {
    editControlContainer = drawControl.getContainer().querySelector(".leaflet-draw-edit");
    deleteControlContainer = drawControl.getContainer().querySelector(".leaflet-draw-edit-remove");
  }
  const hasLayers =
    editableLayers.getLayers().length > 0 || stravaActivitiesLayer.getLayers().length > 0;

  // Disable the entire download control if there are no layers on the map.
  const downloadButtonContainer = document.getElementById("main-download-button");
  if (downloadButtonContainer) {
    if (hasLayers) {
      L.DomUtil.removeClass(downloadButtonContainer, "disabled");
      downloadButtonContainer.title = "Download file"; // Set normal tooltip
    } else {
      L.DomUtil.addClass(downloadButtonContainer, "disabled");
      downloadButtonContainer.title = "No items to download"; // Set disabled tooltip
    }
  }

  if (editControlContainer && deleteControlContainer) {
    if (hasLayers) {
      L.DomUtil.removeClass(editControlContainer, "leaflet-disabled");
      L.DomUtil.removeClass(deleteControlContainer, "leaflet-disabled");
    } else {
      L.DomUtil.addClass(editControlContainer, "leaflet-disabled");
      L.DomUtil.addClass(deleteControlContainer, "leaflet-disabled");
    }
  }

  // NEW: Disable/enable layer toggling based on edit/delete mode
  const layerSelectors = document.querySelectorAll(
    "#custom-layers-panel .leaflet-control-layers-selector"
  );
  if (isEditMode || isDeleteMode) {
    layerSelectors.forEach((selector) => {
      L.DomUtil.addClass(selector, "leaflet-disabled-interaction");
      selector.disabled = true; // Also disable the checkbox/radio directly
    });
  } else {
    layerSelectors.forEach((selector) => {
      L.DomUtil.removeClass(selector, "leaflet-disabled-interaction");
      selector.disabled = false; // Enable them back
    });
  }
}

// --- START: NEW INSTANT DELETION LOGIC ---
/**
 * Deletes a layer and its associated data immediately from all groups and the UI.
 * @param {L.Layer} layer The layer to be deleted.
 */
function deleteLayerImmediately(layer) {
  if (!layer) return;

  // If the layer being deleted is the active route, we must call the dedicated
  // clearRouting function. This ensures the routing markers and panel are
  // also cleared, not just the route line.
  if (layer === currentRoutePath) {
    // This function is exposed on window.app from routing.js and handles all cleanup.
    if (window.app && typeof window.app.clearRouting === "function") {
      window.app.clearRouting();
    }
    // We return here because clearRouting() takes care of all necessary layer removal and UI updates.
    return;
  }

  if (globallySelectedItem === layer) {
    deselectCurrentItem();
  }

  // Remove the layer from whichever display group it resides in (including nested groups)
  [drawnItems, importedItems, kmzLayer, stravaActivitiesLayer].forEach((group) => {
    if (group.hasLayer(layer)) {
      group.removeLayer(layer);
    } else {
      group.eachLayer((geoJsonGroup) => {
        if (geoJsonGroup instanceof L.GeoJSON && geoJsonGroup.hasLayer(layer)) {
          geoJsonGroup.removeLayer(layer);
        }
      });
    }
  });

  // Also remove it from the master editable layer group if it's there
  if (editableLayers.hasLayer(layer)) {
    editableLayers.removeLayer(layer);
  }

  if (layer === currentRoutePath) {
    currentRoutePath = null;
  }

  // Refresh the UI
  updateDrawControlStates();
  updateOverviewList();
}

// A named function to act as our delete click handler during Leaflet.Draw's delete mode.
const onFeatureClickToDelete = function (e) {
  // Deselect the item if it was selected and is about to be "hidden" for deletion
  if (this === globallySelectedItem) {
    deselectCurrentItem();
  }

  // Remove the layer from the map (visually hide it) but keep it in editableLayers
  // so Leaflet.Draw can manage its actual deletion or restoration on save/cancel.
  map.removeLayer(this);
  // Add a flag to distinguish layers removed by the toolbar for later processing in DELETED event
  this.isDeletedFromToolbar = true;

  // Stop the event from propagating to Leaflet.Draw's own handlers
  L.DomEvent.stop(e);
};
// --- END: NEW INSTANT DELETION LOGIC ---
