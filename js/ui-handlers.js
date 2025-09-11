// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * Helper function to create a single list item for the overview panel.
 * This encapsulates the logic for creating the item's text, buttons, and event listeners.
 * @param {L.Layer} layer - The layer to create the list item for.
 * @returns {HTMLElement} The created list item element.
 */
function createOverviewListItem(layer) {
  const layerId = L.Util.stamp(layer);
  let layerName =
    layer.feature?.properties?.name || (layer instanceof L.Marker ? "Marker" : "Unnamed Path");

  const listItem = document.createElement("div");
  listItem.className = "overview-list-item";
  listItem.setAttribute("data-layer-id", layerId);

  // Visibility toggle button
  const visibilityBtn = document.createElement("span");
  visibilityBtn.className = "overview-visibility-btn";
  visibilityBtn.title = "Toggle visibility";
  const setIcon = (visible) => {
    visibilityBtn.innerHTML = visible
      ? '<span class="material-symbols">visibility</span>'
      : '<span class="material-symbols">visibility_off</span>';
  };
  const isInitiallyVisible = map.hasLayer(layer) && !layer.isManuallyHidden;
  setIcon(isInitiallyVisible);
  visibilityBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const layerToToggle =
      editableLayers.getLayer(layerId) ||
      stravaActivitiesLayer.getLayer(layerId) ||
      (currentRoutePath && L.Util.stamp(currentRoutePath) === layerId ? currentRoutePath : null);
    if (!layerToToggle) return;
    const isCurrentlyVisible = map.hasLayer(layerToToggle);
    if (isCurrentlyVisible) {
      layerToToggle.isManuallyHidden = true;
      map.removeLayer(layerToToggle);
      if (layerToToggle === globallySelectedItem) {
        if (selectedPathOutline) map.removeLayer(selectedPathOutline);
        if (selectedMarkerOutline) map.removeLayer(selectedMarkerOutline);
      }
      setIcon(false);
    } else {
      layerToToggle.isManuallyHidden = false;
      map.addLayer(layerToToggle);
      if (layerToToggle === globallySelectedItem) {
        if (selectedPathOutline) selectedPathOutline.addTo(map).bringToBack();
        if (selectedMarkerOutline) selectedMarkerOutline.addTo(map);
      }
      setIcon(true);
    }
  });

  // Duplicate button
  const duplicateBtn = document.createElement("span");
  if (layer !== currentRoutePath) {
    duplicateBtn.className = "overview-duplicate-btn";
    duplicateBtn.innerHTML = '<span class="material-symbols">content_copy</span>';
    duplicateBtn.title = "Duplicate";
    duplicateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const layerToDuplicate =
        editableLayers.getLayer(layerId) || stravaActivitiesLayer.getLayer(layerId);
      if (!layerToDuplicate) return;
      let newLayer;
      const newFeature = JSON.parse(JSON.stringify(layerToDuplicate.feature || { properties: {} }));
      newFeature.properties.name =
        (newFeature.properties.name || (layerToDuplicate instanceof L.Marker ? "Marker" : "Path")) +
        " (Copy)";
      const colorName = newFeature.properties.omColorName || "Red";
      const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
      const color = colorData ? colorData.css : "#e51b23";
      if (layerToDuplicate.pathType === "strava") {
        const originalCoords = layerToDuplicate
          .getLatLngs()
          .map((latlng) => [latlng.lng, latlng.lat]);
        const simplified = simplifyPath(originalCoords, "LineString", pathSimplificationConfig);
        newLayer = L.polyline(
          simplified.coords.map((c) => [c[1], c[0]]),
          { ...STYLE_CONFIG.path.default, color: color }
        );
        newFeature.properties.totalDistance = calculatePathDistance(newLayer);
      } else if (layerToDuplicate instanceof L.Marker) {
        newLayer = L.marker(layerToDuplicate.getLatLng(), {
          icon: createMarkerIcon(color, STYLE_CONFIG.marker.default.opacity),
        });
      } else if (layerToDuplicate instanceof L.Polyline) {
        newLayer = L.polyline(layerToDuplicate.getLatLngs(), {
          ...STYLE_CONFIG.path.default,
          color: color,
        });
      }
      if (newLayer) {
        newLayer.feature = newFeature;
        newLayer.pathType = "drawn";
        newLayer.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          selectItem(newLayer);
        });
        drawnItems.addLayer(newLayer);
        editableLayers.addLayer(newLayer);
        updateOverviewList();
        updateDrawControlStates();
        selectItem(newLayer);
      }
    });
  }

  // Delete button
  const deleteBtn = document.createElement("span");
  deleteBtn.className = "overview-delete-btn";
  deleteBtn.innerHTML = '<span class="material-symbols material-symbols-fill">cancel</span>';
  deleteBtn.title = "Delete";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const layerToDelete =
      editableLayers.getLayer(layerId) ||
      stravaActivitiesLayer.getLayer(layerId) ||
      (currentRoutePath && L.Util.stamp(currentRoutePath) === layerId ? currentRoutePath : null);
    if (layerToDelete) {
      deleteLayerImmediately(layerToDelete);
    }
  });

  // Text span for the name
  const textSpan = document.createElement("span");
  textSpan.className = "overview-item-text";
  textSpan.textContent = layerName;
  textSpan.title = layerName;

  listItem.appendChild(visibilityBtn);
  listItem.appendChild(duplicateBtn);
  listItem.appendChild(deleteBtn);
  listItem.appendChild(textSpan);

  if (globallySelectedItem && L.Util.stamp(globallySelectedItem) === layerId) {
    listItem.classList.add("selected");
  }

  listItem.addEventListener("click", () => {
    const targetLayer =
      editableLayers.getLayer(layerId) ||
      stravaActivitiesLayer.getLayer(layerId) ||
      (currentRoutePath && L.Util.stamp(currentRoutePath) === layerId ? currentRoutePath : null);
    if (targetLayer) {
      if (targetLayer instanceof L.Polyline || targetLayer instanceof L.Polygon) {
        if (targetLayer.getBounds().isValid()) {
          map.fitBounds(targetLayer.getBounds(), { paddingTopLeft: [50, 50] });
        }
      } else if (targetLayer instanceof L.Marker) {
        const targetZoom = Math.max(map.getZoom(), 16);
        map.flyTo(targetLayer.getLatLng(), targetZoom);
      }
      selectItem(targetLayer);
    }
  });

  return listItem;
}

// Populates or updates the overview list with all items on the map, grouped by type.
function updateOverviewList() {
  const listContainer = document.getElementById("overview-panel-list");
  if (!listContainer) return;

  listContainer.innerHTML = ""; // Clear existing list

  // 1. Collect all items into a single array
  const allItems = [...editableLayers.getLayers(), ...stravaActivitiesLayer.getLayers()];
  if (currentRoutePath) {
    allItems.unshift(currentRoutePath);
  }

  // Handle the empty state
  if (allItems.length === 0) {
    listContainer.innerHTML =
      '<div class="overview-list-item" style="color: grey; cursor: default;">No items on map</div>';
    return;
  }

  // 2. Group all items by their type
  const groupedItems = {};
  const getGroupTitle = (pathType) => {
    switch (pathType) {
      case "route":
        return "Route";
      case "drawn":
        return "Drawn Items";
      case "gpx":
      case "kml":
        return "Imported GPX/KML";
      case "kmz":
        return "Imported KMZ";
      case "strava":
        return "Strava Activities";
      default:
        return "Other";
    }
  };

  allItems.forEach((layer) => {
    const title = getGroupTitle(layer.pathType);
    if (!groupedItems[title]) {
      groupedItems[title] = [];
    }
    groupedItems[title].push(layer);
  });

  // 3. Render the groups in a specific order
  const fragment = document.createDocumentFragment();
  const groupOrder = [
    "Route",
    "Drawn Items",
    "Imported GPX/KML",
    "Imported KMZ",
    "Strava Activities",
    "Other",
  ];

  groupOrder.forEach((title) => {
    const itemsInGroup = groupedItems[title];
    if (itemsInGroup && itemsInGroup.length > 0) {
      // Create and append a header for the group
      const header = document.createElement("div");
      header.className = "overview-list-header";
      header.textContent = title;
      fragment.appendChild(header);

      // Create and append the list items for this group
      itemsInGroup.forEach((layer) => {
        const listItem = createOverviewListItem(layer); // Use the helper function
        fragment.appendChild(listItem);
      });
    }
  });

  listContainer.appendChild(fragment);
}

// Displays the info panel with details about the selected layer.
// @param {L.Layer} layer - The selected layer.
function showInfoPanel(layer) {
  // Style adjustments for when an item is selected
  infoPanelName.style.display = "block";
  infoPanelDetails.style.color = "var(--color-black)";
  infoPanelDetails.style.fontSize = "12px"; // Reset font size
  infoPanel.style.justifyContent = "flex-start";
  infoPanelDetails.style.marginTop = "5px";

  // Populating content
  layer.feature = layer.feature || {};
  layer.feature.properties = layer.feature.properties || {};
  let name = layer.feature.properties.name || "";
  let details = "";
  const editHint = document.getElementById("info-panel-edit-hint");
  const stravaLink = document.getElementById("info-panel-strava-link");

  // Clear previous click handler and reset cursor
  infoPanelDetails.onclick = null;
  infoPanelDetails.style.cursor = "default";
  infoPanelDetails.title = "";

  // Hide hint and Strava link by default
  editHint.style.display = "none";
  stravaLink.style.display = "none";

  if (layer instanceof L.Marker) {
    name = name || "Marker";
    const latlng = layer.getLatLng();
    details = `<span>Lat: ${latlng.lat.toFixed(5)}, Lon: ${latlng.lng.toFixed(
      5
    )}<span class="copy-icon material-symbols">content_copy</span>`;
    infoPanelDetails.innerHTML = details;

    // Add click-to-copy functionality for marker coordinates
    infoPanelDetails.style.cursor = "pointer";
    infoPanelDetails.title = "Click to copy coordinates";

    // FIX #1: Use the robust copyToClipboard function and handle both click and touch events.
    infoPanelDetails.onclick = (e) => {
      L.DomEvent.stop(e); // Prevent event from bubbling up
      const coordString = `${latlng.lat}, ${latlng.lng}`;
      copyToClipboard(coordString)
        .then(() => {
          Swal.fire({
            toast: true,
            position: "center",
            icon: "success",
            iconColor: "var(--swal-color-success)",
            title: "Coordinates Copied!",
            html: coordString,
            showConfirmButton: false,
            timer: 2000,
          });
        })
        .catch((err) => {
          console.error("Could not copy text: ", err);
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
    };
  } else if (layer instanceof L.Polyline) {
    name = name || "Path";
    let totalDistance = 0;

    if (layer.feature?.properties?.totalDistance) {
      totalDistance = layer.feature.properties.totalDistance;
    } else {
      totalDistance = calculatePathDistance(layer);
    }

    details = `Length: ${formatDistance(totalDistance)}`;
  }

  layer.feature.properties.name = name;
  infoPanelName.value = name;
  infoPanelDetails.innerHTML = details;

  infoPanelStyleRow.style.display = "flex";

  // Determine layer type for display
  let layerTypeName = "Unknown";
  switch (layer.pathType) {
    case "drawn":
      layerTypeName = "Drawn Item";
      break;
    case "gpx":
    case "kml":
      layerTypeName = "Imported GPX/KML";
      break;
    case "kmz":
      layerTypeName = "Imported KMZ";
      break;
    case "route":
      layerTypeName = "Route";
      break;
    case "strava":
      const activityType = layer.feature.properties.type || "";
      layerTypeName = `Strava Activity ${activityType ? `(${activityType})` : ""}`.trim();

      // Show the "View on Strava" link
      if (layer.feature.properties.stravaId) {
        const activityUrl = `https://www.strava.com/activities/${layer.feature.properties.stravaId}`;
        stravaLink.href = activityUrl;
        stravaLink.textContent = "View on Strava";
        stravaLink.style.display = "flex";
      }

      // Show the editing hint
      editHint.innerHTML = "To edit, duplicate activity in <b>Contents</b> tab.";
      editHint.style.display = "block";
      break;
  }
  infoPanelLayerName.textContent = layerTypeName;

  // Set the color swatch and update picker state
  const colorName = layer.feature?.properties?.omColorName || "Red";
  const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
  if (colorData) {
    infoPanelColorSwatch.style.backgroundColor = colorData.css;
  }
  updateColorPickerSelection(colorName);

  // Hide the main color picker initially
  colorPicker.style.display = "none";
}

// Resets the info panel to its default state (no item selected).
function resetInfoPanel() {
  if (infoPanel) {
    infoPanelName.style.display = "none";
    infoPanelDetails.textContent = "No item selected";
    infoPanelDetails.style.fontWeight = "normal";
    infoPanelDetails.style.color = "var(--color-grey-dark)";
    infoPanelDetails.style.fontSize = "14px"; // Larger font for this message
    infoPanel.style.justifyContent = "center";
    infoPanelDetails.style.marginTop = "0";

    // Ensure click handler and styles are reset
    infoPanelDetails.onclick = null;
    infoPanelDetails.style.cursor = "default";
    infoPanelDetails.title = "";

    // Hide the hint and Strava link when resetting
    document.getElementById("info-panel-edit-hint").style.display = "none";
    document.getElementById("info-panel-strava-link").style.display = "none";

    // Hide color picker and the new style row
    infoPanelStyleRow.style.display = "none";
    colorPicker.style.display = "none";
  }
}

// Updates the name of the selected layer from the info panel input.
function updateLayerName() {
  if (globallySelectedItem && globallySelectedItem.feature.properties) {
    let newName = infoPanelName.value.trim();
    if (!newName) {
      // Default name if input is empty
      newName = globallySelectedItem instanceof L.Marker ? "Marker" : "Path";
      infoPanelName.value = newName;
    }
    globallySelectedItem.feature.properties.name = newName;
    updateOverviewList();
  }
}

// Populates the color picker with swatches
function populateColorPicker() {
  ORGANIC_MAPS_COLORS.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    swatch.style.backgroundColor = color.css;
    swatch.dataset.colorName = color.name;
    swatch.title = color.name;

    swatch.addEventListener("click", () => {
      if (!globallySelectedItem) return;

      const newColorName = swatch.dataset.colorName;
      const newColorData = ORGANIC_MAPS_COLORS.find((c) => c.name === newColorName);

      if (newColorData) {
        // Store the color name on the feature
        globallySelectedItem.feature.properties.omColorName = newColorName;

        // Update the layer's visual style immediately
        if (
          globallySelectedItem instanceof L.Polyline ||
          globallySelectedItem instanceof L.Polygon
        ) {
          globallySelectedItem.setStyle({
            ...STYLE_CONFIG.path.highlight,
            color: newColorData.css,
          });
        } else if (globallySelectedItem instanceof L.Marker) {
          globallySelectedItem.setIcon(
            createMarkerIcon(newColorData.css, STYLE_CONFIG.marker.highlight.opacity)
          );
        }

        // Update the selected state in the color picker
        updateColorPickerSelection(newColorName);

        // --- NEW ---
        // Update the mini swatch in the info panel and hide the picker
        infoPanelColorSwatch.style.backgroundColor = newColorData.css;
        colorPicker.style.display = "none";
      }
    });

    colorPicker.appendChild(swatch);
  });
}

// Updates which swatch in the picker has the 'selected' class
function updateColorPickerSelection(colorName) {
  const swatches = colorPicker.querySelectorAll(".color-swatch");
  swatches.forEach((swatch) => {
    if (swatch.dataset.colorName === colorName) {
      swatch.classList.add("selected");
    } else {
      swatch.classList.remove("selected");
    }
  });
}

/**
 * Toggles the visibility of the map's scale control based on whether
 * the elevation profile chart is currently visible.
 */
function updateScaleControlVisibility() {
  const scaleControl = document.querySelector(".leaflet-control-scale");
  const elevationDiv = document.getElementById("elevation-div");

  if (scaleControl && elevationDiv) {
    const isElevationVisible = elevationDiv.style.visibility === "visible";
    if (isElevationVisible) {
      L.DomUtil.addClass(scaleControl, "hidden-by-elevation");
    } else {
      L.DomUtil.removeClass(scaleControl, "hidden-by-elevation");
    }
  }
}

// Replaces default leaflet icons with Material Symbols
function replaceDefaultIconsWithMaterialSymbols() {
  const layersButton = document.querySelector(".icon-layers")?.closest(".leaflet-control-custom");
  if (layersButton) {
    layersButton.querySelector("a").innerHTML = '<span class="material-symbols">layers</span>';
  }

  const locateButton = document.querySelector(".leaflet-control-locate a");
  if (locateButton) {
    locateButton.innerHTML = '<span class="material-symbols">my_location</span>';
  }

  const zoomInButton = document.querySelector(".leaflet-control-zoom-in");
  if (zoomInButton) {
    zoomInButton.innerHTML = '<span class="material-symbols">add</span>';
  }

  const zoomOutButton = document.querySelector(".leaflet-control-zoom-out");
  if (zoomOutButton) {
    zoomOutButton.innerHTML = '<span class="material-symbols">remove</span>';
  }

  const pathButton = document.querySelector(".leaflet-draw-draw-polyline");
  if (pathButton) {
    pathButton.innerHTML = '<span class="material-symbols">diagonal_line</span>';
  }

  const markerButton = document.querySelector(".leaflet-draw-draw-marker");
  if (markerButton) {
    markerButton.innerHTML = '<span class="material-symbols">location_on</span>';
  }

  const editButton = document.querySelector(".leaflet-draw-edit-edit");
  if (editButton) {
    editButton.innerHTML = '<span class="material-symbols">edit</span>';
  }

  const deleteButton = document.querySelector(".leaflet-draw-edit-remove");
  if (deleteButton) {
    deleteButton.innerHTML = '<span class="material-symbols">delete</span>';
  }

  const importButton = document.querySelector(".icon-import")?.closest(".leaflet-control-custom");
  if (importButton) {
    importButton.querySelector("a").innerHTML = '<span class="material-symbols">folder_open</span>';
  }

  const downloadButton = document
    .querySelector(".icon-download")
    ?.closest(".leaflet-control-custom");
  if (downloadButton) {
    downloadButton.querySelector("a").innerHTML = '<span class="material-symbols">download</span>';
  }

  const elevationButton = document
    .querySelector(".icon-elevation")
    ?.closest(".leaflet-control-custom");
  if (elevationButton) {
    elevationButton.querySelector("a").innerHTML =
      '<span class="material-symbols">elevation</span>';
  }
}
