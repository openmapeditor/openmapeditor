// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * WMS GetFeatureInfo Module
 * Handles clicking on WMS layers to retrieve feature information
 */

const WmsGetFeatureInfo = (function () {
  // Configuration
  const CONFIG = {
    defaultFeatureCount: 10,
    defaultTolerance: 5, // pixels
    preferredFormats: ["application/json", "application/vnd.ogc.gml", "text/html", "text/plain"],
    requestTimeout: 10000, // 10 seconds
  };

  let isEnabled = true;
  let activePopup = null;

  /**
   * Initialize the WMS GetFeatureInfo functionality
   * @param {L.Map} map - Leaflet map instance
   */
  function initialize(map) {
    if (!map) {
      console.error("WmsGetFeatureInfo: Map instance required");
      return;
    }

    console.log("WMS GetFeatureInfo initialized");
  }

  /**
   * Query WMS layers at a specific location and show feature info
   * @param {L.LatLng} latlng - Location to query
   * @param {L.Map} map - Leaflet map instance
   */
  async function queryAtLocation(latlng, map) {
    if (!isEnabled) return;

    // Get all active WMS layers
    const wmsLayers = getActiveWmsLayers(map);

    if (wmsLayers.length === 0) return;

    // Close any existing popup
    if (activePopup) {
      map.closePopup(activePopup);
      activePopup = null;
    }

    // Query all WMS layers at click point
    const allFeatures = [];
    for (const layerInfo of wmsLayers) {
      try {
        const features = await queryWmsLayer(layerInfo, latlng, map);
        if (features && features.length > 0) {
          allFeatures.push({
            layerName: layerInfo.name,
            features: features,
          });
        }
      } catch (error) {
        console.error(`GetFeatureInfo error for layer ${layerInfo.name}:`, error);
      }
    }

    // Display results if any features found
    if (allFeatures.length > 0) {
      showFeatureInfoPopup(allFeatures, latlng, map);
    }
  }

  /**
   * Get all active WMS layers from the map
   * @param {L.Map} map - Leaflet map instance
   * @returns {Array} Array of WMS layer info objects
   */
  function getActiveWmsLayers(map) {
    const wmsLayers = [];

    map.eachLayer((layer) => {
      // Check if it's a TileLayer.WMS
      if (layer instanceof L.TileLayer.WMS && layer.options.layers) {
        wmsLayers.push({
          layer: layer,
          name: layer.options.layerName || layer.options.layers || "WMS Layer",
          url: layer._url,
          layers: layer.options.layers,
          version: layer.options.version || "1.3.0",
          format: layer.options.format || "image/png",
          crs: layer.options.crs || "EPSG:4326",
          queryable: layer.options.queryable !== false, // Default to true
        });
      }
    });

    return wmsLayers.filter((l) => l.queryable);
  }

  /**
   * Query a WMS layer for feature information at a point
   * @param {Object} layerInfo - WMS layer information
   * @param {L.LatLng} latlng - Click coordinates
   * @param {L.Map} map - Leaflet map instance
   * @returns {Promise<Array>} Array of features
   */
  async function queryWmsLayer(layerInfo, latlng, map) {
    // Build GetFeatureInfo request URL
    const url = buildGetFeatureInfoUrl(layerInfo, latlng, map);

    // Attempt to fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        mode: "cors",
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Determine response content type
      const contentType = response.headers.get("content-type") || "";

      // Parse response based on content type
      if (contentType.includes("application/json")) {
        return await parseGeoJsonResponse(await response.json());
      } else if (
        contentType.includes("application/vnd.ogc.gml") ||
        contentType.includes("text/xml")
      ) {
        return await parseGmlResponse(await response.text());
      } else if (contentType.includes("text/html")) {
        return await parseHtmlResponse(await response.text(), layerInfo);
      } else if (contentType.includes("text/plain")) {
        return await parsePlainTextResponse(await response.text(), layerInfo);
      } else {
        // Try to parse as JSON first, then fall back
        const text = await response.text();
        try {
          return await parseGeoJsonResponse(JSON.parse(text));
        } catch {
          return await parseHtmlResponse(text, layerInfo);
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("GetFeatureInfo request timeout");
      }
      throw error;
    }
  }

  /**
   * Build GetFeatureInfo request URL
   * @param {Object} layerInfo - WMS layer information
   * @param {L.LatLng} latlng - Click coordinates
   * @param {L.Map} map - Leaflet map instance
   * @returns {string} Complete GetFeatureInfo URL
   */
  function buildGetFeatureInfoUrl(layerInfo, latlng, map) {
    const bounds = map.getBounds();
    const size = map.getSize();
    const point = map.latLngToContainerPoint(latlng);

    // Determine the best info format to request
    const infoFormat = CONFIG.preferredFormats[0]; // Try JSON first

    // Build parameters object
    const params = {
      SERVICE: "WMS",
      VERSION: layerInfo.version,
      REQUEST: "GetFeatureInfo",
      LAYERS: layerInfo.layers,
      QUERY_LAYERS: layerInfo.layers,
      STYLES: "",
      INFO_FORMAT: infoFormat,
      FEATURE_COUNT: CONFIG.defaultFeatureCount,
    };

    // Handle different WMS versions
    if (layerInfo.version === "1.3.0") {
      // WMS 1.3.0 uses CRS and I/J
      params.CRS = layerInfo.crs;
      params.BBOX = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(
        ","
      );
      params.WIDTH = size.x;
      params.HEIGHT = size.y;
      params.I = Math.floor(point.x);
      params.J = Math.floor(point.y);
    } else {
      // WMS 1.1.1 and earlier use SRS and X/Y
      params.SRS = layerInfo.crs;
      params.BBOX = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(
        ","
      );
      params.WIDTH = size.x;
      params.HEIGHT = size.y;
      params.X = Math.floor(point.x);
      params.Y = Math.floor(point.y);
    }

    // Add tolerance parameters for different WMS server types
    params.BUFFER = CONFIG.defaultTolerance; // GeoServer
    params.TOLERANCE = CONFIG.defaultTolerance; // MapServer
    params.FI_POINT_TOLERANCE = CONFIG.defaultTolerance; // QGIS
    params.FI_LINE_TOLERANCE = CONFIG.defaultTolerance; // QGIS
    params.FI_POLYGON_TOLERANCE = CONFIG.defaultTolerance; // QGIS

    // Build URL
    const baseUrl = layerInfo.url.split("?")[0];
    const queryString = new URLSearchParams(params).toString();

    return `${baseUrl}?${queryString}`;
  }

  /**
   * Parse GeoJSON format response
   * @param {Object} data - GeoJSON response data
   * @returns {Array} Array of features
   */
  async function parseGeoJsonResponse(data) {
    if (!data || !data.features) {
      return [];
    }

    return data.features.map((feature) => ({
      id: feature.id || feature.properties?.id || null,
      properties: feature.properties || {},
      geometry: feature.geometry || null,
    }));
  }

  /**
   * Parse GML format response
   * @param {string} xmlText - GML XML text
   * @returns {Array} Array of features
   */
  async function parseGmlResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // Check for parsing errors
    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      console.error("Error parsing GML response");
      return [];
    }

    const features = [];

    // Try to find feature members (GML uses different tag names)
    const featureMembers = xmlDoc.getElementsByTagName("gml:featureMember");
    const featureMembersAlt = xmlDoc.getElementsByTagName("featureMember");
    const msFeatures = xmlDoc.getElementsByTagName("msGMLOutput"); // MapServer specific

    let featureElements = [];
    if (featureMembers.length > 0) {
      featureElements = Array.from(featureMembers);
    } else if (featureMembersAlt.length > 0) {
      featureElements = Array.from(featureMembersAlt);
    } else if (msFeatures.length > 0) {
      // MapServer format
      const layers = msFeatures[0].getElementsByTagName("*");
      featureElements = Array.from(layers).filter((el) => el.children.length > 0);
    }

    featureElements.forEach((featureMember) => {
      const properties = {};

      // Extract all child elements as properties
      Array.from(featureMember.children).forEach((child) => {
        if (child.children.length === 0) {
          // Leaf node - extract as property
          const key = child.tagName.split(":").pop(); // Remove namespace prefix
          const value = child.textContent;
          properties[key] = value;
        } else {
          // Nested structure - try to extract properties
          Array.from(child.children).forEach((grandchild) => {
            if (grandchild.children.length === 0) {
              const key = grandchild.tagName.split(":").pop();
              const value = grandchild.textContent;
              properties[key] = value;
            }
          });
        }
      });

      if (Object.keys(properties).length > 0) {
        features.push({
          id: properties.id || properties.fid || null,
          properties: properties,
          geometry: null, // GML geometry parsing is complex, skip for now
        });
      }
    });

    return features;
  }

  /**
   * Parse HTML format response
   * @param {string} html - HTML response text
   * @param {Object} layerInfo - Layer information
   * @returns {Array} Array of features with HTML content
   */
  async function parseHtmlResponse(html, layerInfo) {
    // HTML response is typically pre-formatted by the server
    // Return it as a single "feature" with the HTML content
    if (!html || html.trim().length === 0) {
      return [];
    }

    return [
      {
        id: "html-response",
        properties: {
          html: html,
        },
        geometry: null,
      },
    ];
  }

  /**
   * Parse plain text format response
   * @param {string} text - Plain text response
   * @param {Object} layerInfo - Layer information
   * @returns {Array} Array of features
   */
  async function parsePlainTextResponse(text, layerInfo) {
    // Plain text response - try to parse as key-value pairs
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Check if it's a "no features found" message
    if (
      text.toLowerCase().includes("no features") ||
      text.toLowerCase().includes("no information")
    ) {
      return [];
    }

    // Try to parse as simple key-value pairs
    const lines = text.split("\n").filter((line) => line.trim());
    const properties = {};

    lines.forEach((line) => {
      const parts = line.split(/[:=]/).map((p) => p.trim());
      if (parts.length >= 2) {
        properties[parts[0]] = parts.slice(1).join(":");
      }
    });

    if (Object.keys(properties).length > 0) {
      return [
        {
          id: "text-response",
          properties: properties,
          geometry: null,
        },
      ];
    }

    // If parsing failed, return the raw text
    return [
      {
        id: "text-response",
        properties: {
          text: text,
        },
        geometry: null,
      },
    ];
  }

  /**
   * Display feature information in a popup
   * @param {Array} layerFeatures - Array of {layerName, features}
   * @param {L.LatLng} latlng - Popup location
   * @param {L.Map} map - Leaflet map instance
   */
  function showFeatureInfoPopup(layerFeatures, latlng, map) {
    const container = document.createElement("div");
    container.style.width = "300px";
    container.style.maxHeight = "400px";
    container.style.overflowY = "auto";
    container.style.fontSize = "13px";

    // Add title with layer name(s) at the top
    const title = document.createElement("div");
    title.textContent = layerFeatures.map((lf) => lf.layerName).join(", ");
    title.style.fontSize = "13px";
    title.style.marginBottom = "5px";
    title.style.textAlign = "center";
    container.appendChild(title);

    // Add divider after title
    const divider = document.createElement("hr");
    divider.style.margin = "5px 0";
    divider.style.border = "none";
    divider.style.borderTop = "1px solid var(--divider-color)";
    container.appendChild(divider);

    layerFeatures.forEach(({ features }) => {
      features.forEach((feature, index) => {
        // Check if feature has HTML content (from HTML response)
        if (feature.properties.html) {
          const htmlDiv = document.createElement("div");
          htmlDiv.innerHTML = feature.properties.html;
          container.appendChild(htmlDiv);
        } else {
          // Display properties as simple key-value pairs
          for (const [key, value] of Object.entries(feature.properties)) {
            // Skip HTML and text raw properties
            if (key === "html" || key === "text") continue;

            // Skip empty values
            if (value === null || value === undefined || value === "") continue;

            const row = document.createElement("div");
            row.style.marginBottom = "4px";

            // Format key (remove underscores, capitalize)
            const formattedKey = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

            const keySpan = document.createElement("span");
            keySpan.textContent = formattedKey + ": ";
            keySpan.style.fontWeight = "600";

            const valueSpan = document.createElement("span");
            valueSpan.textContent = String(value);

            row.appendChild(keySpan);
            row.appendChild(valueSpan);
            container.appendChild(row);
          }
        }

        // Add separator between features
        if (index < features.length - 1) {
          const hr = document.createElement("hr");
          hr.style.margin = "8px 0";
          hr.style.border = "none";
          hr.style.borderTop = "1px solid var(--divider-color)";
          container.appendChild(hr);
        }
      });
    });

    // Create and open popup (matching context menu style)
    activePopup = L.popup({
      closeButton: false,
      minWidth: 300,
      maxWidth: 300,
    })
      .setLatLng(latlng)
      .setContent(container)
      .openOn(map);
  }

  /**
   * Check if there are any active WMS layers
   * @param {L.Map} map - Leaflet map instance
   * @returns {boolean}
   */
  function hasWmsLayers(map) {
    return getActiveWmsLayers(map).length > 0;
  }

  /**
   * Enable GetFeatureInfo functionality
   */
  function enable() {
    isEnabled = true;
    console.log("WMS GetFeatureInfo enabled");
  }

  /**
   * Disable GetFeatureInfo functionality
   */
  function disable() {
    isEnabled = false;
    console.log("WMS GetFeatureInfo disabled");
  }

  /**
   * Check if GetFeatureInfo is enabled
   * @returns {boolean}
   */
  function isActive() {
    return isEnabled;
  }

  /**
   * Set the default feature count
   * @param {number} count - Number of features to return
   */
  function setFeatureCount(count) {
    if (count > 0) {
      CONFIG.defaultFeatureCount = count;
    }
  }

  /**
   * Set the tolerance (in pixels) for feature selection
   * @param {number} tolerance - Pixel tolerance
   */
  function setTolerance(tolerance) {
    if (tolerance >= 0) {
      CONFIG.defaultTolerance = tolerance;
    }
  }

  // Public API
  return {
    initialize,
    enable,
    disable,
    isActive,
    setFeatureCount,
    setTolerance,
    queryAtLocation,
    hasWmsLayers,
  };
})();

// Make available globally
window.WmsGetFeatureInfo = WmsGetFeatureInfo;
