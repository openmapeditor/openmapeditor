// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * Generates a KML placemark for a given Leaflet layer.
 * @param {L.Layer} layer - The layer to convert
 * @param {string} defaultName - A fallback name
 * @param {string} defaultDescription - A fallback description
 * @returns {string|null} The KML placemark string or null
 */
function generateKmlForLayer(layer, defaultName, defaultDescription = "") {
  let name = defaultName;
  let description = defaultDescription;
  if (layer.feature && layer.feature.properties) {
    name = layer.feature.properties.name || name;
    description = layer.feature.properties.description || description;
  }

  const colorName = layer.feature?.properties?.omColorName || "Red";
  const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName) || ORGANIC_MAPS_COLORS[0];

  const escapeXml = (unsafe) => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "&":
          return "&amp;";
        case "'":
          return "&apos;";
        case '"':
          return "&quot;";
      }
    });
  };

  const safeName = escapeXml(name);
  const safeDescription = description ? escapeXml(description) : "";

  const placemarkStart =
    `  <Placemark>\n` +
    `    <name>${safeName}</name>\n` +
    (safeDescription ? `    <description>${safeDescription}</description>\n` : "");

  const placemarkEnd = `  </Placemark>`;

  if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
    let latlngs;
    let coords;
    if (layer instanceof L.Polygon) {
      // Polygon: close the ring by adding the first point at the end
      latlngs = layer.getLatLngs()[0];
      const closedLatLngs = [...latlngs, latlngs[0]];
      coords = closedLatLngs
        .map((p) => `${p.lng},${p.lat},${typeof p.alt === "number" ? p.alt : 0}`)
        .join(" ");
    } else if (layer instanceof L.Polyline) {
      latlngs = layer.getLatLngs();
      while (latlngs.length > 0 && Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
        latlngs = latlngs[0];
      }
      coords = latlngs
        .map((p) => `${p.lng},${p.lat},${typeof p.alt === "number" ? p.alt : 0}`)
        .join(" ");
    }

    const geometryType = layer instanceof L.Polygon ? "Polygon" : "LineString";
    const geometryTag =
      geometryType === "Polygon"
        ? `    <Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n`
        : `    <LineString><coordinates>${coords}</coordinates></LineString>\n`;

    const styleTag =
      `    <Style>\n` +
      `      <LineStyle>\n` +
      `        <color>${colorData.kml.toUpperCase()}</color>\n` +
      `        <width>5</width>\n` +
      `      </LineStyle>\n` +
      `    </Style>\n`;

    return placemarkStart + styleTag + geometryTag + placemarkEnd;
  }

  if (layer instanceof L.Marker) {
    const latlng = layer.getLatLng();
    const alt = typeof latlng.alt === "number" ? latlng.alt : 0;
    const pointTag = `    <Point><coordinates>${latlng.lng},${latlng.lat},${alt}</coordinates></Point>\n`;

    const styleTag = `    <styleUrl>#placemark-${colorData.name.toLowerCase()}</styleUrl>\n`;
    return placemarkStart + styleTag + pointTag + placemarkEnd;
  }

  return null;
}

/**
 * Creates a complete, pretty-printed KML document string from a name and an array of placemarks.
 * @param {string} name - The name for the <Document>
 * @param {Array<string>} placemarks - An array of pre-formatted KML <Placemark> strings
 * @returns {string} The full KML document as a string
 */
function createKmlDocument(name, placemarks) {
  const kmlMarkerStyles = ORGANIC_MAPS_COLORS.map(
    (color) =>
      `  <Style id="placemark-${color.name.toLowerCase()}">\n` +
      `    <IconStyle>\n` +
      `      <Icon>\n` +
      `        <href>https://omaps.app/placemarks/placemark-${color.name.toLowerCase()}.png</href>\n` +
      `      </Icon>\n` +
      `    </IconStyle>\n` +
      `  </Style>`
  ).join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">\n` +
    `<Document>\n` +
    `  <name>${name}</name>\n` +
    `${kmlMarkerStyles}\n` +
    `${placemarks.join("\n")}\n` +
    `</Document>\n` +
    `</kml>`
  );
}

/**
 * Creates a JSZip instance containing all map data for a KMZ export.
 * @param {string} docName - The name for the main KML document
 * @returns {JSZip} The zip object ready for generation
 */
function generateFullKmzZip(docName) {
  const zip = new JSZip();
  const filesFolder = zip.folder("files");
  const networkLinks = [];
  let featureCounter = 0;

  const kmlGroups = {};
  const drawnPlacemarks = [];
  const importedPlacemarks = [];
  const stravaPlacemarks = [];

  const allLayers = [...editableLayers.getLayers(), ...importedItems.getLayers()];

  allLayers.forEach(function (layer) {
    const defaultName =
      layer instanceof L.Marker ? `Marker_${++featureCounter}` : `Path_${++featureCounter}`;
    const kmlSnippet = generateKmlForLayer(layer, defaultName);
    if (!kmlSnippet) return;

    switch (layer.pathType) {
      case "drawn":
        drawnPlacemarks.push(kmlSnippet);
        break;
      case "gpx":
      case "kml":
      case "geojson":
        importedPlacemarks.push(kmlSnippet);
        break;
      case "kmz":
        const originalPath = layer.originalKmzPath;
        if (originalPath && originalPath.toLowerCase() !== "doc.kml") {
          if (!kmlGroups[originalPath]) {
            kmlGroups[originalPath] = [];
          }
          kmlGroups[originalPath].push(kmlSnippet);
        } else {
          importedPlacemarks.push(kmlSnippet);
        }
        break;
    }
  });

  stravaActivitiesLayer.eachLayer(function (layer) {
    const defaultName = `Strava_Activity_${++featureCounter}`;
    const kmlSnippet = generateKmlForLayer(layer, defaultName);
    if (kmlSnippet) {
      stravaPlacemarks.push(kmlSnippet);
    }
  });

  Object.keys(kmlGroups).forEach((path) => {
    if (kmlGroups[path].length > 0) {
      const fileName = path.substring(path.lastIndexOf("/") + 1);
      const docName = fileName.replace(/\.kml$/i, "");
      filesFolder.file(fileName, createKmlDocument(docName, kmlGroups[path]));
      networkLinks.push({ name: docName, href: `files/${fileName}` });
    }
  });

  if (drawnPlacemarks.length > 0) {
    filesFolder.file("Drawn_Features.kml", createKmlDocument("Drawn Features", drawnPlacemarks));
    networkLinks.push({ name: "Drawn Features", href: "files/Drawn_Features.kml" });
  }

  if (importedPlacemarks.length > 0) {
    filesFolder.file(
      "Imported_Features.kml",
      createKmlDocument("Imported Features", importedPlacemarks)
    );
    networkLinks.push({ name: "Imported Features", href: "files/Imported_Features.kml" });
  }

  if (stravaPlacemarks.length > 0) {
    filesFolder.file(
      "Strava_Activities.kml",
      createKmlDocument("Strava Activities", stravaPlacemarks)
    );
    networkLinks.push({ name: "Strava Activities", href: "files/Strava_Activities.kml" });
  }

  preservedKmzFiles.forEach((file) => {
    const fileName = file.path.substring(file.path.lastIndexOf("/") + 1);
    if (!filesFolder.file(fileName)) {
      filesFolder.file(fileName, file.content);
      const docName = fileName.replace(/\.kml$/i, "");
      networkLinks.push({ name: docName, href: `files/${fileName}` });
    }
  });

  if (networkLinks.length > 0) {
    networkLinks.sort((a, b) => a.name.localeCompare(b.name));
    zip.file(
      "doc.kml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>${docName}</name>\n${networkLinks
        .map(
          (link) =>
            `  <NetworkLink>\n    <name>${link.name}</name>\n    <Link>\n      <href>${link.href}</href>\n    </Link>\n  </NetworkLink>`
        )
        .join("\n")}\n</Document>\n</kml>`
    );
  }
  return zip;
}

/**
 * Handles the final export and download of the KMZ file.
 */
function exportKmz() {
  const timestamp = generateTimestamp();
  const fileName = `Map_Export_${timestamp}.kmz`;
  const docName = `Map Export ${timestamp}`;

  const zip = generateFullKmzZip(docName);

  if (!zip.files["doc.kml"]) {
    return Swal.fire({
      title: "No Data to Export",
      text: "There are no items on the map to export.",
    });
  }

  zip
    .generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" })
    .then(function (content) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      Swal.fire({
        title: "Export Successful!",
        text: "All items have been exported to KMZ.",
        timer: 2000,
        showConfirmButton: false,
      });
    })
    .catch(function (error) {
      console.error("Error generating KMZ:", error);
      Swal.fire({
        title: "Export Error",
        text: `Failed to generate KMZ file: ${error.message}`,
      });
    });
}

/**
 * Properties to exclude from GeoJSON export.
 * Add any property names here that you don't want included in exported files.
 */
const GEOJSON_EXPORT_EXCLUDED_PROPERTIES = [
  "totalDistance", // Internal calculated distance - not needed in export
];

/**
 * Exports all map items to a GeoJSON file with color preservation.
 */
function exportGeoJson() {
  const features = [];

  // Collect all layers
  const allLayers = [...editableLayers.getLayers(), ...importedItems.getLayers()];

  // Add current route if exists
  if (currentRoutePath) {
    allLayers.push(currentRoutePath);
  }

  // Add Strava activities
  stravaActivitiesLayer.eachLayer((layer) => {
    allLayers.push(layer);
  });

  if (allLayers.length === 0) {
    return Swal.fire({
      title: "No Data to Export",
      text: "There are no items on the map to export.",
    });
  }

  // Convert each layer to GeoJSON
  allLayers.forEach((layer) => {
    try {
      const geojson = layer.toGeoJSON();

      // Skip if toGeoJSON didn't produce valid geometry
      if (!geojson || !geojson.geometry || !geojson.geometry.type) {
        console.warn("Skipping layer with invalid geometry:", layer);
        return;
      }

      // Extract full precision coordinates directly from layer
      if (layer instanceof L.Marker) {
        const ll = layer.getLatLng();
        geojson.geometry.coordinates = [ll.lng, ll.lat];
      } else if (layer instanceof L.Polygon) {
        const latlngs = layer.getLatLngs()[0];
        const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
        coords.push(coords[0]); // Close the polygon
        geojson.geometry.coordinates = [coords];
      } else if (layer instanceof L.Polyline) {
        let latlngs = layer.getLatLngs();
        while (Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
          latlngs = latlngs[0];
        }
        geojson.geometry.coordinates = latlngs.map((ll) => [ll.lng, ll.lat]);
      }

      // Get color information
      const colorName = layer.feature?.properties?.omColorName || "Red";
      const colorData =
        ORGANIC_MAPS_COLORS.find((c) => c.name === colorName) || ORGANIC_MAPS_COLORS[0];

      // Filter out excluded properties
      const filteredProperties = Object.keys(geojson.properties || {}).reduce((acc, key) => {
        if (!GEOJSON_EXPORT_EXCLUDED_PROPERTIES.includes(key)) {
          acc[key] = geojson.properties[key];
        }
        return acc;
      }, {});

      // Enhance properties with color data
      geojson.properties = {
        ...filteredProperties,
        omColorName: colorName, // For round-trip with our app
      };

      // Add standard GeoJSON styling for other tools
      if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
        geojson.properties.stroke = colorData.css;
        geojson.properties["stroke-width"] = 3;
        geojson.properties["stroke-opacity"] = 1;
      }
      if (layer instanceof L.Polygon) {
        geojson.properties.fill = colorData.css;
        geojson.properties["fill-opacity"] = 0.2;
      }

      if (layer instanceof L.Marker) {
        geojson.properties["marker-color"] = colorData.css;
      }

      // Ensure type: "Feature" is present
      geojson.type = "Feature";

      features.push(geojson);
    } catch (error) {
      console.error("Error converting layer to GeoJSON:", error, layer);
      // Skip this layer and continue with others
    }
  });

  // Create FeatureCollection
  const geojsonDoc = {
    type: "FeatureCollection",
    features: features,
  };

  // Generate filename with timestamp
  const fileName = generateTimestampedFilename("Map_Export", "geojson");

  // Download file
  downloadFile(fileName, JSON.stringify(geojsonDoc, null, 2));
  Swal.fire({
    title: "Export Successful!",
    text: "All items have been exported to GeoJSON.",
    timer: 2000,
    showConfirmButton: false,
  });
}

/**
 * Converts a Leaflet layer to a GPX string, supporting markers and paths with Organic Maps colors.
 * @param {L.Layer} layer - The layer to convert
 * @returns {string} The GPX file content as a string
 */
function toGpx(layer) {
  const name = layer.feature?.properties?.name || "Exported Feature";
  const description = layer.feature?.properties?.description || "";
  const colorName = layer.feature?.properties?.omColorName || "Red";
  const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
  const gpxColorHex = colorData ? colorData.css.substring(1).toUpperCase() : "E51B23";

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
    xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3"
    xmlns:gpx_style="http://www.topografix.com/GPX/gpx_style/0/2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1 https://www.topografix.com/GPX/1/1/gpx.xsd http://www.topografix.com/GPX/gpx_style/0/2 https://www.topografix.com/GPX/gpx_style/0/2/gpx_style.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 https://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd">`;

  let content = "";

  if (layer instanceof L.Polygon) {
    let latlngs = layer.getLatLngs()[0];

    // Close the polygon by adding the first point at the end
    const closedLatLngs = [...latlngs, latlngs[0]];

    const pathPoints = closedLatLngs
      .map((p) => {
        let pt = `<trkpt lat="${p.lat}" lon="${p.lng}">`;
        if (typeof p.alt !== "undefined" && p.alt !== null) {
          pt += `<ele>${p.alt}</ele>`;
        }
        pt += `</trkpt>`;
        return pt;
      })
      .join("\n      ");

    content = `
  <trk>
    <name>${name}</name>
    <extensions>
      <gpx_style:line>
        <gpx_style:color>${gpxColorHex}</gpx_style:color>
      </gpx_style:line>
    </extensions>
    <trkseg>
      ${pathPoints}
    </trkseg>
  </trk>`;
  } else if (layer instanceof L.Polyline) {
    let latlngs = layer.getLatLngs();
    while (latlngs.length > 0 && Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
      latlngs = latlngs[0];
    }

    const pathPoints = latlngs
      .map((p) => {
        let pt = `<trkpt lat="${p.lat}" lon="${p.lng}">`;
        if (typeof p.alt !== "undefined" && p.alt !== null) {
          pt += `<ele>${p.alt}</ele>`;
        }
        pt += `</trkpt>`;
        return pt;
      })
      .join("\n      ");

    content = `
  <trk>
    <name>${name}</name>
    <extensions>
      <gpx_style:line>
        <gpx_style:color>${gpxColorHex}</gpx_style:color>
      </gpx_style:line>
    </extensions>
    <trkseg>
      ${pathPoints}
    </trkseg>
  </trk>`;
  } else if (layer instanceof L.Marker) {
    const latlng = layer.getLatLng();
    content = `
  <wpt lat="${latlng.lat}" lon="${latlng.lng}">
    <name>${name}</name>${description ? `\n    <desc>${description}</desc>` : ""}
  </wpt>`;
  }

  const footer = "\n</gpx>";
  return header + content + footer;
}

/**
 * Finds a color name from a KML style property.
 * @param {object} properties - The feature properties
 * @returns {string} The color name or "Red" as default
 */
function getColorNameFromKmlStyle(properties) {
  // Case 1: styleUrl (e.g., #placemark-red) for markers
  if (properties.styleUrl) {
    const styleId = properties.styleUrl.substring(1).toLowerCase(); // -> "placemark-red"
    const colorMatch = ORGANIC_MAPS_COLORS.find(
      (c) => `placemark-${c.name.toLowerCase()}` === styleId
    );
    if (colorMatch) return colorMatch.name;
  }

  // Case 2: Inline style color from toGeoJSON (converted to #RRGGBBAA format)
  if (properties.stroke) {
    const cssColor = properties.stroke.substring(0, 7).toLowerCase(); // Get #RRGGBB
    const colorMatch = ORGANIC_MAPS_COLORS.find((c) => c.css.toLowerCase() === cssColor);
    if (colorMatch) return colorMatch.name;
  }
  return "Red";
}

/**
 * Adds GeoJSON data to the map, applying appropriate styles.
 * @param {object} geoJsonData - The GeoJSON data to add
 * @param {string} fileType - The file type ('gpx', 'kml', 'kmz')
 * @param {string|null} originalPath - The original path for KMZ files
 * @returns {L.GeoJSON} The created layer group
 */
function addGeoJsonToMap(geoJsonData, fileType, originalPath = null) {
  const targetGroup = importedItems; // All imported files go to the same group

  const layerGroup = L.geoJSON(geoJsonData, {
    style: (feature) => {
      const isKmlBased = fileType === "kml" || fileType === "kmz";
      // For GPX, color is pre-enriched. For KML/KMZ, it's parsed here.
      const colorName =
        feature.properties.omColorName ||
        (isKmlBased ? getColorNameFromKmlStyle(feature.properties) : "Red");

      const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
      const color = colorData ? colorData.css : colorScheme.imported.primary;
      return { ...STYLE_CONFIG.path.default, color: color };
    },
    onEachFeature: (feature, layer) => {
      const isKmlBased = fileType === "kml" || fileType === "kmz";
      layer.feature.properties.omColorName =
        feature.properties.omColorName ||
        (isKmlBased ? getColorNameFromKmlStyle(feature.properties) : "Red");

      layer.pathType = fileType; // Use the specific fileType ('kmz', 'kml', 'gpx')
      if (fileType === "kmz" && originalPath) {
        layer.originalKmzPath = originalPath; // Store the source file path
      }

      layer.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        selectItem(layer);
      });
      if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
      }
    },
    pointToLayer: (feature, latlng) => {
      const isKmlBased = fileType === "kml" || fileType === "kmz";
      const colorName =
        feature.properties.omColorName ||
        (isKmlBased ? getColorNameFromKmlStyle(feature.properties) : "Red");

      const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
      const color = colorData ? colorData.css : colorScheme.imported.primary;
      const marker = L.marker(latlng, {
        icon: createMarkerIcon(color, STYLE_CONFIG.marker.default.opacity),
      });
      marker.feature = feature;
      return marker;
    },
  });

  layerGroup.eachLayer((layer) => {
    targetGroup.addLayer(layer);
  });

  updateElevationToggleIconColor();
  updateDrawControlStates();
  updateOverviewList();
  return layerGroup;
}

/**
 * Handles the loading and processing of a KMZ file.
 * @param {File} file - The KMZ file to process
 */
async function handleKmzFile(file) {
  if (!file) return;

  const zip = new JSZip();
  const justImportedLayers = L.featureGroup();

  try {
    const loadedZip = await zip.loadAsync(file);
    const kmlFiles = loadedZip.filter(
      (relativePath, file) => !file.dir && relativePath.toLowerCase().endsWith(".kml")
    );

    if (kmlFiles.length === 0) {
      return Swal.fire({
        title: "No KML Data",
        text: "No KML files could be found within the KMZ archive.",
      });
    }

    // Process all KML files concurrently
    await Promise.all(
      kmlFiles.map(async (kmlFile) => {
        const content = await kmlFile.async("text");
        const kmlDom = new DOMParser().parseFromString(content, "text/xml");
        const geojsonData = toGeoJSON.kml(kmlDom, { styles: true });

        if (geojsonData?.features?.length > 0) {
          const newLayer = addGeoJsonToMap(geojsonData, "kmz", kmlFile.name);
          if (newLayer) {
            justImportedLayers.addLayer(newLayer);
          }
        } else if (kmlFile.name.toLowerCase() !== "doc.kml") {
          preservedKmzFiles.push({ path: kmlFile.name, content: content });
        }
      })
    );

    if (justImportedLayers.getLayers().length > 0) {
      const bounds = justImportedLayers.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds);
      }
    } else if (preservedKmzFiles.length > 0) {
      Swal.fire({
        title: "KMZ Structure Loaded",
        text: "Empty KML files were found and will be preserved on export.",
        timer: 2500,
        showConfirmButton: false,
      });
    } else {
      Swal.fire({
        title: "KMZ Loaded (No Features)",
        text: "No geographical features or preservable KML files found.",
      });
    }
  } catch (error) {
    console.error("Error loading or processing KMZ file:", error);
    Swal.fire({
      title: "KMZ Read Error",
      text: `Could not read the file: ${error.message}`,
    });
  }
}
