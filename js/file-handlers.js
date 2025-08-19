// Generates a kml <placemark> for a given leaflet layer.
// @param {L.Layer} layer - The layer to convert.
// @param {string} defaultname - A fallback name.
// @param {string} defaultdescription - A fallback description.
// @returns {string|null} The kml placemark string or null.
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
    if (layer instanceof L.Polyline) {
      latlngs = layer.getLatLngs();
      while (latlngs.length > 0 && Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
        latlngs = latlngs[0];
      }
      coords = latlngs
        .map((p) => `${p.lng},${p.lat},${typeof p.alt === "number" ? p.alt : 0}`)
        .join(" ");
    } else {
      latlngs = layer.getLatLngs()[0];
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

// --- REFACTORED: New global function for KML generation ---
/**
 * Creates a complete, pretty-printed KML document string from a name and an array of placemarks.
 * @param {string} name The name for the <Document>.
 * @param {Array<string>} placemarks An array of pre-formatted KML <Placemark> strings.
 * @returns {string} The full KML document as a string.
 */
function createKmlDocument(name, placemarks) {
  // This logic generates all the shared <Style> tags for markers.
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

  // This is the main template for the entire KML file.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">\n` +
    `<Document>\n` +
    `  <name>${name}</name>\n` +
    `${kmlMarkerStyles}\n` +
    `  ${placemarks.join("\n")}\n` +
    `</Document>\n` +
    `</kml>`
  );
}

// --- REFACTORED: This function no longer contains the KML creation logic ---
// Creates a jszip instance containing all map data for a kmz export.
// @param {string} docName - The name for the main KML document.
// @returns {JSZip} The zip object ready for generation.
function generateFullKmzZip(docName) {
  const zip = new JSZip();
  const filesFolder = zip.folder("files");
  const networkLinks = [];
  let featureCounter = 0;

  const kmlGroups = {};
  const drawnPlacemarks = [];
  const importedPlacemarks = [];

  editableLayers.eachLayer(function (layer) {
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

  Object.keys(kmlGroups).forEach((path) => {
    if (kmlGroups[path].length > 0) {
      const fileName = path.substring(path.lastIndexOf("/") + 1);
      const docName = fileName.replace(/\.kml$/i, "");
      // Call the new global function
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

// Handles the final export and download of the kmz file.
function exportKmz() {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now
    .getDate()
    .toString()
    .padStart(2, "0")}${now.getHours().toString().padStart(2, "0")}${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
  const fileName = `Map_Export_${timestamp}.kmz`;
  const docName = `Map Export ${timestamp}`; // Create the document name from the timestamp

  const zip = generateFullKmzZip(docName); // Pass the document name to the zip generator

  if (Object.keys(zip.files).length === 0) {
    return Swal.fire({
      icon: "info",
      title: "No Data to Export",
      text: "There are no drawn or imported paths on the map to export.",
    });
  }

  zip
    .generateAsync({ type: "blob" })
    .then(function (content) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      Swal.fire({
        icon: "success",
        title: "Export Successful!",
        text: "All items have been exported to KMZ.",
        timer: 2000,
        showConfirmButton: false,
      });
    })
    .catch(function (error) {
      console.error("Error generating KMZ:", error);
      Swal.fire({
        icon: "error",
        title: "Export Error",
        text: `Failed to generate KMZ file: ${error.message}`,
      });
    });
}

// Converts a leaflet layer to a gpx string, supporting markers and paths with OM colors.
// @param {L.Layer} layer - The layer to convert.
// @returns {string} The gpx file content as a string.
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

  if (layer instanceof L.Polyline) {
    let latlngs = layer.getLatLngs();
    // Flatten for MultiPolyline
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
    // For markers, GPX export does not include color. Name and description are used.
    content = `
  <wpt lat="${latlng.lat}" lon="${latlng.lng}">
    <name>${name}</name>${description ? `\n    <desc>${description}</desc>` : ""}
  </wpt>`;
  }

  const footer = "\n</gpx>";
  return header + content + footer;
}

// Helper function to find a color name from a KML style property
function getColorNameFromKmlStyle(properties) {
  // Case 1: styleUrl (e.g., #placemark-red) - for markers
  if (properties.styleUrl) {
    const styleId = properties.styleUrl.substring(1).toLowerCase(); // -> "placemark-red"
    const colorMatch = ORGANIC_MAPS_COLORS.find(
      (c) => `placemark-${c.name.toLowerCase()}` === styleId
    );
    if (colorMatch) return colorMatch.name;
  }

  // Case 2: Inline style color from toGeoJSON (KML <LineStyle><color>AABBGGRR</color>)
  // toGeoJSON converts this to an RGBA hex string: #RRGGBBAA
  if (properties.stroke) {
    const cssColor = properties.stroke.substring(0, 7).toLowerCase(); // Get #RRGGBB
    const colorMatch = ORGANIC_MAPS_COLORS.find((c) => c.css.toLowerCase() === cssColor);
    if (colorMatch) return colorMatch.name;
  }
  return "Red"; // Default color if none found
}

// Adds GeoJSON data to the map, applying appropriate styles.
function addGeoJsonToMap(geoJsonData, fileType, originalPath = null) {
  let simplificationHappened = false;

  // Use the new simplification logic with the config for IMPORTED PATHS.
  if (enablePathSimplification) {
    geoJsonData.features.forEach((feature) => {
      if (feature.geometry && feature.geometry.coordinates) {
        const { coordinates, type: geomType } = feature.geometry;
        // Pass the specific config for paths
        const result = simplifyPath(coordinates, geomType, pathSimplificationConfig);
        if (result.simplified) {
          feature.geometry.coordinates = result.coords;
          simplificationHappened = true;
        }
      }
    });
  }

  if (simplificationHappened) {
    Swal.fire({
      toast: true,
      position: "center",
      icon: "info",
      title: "Path Optimized",
      text: "The imported path was simplified for better performance.",
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
    });
  }

  const targetGroup = fileType === "kmz" ? kmzLayer : importedItems;

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
      // Assign the color name found during parsing (or default)
      layer.feature.properties.omColorName =
        feature.properties.omColorName ||
        (isKmlBased ? getColorNameFromKmlStyle(feature.properties) : "Red");

      layer.pathType = fileType; // Use the specific fileType ('kmz', 'kml', 'gpx')
      if (fileType === "kmz" && originalPath) {
        layer.originalKmzPath = originalPath; // Store the source file path
      }

      editableLayers.addLayer(layer);
      layer.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        selectItem(layer);
      });
      // Check if the layer is a path-like object
      if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
        // Distance label creation was removed from here.
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
        icon: createSvgIcon(color, STYLE_CONFIG.marker.default.opacity),
      });
      marker.feature = feature; // ensure feature is attached for selection logic
      return marker;
    },
  });

  // --- BUG FIX: Add individual layers to the target group instead of the L.GeoJSON group ---
  // This flattens the layer structure, making group-level operations more reliable.
  layerGroup.eachLayer((layer) => {
    targetGroup.addLayer(layer);
  });
  // --- END BUG FIX ---

  updateElevationToggleIconColor();
  updateDrawControlStates();
  updateOverviewList();
  return layerGroup;
}

// --- REFACTORED: Now uses modern async/await for better readability ---
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
        icon: "info",
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

    // Provide feedback after all files are processed
    if (justImportedLayers.getLayers().length > 0) {
      const bounds = justImportedLayers.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds);
      }
    } else if (preservedKmzFiles.length > 0) {
      Swal.fire({
        icon: "success",
        title: "KMZ Structure Loaded",
        text: "Empty KML files were found and will be preserved on export.",
        timer: 2500,
        showConfirmButton: false,
      });
    } else {
      Swal.fire({
        icon: "warning",
        title: "KMZ Loaded (No Features)",
        text: "No geographical features or preservable KML files found.",
      });
    }
  } catch (error) {
    console.error("Error loading or processing KMZ file:", error);
    Swal.fire({
      icon: "error",
      title: "KMZ Read Error",
      text: `Could not read the file: ${error.message}`,
    });
  }
}
