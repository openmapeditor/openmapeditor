// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// --- START: NEW code block to apply saved theme on load ---
// Immediately-invoked function to set theme on initial load.
// It only applies dark mode if it was explicitly saved, otherwise the default is light.
(function () {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
  }
})();
// --- END: NEW code block ---

// Global variables
let map,
  drawnItems,
  importedItems,
  kmzLayer,
  editableLayers,
  elevationControl,
  selectedElevationPath = null,
  globallySelectedItem = null,
  selectedPathOutline = null,
  selectedMarkerOutline = null,
  infoPanel,
  infoPanelName,
  infoPanelDetails,
  infoPanelStyleRow,
  infoPanelColorSwatch,
  infoPanelLayerName,
  colorPicker,
  isDeleteMode = false,
  elevationToggleControl,
  downloadControl,
  isElevationProfileVisible = false,
  drawControl,
  isEditMode = false,
  editControlContainer,
  deleteControlContainer,
  locateControl,
  currentRoutePath = null,
  saveRouteBtn,
  temporarySearchMarker = null,
  preservedKmzFiles = []; // For preserving empty KMLs from KMZ imports

// Main function to initialize the map and all its components.
function initializeMap() {
  // --- START: Add this check for secrets.js ---
  // Verify that all API keys from secrets.js are available.
  if (
    typeof googleApiKey === "undefined" ||
    typeof mapboxAccessToken === "undefined" ||
    typeof tracetrackApiKey === "undefined"
  ) {
    Swal.fire({
      icon: "error",
      title: "Configuration Error",
      html: `The <strong>secrets.js</strong> file is missing or misconfigured.<br><br>Please ensure the file exists in the 'js/' folder and contains all required API keys.`,
      allowOutsideClick: false,
    });
  }
  // --- END: Check for secrets.js ---

  // FIX: This prevents the polyline drawing tool from finishing on the second tap on touch devices.
  L.Draw.Polyline.prototype._onTouch = L.Util.falseFn;

  // Initialize ui elements
  infoPanel = document.getElementById("info-panel");
  infoPanelName = document.getElementById("info-panel-name");
  infoPanelDetails = document.getElementById("info-panel-details");
  infoPanelStyleRow = document.getElementById("info-panel-style-row");
  infoPanelColorSwatch = document.getElementById("info-panel-color-swatch");
  infoPanelLayerName = document.getElementById("info-panel-layer-name");
  colorPicker = document.getElementById("color-picker");

  L.DomEvent.disableClickPropagation(infoPanel);
  L.DomEvent.disableScrollPropagation(infoPanel);

  infoPanelName.addEventListener("blur", updateLayerName);
  infoPanelName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      updateLayerName();
      infoPanelName.blur();
      e.preventDefault();
    }
  });

  // Toggle color picker on swatch click
  infoPanelColorSwatch.addEventListener("click", () => {
    const isPickerVisible =
      colorPicker.style.display === "grid" || colorPicker.style.display === "block";
    colorPicker.style.display = isPickerVisible ? "none" : "grid";
  });

  populateColorPicker();

  // --- MODIFIED: Tab System Logic ---
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const routingInfoIcon = document.getElementById("routing-info-icon");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // Deactivate all buttons and panels
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabPanels.forEach((panel) => panel.classList.remove("active"));

      // Activate the clicked button
      button.classList.add("active");

      // Activate the corresponding panel
      const targetPanelId = button.getAttribute("data-target");
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }

      // Update the visual state of the routing info icon
      if (document.getElementById("tab-btn-routing").classList.contains("active")) {
        routingInfoIcon.classList.remove("disabled");
      } else {
        routingInfoIcon.classList.add("disabled");
      }
    });
  });

  // --- NEW: Routing Info Icon Logic ---
  if (routingInfoIcon) {
    // Set initial visual state for the info icon on page load
    if (!document.getElementById("tab-btn-routing").classList.contains("active")) {
      routingInfoIcon.classList.add("disabled");
    }

    L.DomEvent.on(routingInfoIcon, "click", (e) => {
      const routingTabButton = document.getElementById("tab-btn-routing");

      // ONLY if the tab is already active, stop the event and show the alert.
      if (routingTabButton.classList.contains("active")) {
        L.DomEvent.stop(e); // Prevent the click from bubbling to the parent button
        Swal.fire({
          title: "Routing Help",
          icon: "info",
          html: `
            <div style="text-align: left;">
              <p style="margin-top:0;"><strong>Managing Waypoints</strong></p>
              <p>The <strong>Start</strong>, <strong>Via</strong>, and <strong>End</strong> markers can be managed with your mouse or finger.</p>
              <ul style="margin-bottom: 1.5em;">
                <li><strong>To Move:</strong> Drag the marker to a new position.</li>
                <li><strong>To Remove:</strong> Long-press the marker.</li>
              </ul>
              <p><strong>Adding Extra Via Points</strong></p>
              <p>After a route appears on the map, you can add extra stops by <strong>long-pressing</strong> anywhere on the blue route line.</p>
            </div>
          `,
          confirmButtonText: "Got it!",
        });
      }
      // If the tab is NOT active, we do nothing. The click event will
      // naturally bubble up to the parent button and trigger its click handler.
    });
  }

  // Disable click propagation on parent containers to allow internal scrolling on mobile
  const overviewPanelList = document.getElementById("overview-panel-list");
  L.DomEvent.disableClickPropagation(overviewPanelList);
  L.DomEvent.disableScrollPropagation(overviewPanelList);

  // Define base and overlay layers
  const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
  });
  const baseMaps = {
    "&#127757; OpenStreetMap": osmLayer,
    "&#127757; Esri World Imagery": L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a>',
      }
    ),
    // "&#127757; Google Satellite": L.tileLayer("http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    //   maxZoom: 19,
    //   subdomains: ["mt0", "mt1", "mt2", "mt3"],
    //   attribution: "&copy; Google",
    // }),
    "&#127757; CyclOSM": L.tileLayer(
      "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>. Tiles style by <a href="https://www.cyclosm.org/" target="_blank">CyclOSM</a>',
      }
    ),
    "&#127757; Tracetrack Topo": L.tileLayer(
      `https://tile.tracestrack.com/topo__/{z}/{x}/{y}.webp?key=${tracetrackApiKey}`,
      {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.tracestrack.com/" target="_blank">Tracetrack</a>',
      }
    ),
    "&#127465;&#127466; TopPlusOpen": L.tileLayer(
      "http://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank">dl-de/by-2-0</a>',
      }
    ),
    "&#127464;&#127469; Swisstopo Map": L.tileLayer.wms("https://wms.geo.admin.ch/", {
      layers: "ch.swisstopo.pixelkarte-farbe",
      format: "image/jpeg",
      attribution: '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank">swisstopo</a>',
    }),
  };
  const staticOverlayMaps = {
    "&#127464;&#127469; Swiss Hiking Trails": L.tileLayer.wms("https://wms.geo.admin.ch/", {
      layers: "ch.swisstopo.swisstlm3d-wanderwege",
      format: "image/png",
      transparent: true,
      attribution: '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank">swisstopo</a>',
    }),
  };

  // Initialize map
  map = L.map("map", {
    center: [20, 0],
    zoom: 2,
    zoomControl: false,
    doubleClickZoom: false,
  });

  // Configure the map's attribution control
  map.attributionControl.setPosition("bottomleft");
  map.attributionControl.setPrefix(
    '<a href="#" id="attribution-link" title="Credits">OpenMapEditor &#x2764;&#xfe0f;</a>'
  );

  // Add the initial base layer to the map (after configuring attribution control to prevent problems with prefix)
  osmLayer.addTo(map);

  // Initialize feature groups first so they are available for the layer control
  drawnItems = new L.FeatureGroup().addTo(map);
  importedItems = new L.FeatureGroup().addTo(map);
  kmzLayer = new L.FeatureGroup().addTo(map);
  editableLayers = new L.FeatureGroup(); // Don't add to map directly, managed by other groups

  // Combine all overlays into a single object for the custom control
  const allOverlayMaps = {
    ...staticOverlayMaps, // Add static tile overlays
    "&#9999;&#65039; Drawn Items": drawnItems,
    "&#128193; Imported GPX/KML": importedItems,
    "&#128193; Imported KMZ": kmzLayer,
  };

  // Start functionality for swisstopo layers
  const swissBounds = L.latLngBounds([
    [45.8179, 5.956], // Southwest corner of Switzerland
    [47.8085, 10.4923], // Northeast corner of Switzerland
  ]);

  map.on("baselayerchange", function (e) {
    if (e.name && e.name.includes("Swisstopo")) {
      const currentBounds = map.getBounds();
      // Do not re-frame the map if the current view is already
      // completely within the bounds of Switzerland.
      if (!swissBounds.contains(currentBounds)) {
        // map.fitBounds(swissBounds);
      }
    }
  });
  // End functionality for swisstopo layers

  // --- START: Custom Layer Control Implementation ---
  const LayersToggleControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function (map) {
      const container = L.DomUtil.create(
        "div",
        "leaflet-bar leaflet-control leaflet-control-custom"
      );
      container.title = "Layers";
      const link = L.DomUtil.create("a", "", container);
      link.href = "#";
      link.role = "button";
      link.innerHTML = '<svg class="icon icon-layers"><use href="#icon-layers"></use></svg>';

      // This control ONLY handles the click on the button.
      // The global document listener handles closing.
      L.DomEvent.on(link, "click", (e) => {
        L.DomEvent.stop(e);
        const panel = document.getElementById("custom-layers-panel");
        const isVisible = panel.style.display === "block";
        panel.style.display = isVisible ? "none" : "block";
      });

      return container;
    },
  });

  // Add the custom button to the map
  new LayersToggleControl().addTo(map);

  // --- Robustly populate the custom panel ---
  const customPanel = document.getElementById("custom-layers-panel");
  let formContent = '<form class="leaflet-control-layers-form">';

  // Add base layers
  formContent += '<div class="leaflet-control-layers-base">';
  let firstBaseLayer = true;
  for (const name in baseMaps) {
    const layer = baseMaps[name];
    const layerId = L.Util.stamp(layer);
    const isChecked = firstBaseLayer ? 'checked="checked"' : "";
    formContent += `<label><div><input type="radio" class="leaflet-control-layers-selector" name="leaflet-base-layers" ${isChecked} data-layer-id="${layerId}" data-layer-name="${name}"><span> ${name}</span></div></label>`;
    firstBaseLayer = false;
  }
  formContent += "</div>";

  formContent += '<div class="leaflet-control-layers-separator"></div>';

  // Add overlay layers
  formContent += '<div class="leaflet-control-layers-overlays">';
  for (const name in allOverlayMaps) {
    const layer = allOverlayMaps[name];
    const layerId = L.Util.stamp(layer);
    const isChecked = map.hasLayer(layer) ? 'checked="checked"' : "";
    formContent += `<label><div><input type="checkbox" class="leaflet-control-layers-selector" ${isChecked} data-layer-id="${layerId}" data-layer-name="${name}"><span> ${name}</span></div></label>`;
  }
  formContent += "</div></form>";

  customPanel.innerHTML = formContent;

  // --- This function handles side effects of toggling overlays (like updating labels) ---
  const onOverlayToggle = (e) => {
    const isAdding = e.type === "overlayadd";

    let itemIsInGroup = false;
    if (globallySelectedItem && e.layer.hasLayer && e.layer.hasLayer(globallySelectedItem)) {
      itemIsInGroup = true;
    }

    if (itemIsInGroup) {
      if (isAdding) {
        if (!globallySelectedItem.isManuallyHidden) {
          if (selectedPathOutline) selectedPathOutline.addTo(map).bringToBack();
          if (selectedMarkerOutline) selectedMarkerOutline.addTo(map);
        }
      } else {
        if (selectedPathOutline) map.removeLayer(selectedPathOutline);
        if (selectedMarkerOutline) map.removeLayer(selectedMarkerOutline);
      }
    }

    // --- FIX: Check if the layer supports eachLayer before iterating ---
    // This handles both tile layers (like Swisstopo) and our feature groups.
    if (typeof e.layer.eachLayer !== "function") {
      // If it's a simple layer (e.g., a WMS tile layer), there's nothing more to do.
      return;
    }
    // --- END FIX ---

    if (isAdding) {
      e.layer.eachLayer((group) => {
        const processLayer = (l) => {
          if (l.isManuallyHidden) {
            map.removeLayer(l);
          }
        };
        if (group instanceof L.GeoJSON) {
          group.eachLayer(processLayer);
        } else {
          processLayer(group);
        }
      });
    }
  };

  // --- Add event listener to the manually created inputs ---
  customPanel.addEventListener("click", function (e) {
    if (e.target && e.target.classList.contains("leaflet-control-layers-selector")) {
      // NEW: Prevent interaction if disabled
      if (L.DomUtil.hasClass(e.target, "leaflet-disabled-interaction")) {
        L.DomEvent.stop(e); // Stop event propagation
        return; // Do nothing
      }

      const selectedLayerId = parseInt(e.target.dataset.layerId, 10);
      const isRadio = e.target.type === "radio";

      if (isRadio) {
        // Handle base layers
        for (const name in baseMaps) {
          map.removeLayer(baseMaps[name]);
        }
        for (const name in baseMaps) {
          if (L.Util.stamp(baseMaps[name]) === selectedLayerId) {
            map.addLayer(baseMaps[name]);
          }
        }
      } else {
        // Handle overlay layers
        for (const name in allOverlayMaps) {
          const layer = allOverlayMaps[name];
          if (L.Util.stamp(layer) === selectedLayerId) {
            if (e.target.checked) {
              map.addLayer(layer);
              // Manually trigger the 'add' logic
              onOverlayToggle({ type: "overlayadd", layer: layer });
            } else {
              map.removeLayer(layer);
              // Manually trigger the 'remove' logic
              onOverlayToggle({ type: "overlayremove", layer: layer });
            }
            break; // Exit loop once found
          }
        }
      }
    }
  });

  // --- Global click handler to close popups ---
  document.addEventListener(
    "click",
    function (event) {
      const layersPanel = document.getElementById("custom-layers-panel");
      const layersButton = document.querySelector(".icon-layers")?.closest(".leaflet-control");
      const downloadMenu = document.querySelector(".download-submenu");
      const downloadButton = document.querySelector(".icon-download")?.closest(".leaflet-control");

      // Close Layers Panel if click is outside
      if (
        layersPanel &&
        layersButton &&
        layersPanel.style.display === "block" &&
        !layersButton.contains(event.target) &&
        !layersPanel.contains(event.target)
      ) {
        layersPanel.style.display = "none";
      }

      // Close Download Menu if click is outside
      if (
        downloadMenu &&
        downloadButton &&
        downloadMenu.style.display === "block" &&
        !downloadButton.contains(event.target) &&
        !downloadMenu.contains(event.target)
      ) {
        downloadMenu.style.display = "none";
      }
    },
    true
  ); // Use capture phase to ensure this runs before other click handlers stop propagation.

  // Define and add other custom controls
  const ElevationToggleControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function (map) {
      const container = L.DomUtil.create(
        "div",
        "leaflet-bar leaflet-control leaflet-control-custom"
      );
      container.title = "Toggle elevation profile";
      container.innerHTML =
        '<a href="#" role="button"><svg class="icon icon-elevation"><use href="#icon-elevation"></use></svg></a>';
      L.DomEvent.on(container, "click", (ev) => {
        L.DomEvent.stop(ev);
        if (L.DomUtil.hasClass(container, "disabled")) return;
        const elevationDiv = document.getElementById("elevation-div");
        isElevationProfileVisible =
          elevationDiv.style.visibility === "hidden" || elevationDiv.style.visibility === "";
        elevationDiv.style.visibility = isElevationProfileVisible ? "visible" : "hidden";
        if (isElevationProfileVisible) {
          if (elevationControl && selectedElevationPath) {
            elevationControl.clear();
            addElevationProfileForLayer(selectedElevationPath);
          }
        } else {
          elevationControl.clear();
        }
        updateElevationToggleIconColor();
        updateScaleControlVisibility();
      });
      return container;
    },
  });

  // --- REFACTORED: Single-item export now calls the global createKmlDocument function ---
  const DownloadControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function (map) {
      const container = L.DomUtil.create(
        "div",
        "leaflet-bar leaflet-control leaflet-control-custom"
      );
      container.title = "Download file";
      container.style.position = "relative";
      container.innerHTML =
        '<a href="#" role="button"><svg class="icon icon-download"><use href="#icon-download"></use></svg></a><div class="download-submenu"><button id="download-gpx" disabled>GPX (Selected Item)</button><button id="download-kml" disabled>KML (Selected Item)</button><button id="download-kmz">KMZ (Everything)</button></div>';
      const subMenu = container.querySelector(".download-submenu");

      L.DomEvent.on(container, "click", (ev) => {
        L.DomEvent.stop(ev);
        const isVisible = subMenu.style.display === "block";
        subMenu.style.display = isVisible ? "none" : "block";
      });

      const downloadAction = (format) => {
        if (!globallySelectedItem) return;

        const name = globallySelectedItem.feature?.properties?.name || `Map_Export_${Date.now()}`;
        let data;
        if (format === "gpx") {
          data = toGpx(globallySelectedItem);
        } else if (format === "kml") {
          // This is much simpler now. It generates the single placemark...
          const kmlPlacemark = generateKmlForLayer(globallySelectedItem, name);
          // ...and calls the global function, passing the placemark in an array.
          data = createKmlDocument(name, [kmlPlacemark]);
        }

        if (data) {
          downloadFile(`${name}.${format}`, data);
        }
        subMenu.style.display = "none";
      };

      L.DomEvent.on(container.querySelector("#download-gpx"), "click", (e) => {
        L.DomEvent.stop(e);
        downloadAction("gpx");
      });
      L.DomEvent.on(container.querySelector("#download-kml"), "click", (e) => {
        L.DomEvent.stop(e);
        downloadAction("kml");
      });
      L.DomEvent.on(container.querySelector("#download-kmz"), "click", (e) => {
        L.DomEvent.stop(e);
        exportKmz();
        subMenu.style.display = "none";
      });
      return container;
    },
  });

  // Get the color value from your CSS file
  const locateCircleColor = rootStyles.getPropertyValue("--locate-color").trim();

  locateControl = L.control
    .locate({
      position: "topleft",
      flyTo: true,
      locateOptions: { maxZoom: 16 },
      markerStyle: {
        color: "white", // Color of the marker's border
        fillColor: locateCircleColor, // Fill color of the marker
        fillOpacity: 1,
        weight: 2,
        opacity: 1,
        radius: 10, // Size of the center dot
      },
    })
    .addTo(map);
  setTimeout(() => {
    const locateButton = locateControl.getContainer().querySelector("a");
    if (locateButton) {
      locateButton.innerHTML =
        '<svg class="icon icon-locate"><use href="#icon-locate"></use></svg>';
    }
  }, 0);

  // Add a scale control showing both metric and imperial units
  L.control.scale({ position: "bottomleft", metric: true, imperial: true }).addTo(map);

  // Change background of locate button on locationfound/locationerror
  const locateButtonContainer = locateControl.getContainer();
  map.on("locateactivate", function () {
    L.DomUtil.addClass(locateButtonContainer, "locate-active");
  });
  map.on("locatedeactivate", function () {
    L.DomUtil.removeClass(locateButtonContainer, "locate-active");
  });

  L.control.zoom({ position: "topleft" }).addTo(map);

  // Setup GeoSearch control with a custom event listener
  const searchControl = new GeoSearch.GeoSearchControl({
    provider: new GeoSearch.OpenStreetMapProvider(),
    style: "bar",
    position: "topright",
    autoClose: true,
    showMarker: false, // We will handle our own marker
    searchLabel: "Search",
  });
  map.addControl(searchControl);

  // --- REFACTORED: PanelsToggleControl with cleaner CSS-based icon swapping ---
  const PanelsToggleControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function (map) {
      const container = L.DomUtil.create(
        "div",
        "leaflet-control leaflet-control-custom leaflet-control-toggle-panels"
      );
      container.title = "Toggle Sidebar";
      // The container starts in the "visible" state
      container.classList.add("panels-visible");
      // Both icons are present in the HTML, their visibility is controlled by CSS
      container.innerHTML =
        '<a href="#" role="button">' +
        '<svg class="icon icon-chevron-right"><use href="#icon-chevron-right"></use></svg>' +
        '<svg class="icon icon-chevron-left"><use href="#icon-chevron-left"></use></svg>' +
        "</a>";

      L.DomEvent.on(container, "click", (ev) => {
        L.DomEvent.stop(ev);
        const panelContainer = document.getElementById("main-right-container");
        panelContainer.classList.toggle("hidden");
        // Toggle the state class on the button itself
        container.classList.toggle("panels-visible");
        container.classList.toggle("panels-hidden");
      });
      L.DomEvent.on(container, "dblclick mousedown wheel", L.DomEvent.stopPropagation);
      return container;
    },
  });

  new PanelsToggleControl().addTo(map);

  // --- REFACTORED: FullscreenToggleControl with cleaner CSS-based icon swapping ---
  const FullscreenToggleControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function (map) {
      const container = L.DomUtil.create(
        "div",
        "leaflet-control leaflet-control-custom leaflet-control-fullscreen-toggle"
      );
      container.title = "Toggle Fullscreen (f)";
      // Both icons are present, CSS will control visibility
      container.innerHTML =
        '<a href="#" role="button">' +
        '<svg class="icon icon-fullscreen-enter"><use href="#icon-fullscreen-enter"></use></svg>' +
        '<svg class="icon icon-fullscreen-exit"><use href="#icon-fullscreen-exit"></use></svg>' +
        "</a>";

      L.DomEvent.on(container, "click", (ev) => {
        L.DomEvent.stop(ev);
        toggleFullscreen();
      });
      L.DomEvent.on(container, "dblclick mousedown wheel", L.DomEvent.stopPropagation);
      return container;
    },
  });

  function toggleFullscreen() {
    const container = document.querySelector(".leaflet-control-fullscreen-toggle");
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      container.classList.add("fullscreen-active");
    } else {
      document.exitFullscreen();
      container.classList.remove("fullscreen-active");
    }
  }

  // Also listen for native fullscreen changes (e.g., user pressing ESC)
  document.addEventListener("fullscreenchange", () => {
    const container = document.querySelector(".leaflet-control-fullscreen-toggle");
    if (document.fullscreenElement) {
      container.classList.add("fullscreen-active");
    } else {
      container.classList.remove("fullscreen-active");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "f" && !e.target.matches("input, textarea")) {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  new FullscreenToggleControl().addTo(map);

  map.on("geosearch/showlocation", function (result) {
    // Remove previous temporary marker if it exists
    if (temporarySearchMarker) {
      map.removeLayer(temporarySearchMarker);
      temporarySearchMarker = null; // Important to nullify it
    }

    const locationLatLng = L.latLng(result.location.y, result.location.x);

    // Create a new, temporary black marker and make it interactive
    temporarySearchMarker = L.marker(locationLatLng, {
      icon: createSvgIcon(rootStyles.getPropertyValue("--color-black").trim(), 1),
      interactive: true,
    }).addTo(map);

    // --- Create Popup Content ---
    const popupContent = document.createElement("div");
    popupContent.style.textAlign = "center";
    popupContent.innerHTML = `<div style="font-weight: bold; margin-bottom: 8px;">${result.location.label}</div>`;

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save to Map";
    // Add some basic styling to make it look like a button
    saveButton.style.cssText =
      "padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background-color: #f0f0f0;";
    saveButton.onmouseover = () => (saveButton.style.backgroundColor = "#e0e0e0");
    saveButton.onmouseout = () => (saveButton.style.backgroundColor = "#f0f0f0");
    popupContent.appendChild(saveButton);
    // --- End Popup Content ---

    // --- Save Button Logic ---
    L.DomEvent.on(saveButton, "click", () => {
      const defaultDrawColorName = "Red";
      const defaultDrawColorData = ORGANIC_MAPS_COLORS.find((c) => c.name === defaultDrawColorName);

      const newMarker = L.marker(locationLatLng, {
        icon: createSvgIcon(defaultDrawColorData.css, STYLE_CONFIG.marker.default.opacity),
      });

      newMarker.pathType = "drawn";
      newMarker.feature = {
        properties: {
          name: result.location.label,
          omColorName: defaultDrawColorName,
        },
      };

      drawnItems.addLayer(newMarker);
      editableLayers.addLayer(newMarker);

      newMarker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        selectItem(newMarker);
      });

      // Clean up the temporary marker
      if (temporarySearchMarker) {
        map.removeLayer(temporarySearchMarker);
        temporarySearchMarker = null;
      }
      map.closePopup();

      // Update UI
      updateDrawControlStates();
      updateOverviewList();
      selectItem(newMarker); // Select the newly saved marker

      Swal.fire({
        toast: true,
        position: "center",
        icon: "success",
        title: "Marker Saved!",
        showConfirmButton: false,
        timer: 2000,
      });
    });
    // --- End Save Button Logic ---

    // Bind the popup and open it.
    temporarySearchMarker.bindPopup(popupContent, { offset: L.point(0, -35) }).openPopup();

    // When the popup is closed (without saving), remove the temporary marker.
    temporarySearchMarker.on("popupclose", () => {
      // The marker might have already been removed by the save button.
      if (temporarySearchMarker && map.hasLayer(temporarySearchMarker)) {
        map.removeLayer(temporarySearchMarker);
        temporarySearchMarker = null;
      }
    });
  });

  elevationControl = L.control.elevation({
    position: "bottomright",
    theme: "custom-theme",
    detached: true,
    elevationDiv: "#elevation-div",
    collapsed: false,
    closeBtn: false,
    distance: false,
    time: false,
    margins: {
      top: 30,
      right: 30,
      bottom: -10,
      left: 60,
    },
  });
  elevationControl.addTo(map);

  // Configure draw control
  const defaultDrawColorName = "Red";
  const defaultDrawColor = ORGANIC_MAPS_COLORS.find((c) => c.name === defaultDrawColorName).css;

  L.drawLocal.draw.toolbar.buttons.polyline = "Draw path";
  L.drawLocal.draw.toolbar.buttons.marker = "Place marker";
  L.drawLocal.edit.toolbar.buttons.edit = "Edit";
  L.drawLocal.edit.toolbar.buttons.remove = "Delete";
  L.drawLocal.edit.toolbar.buttons.editDisabled = "No items to edit";
  L.drawLocal.edit.toolbar.buttons.removeDisabled = "No items to delete";
  drawControl = new L.Control.Draw({
    edit: { featureGroup: editableLayers },
    draw: {
      polyline: {
        shapeOptions: { ...STYLE_CONFIG.path.default, color: defaultDrawColor },
      },
      polygon: false,
      rectangle: false,
      circle: false,
      marker: {
        icon: createSvgIcon(defaultDrawColor, STYLE_CONFIG.marker.default.opacity),
      },
      circlemarker: false,
    },
  });
  map.addControl(drawControl);

  const ImportControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function (map) {
      const container = L.DomUtil.create(
        "div",
        "leaflet-bar leaflet-control leaflet-control-custom"
      );
      container.title = "Import GPX/KML/KMZ file";
      const link = L.DomUtil.create("a", "", container);
      link.href = "#";
      link.role = "button";
      link.innerHTML = '<svg class="icon icon-import"><use href="#icon-import"></use></svg>';
      const input = L.DomUtil.create("input", "hidden", container);
      input.type = "file";
      input.accept = ".gpx,.kml,.kmz";
      input.style.display = "none";

      L.DomEvent.on(link, "click", (e) => {
        L.DomEvent.stop(e);
        input.click();
      });

      L.DomEvent.on(input, "change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fileNameLower = file.name.toLowerCase();
        if (fileNameLower.endsWith(".kmz")) {
          handleKmzFile(file);
        } else if (fileNameLower.endsWith(".gpx") || fileNameLower.endsWith(".kml")) {
          const reader = new FileReader();
          reader.onload = (readEvent) => {
            try {
              const dom = new DOMParser().parseFromString(readEvent.target.result, "text/xml");
              const fileType = fileNameLower.endsWith(".gpx") ? "gpx" : "kml";

              // FIX: Define geojsonData *before* it is used.
              const geojsonData = toGeoJSON[fileType](dom);

              // --- Pre-process GPX to find colors ---
              if (fileType === "gpx") {
                const tracksInDom = dom.querySelectorAll("trk");
                const pathFeatures = geojsonData.features.filter(
                  (f) => f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"
                );

                if (pathFeatures.length === tracksInDom.length) {
                  pathFeatures.forEach((feature, index) => {
                    const trackNode = tracksInDom[index];
                    // Query for gpx_style:color, allowing for namespace variations
                    const colorNode = trackNode.querySelector("gpx_style\\:color, color");
                    if (colorNode) {
                      // Normalize to a CSS hex string
                      const hexColor = `#${colorNode.textContent.trim().toLowerCase()}`;
                      const colorMatch = ORGANIC_MAPS_COLORS.find(
                        (c) => c.css.toLowerCase() === hexColor
                      );
                      if (colorMatch) {
                        feature.properties = feature.properties || {};
                        feature.properties.omColorName = colorMatch.name;
                      }
                    }
                  });
                }
              }

              const newLayer = addGeoJsonToMap(geojsonData, fileType);
              if (newLayer && newLayer.getBounds().isValid()) {
                map.fitBounds(newLayer.getBounds());
              }
            } catch (error) {
              console.error("Error parsing file:", error);
              Swal.fire({
                icon: "error",
                title: "File Parse Error",
                text: `Could not parse the file: ${error.message}`,
              });
            }
          };
          reader.readAsText(file);
        }
        e.target.value = "";
      });
      return container;
    },
  });
  new ImportControl().addTo(map);
  downloadControl = new DownloadControl({ position: "topleft" }).addTo(map);
  elevationToggleControl = new ElevationToggleControl({ position: "topleft" }).addTo(map);
  L.DomUtil.addClass(elevationToggleControl.getContainer(), "disabled");
  updateElevationToggleIconColor();
  updateOverviewList();

  // Map event listeners
  map.on("draw:created", (e) => {
    const layer = e.layer;
    layer.pathType = "drawn";
    layer.feature = layer.feature || { properties: {} };
    layer.feature.properties.omColorName = defaultDrawColorName;
    drawnItems.addLayer(layer);
    editableLayers.addLayer(layer);
    layer.on("click", (ev) => {
      L.DomEvent.stopPropagation(ev);
      selectItem(layer);
    });
    if (e.layerType === "polyline" || e.layerType === "polygon") {
      // Distance label creation was removed from here.
    }
    selectItem(layer);
    updateDrawControlStates();
    updateOverviewList();
  });

  const showCopyCoordsPopup = (e) => {
    const latlng = e.latlng;
    const coordString = `${latlng.lat}, ${latlng.lng}`;
    const popupContent = document.createElement("div");
    popupContent.innerHTML = `<span style="font-weight: bold;">Copy coordinates</span><br><span style="font-size: 0.9em;">${latlng.lat.toFixed(
      5
    )}, ${latlng.lng.toFixed(5)}</span>`;
    popupContent.style.cursor = "pointer";
    popupContent.style.textAlign = "center";
    popupContent.style.margin = "5px";

    const popup = L.popup({
      closeButton: false,
    })
      .setLatLng(latlng)
      .setContent(popupContent)
      .openOn(map);

    popupContent.addEventListener("click", () => {
      copyToClipboard(coordString)
        .then(() => {
          map.closePopup(popup);
          Swal.fire({
            toast: true,
            position: "center",
            icon: "success",
            title: "Coordinates Copied!",
            html: coordString,
            showConfirmButton: false,
            timer: 1500,
          });
        })
        .catch((err) => {
          console.error("Could not copy text: ", err);
          map.closePopup(popup);
          Swal.fire({
            toast: true,
            position: "center",
            icon: "error",
            title: "Failed to Copy",
            showConfirmButton: false,
            timer: 2000,
          });
        });
    });
  };

  map.on("contextmenu", showCopyCoordsPopup);

  // --- FINAL: Reworked long-press logic for stability ---
  let pressTimer;

  map.on("mousedown", (e) => {
    // This handler is now ONLY for touch events on the map canvas.
    if (e.originalEvent.pointerType !== "touch") {
      return;
    }

    // *** FIX: Check if the touch is on a path (which has its own handler). ***
    // The `leaflet-interactive` class is applied to all vector layers like polylines.
    if (e.originalEvent.target.classList.contains("leaflet-interactive")) {
      return;
    }

    // Also, prevent the timer if the touch is on a known UI element.
    if (
      e.originalEvent.target.closest &&
      e.originalEvent.target.closest(
        ".leaflet-marker-draggable, .leaflet-control, .leaflet-popup, #main-right-container"
      )
    ) {
      return;
    }

    pressTimer = setTimeout(() => {
      map.closePopup();
      showCopyCoordsPopup(e);
    }, 800);
  });

  map.on("mouseup mouseout dragstart", () => {
    clearTimeout(pressTimer);
  });
  // --- END FINAL ---

  map.on("draw:edited", (e) => {
    e.layers.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
        // --- FIX: Recalculate distance, store it, then update the UI ---
        const newDistance = calculatePathDistance(layer);
        if (layer.feature && layer.feature.properties) {
          layer.feature.properties.totalDistance = newDistance;
        }
        // --- END FIX ---
        if (globallySelectedItem === layer) selectItem(layer);
      }
    });
    updateDrawControlStates();
  });

  // --- MODIFIED: L.Draw.Event.DELETED handler for "Clear All" and toolbar deletions ---
  map.on(L.Draw.Event.DELETED, (e) => {
    e.layers.eachLayer((layer) => {
      // This event fires when 'Save' is clicked in delete mode.
      // If `layer.isDeletedFromToolbar` is true, it means it was a single selection.
      // If all layers are in `e.layers`, it means "Clear All" was pressed.
      deleteLayerImmediately(layer);
      layer.isDeletedFromToolbar = false; // Reset flag
    });
  });

  map.on("click", (e) => {
    if (
      e.originalEvent.target.id === "map" ||
      e.originalEvent.target.classList.contains("leaflet-container")
    ) {
      deselectCurrentItem();
    }
  });

  map.on(L.Draw.Event.DELETESTART, () => {
    isDeleteMode = true;
    deselectCurrentItem();
    editableLayers.eachLayer((layer) => {
      // Add event listener only if the layer is currently on the map.
      // This prevents issues with hidden layers.
      if (map.hasLayer(layer)) {
        layer.on("click", onFeatureClickToDelete);
      }
    });
    // Add class to map container to force dotted line removal on paths during editing
    L.DomUtil.addClass(map.getContainer(), "map-is-editing");
    updateDrawControlStates(); // Update layer toggles
  });

  map.on(L.Draw.Event.DELETESTOP, () => {
    isDeleteMode = false;
    updateDrawControlStates(); // Update layer toggles
    editableLayers.eachLayer((layer) => {
      layer.off("click", onFeatureClickToDelete);
    });
    L.DomUtil.removeClass(map.getContainer(), "map-is-editing");

    // Re-add any layers that were "hidden" by onFeatureClickToDelete but not actually removed
    // (i.e., the user cancelled the deletion by clicking 'Cancel' in the toolbar)
    editableLayers.eachLayer((layer) => {
      // Only re-add if it's not already on the map AND wasn't manually hidden before delete mode
      if (!map.hasLayer(layer) && !layer.isManuallyHidden) {
        map.addLayer(layer);
      }
      layer.isDeletedFromToolbar = false; // Ensure flag is reset
    });

    if (globallySelectedItem) {
      // If an item was selected before delete mode, re-select it to restore highlight
      selectItem(globallySelectedItem);
    }
  });

  map.on(L.Draw.Event.EDITSTART, () => {
    isEditMode = true;
    deselectCurrentItem();
    if (selectedPathOutline) map.removeLayer(selectedPathOutline);
    if (selectedMarkerOutline) map.removeLayer(selectedMarkerOutline);
    // Add class to map container to force dotted line removal on paths during editing
    L.DomUtil.addClass(map.getContainer(), "map-is-editing");
    updateDrawControlStates(); // Update layer toggles
  });

  map.on(L.Draw.Event.EDITSTOP, () => {
    isEditMode = false;
    L.DomUtil.removeClass(map.getContainer(), "map-is-editing");

    if (globallySelectedItem) {
      const itemToReselect = globallySelectedItem;
      deselectCurrentItem();
      setTimeout(() => {
        selectItem(itemToReselect);
        if (itemToReselect instanceof L.Marker) {
          itemToReselect.setZIndexOffset(1000);
        }
      }, 50);
    }
    updateDrawControlStates();
  });

  // Kick off routing functionality
  initializeRouting();

  // --- MODIFIED: Settings Controls are now in the Settings Panel ---
  const settingsPanel = document.getElementById("settings-panel");
  if (settingsPanel) {
    // --- Path Simplification Setting ---
    const simplificationContainer = L.DomUtil.create("div", "settings-control-item", settingsPanel);
    const labelGroup = L.DomUtil.create("div", "", simplificationContainer);
    labelGroup.style.display = "flex";
    labelGroup.style.alignItems = "center";
    const label = L.DomUtil.create("label", "", labelGroup);
    label.htmlFor = "simplification-toggle";
    label.innerText = "Path Simplification";
    const infoIcon = L.DomUtil.create("span", "settings-info-icon", labelGroup);
    infoIcon.innerHTML = "&#9432;";
    infoIcon.title = "What's this?";
    const checkbox = L.DomUtil.create("input", "", simplificationContainer);
    checkbox.type = "checkbox";
    checkbox.id = "simplification-toggle";
    checkbox.checked = enablePathSimplification;
    L.DomEvent.on(checkbox, "change", (e) => {
      enablePathSimplification = e.target.checked;
      Swal.fire({
        toast: true,
        position: "center",
        icon: "info",
        title: `Path Simplification ${enablePathSimplification ? "Enabled" : "Disabled"}`,
        showConfirmButton: false,
        timer: 1500,
      });
    });
    L.DomEvent.on(infoIcon, "click", () => {
      Swal.fire({
        icon: "info",
        title: "Path Simplification",
        html: `<p style="text-align: left; margin-bottom: 1em;">This option automatically reduces the number of points in complex imported paths (GPX, KML) and generated routes.</p><p style="text-align: left;"><strong>Enabled (Recommended):</strong> Improves performance and responsiveness, especially with long tracks. The visual change is often unnoticeable.</p><p style="text-align: left;"><strong>Disabled:</strong> Preserves every single point from the original file. Use this if absolute precision is critical and you are not experiencing performance issues.</p>`,
        confirmButtonText: "Got it!",
      });
    });
    L.DomEvent.on(simplificationContainer, "dblclick mousedown wheel", L.DomEvent.stopPropagation);

    // --- Dark/Light Mode Toggle ---
    const themeToggleContainer = L.DomUtil.create("div", "settings-control-item", settingsPanel);
    const themeLabel = L.DomUtil.create("label", "", themeToggleContainer);
    themeLabel.htmlFor = "theme-toggle";
    themeLabel.innerText = "Dark Mode";
    const themeCheckbox = L.DomUtil.create("input", "", themeToggleContainer);
    themeCheckbox.type = "checkbox";
    themeCheckbox.id = "theme-toggle";
    themeCheckbox.checked = document.body.classList.contains("dark-mode");
    L.DomEvent.on(themeCheckbox, "change", (e) => {
      if (e.target.checked) {
        document.body.classList.add("dark-mode");
        localStorage.setItem("theme", "dark");
      } else {
        document.body.classList.remove("dark-mode");
        localStorage.setItem("theme", "light");
      }
    });
    L.DomEvent.on(themeToggleContainer, "dblclick mousedown wheel", L.DomEvent.stopPropagation);

    // --- Routing Provider Setting ---
    const routingProviderContainer = L.DomUtil.create(
      "div",
      "settings-control-item",
      settingsPanel
    );
    const routingProviderLabel = L.DomUtil.create("label", "", routingProviderContainer);
    routingProviderLabel.htmlFor = "routing-provider-select";
    routingProviderLabel.innerText = "Routing Provider";
    const routingProviderSelect = L.DomUtil.create("select", "", routingProviderContainer);
    routingProviderSelect.id = "routing-provider-select";
    routingProviderSelect.innerHTML = `<option value="mapbox">Mapbox</option><option value="osrm">OSRM</option>`;
    routingProviderSelect.value = localStorage.getItem("routingProvider") || "mapbox";
    L.DomEvent.on(routingProviderSelect, "change", (e) => {
      const newProvider = e.target.value;
      localStorage.setItem("routingProvider", newProvider);
      window.app.clearRouting();
      window.app.setupRoutingControl(newProvider);
      Swal.fire({
        toast: true,
        position: "center",
        icon: "info",
        title: `Routing provider set to ${e.target.options[e.target.selectedIndex].text}`,
        showConfirmButton: false,
        timer: 1500,
      });
    });
    L.DomEvent.on(routingProviderContainer, "dblclick mousedown wheel", L.DomEvent.stopPropagation);

    // --- Elevation Provider Setting ---
    const elevationProviderContainer = L.DomUtil.create(
      "div",
      "settings-control-item",
      settingsPanel
    );
    const elevationProviderLabel = L.DomUtil.create("label", "", elevationProviderContainer);
    elevationProviderLabel.htmlFor = "elevation-provider-select";
    elevationProviderLabel.innerText = "Elevation Provider";
    const elevationProviderSelect = L.DomUtil.create("select", "", elevationProviderContainer);
    elevationProviderSelect.id = "elevation-provider-select";
    // elevationProviderSelect.innerHTML = `<option value="google">Google</option><option value="open-topo">Open Topo Data</option><option value="mapbox">Mapbox</option>`;
    elevationProviderSelect.innerHTML = `<option value="google">Google</option><option value="open-topo">Open Topo Data</option>`; // Removed Mapbox option
    const savedElevationProvider = localStorage.getItem("elevationProvider") || "google";
    elevationProvider = savedElevationProvider;
    elevationProviderSelect.value = savedElevationProvider;
    L.DomEvent.on(elevationProviderSelect, "change", (e) => {
      const newProvider = e.target.value;
      elevationProvider = newProvider;
      localStorage.setItem("elevationProvider", newProvider);
      clearElevationCache();
      Swal.fire({
        toast: true,
        position: "center",
        icon: "info",
        title: `Elevation Provider set to ${e.target.options[e.target.selectedIndex].text}`,
        showConfirmButton: false,
        timer: 1500,
      });
    });
    L.DomEvent.on(
      elevationProviderContainer,
      "dblclick mousedown wheel",
      L.DomEvent.stopPropagation
    );
  }

  // --- START: MODIFIED code block for clickable attribution using event delegation ---
  // Use event delegation on the map container to handle clicks on the attribution link.
  // This is robust and works even if Leaflet redraws the attribution control.
  map.getContainer().addEventListener("click", (e) => {
    // Use .closest() to check if the click was on the link or an element inside it.
    const attributionLink = e.target.closest("#attribution-link");

    if (attributionLink) {
      // Prevent the link's default behavior (e.g., navigating to '#')
      e.preventDefault();
      e.stopPropagation();

      // Open the SweetAlert with content from credits.js
      Swal.fire({
        // icon: "info",
        imageUrl:
          "https://raw.githubusercontent.com/openmapeditor/openmapeditor-assets/refs/heads/main/icon-750x750-min.png",
        imageWidth: 150,
        imageHeight: "auto",
        html: CREDITS_HTML,
        confirmButtonText: "Close",
        width: "500px",
      });
    }
  });
  // --- END: MODIFIED code block ---

  // --- START: NEW - Dynamically adjust elevation summary padding ---
  // This is necessary because the elevation-div is absolutely positioned at the
  // bottom of the screen, and the attribution control can overlap its content.
  // This code dynamically calculates the height of the attribution control and
  // applies it as bottom padding to the elevation summary, ensuring the summary
  // content is never hidden.
  const adjustElevationSummaryPadding = () => {
    const attributionControl = document.querySelector(".leaflet-control-attribution");
    const elevationSummary = document.querySelector(".elevation-summary");

    if (attributionControl && elevationSummary) {
      const attributionHeight = attributionControl.offsetHeight;
      // Add a 10px buffer for spacing
      const requiredPadding = attributionHeight + 10;
      elevationSummary.style.paddingBottom = `${requiredPadding}px`;
    }
  };

  // Initial adjustment after a short delay to ensure rendering is complete
  setTimeout(adjustElevationSummaryPadding, 500);

  // Use a MutationObserver to react to any changes in the attribution content
  const attributionElement = document.querySelector(".leaflet-control-attribution");
  if (attributionElement) {
    const observer = new MutationObserver(adjustElevationSummaryPadding);
    observer.observe(attributionElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // Also, re-check on map move as a fallback, as this often triggers attribution changes
  map.on("moveend", adjustElevationSummaryPadding);
  // --- END: NEW ---

  // Final ui updates
  setTimeout(updateDrawControlStates, 0);
  setTimeout(replaceDefaultIcons, 0);
  resetInfoPanel();
  updateScaleControlVisibility();
}

// Initialize the application once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", initializeMap);
