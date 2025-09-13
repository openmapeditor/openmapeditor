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
  stravaActivitiesLayer,
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
  preservedKmzFiles = [], // For preserving empty KMLs from KMZ imports
  useImperialUnits = false,
  scaleControl;

/**
 * Adjusts the height of the info panel's name textarea to fit its content,
 * up to a maximum of approximately three lines.
 * @param {HTMLTextAreaElement} textarea The textarea element to resize.
 */
function adjustInfoPanelNameHeight(textarea) {
  // Max height for ~3 lines (14px font * 1.5 line-height * 3 lines + 10px padding)
  const heightLimit = 75;

  // Temporarily reset height to auto to get the new scrollHeight
  textarea.style.height = "auto";

  // Set the new height, but don't exceed the limit
  textarea.style.height = `${Math.min(textarea.scrollHeight, heightLimit)}px`;

  // Show a scrollbar only if the content is taller than the limit
  textarea.style.overflowY = textarea.scrollHeight > heightLimit ? "auto" : "hidden";

  // MODIFIED: Add this line to ensure the text is scrolled to the top
  textarea.scrollTop = 0;
}

/**
 * Creates, configures, and adds the Leaflet Elevation control to the map.
 * @param {boolean} useImperial - If true, the control will use imperial units (feet/miles).
 * @returns {L.Control.Elevation} The newly created elevation control instance.
 */
function createAndAddElevationControl(useImperial) {
  const control = L.control.elevation({
    position: "bottomright",
    theme: "custom-theme",
    detached: true,
    elevationDiv: "#elevation-div",
    collapsed: false,
    closeBtn: false,
    distance: false,
    time: true,
    imperial: useImperial, // The parameter is used here
    margins: {
      top: 30,
      right: 30,
      bottom: -10,
      left: 60,
    },
  });

  control.on("eledata_added", ({ track_info }) => {
    // console.log("Elevation data added!", track_info);
    // console.log("Elevation data distance", track_info.distance);
    // console.log("Elevation data elevation_min", track_info.elevation_min);
    // console.log("Elevation data elevation_max", track_info.elevation_max);
    // console.log("Elevation data elevation_avg", track_info.elevation_avg);
    // console.log("Elevation data time", track_info.time);
  });

  control.addTo(map);
  return control;
}

/**
 * A simple function to trigger updates on currently displayed UI elements
 * that show units, like the routing panel and info panel. This is called
 * when the user toggles the unit setting.
 */
function updateAllDynamicUnitDisplays() {
  // 1. If an item is selected, re-render its info panel to update units.
  if (globallySelectedItem) {
    showInfoPanel(globallySelectedItem);
  }

  // 2. If a route is active, tell the routing module to redisplay it.
  if (window.app && typeof window.app.redisplayCurrentRoute === "function") {
    window.app.redisplayCurrentRoute();
  }
}

// Main function to initialize the map and all its components.
function initializeMap() {
  // --- START: Add this check for secrets.js ---
  // Verify that all API keys from secrets.js are available.
  if (
    typeof googleApiKey === "undefined" ||
    typeof mapboxAccessToken === "undefined" ||
    typeof tracestrackApiKey === "undefined"
  ) {
    Swal.fire({
      icon: "error",
      iconColor: "var(--swal-color-error)",
      title: "Configuration Error",
      html: `The <strong>secrets.js</strong> file is missing or misconfigured.<br><br>Please ensure the file exists in the 'js/' folder and contains all required API keys.`,
      allowOutsideClick: false,
    });
  }
  // --- END: Check for secrets.js ---

  // Read saved preference for units setting at the beginning
  useImperialUnits = localStorage.getItem("useImperialUnits") === "true";

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

  // Isolate the entire right-side UI panel from the map.
  // This prevents clicks, drags, and scrolls within the panel from
  // accidentally panning or zooming the map underneath it.
  const mainRightContainer = document.getElementById("main-right-container");
  L.DomEvent.disableClickPropagation(mainRightContainer);
  L.DomEvent.disableScrollPropagation(mainRightContainer);

  infoPanelName.addEventListener("blur", () => {
    updateLayerName();
    adjustInfoPanelNameHeight(infoPanelName);
  });
  infoPanelName.addEventListener("keydown", (e) => {
    // MODIFIED: For textarea, "Enter" without Shift should submit, not create a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      updateLayerName();
      infoPanelName.blur(); // Unfocus the element
      e.preventDefault(); // Prevent adding a new line
    }
  });

  // This makes the textarea grow and shrink as you type.
  infoPanelName.addEventListener("input", () => adjustInfoPanelNameHeight(infoPanelName));
  infoPanelName.addEventListener("focus", () => infoPanelName.select());

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

      // Check if we need to scroll the overview list
      if (targetPanelId === "overview-panel" && globallySelectedItem) {
        const layerId = L.Util.stamp(globallySelectedItem);
        const listItem = document.querySelector(
          `#overview-panel-list .overview-list-item[data-layer-id='${layerId}']`
        );
        if (listItem) {
          // The panel is now visible, so we can scroll to the item
          listItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
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
          iconColor: "var(--swal-color-info)",
          html: `
<p style="text-align: left; margin: 0 0 18px 0">
  <strong>Managing Waypoints:</strong> The <strong>Start</strong>, <strong>Via</strong>, and
  <strong>End</strong> markers can be managed with your mouse or finger.
</p>
<p style="text-align: left"><strong>To Move:</strong> Drag the marker to a new position.</p>
<p style="text-align: left; margin: 0 0 18px 0">
  <strong>To Remove:</strong> Long-press the marker.
</p>
<p style="text-align: left">
  <strong>Adding Extra Via Points: </strong>After a route appears on the map, you can add extra
  stops by <strong>long-pressing</strong> anywhere on the route line.
</p>
`,
          confirmButtonText: "Got it!",
        });
      }
      // If the tab is NOT active, we do nothing. The click event will
      // naturally bubble up to the parent button and trigger its click handler.
    });
  }

  // Define base and overlay layers
  const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  });
  const baseMaps = {
    "&#127757; OpenStreetMap": osmLayer,
    "&#127757; Esri World Imagery": L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
      }
    ),
    // "&#127757; Google Satellite": L.tileLayer("http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    //   maxZoom: 19,
    //   subdomains: ["mt0", "mt1", "mt2", "mt3"],
    // }),
    "&#127757; CyclOSM": L.tileLayer(
      "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
      }
    ),
    "&#127757; Tracestrack Topo": L.tileLayer(
      `https://tile.tracestrack.com/topo__/{z}/{x}/{y}.webp?key=${tracestrackApiKey}`,
      {
        maxZoom: 19,
      }
    ),
    "&#127465;&#127466; TopPlusOpen": L.tileLayer(
      "http://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
      {
        maxZoom: 19,
      }
    ),
    "&#127464;&#127469; Swisstopo": L.tileLayer.wms("https://wms.geo.admin.ch/", {
      layers: "ch.swisstopo.pixelkarte-farbe",
      format: "image/jpeg",
    }),
  };
  const staticOverlayMaps = {
    "&#127464;&#127469; Swiss Hiking Trails": L.tileLayer.wms("https://wms.geo.admin.ch/", {
      layers: "ch.swisstopo.swisstlm3d-wanderwege",
      format: "image/png",
      transparent: true,
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
    '<a href="#" id="attribution-link" title="Credits">OpenMapEditor &#x2764;&#xfe0f;</a><a href="#" id="install-pwa-link" title="Install App" style="display: none;">Install</a>'
  );

  // Add the initial base layer to the map (after configuring attribution control to prevent problems with prefix)
  osmLayer.addTo(map);

  // Initialize feature groups first so they are available for the layer control
  drawnItems = new L.FeatureGroup().addTo(map);
  importedItems = new L.FeatureGroup().addTo(map);
  kmzLayer = new L.FeatureGroup().addTo(map);
  editableLayers = new L.FeatureGroup(); // Don't add to map directly, managed by other groups
  stravaActivitiesLayer = L.featureGroup().addTo(map);

  // Combine all overlays into a single object for the custom control
  const allOverlayMaps = {
    ...staticOverlayMaps, // Add static tile overlays
    "&#9999;&#65039; Drawn Items": drawnItems,
    "&#128193; Imported GPX/KML": importedItems,
    "&#128193; Imported KMZ": kmzLayer,
    "&#129505; Strava Activities": stravaActivitiesLayer,
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
      link.innerHTML = "";

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
      const layersButton = document.querySelector('.leaflet-control-custom[title="Layers"]');
      const downloadMenu = document.querySelector(".download-submenu");
      const downloadButton = document.querySelector(
        '.leaflet-control-custom[title="Download file"]'
      );

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
      container.title = "No path selected";
      container.innerHTML = '<a href="#" role="button"></a>';
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
        '<a href="#" role="button"></a>' +
        '<div class="download-submenu">' +
        '<button id="download-gpx" disabled>GPX (Selected Item)</button>' +
        '<button id="download-kml" disabled>KML (Selected Item)</button>' +
        '<button id="download-strava-original-gpx" style="display: none;">GPX (Original from Strava)</button>' +
        '<button id="download-kmz">KMZ (Everything)</button>' +
        "</div>";
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
      L.DomEvent.on(container.querySelector("#download-strava-original-gpx"), "click", (e) => {
        L.DomEvent.stop(e);
        if (globallySelectedItem && globallySelectedItem.feature.properties.stravaId) {
          const { stravaId, name } = globallySelectedItem.feature.properties;
          downloadOriginalStravaGpx(stravaId, name);
        }
        subMenu.style.display = "none";
      });
      L.DomEvent.on(container.querySelector("#download-kmz"), "click", (e) => {
        L.DomEvent.stop(e);
        exportKmz();
        subMenu.style.display = "none";
      });
      return container;
    },
  });

  // A single constant for both custom locate markers.
  const CUSTOM_LOCATE_ICON_SIZE = 50;

  const locationArrowIcon = L.divIcon({
    html: `<img src="img/location-arrow.svg" style="width: ${CUSTOM_LOCATE_ICON_SIZE}px; height: ${CUSTOM_LOCATE_ICON_SIZE}px;">`,
    className: "custom-locate-icon",
    iconSize: [CUSTOM_LOCATE_ICON_SIZE, CUSTOM_LOCATE_ICON_SIZE],
    // Calculate anchor based on the SVG's dimensions relative to its viewBox.
    // The tip of the arrow is at x=100, y=150.
    // The total viewBox width is 220 - (-10) = 230
    // The total viewBox height is 220 - (-25) = 245
    iconAnchor: [(100 / 230) * CUSTOM_LOCATE_ICON_SIZE, (150 / 245) * CUSTOM_LOCATE_ICON_SIZE],
  });

  // Custom location compass marker for locateControl
  const locationCompassArrowIcon = L.Control.Locate.LocationMarker.extend({
    initialize(latlng, heading, options) {
      // Use leaflet.setOptions instead of L.setOptions
      leaflet.setOptions(this, options);
      this._latlng = latlng;
      this._heading = heading;
      this.createIcon();
    },

    setHeading(heading) {
      this._heading = heading;
      // Rotate the icon's IMG element directly
      if (this._icon) {
        const imgElement = this._icon.querySelector("img");
        if (imgElement) {
          imgElement.style.transform = `rotate(${this._heading}deg)`;
        }
      }

      // The L.Control.Locate plugin internally creates its default marker with this specific class name.
      // We select it here so we can hide it, ensuring only our custom compass icon is visible when heading is available.
      const locationMarkerElement = document.querySelector(".leaflet-control-locate-location");
      // Check if the element exists
      if (locationMarkerElement) {
        // Set the display property to 'none'
        locationMarkerElement.style.display = "none";
      }
    },

    /**
     * **OVERRIDE THE ENTIRE METHOD TO ADD THE ICON ANCHOR**
     * Create a styled circle location marker
     */
    createIcon() {
      // This method is copied from the parent L.Control.Locate.LocationMarker
      // with one critical addition: `iconAnchor`.
      const opt = this.options;
      const style = ""; // Style is not needed as we use an SVG symbol

      const icon = this._getIconSVG(opt, style);

      this._locationIcon = leaflet.divIcon({
        className: icon.className,
        html: icon.html, // Use 'html' property
        iconSize: [icon.w, icon.h],
        // --- THIS IS THE FIX ---
        // Add the same anchor calculation as locationArrowIcon
        iconAnchor: [(100 / 230) * CUSTOM_LOCATE_ICON_SIZE, (150 / 245) * CUSTOM_LOCATE_ICON_SIZE],
      });

      this.setIcon(this._locationIcon);

      // After setting the icon, apply initial heading
      this.setHeading(this._heading);
    },

    /**
     * Create a styled arrow compass marker
     */
    _getIconSVG(options, style) {
      const size = CUSTOM_LOCATE_ICON_SIZE;
      const imgContent = `<img src="img/location-arrow.svg" style="width:${size}px; height:${size}px;">`;

      return {
        className: "leaflet-control-locate-heading",
        html: imgContent,
        w: size,
        h: size,
      };
    },
  });

  // Get the color value from your CSS file
  const locateCircleColor = rootStyles.getPropertyValue("--locate-color").trim();

  locateControl = L.control
    .locate({
      position: "topleft",
      flyTo: true,
      locateOptions: { maxZoom: 16 },
      drawCircle: false,
      showPopup: false,
      showCompass: true,
      // Custom compass marker
      compassClass: locationCompassArrowIcon,
      // Marker style when not using custom marker
      markerStyle: {
        color: "white", // Color of the marker's border
        fillColor: locateCircleColor, // Fill color of the marker
        fillOpacity: 1,
        weight: 2,
        opacity: 1,
        radius: 10, // Size of the center dot
      },
      // --- FOR DEBUGGING ALIGNMENT ---
      // To visually test that the rotating compass marker has the correct anchor point,
      // you can un-comment the 'markerClass' option below. This will force the plugin
      // to use our non-rotating custom icon, making it easy to confirm that both
      // the compass and static icons align perfectly.
      //
      // markerClass: L.Marker.extend({
      //   options: {
      //     icon: locationArrowIcon,
      //   },
      // }),
    })
    .addTo(map);

  // Add a scale control showing units based on the user's setting
  scaleControl = L.control
    .scale({
      position: "bottomleft",
      metric: !useImperialUnits,
      imperial: useImperialUnits,
    })
    .addTo(map);

  // Change background of locate button on locationfound/locationerror
  const locateButtonContainer = locateControl.getContainer();
  map.on("locateactivate", function () {
    L.DomUtil.addClass(locateButtonContainer, "locate-active");
  });
  map.on("locatedeactivate", function () {
    L.DomUtil.removeClass(locateButtonContainer, "locate-active");
  });

  L.control.zoom({ position: "topleft" }).addTo(map);

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
        '<span class="icon-chevron-right-span material-symbols">chevron_right</span>' +
        '<span class="icon-chevron-left-span material-symbols">chevron_left</span>' +
        "</a>";

      L.DomEvent.on(container, "click", (ev) => {
        L.DomEvent.stop(ev);
        const panelContainer = document.getElementById("main-right-container");
        panelContainer.classList.toggle("hidden");
        // Toggle the state class on the button itself
        container.classList.toggle("panels-visible");
        container.classList.toggle("panels-hidden");

        // --- START: NEW FIX ---
        // If the panel was just made visible and an item is selected,
        // re-run the height adjustment for the name textarea. This corrects
        // the height if an item was selected while the panel was hidden.
        if (!panelContainer.classList.contains("hidden") && globallySelectedItem) {
          adjustInfoPanelNameHeight(infoPanelName);
        }
        // --- END: NEW FIX ---
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
        '<span class="icon-fullscreen-enter-span material-symbols">fullscreen</span>' +
        '<span class="icon-fullscreen-exit-span material-symbols">fullscreen_exit</span>' +
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

  // --- START: NEW Custom Search Bar Setup ---
  const searchInput = document.getElementById("search-input");
  const searchSuggestions = document.getElementById("search-suggestions");

  const onSearchResult = (locationLatLng, label) => {
    // This logic is moved from the old 'geosearch/showlocation' event handler.

    // Remove previous temporary marker if it exists
    if (temporarySearchMarker) {
      map.removeLayer(temporarySearchMarker);
      temporarySearchMarker = null; // Important to nullify it
    }

    // Create a new, temporary black marker and make it interactive
    temporarySearchMarker = L.marker(locationLatLng, {
      icon: createMarkerIcon(rootStyles.getPropertyValue("--color-black").trim(), 1),
      interactive: true,
    }).addTo(map);

    // --- Create Popup Content ---
    const popupContent = document.createElement("div");
    popupContent.style.textAlign = "center";
    popupContent.innerHTML = `<div style="font-weight: bold; margin-bottom: 8px;">${label}</div>`;

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
        icon: createMarkerIcon(defaultDrawColorData.css, STYLE_CONFIG.marker.default.opacity),
      });

      newMarker.pathType = "drawn";
      newMarker.feature = {
        properties: {
          name: label,
          omColorName: defaultDrawColorName,
        },
      };

      drawnItems.addLayer(newMarker);
      editableLayers.addLayer(newMarker);

      newMarker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        selectItem(newMarker);
      });

      // Clean up the temporary marker and input
      if (temporarySearchMarker) {
        map.removeLayer(temporarySearchMarker);
        temporarySearchMarker = null;
      }
      map.closePopup();
      searchInput.value = ""; // Clear search input on save

      // Update UI
      updateDrawControlStates();
      updateOverviewList();
      selectItem(newMarker); // Select the newly saved marker

      Swal.fire({
        toast: true,
        position: "center",
        icon: "success",
        iconColor: "var(--swal-color-success)",
        title: "Marker Saved!",
        showConfirmButton: false,
        timer: 2000,
      });
    });
    // --- End Save Button Logic ---

    // Bind the popup and open it.
    temporarySearchMarker
      .bindPopup(popupContent, { offset: L.point(0, -35), maxWidth: 150 })
      .openPopup();

    // When the popup is closed (without saving), remove the temporary marker.
    temporarySearchMarker.on("popupclose", () => {
      // The marker might have already been removed by the save button.
      if (temporarySearchMarker && map.hasLayer(temporarySearchMarker)) {
        map.removeLayer(temporarySearchMarker);
        temporarySearchMarker = null;
      }
      searchInput.value = ""; // Also clear input on popup close
    });

    // Fly to the location
    map.flyTo(locationLatLng, map.getZoom() < 16 ? 16 : map.getZoom());
  };

  setupAutocomplete(searchInput, searchSuggestions, onSearchResult);
  // --- END: NEW Custom Search Bar Setup ---

  // Add elevationControl
  elevationControl = createAndAddElevationControl(useImperialUnits);

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
        metric: true,
        feet: false,
        showLength: false,
      },
      polygon: false,
      rectangle: false,
      circle: false,
      marker: {
        icon: createMarkerIcon(defaultDrawColor, STYLE_CONFIG.marker.default.opacity),
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
      link.innerHTML = "";
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
                iconColor: "var(--swal-color-error)",
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
    popupContent.innerHTML = `<span style="font-weight: bold;">Copy coordinates</span><br><span style="font-size: 12px;">${latlng.lat.toFixed(
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
            iconColor: "var(--swal-color-success)",
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
            iconColor: "var(--swal-color-error)",
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

  map.on(L.Draw.Event.DRAWSTART, function (e) {
    // When any drawing starts deselect current item
    deselectCurrentItem();
    // When any drawing starts, add a general class to the body.
    L.DomUtil.addClass(document.body, "leaflet-is-drawing");
  });

  map.on(L.Draw.Event.DRAWSTOP, function () {
    // When drawing stops for any reason, remove the class.
    L.DomUtil.removeClass(document.body, "leaflet-is-drawing");
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

  // Initialize Strava functionality
  initializeStrava();

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
    infoIcon.innerHTML = '<span class="material-symbols">info</span>';
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
        iconColor: "var(--swal-color-info)",
        title: `Path Simplification ${enablePathSimplification ? "Enabled" : "Disabled"}`,
        showConfirmButton: false,
        timer: 1500,
      });
    });
    L.DomEvent.on(infoIcon, "click", () => {
      Swal.fire({
        icon: "info",
        iconColor: "var(--swal-color-info)",
        title: "Path Simplification",
        html: `
<p style="text-align: left; margin: 0 0 18px 0">
  This option automatically reduces the number of points in complex imported paths (GPX, KML) and
  generated routes.
</p>
<p style="text-align: left; margin: 0 0 18px 0">
  <strong>Enabled (Recommended):</strong> Improves performance and responsiveness, especially with
  long tracks. The visual change is often unnoticeable.
</p>
<p style="text-align: left">
  <strong>Disabled:</strong> Preserves every single point from the original file. Use this if
  absolute precision is critical and you are not experiencing performance issues.
</p>
`,
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

    // --- START: Imperial Units Toggle ---
    const imperialUnitsContainer = L.DomUtil.create("div", "settings-control-item", settingsPanel);
    const imperialUnitsLabel = L.DomUtil.create("label", "", imperialUnitsContainer);
    imperialUnitsLabel.htmlFor = "imperial-units-toggle";
    imperialUnitsLabel.innerText = "Imperial Units";
    const imperialUnitsCheckbox = L.DomUtil.create("input", "", imperialUnitsContainer);
    imperialUnitsCheckbox.type = "checkbox";
    imperialUnitsCheckbox.id = "imperial-units-toggle";
    imperialUnitsCheckbox.checked = useImperialUnits; // Use the global variable

    L.DomEvent.on(imperialUnitsCheckbox, "change", async (e) => {
      useImperialUnits = e.target.checked;
      localStorage.setItem("useImperialUnits", useImperialUnits);

      // Update the scale control to reflect the new unit setting
      if (scaleControl) {
        map.removeControl(scaleControl);
      }
      scaleControl = L.control
        .scale({
          position: "bottomleft",
          metric: !useImperialUnits,
          imperial: useImperialUnits,
        })
        .addTo(map);

      if (elevationControl) {
        map.removeControl(elevationControl);
      }
      elevationControl = createAndAddElevationControl(useImperialUnits);

      const isProfileVisible =
        document.getElementById("elevation-div").style.visibility === "visible";
      if (selectedElevationPath && isProfileVisible) {
        await addElevationProfileForLayer(selectedElevationPath);
      }

      updateAllDynamicUnitDisplays();
      updateScaleControlVisibility();

      Swal.fire({
        toast: true,
        position: "center",
        icon: "info",
        iconColor: "var(--swal-color-info)",
        title: `Units set to ${useImperialUnits ? "Imperial" : "Metric"}`,
        showConfirmButton: false,
        timer: 1500,
      });
    });

    L.DomEvent.on(imperialUnitsContainer, "dblclick mousedown wheel", L.DomEvent.stopPropagation);
    // --- END: Imperial Units Toggle ---

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
    routingProviderSelect.innerHTML = `<option value="mapbox">Mapbox</option><option value="osrm">OSRM (Demo)</option>`;
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
        iconColor: "var(--swal-color-info)",
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
        iconColor: "var(--swal-color-info)",
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

    // --- Privacy Policy Link ---
    const privacyPolicyContainer = L.DomUtil.create("div", "settings-control-item", settingsPanel);
    const privacyPolicyLabel = L.DomUtil.create("label", "", privacyPolicyContainer);
    privacyPolicyLabel.innerText = "Legal";
    privacyPolicyLabel.style.color = "var(--text-color)";
    const privacyPolicyLink = L.DomUtil.create("a", "", privacyPolicyContainer);
    privacyPolicyLink.href = "privacy.html";
    privacyPolicyLink.target = "_blank";
    privacyPolicyLink.innerText = "View Privacy Policy";
    privacyPolicyLink.style.fontSize = "14px";
    privacyPolicyLink.style.color = "var(--highlight-color)";
  }

  // --- START: MODIFIED code block for clickable attribution using event delegation ---
  // Use event delegation on the map container to handle clicks on the attribution link.
  // This is robust and works even if Leaflet redraws the attribution control.
  map.getContainer().addEventListener("click", async (e) => {
    // <-- Note the 'async' keyword
    // Use .closest() to check if the click was on the link or an element inside it.
    const attributionLink = e.target.closest("#attribution-link");

    if (attributionLink) {
      // Prevent the link's default behavior (e.g., navigating to '#')
      e.preventDefault();
      e.stopPropagation();

      try {
        // Fetch the content from the new HTML file
        const response = await fetch("credits.html");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const creditsHtmlContent = await response.text();

        // Open the SweetAlert with the fetched content
        Swal.fire({
          imageUrl: "img/icon-1024x1024.svg",
          imageWidth: 150,
          imageHeight: "auto",
          html: creditsHtmlContent, // <-- Use the fetched HTML here
          confirmButtonText: "Close",
          width: "500px",
          customClass: {
            popup: "swal2-credits-popup",
          },
        });
      } catch (error) {
        console.error("Could not load credits.html:", error);
        Swal.fire({
          icon: "error",
          iconColor: "var(--swal-color-error)",
          title: "Error",
          text: "Could not load the credits information.",
        });
      }
    }
  });
  // --- END: MODIFIED code block ---

  // --- START: NEW - MutationObserver to auto-resize textarea on selection ---
  // This observer watches for changes in the info panel. When details are
  // populated (which happens when an item is selected), it automatically
  // triggers the textarea height adjustment. This robustly solves the problem
  // of the initial height being incorrect for names of any length.
  const infoPanelObserver = new MutationObserver(() => {
    if (infoPanelName) {
      adjustInfoPanelNameHeight(infoPanelName);
    }
  });

  // Start observing the main info panel container for any changes in its content.
  infoPanelObserver.observe(infoPanel, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  // --- END: NEW - MutationObserver ---

  // --- START: PWA Installation Logic ---
  let deferredPrompt;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const installLink = document.querySelector("#install-pwa-link");
    if (installLink) {
      installLink.style.display = "inline";

      installLink.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        installLink.style.display = "none";

        // Check if the prompt is still available before using it
        if (deferredPrompt) {
          deferredPrompt.prompt();

          deferredPrompt.userChoice.then(({ outcome }) => {
            console.log(`User response to the install prompt: ${outcome}`);
          });

          // **THE FIX**: Clear the deferredPrompt immediately after calling prompt().
          // This prevents it from being used a second time.
          deferredPrompt = null;
        }
      });
    }
  });

  window.addEventListener("appinstalled", () => {
    const installLink = document.querySelector("#install-pwa-link");
    if (installLink) {
      installLink.style.display = "none";
    }
    deferredPrompt = null;
    console.log("PWA was installed");
  });
  // --- END: PWA Installation Logic ---

  // Final ui updates
  setTimeout(updateDrawControlStates, 0);
  setTimeout(replaceDefaultIconsWithMaterialSymbols, 0);
  resetInfoPanel();
  updateScaleControlVisibility();

  // --- START: Preload key images to prevent flash on modal/panel open ---
  // This waits for the window to be fully loaded, then downloads the images
  // into the cache so they are ready when needed.
  window.addEventListener(
    "load",
    () => {
      // Preload credits icon
      const creditsIcon = new Image();
      creditsIcon.src = "img/icon-1024x1024.svg";

      // Preload Strava connect button
      const stravaButton = new Image();
      stravaButton.src = "img/btn_strava_connect_with_orange.svg";
    },
    { once: true }
  );
  // --- END ---
}

// Initialize the application once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", initializeMap);
