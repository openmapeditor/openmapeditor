// ===================================================================================
// --- ROUTING FUNCTIONALITY ---
// ===================================================================================

function initializeRouting() {
  let routingControl,
    startMarker,
    endMarker,
    viaMarker,
    currentStartLatLng,
    currentEndLatLng,
    currentViaLatLng,
    routePointSelectionMode = null,
    customCursorStart,
    customCursorEnd,
    customCursorVia;

  const geocoder = new GeoSearch.OpenStreetMapProvider();

  // Define router options
  const mapboxRouter = L.Routing.mapbox(mapboxAccessToken);
  const osrmRouter = L.Routing.osrmv1({
    serviceUrl: "https://router.project-osrm.org/route/v1",
    profile: "driving", // This will be updated when 'Get Route' is clicked
  });

  // --- FIX START: Encapsulate routing control creation in a function ---
  function setupRoutingControl(provider) {
    // If an old control exists, remove it from the map
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }

    // Select the appropriate router engine
    const router = provider === "osrm" ? osrmRouter : mapboxRouter;

    // Create and configure the new routing control
    routingControl = L.Routing.control({
      waypoints: [],
      router: router,
      lineOptions: {
        styles: [{ opacity: 0, weight: 0 }],
      },
      routeWhileDragging: false,
      show: false,
      addWaypoints: false,
      createMarker: () => null,
    }).addTo(map);

    // Re-attach the 'routesfound' event listener to the new control instance
    routingControl.on("routesfound", (e) => {
      const routes = e.routes;
      if (routes.length > 0) {
        const route = routes[0];
        let processedCoordinates = route.coordinates;

        if (enablePathSimplification) {
          const geoJsonCoords = processedCoordinates.map((latlng) => [latlng.lng, latlng.lat]);
          const simplificationResult = simplifyPath(
            geoJsonCoords,
            "LineString",
            routeSimplificationConfig
          );
          if (simplificationResult.simplified) {
            processedCoordinates = simplificationResult.coords.map((c) => L.latLng(c[1], c[0]));
          }
        }

        const summaryContainer = document.getElementById("routing-summary-container");
        if (route.summary && summaryContainer) {
          const totalDistanceKm = (route.summary.totalDistance / 1000).toFixed(2);

          function formatDuration(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            let parts = [];
            if (h > 0) parts.push(h + " h");
            if (m > 0 || h === 0) parts.push(m + " m");
            return parts.join(" ");
          }
          const formattedTime = formatDuration(route.summary.totalTime);

          summaryContainer.innerHTML = `<b>Distance:</b> ${totalDistanceKm} km &nbsp;&nbsp; <b>Time:</b> ${formattedTime}`;
          summaryContainer.style.display = "block";
        }

        const directionsPanel = document.getElementById("directions-panel");
        const directionsList = document.getElementById("directions-list");
        directionsList.innerHTML = "";
        directionsPanel.style.display = "block";

        if (route.instructions && route.instructions.length > 0) {
          route.instructions.forEach((instr) => {
            const item = document.createElement("div");
            item.className = "direction-item";
            const distanceM = instr.distance;
            let distanceStr = "";
            if (distanceM > 999) {
              distanceStr = `(${(distanceM / 1000).toFixed(1)} km)`;
            } else if (distanceM > 0) {
              distanceStr = `(${Math.round(distanceM)} m)`;
            }
            item.textContent = `${instr.text} ${distanceStr}`;
            directionsList.appendChild(item);
          });
        } else {
          directionsList.innerHTML =
            '<div class="direction-item">No turn-by-turn directions available.</div>';
        }

        map.fitBounds(L.latLngBounds(processedCoordinates), { padding: [50, 50] });

        if (currentRoutePath) {
          if (globallySelectedItem === currentRoutePath) {
            deselectCurrentItem();
          }
          editableLayers.removeLayer(currentRoutePath);
          drawnItems.removeLayer(currentRoutePath);
          map.removeLayer(currentRoutePath);
        }

        const routeColorName = "DeepPurple";
        const routeColor = ORGANIC_MAPS_COLORS.find((c) => c.name === routeColorName).css;
        const newRoutePath = L.polyline(processedCoordinates, {
          ...STYLE_CONFIG.path.default,
          color: routeColor,
        });

        newRoutePath.feature = {
          properties: {
            name: route.name || "Calculated Route",
            omColorName: routeColorName,
            totalDistance: route.summary.totalDistance,
          },
        };
        newRoutePath.pathType = "route";

        newRoutePath.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          selectItem(newRoutePath);
        });

        editableLayers.addLayer(newRoutePath);
        drawnItems.addLayer(newRoutePath);
        newRoutePath.addTo(map);
        currentRoutePath = newRoutePath;

        updateOverviewList();
        updateDrawControlStates();

        selectItem(newRoutePath);
        saveRouteBtn.disabled = false;
      }
    });

    // --- MODIFIED: Add generalized routing error handler ---
    routingControl.on("routingerror", (e) => {
      console.error("Routing error:", e.error); // Keep the console log for debugging

      // Check for specific API error messages within the XHR response first
      if (e.error && e.error.target && e.error.target.responseText) {
        try {
          const apiResponse = JSON.parse(e.error.target.responseText);
          if (apiResponse && apiResponse.message) {
            Swal.fire({
              icon: "error",
              title: "Routing Service Error", // Generic title
              text: apiResponse.message, // Show the detailed error from the API
            });
            return; // Exit after showing the specific error
          }
        } catch (err) {
          console.warn("Could not parse API error response:", err);
        }
      }

      // Fallback to library-specific error statuses like "NoRoute"
      if (e.error && e.error.status === "NoRoute") {
        Swal.fire({
          icon: "warning",
          title: "No Route Found",
          text: "A route could not be found between the specified locations. Please check if the locations are accessible by the selected mode of transport.",
        });
      }
      // Add a generic fallback for other types of errors (e.g., network down)
      else {
        Swal.fire({
          icon: "error",
          title: "Routing Unavailable",
          text: "The routing service could not be reached or returned an unknown error. Please try again later.",
        });
      }
    });
    // --- END MODIFIED ---
  }
  // --- FIX END ---

  // Read saved provider or default to mapbox and initialize the control
  const savedProvider = localStorage.getItem("routingProvider") || "mapbox";
  setupRoutingControl(savedProvider); // MODIFIED: Use the new setup function

  const routingPanelContainer = document.getElementById("routing-panel");
  L.DomEvent.disableClickPropagation(routingPanelContainer);
  L.DomEvent.disableScrollPropagation(routingPanelContainer);

  const startInput = document.getElementById("route-start");
  const endInput = document.getElementById("route-end");
  const viaInput = document.getElementById("route-via");
  const currentLocationBtn = document.getElementById("use-current-location");
  const endCurrentLocationBtn = document.getElementById("use-current-location-end");
  const getRouteBtn = document.getElementById("get-route-btn");
  saveRouteBtn = document.getElementById("save-route-btn");
  saveRouteBtn.disabled = true;
  const profileSelect = document.getElementById("route-profile");
  const selectStartBtn = document.getElementById("select-start-on-map");
  const selectEndBtn = document.getElementById("select-end-on-map");
  const selectViaBtn = document.getElementById("select-via-on-map");
  const clearViaBtn = document.getElementById("clear-via-stop");
  customCursorStart = document.getElementById("custom-cursor-start");
  customCursorEnd = document.getElementById("custom-cursor-end");
  customCursorVia = document.getElementById("custom-cursor-via");

  const directionsHeader = document.getElementById("directions-panel-header");
  const directionsPanel = document.getElementById("directions-panel");
  directionsHeader.addEventListener("click", () => {
    directionsPanel.classList.toggle("collapsed");
  });

  const setupAutocomplete = (inputEl, suggestionsEl, latLngCallback) => {
    let debounceTimeout;
    inputEl.addEventListener("input", () => {
      clearTimeout(debounceTimeout);
      const query = inputEl.value;
      if (query.length < 3) {
        suggestionsEl.innerHTML = "";
        suggestionsEl.style.display = "none";
        return;
      }
      debounceTimeout = setTimeout(async () => {
        const results = await geocoder.search({ query });
        suggestionsEl.innerHTML = "";
        if (results && results.length > 0) {
          suggestionsEl.style.display = "block";
          results.forEach((result) => {
            const item = document.createElement("div");
            item.className = "autocomplete-suggestion-item";
            item.textContent = result.label;
            item.addEventListener("click", () => {
              inputEl.value = result.label;
              latLngCallback(L.latLng(result.y, result.x));
              suggestionsEl.innerHTML = "";
              suggestionsEl.style.display = "none";
            });
            suggestionsEl.appendChild(item);
          });
        } else {
          suggestionsEl.style.display = "none";
        }
      }, 300);
    });

    document.addEventListener("click", (e) => {
      if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
        suggestionsEl.style.display = "none";
      }
    });
  };

  setupAutocomplete(startInput, document.getElementById("route-start-suggestions"), (latlng) => {
    currentStartLatLng = latlng;
    startInput.style.color = "var(--color-black)";
    if (startMarker) {
      startMarker.setLatLng(latlng);
    } else {
      startMarker = L.marker(latlng, {
        icon: createSvgIcon(routingColorStart, 1),
        title: "Start",
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(startMarker, "start");
    }
  });

  setupAutocomplete(endInput, document.getElementById("route-end-suggestions"), (latlng) => {
    currentEndLatLng = latlng;
    endInput.style.color = "var(--color-black)";
    if (endMarker) {
      endMarker.setLatLng(latlng);
    } else {
      endMarker = L.marker(latlng, {
        icon: createSvgIcon(routingColorEnd, 1),
        title: "End",
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(endMarker, "end");
    }
  });

  setupAutocomplete(viaInput, document.getElementById("route-via-suggestions"), (latlng) => {
    currentViaLatLng = latlng;
    viaInput.style.color = "var(--color-black)";
    if (viaMarker) {
      viaMarker.setLatLng(latlng);
    } else {
      viaMarker = L.marker(latlng, {
        icon: createSvgIcon(routingColorVia, 1),
        title: "Via",
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(viaMarker, "via");
    }
  });

  function addDragHandlersToRoutingMarker(marker, type) {
    const isStart = type === "start";
    const isVia = type === "via";
    const input = isStart ? startInput : isVia ? viaInput : endInput;

    marker.on("dragend", () => {
      const newLatLng = marker.getLatLng();

      if (isStart) {
        currentStartLatLng = newLatLng;
      } else if (isVia) {
        currentViaLatLng = newLatLng;
      } else {
        currentEndLatLng = newLatLng;
      }

      input.value = `${newLatLng.lat.toFixed(5)}, ${newLatLng.lng.toFixed(5)}`;
      input.style.color = "var(--color-black)";

      if (startMarker && endMarker) {
        getRouteBtn.click();
      }
    });
  }

  const clearRouting = () => {
    if (routingControl) {
      routingControl.setWaypoints([]);
    }
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    if (viaMarker) map.removeLayer(viaMarker);
    startMarker = null;
    endMarker = null;
    viaMarker = null;

    if (document.getElementById("route-via")) document.getElementById("route-via").value = "";
    currentViaLatLng = null;

    const summaryContainer = document.getElementById("routing-summary-container");
    if (summaryContainer) {
      summaryContainer.innerHTML = "";
      summaryContainer.style.display = "none";
    }

    const directionsPanel = document.getElementById("directions-panel");
    if (directionsPanel) {
      directionsPanel.style.display = "none";
      const directionsList = document.getElementById("directions-list");
      if (directionsList) directionsList.innerHTML = "";
    }

    if (currentRoutePath) {
      if (globallySelectedItem === currentRoutePath) {
        deselectCurrentItem();
      }
      editableLayers.removeLayer(currentRoutePath);
      drawnItems.removeLayer(currentRoutePath);
      map.removeLayer(currentRoutePath);
      currentRoutePath = null;
      updateOverviewList();
      updateDrawControlStates();
    }
    if (saveRouteBtn) saveRouteBtn.disabled = true;
  };

  const updateRoutingPoint = (latlng, type) => {
    const locationString = `Current Location (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;

    if (type === "start") {
      currentStartLatLng = latlng;
      startInput.value = locationString;

      if (startMarker) {
        startMarker.setLatLng(latlng);
      } else {
        startMarker = L.marker(latlng, {
          icon: createSvgIcon(routingColorStart, 1),
          title: "Start (Current Location)",
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(startMarker, "start");
      }
    } else {
      currentEndLatLng = latlng;
      endInput.value = locationString;

      if (endMarker) {
        endMarker.setLatLng(latlng);
      } else {
        endMarker = L.marker(latlng, {
          icon: createSvgIcon(routingColorEnd, 1),
          title: "End (Current Location)",
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(endMarker, "end");
      }
    }
    exitRoutePointSelectionMode();
  };

  const handleRoutingLocation = (type) => {
    const onLocationAquired = (latlng) => {
      if (!latlng || typeof latlng.lat !== "number" || typeof latlng.lng !== "number") {
        Swal.fire({
          icon: "error",
          title: "Location Error",
          text: "Could not retrieve a valid location.",
        });
        return;
      }
      updateRoutingPoint(latlng, type);
      map.flyTo(latlng, map.getZoom() < 16 ? 16 : map.getZoom());
    };

    const isLocateActive = locateControl.getContainer()?.classList.contains("locate-active");

    if (isLocateActive) {
      locateControl.stop();
    }

    map
      .locate()
      .once("locationfound", (e) => onLocationAquired(e.latlng))
      .once("locationerror", (e) => {
        Swal.fire({ icon: "error", title: "Location Error", text: e.message });
      });
  };

  currentLocationBtn.addEventListener("click", (e) => {
    L.DomEvent.stop(e);
    handleRoutingLocation("start");
  });

  endCurrentLocationBtn.addEventListener("click", (e) => {
    L.DomEvent.stop(e);
    handleRoutingLocation("end");
  });

  startInput.addEventListener("input", () => {
    if (startInput.value.indexOf("Current Location") === -1) {
      currentStartLatLng = null;
    }
  });

  endInput.addEventListener("input", () => {
    if (endInput.value.indexOf("Current Location") === -1) {
      currentEndLatLng = null;
    }
  });

  function updateCustomCursorPosition(e) {
    if (!routePointSelectionMode) return;

    const mapContainer = map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    const cursorEl =
      routePointSelectionMode === "start"
        ? customCursorStart
        : routePointSelectionMode === "via"
        ? customCursorVia
        : customCursorEnd;

    const x = e.clientX - mapRect.left;
    const y = e.clientY - mapRect.top;

    cursorEl.style.left = `${x}px`;
    cursorEl.style.top = `${y}px`;
  }

  const enterRoutePointSelectionMode = (mode, e) => {
    exitRoutePointSelectionMode();

    if (!mode) return;

    if (mode === "start" && startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
    }
    if (mode === "end" && endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }
    if (mode === "via" && viaMarker) {
      map.removeLayer(viaMarker);
      viaMarker = null;
    }

    routePointSelectionMode = mode;
    document.body.classList.add("route-point-select-mode");
    selectStartBtn.classList.toggle("active", mode === "start");
    selectEndBtn.classList.toggle("active", mode === "end");
    selectViaBtn.classList.toggle("active", mode === "via");

    if (mode === "start") {
      customCursorStart.style.display = "block";
    } else if (mode === "end") {
      customCursorEnd.style.display = "block";
    } else if (mode === "via") {
      customCursorVia.style.display = "block";
    }

    document.addEventListener("mousemove", updateCustomCursorPosition);

    if (e) {
      updateCustomCursorPosition(e);
    }
  };

  const exitRoutePointSelectionMode = () => {
    routePointSelectionMode = null;
    document.body.classList.remove("route-point-select-mode");
    selectStartBtn.classList.remove("active");
    selectEndBtn.classList.remove("active");
    selectViaBtn.classList.remove("active");

    customCursorStart.style.display = "none";
    customCursorEnd.style.display = "none";
    customCursorVia.style.display = "none";
    document.removeEventListener("mousemove", updateCustomCursorPosition);
  };

  selectStartBtn.addEventListener("click", (e) => {
    L.DomEvent.stop(e);
    enterRoutePointSelectionMode(routePointSelectionMode === "start" ? null : "start", e);
  });

  selectEndBtn.addEventListener("click", (e) => {
    L.DomEvent.stop(e);
    enterRoutePointSelectionMode(routePointSelectionMode === "end" ? null : "end", e);
  });

  selectViaBtn.addEventListener("click", (e) => {
    L.DomEvent.stop(e);
    enterRoutePointSelectionMode(routePointSelectionMode === "via" ? null : "via", e);
  });

  clearViaBtn.addEventListener("click", (e) => {
    L.DomEvent.stop(e);
    if (viaMarker) {
      map.removeLayer(viaMarker);
      viaMarker = null;
    }
    viaInput.value = "";
    currentViaLatLng = null;
    // If a route already exists, recalculate it
    if (startMarker && endMarker) {
      getRouteBtn.click();
    }
  });

  map.on("click", (e) => {
    if (routePointSelectionMode) {
      const latlng = e.latlng;
      const input =
        routePointSelectionMode === "start"
          ? startInput
          : routePointSelectionMode === "via"
          ? viaInput
          : endInput;
      input.value = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;

      if (routePointSelectionMode === "start") {
        currentStartLatLng = latlng;
        startInput.style.color = "var(--color-black)";
        if (startMarker) {
          startMarker.setLatLng(latlng);
        } else {
          startMarker = L.marker(latlng, {
            icon: createSvgIcon(routingColorStart, 1),
            title: "Start",
            draggable: true,
          }).addTo(map);
          addDragHandlersToRoutingMarker(startMarker, "start");
        }
      } else if (routePointSelectionMode === "via") {
        currentViaLatLng = latlng;
        viaInput.style.color = "var(--color-black)";
        if (viaMarker) {
          viaMarker.setLatLng(latlng);
        } else {
          viaMarker = L.marker(latlng, {
            icon: createSvgIcon(routingColorVia, 1),
            title: "Via",
            draggable: true,
          }).addTo(map);
          addDragHandlersToRoutingMarker(viaMarker, "via");
        }
      } else {
        currentEndLatLng = latlng;
        endInput.style.color = "var(--color-black)";
        if (endMarker) {
          endMarker.setLatLng(latlng);
        } else {
          endMarker = L.marker(latlng, {
            icon: createSvgIcon(routingColorEnd, 1),
            title: "End",
            draggable: true,
          }).addTo(map);
          addDragHandlersToRoutingMarker(endMarker, "end");
        }
      }
      exitRoutePointSelectionMode();
    }
  });

  getRouteBtn.addEventListener("click", async () => {
    saveRouteBtn.disabled = true;
    routingControl.setWaypoints([]);

    const startQuery = startInput.value;
    const endQuery = endInput.value;
    const viaQuery = viaInput.value;

    if (!startQuery || !endQuery) {
      return Swal.fire({
        icon: "warning",
        title: "Missing Information",
        text: "Please provide both a start and end location.",
      });
    }

    const selectedProfile = profileSelect.value; // "driving", "bike", "foot"

    const providerMap = {
      mapbox: "Mapbox",
      osrm: "OSRM",
    };
    const currentProvider = localStorage.getItem("routingProvider") || "mapbox";
    const providerDisplayName = providerMap[currentProvider] || currentProvider;
    console.log(`Fetching route from: ${providerDisplayName}`);

    if (currentProvider === "mapbox") {
      let mapboxProfile;
      // Translate UI values to Mapbox API values
      switch (selectedProfile) {
        case "bike":
          mapboxProfile = "cycling";
          break;
        case "foot":
          mapboxProfile = "walking";
          break;
        default: // "driving"
          mapboxProfile = "driving";
      }
      // --- FIX: Remove the "mapbox/" prefix. The library adds it automatically.
      routingControl.getRouter().options.profile = "mapbox/" + mapboxProfile;
    } else {
      // OSRM
      // OSRM profiles match our select values directly
      routingControl.getRouter().options.profile = selectedProfile;
    }

    try {
      const parseLatLng = (query) => {
        const parts = query.split(/[,; ]+/);
        if (parts.length === 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) return { y: lat, x: lng };
        }
        return null;
      };

      const createLocationPromise = (type) => {
        return new Promise((resolve, reject) => {
          const isLocateActive = locateControl.getContainer()?.classList.contains("locate-active");

          if (isLocateActive) {
            locateControl.stop();
          }

          map
            .locate()
            .once("locationfound", (e) => {
              const latlng = e.latlng;
              updateRoutingPoint(latlng, type);
              resolve({ y: latlng.lat, x: latlng.lng });
            })
            .once("locationerror", (e) => {
              reject(new Error(`Could not get current location: ${e.message}`));
            });
        });
      };

      let startPromise;
      if (startQuery.includes("Current Location")) {
        startPromise = createLocationPromise("start");
      } else if (currentStartLatLng) {
        startPromise = Promise.resolve({
          y: currentStartLatLng.lat,
          x: currentStartLatLng.lng,
        });
      } else {
        const startCoords = parseLatLng(startQuery);
        startPromise = startCoords
          ? Promise.resolve(startCoords)
          : geocoder.search({ query: startQuery });
      }

      let endPromise;
      if (endQuery.includes("Current Location")) {
        endPromise = createLocationPromise("end");
      } else if (currentEndLatLng) {
        endPromise = Promise.resolve({
          y: currentEndLatLng.lat,
          x: currentEndLatLng.lng,
        });
      } else {
        const endCoords = parseLatLng(endQuery);
        endPromise = endCoords ? Promise.resolve(endCoords) : geocoder.search({ query: endQuery });
      }

      let viaPromise = Promise.resolve(null); // Default to null if no via point
      if (viaQuery) {
        if (currentViaLatLng) {
          viaPromise = Promise.resolve({ y: currentViaLatLng.lat, x: currentViaLatLng.lng });
        } else {
          const viaCoords = parseLatLng(viaQuery);
          viaPromise = viaCoords
            ? Promise.resolve(viaCoords)
            : geocoder.search({ query: viaQuery });
        }
      }

      const [startResult, endResult, viaResult] = await Promise.all([
        startPromise,
        endPromise,
        viaPromise,
      ]);

      const start = Array.isArray(startResult) ? startResult[0] : startResult;
      const end = Array.isArray(endResult) ? endResult[0] : endResult;
      const via = Array.isArray(viaResult) ? viaResult[0] : viaResult;

      if (!start || !end) {
        return Swal.fire({
          icon: "error",
          title: "Location Not Found",
          text: "Could not find one or both locations. Please be more specific.",
        });
      }

      const startWp = L.latLng(start.y, start.x);
      const endWp = L.latLng(end.y, end.x);
      let viaWp = null;
      if (via) {
        viaWp = L.latLng(via.y, via.x);
        currentViaLatLng = viaWp;
      }

      if (startMarker) {
        startMarker.setLatLng(startWp);
      } else {
        startMarker = L.marker(startWp, {
          icon: createSvgIcon(routingColorStart, 1),
          title: `Start: ${start.label || startInput.value}`,
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(startMarker, "start");
      }

      if (endMarker) {
        endMarker.setLatLng(endWp);
      } else {
        endMarker = L.marker(endWp, {
          icon: createSvgIcon(routingColorEnd, 1),
          title: `End: ${end.label || endInput.value}`,
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(endMarker, "end");
      }

      if (viaWp) {
        if (viaMarker) {
          viaMarker.setLatLng(viaWp);
        } else {
          viaMarker = L.marker(viaWp, {
            icon: createSvgIcon(routingColorVia, 1),
            title: `Via: ${via.label || viaInput.value}`,
            draggable: true,
          }).addTo(map);
          addDragHandlersToRoutingMarker(viaMarker, "via");
        }
      }

      const waypoints = [startWp];
      if (viaWp) {
        waypoints.push(viaWp);
      }
      waypoints.push(endWp);

      routingControl.setWaypoints(waypoints);
    } catch (error) {
      console.error("Routing error:", error);
      Swal.fire({
        icon: "error",
        title: "Routing Error",
        text: "An error occurred while trying to find the route.",
      });
    }
  });

  saveRouteBtn.addEventListener("click", () => {
    if (!currentRoutePath) {
      return;
    }

    const newPath = L.polyline(currentRoutePath.getLatLngs(), {
      ...STYLE_CONFIG.path.default,
      color: currentRoutePath.options.color,
    });

    newPath.feature = JSON.parse(JSON.stringify(currentRoutePath.feature));
    newPath.pathType = "drawn";
    newPath.feature.properties.name = newPath.feature.properties.name || "Saved Route";

    newPath.on("click", (ev) => {
      L.DomEvent.stopPropagation(ev);
      selectItem(newPath);
    });
    drawnItems.addLayer(newPath);
    editableLayers.addLayer(newPath);

    clearRouting();

    updateOverviewList();
    updateDrawControlStates();

    Swal.fire({
      icon: "success",
      title: "Route Saved!",
      text: 'The route has been added to the "Drawn Items" layer.',
      timer: 2500,
      showConfirmButton: false,
    });
  });

  // --- Publicly expose the setupRoutingControl and clearRouting functions ---
  // This is a bit of a hack to make them accessible from main.js, but it's the
  // simplest way without a proper module system.
  window.app = window.app || {};
  window.app.setupRoutingControl = setupRoutingControl;
  window.app.clearRouting = clearRouting;
}
