// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * WMS/WMTS Import Module
 * Handles custom WMS layer imports with GetCapabilities parsing and layer selection
 */

const WmsImport = (function () {
  let customWmsLayers = {}; // Store custom WMS layers by ID
  let layerIdCounter = 0;
  const STORAGE_KEY = "wms-custom-layers";

  /**
   * Shows the main WMS import dialog
   * @param {L.Map} map - Leaflet map instance
   */
  async function showWmsImportDialog(map) {
    const result = await Swal.fire({
      title: "Import WMS Layers",
      html: `
        <div style="text-align: left;">
          <p style="margin-bottom: 12px;">Enter a WMS service URL to browse and import available map layers.</p>
          <label for="wms-url-input" style="display: block; margin-bottom: 8px;">WMS Service URL:</label>
          <input
            type="text"
            id="wms-url-input"
            class="swal2-input"
            placeholder="https://example.com/wms"
            style="width: 100%; margin: 0; box-sizing: border-box; border: 1px solid var(--border-color);"
          />
          <p style="margin-top: 12px;">Examples:</p>
          <ul style="margin: 4px 0; padding-left: 20px; text-align: left;">
            <li class="wms-example-url" data-url="https://wms.geo.admin.ch/" style="cursor: pointer;">https://wms.geo.admin.ch/</li>
            <li class="wms-example-url" data-url="https://ows.terrestris.de/osm/service?" style="cursor: pointer;">https://ows.terrestris.de/osm/service?</li>
            <li class="wms-example-url" data-url="https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?" style="cursor: pointer;">https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?</li>
          </ul>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Connect",
      cancelButtonText: "Cancel",
      customClass: {
        confirmButton: "wms-connect-button",
        cancelButton: "wms-cancel-button",
      },
      didOpen: () => {
        const confirmButton = Swal.getConfirmButton();
        const urlInput = document.getElementById("wms-url-input");

        // Disable button initially
        confirmButton.disabled = true;

        // Enable/disable button based on input
        urlInput.addEventListener("input", () => {
          confirmButton.disabled = !urlInput.value.trim();
        });

        // Add click handlers for example URLs
        document.querySelectorAll(".wms-example-url").forEach((li) => {
          li.addEventListener("click", () => {
            urlInput.value = li.dataset.url;
            confirmButton.disabled = false;
          });
        });
      },
      preConfirm: () => {
        const url = document.getElementById("wms-url-input").value.trim();
        return url;
      },
    });

    if (result.isConfirmed && result.value) {
      await connectToWmsService(result.value, map);
    }
  }

  /**
   * Connects to a WMS service and fetches available layers
   * @param {string} wmsUrl - Base WMS service URL
   * @param {L.Map} map - Leaflet map instance
   */
  async function connectToWmsService(wmsUrl, map) {
    Swal.fire({
      title: "Connecting...",
      text: "Fetching available layers from WMS service",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const layers = await fetchWmsCapabilities(wmsUrl);

      if (!layers || layers.length === 0) {
        Swal.fire({
          icon: "warning",
          iconColor: "var(--swal-color-warning)",
          title: "No Layers Found",
          text: "The WMS service did not return any queryable layers.",
        });
        return;
      }

      await showLayerSelectionDialog(layers, wmsUrl, map);
    } catch (error) {
      console.error("WMS connection error:", error);

      // Properly clear the loading state and close the dialog
      Swal.hideLoading();
      Swal.close();

      // Wait a moment for the dialog to fully close before opening new one
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Show fresh error dialog
      const result = await Swal.fire({
        icon: "error",
        iconColor: "var(--swal-color-error)",
        title: "Connection Failed",
        html: `
          <p>Could not connect to the WMS service.</p>
          <div style="text-align: center; margin-top: 12px;">
            <p style="margin-bottom: 8px;"><strong>Possible reasons:</strong></p>
            <div style="display: inline-block; text-align: left;">
              <ul style="margin: 0; padding-left: 20px;">
                <li>The URL is incorrect or the service is unavailable</li>
                <li>The server doesn't allow cross-origin requests (CORS)</li>
                <li>The service is not a valid WMS endpoint</li>
              </ul>
            </div>
          </div>
          <p style="margin-top: 12px; color: var(--color-red)">Error: ${error.message}</p>
        `,
        confirmButtonText: "OK",
        allowOutsideClick: true,
      });

      // Re-open the WMS import dialog after user clicks OK
      if (result.isConfirmed || result.isDismissed) {
        await showWmsImportDialog(map);
      }
    }
  }

  /**
   * Fetches and parses WMS GetCapabilities
   * @param {string} baseUrl - Base WMS service URL
   * @returns {Promise<Array>} Array of layer objects
   */
  async function fetchWmsCapabilities(baseUrl) {
    // Construct GetCapabilities URL
    const url = new URL(baseUrl);
    url.searchParams.set("SERVICE", "WMS");
    url.searchParams.set("REQUEST", "GetCapabilities");

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // Check for XML parsing errors
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
      throw new Error("Invalid XML response from WMS service");
    }

    return parseWmsLayers(xmlDoc);
  }

  /**
   * Parses WMS GetCapabilities XML to extract layer information
   * @param {Document} xmlDoc - Parsed XML document
   * @returns {Array} Array of layer objects with name, title, and abstract
   */
  function parseWmsLayers(xmlDoc) {
    const layers = [];

    // Try different namespace variations
    let layerElements = xmlDoc.querySelectorAll("Layer[queryable='1']");

    // If no queryable layers, get all named layers
    if (layerElements.length === 0) {
      layerElements = xmlDoc.querySelectorAll("Layer > Name");
      layerElements = Array.from(layerElements).map((name) => name.parentElement);
    }

    layerElements.forEach((layerEl) => {
      const nameEl = layerEl.querySelector("Name");
      const titleEl = layerEl.querySelector("Title");
      const abstractEl = layerEl.querySelector("Abstract");

      if (nameEl && nameEl.textContent.trim()) {
        layers.push({
          name: nameEl.textContent.trim(),
          title: titleEl ? titleEl.textContent.trim() : nameEl.textContent.trim(),
          abstract: abstractEl ? abstractEl.textContent.trim() : "",
        });
      }
    });

    return layers;
  }

  /**
   * Shows layer selection dialog with checkboxes
   * @param {Array} layers - Array of available layers
   * @param {string} wmsUrl - Base WMS URL
   * @param {L.Map} map - Leaflet map instance
   */
  async function showLayerSelectionDialog(layers, wmsUrl, map) {
    const layersHtml = layers
      .map(
        (layer, index) => `
        <label style="display: flex; align-items: start; margin-bottom: 12px; text-align: left; cursor: pointer;">
          <input
            type="checkbox"
            id="wms-layer-${index}"
            value="${layer.name}"
            style="margin-right: 10px; margin-top: 4px; cursor: pointer;"
          />
          <div>
            <div style="font-weight: 500;">${layer.title}</div>
            ${
              layer.abstract
                ? `<div style="font-size: 12px; color: var(--text-color); margin-top: 4px;">${layer.abstract}</div>`
                : ""
            }
          </div>
        </label>
      `
      )
      .join("");

    const result = await Swal.fire({
      title: "Select Layers to Import",
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto; padding: 10px;">
          <p style="margin-bottom: 16px;">
            Found <strong>${layers.length}</strong> layer(s). Select the layers you want to add as map overlays:
          </p>
          ${layersHtml}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Import Selected",
      cancelButtonText: "Cancel",
      width: "600px",
      customClass: {
        confirmButton: "wms-connect-button",
        cancelButton: "wms-cancel-button",
      },
      preConfirm: () => {
        const selectedLayers = [];
        layers.forEach((layer, index) => {
          const checkbox = document.getElementById(`wms-layer-${index}`);
          if (checkbox && checkbox.checked) {
            selectedLayers.push(layer);
          }
        });

        if (selectedLayers.length === 0) {
          Swal.showValidationMessage("Please select at least one layer");
          return false;
        }

        return selectedLayers;
      },
    });

    if (result.isConfirmed && result.value) {
      addWmsOverlays(result.value, wmsUrl, map);
      Swal.fire({
        icon: "success",
        iconColor: "var(--swal-color-success)",
        title: "Layers Imported",
        text: `Successfully added ${result.value.length} layer(s) to the map. Toggle them in the Layers panel.`,
        timer: 3000,
        timerProgressBar: true,
      });
    }
  }

  /**
   * Creates and adds WMS overlay layers to the map
   * @param {Array} selectedLayers - Array of selected layer objects
   * @param {string} wmsUrl - Base WMS URL
   * @param {L.Map} map - Leaflet map instance
   */
  function addWmsOverlays(selectedLayers, wmsUrl, map) {
    selectedLayers.forEach((layer) => {
      const layerId = `wms-custom-${layerIdCounter++}`;

      // Create WMS tile layer
      const wmsLayer = L.tileLayer.wms(wmsUrl, {
        layers: layer.name,
        format: "image/png",
        transparent: true,
      });

      // Store layer information
      customWmsLayers[layerId] = {
        id: layerId,
        layer: wmsLayer,
        name: layer.title,
        wmsUrl: wmsUrl,
        wmsLayerName: layer.name,
        addedToMap: false,
      };

      // Add to layers control
      addToLayersControl(layerId, layer.title, wmsLayer, map);
    });

    // Save to localStorage
    saveLayersToStorage();
  }

  /**
   * Adds a custom WMS layer to the layers control panel
   * @param {string} layerId - Unique layer ID
   * @param {string} displayName - Display name for the layer
   * @param {L.TileLayer.WMS} wmsLayer - Leaflet WMS layer
   * @param {L.Map} map - Leaflet map instance
   */
  function addToLayersControl(layerId, displayName, wmsLayer, map) {
    const customPanel = document.getElementById("custom-layers-panel");
    if (!customPanel) return;

    const overlaysSection = customPanel.querySelector(".leaflet-control-layers-overlays");
    if (!overlaysSection) return;

    const label = document.createElement("label");
    label.className = "wms-custom-layer";
    label.setAttribute("data-layer-id", layerId);
    label.innerHTML = `
      <div>
        <input
          type="checkbox"
          class="leaflet-control-layers-selector"
          data-layer-id="${layerId}"
          data-layer-type="wms-custom"
          checked="checked"
        />
        <span class="layer-name-container" style="padding-left: 0;">
          <span class="layer-name-text" title="${displayName}"><span class="drag-handle material-symbols layer-icon" title="Drag to reorder" style="cursor: move;">drag_indicator</span> ${displayName}</span>
          <span
            class="material-symbols material-symbols-fill layer-icon wms-remove-icon"
            data-layer-id="${layerId}"
            title="Remove this layer"
            style="cursor: pointer;"
          >cancel</span>
        </span>
      </div>
    `;

    overlaysSection.appendChild(label);

    // Auto-enable the layer on import
    map.addLayer(wmsLayer);
    customWmsLayers[layerId].addedToMap = true;

    // Reapply z-index to ensure visual order matches list order
    if (typeof window.reapplyOverlayZIndex === "function") {
      window.reapplyOverlayZIndex();
    }

    // Add event listener for checkbox toggle
    const checkbox = label.querySelector("input");
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        map.addLayer(wmsLayer);
        customWmsLayers[layerId].addedToMap = true;
        // Reapply z-index to ensure layer respects list order
        if (typeof window.reapplyOverlayZIndex === "function") {
          window.reapplyOverlayZIndex();
        }
      } else {
        map.removeLayer(wmsLayer);
        customWmsLayers[layerId].addedToMap = false;
      }
    });

    // Add event listener for remove icon
    const removeIcon = label.querySelector(".wms-remove-icon");
    removeIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      removeWmsLayer(layerId, map);
    });
  }

  /**
   * Removes a custom WMS layer
   * @param {string} layerId - Layer ID to remove
   * @param {L.Map} map - Leaflet map instance
   */
  function removeWmsLayer(layerId, map) {
    const layerData = customWmsLayers[layerId];
    if (!layerData) return;

    // Remove from map
    if (layerData.addedToMap) {
      map.removeLayer(layerData.layer);
    }

    // Remove from control panel
    const customPanel = document.getElementById("custom-layers-panel");
    const checkbox = customPanel?.querySelector(`input[data-layer-id="${layerId}"]`);
    if (checkbox) {
      checkbox.closest("label").remove();
    }

    // Remove from storage
    delete customWmsLayers[layerId];

    // Update localStorage
    saveLayersToStorage();
  }

  /**
   * Saves current WMS layers to localStorage
   */
  function saveLayersToStorage() {
    const layersToSave = Object.values(customWmsLayers).map((layerData) => ({
      id: layerData.id,
      name: layerData.name,
      wmsUrl: layerData.wmsUrl,
      wmsLayerName: layerData.wmsLayerName,
      addedToMap: layerData.addedToMap,
    }));

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layersToSave));
    } catch (e) {
      console.warn("Failed to save WMS layers to localStorage:", e);
    }
  }

  /**
   * Loads WMS layers from localStorage and adds them to the map
   * @param {L.Map} map - Leaflet map instance
   */
  function loadLayersFromStorage(map) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const layersData = JSON.parse(saved);
      layersData.forEach((layerData) => {
        // Create WMS tile layer
        const wmsLayer = L.tileLayer.wms(layerData.wmsUrl, {
          layers: layerData.wmsLayerName,
          format: "image/png",
          transparent: true,
        });

        // Store layer information
        customWmsLayers[layerData.id] = {
          id: layerData.id,
          layer: wmsLayer,
          name: layerData.name,
          wmsUrl: layerData.wmsUrl,
          wmsLayerName: layerData.wmsLayerName,
          addedToMap: false,
        };

        // Add to layers control
        addToLayersControl(layerData.id, layerData.name, wmsLayer, map);

        // Restore map visibility state
        if (layerData.addedToMap) {
          map.addLayer(wmsLayer);
          customWmsLayers[layerData.id].addedToMap = true;

          // Update checkbox state
          const customPanel = document.getElementById("custom-layers-panel");
          const checkbox = customPanel?.querySelector(`input[data-layer-id="${layerData.id}"]`);
          if (checkbox) {
            checkbox.checked = true;
          }
        }

        // Update layerIdCounter to avoid ID conflicts
        const idNum = parseInt(layerData.id.replace("wms-custom-", ""), 10);
        if (!isNaN(idNum) && idNum >= layerIdCounter) {
          layerIdCounter = idNum + 1;
        }
      });
    } catch (e) {
      console.warn("Failed to load WMS layers from localStorage:", e);
    }
  }

  // Public API
  return {
    showWmsImportDialog,
    loadLayersFromStorage,
    getCustomWmsLayers: () => customWmsLayers, // Expose custom WMS layers for layer management
  };
})();

// Export to window for global access
window.WmsImport = WmsImport;
