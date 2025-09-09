// OpenMapEditor - A web-based editor for creating and managing geographic data.
// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// ===================================================================================
// --- ROUTING FUNCTIONALITY ---
// ===================================================================================

function initializeRouting() {
  const ROUTING_MARKER_HINT = "Drag to move, long-press to remove";
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

  let intermediateViaMarkers = [];
  let shouldFitBounds = true;
  let isUnitRefreshInProgress = false;
  let wasRouteSelectedOnUnitRefresh = false;

  const geocoder = new GeoSearch.OpenStreetMapProvider();

  const mapboxRouter = L.Routing.mapbox(mapboxAccessToken);
  const osrmRouter = L.Routing.osrmv1({
    serviceUrl: "https://router.project-osrm.org/route/v1",
    profile: "driving",
    // suppressDemoServerWarning: true,
  });

  // --- Helper function to clear just the route line and summary ---
  const clearRouteLine = () => {
    if (currentRoutePath) {
      if (globallySelectedItem === currentRoutePath) {
        deselectCurrentItem();
      }
      editableLayers.removeLayer(currentRoutePath);
      drawnItems.removeLayer(currentRoutePath);
      map.removeLayer(currentRoutePath);
      currentRoutePath = null;
      updateOverviewList();
    }

    intermediateViaMarkers.forEach((marker) => map.removeLayer(marker));
    intermediateViaMarkers = [];

    routingControl.setWaypoints([]);
    document.getElementById("routing-summary-container").style.display = "none";
    document.getElementById("directions-panel").style.display = "none";
    saveRouteBtn.disabled = true;
  };

  // --- Central function to calculate a fresh route ---
  const calculateNewRoute = () => {
    // Guard clause: only run if we have a start and end.
    if (!currentStartLatLng || !currentEndLatLng) {
      return;
    }

    shouldFitBounds = true;
    intermediateViaMarkers.forEach((marker) => map.removeLayer(marker));
    intermediateViaMarkers = [];
    saveRouteBtn.disabled = true;

    const selectedProfile = profileSelect.value;
    const currentProvider = localStorage.getItem("routingProvider") || "mapbox";

    if (currentProvider === "mapbox") {
      let mapboxProfile;
      switch (selectedProfile) {
        case "bike":
          mapboxProfile = "cycling";
          break;
        case "foot":
          mapboxProfile = "walking";
          break;
        default:
          mapboxProfile = "driving";
      }
      routingControl.getRouter().options.profile = "mapbox/" + mapboxProfile;
    } else {
      routingControl.getRouter().options.profile = selectedProfile;
    }

    const waypoints = [L.latLng(currentStartLatLng)];
    if (currentViaLatLng) {
      waypoints.push(L.latLng(currentViaLatLng));
    }
    waypoints.push(L.latLng(currentEndLatLng));

    setWaypointsAndLog(waypoints);
  };

  const setWaypointsAndLog = (waypoints) => {
    const providerMap = { mapbox: "Mapbox", osrm: "OSRM" };
    const currentProvider = localStorage.getItem("routingProvider") || "mapbox";
    const providerDisplayName = providerMap[currentProvider] || currentProvider;
    console.log(`Fetching route from: ${providerDisplayName}`);
    routingControl.setWaypoints(waypoints);
  };

  const updateRouteWithIntermediateVias = () => {
    if (!currentStartLatLng || !currentEndLatLng) return;
    shouldFitBounds = false;
    const waypoints = [L.latLng(currentStartLatLng)];
    intermediateViaMarkers.forEach((marker) => {
      waypoints.push(marker.getLatLng());
    });
    if (currentViaLatLng) {
      waypoints.push(L.latLng(currentViaLatLng));
    }
    waypoints.push(L.latLng(currentEndLatLng));
    setWaypointsAndLog(waypoints);
  };

  const addIntermediateViaPoint = (latlng) => {
    const newViaMarker = L.marker(latlng, {
      icon: createSvgIcon(routingColorVia, 1),
      draggable: true,
      title: ROUTING_MARKER_HINT,
    }).addTo(map);

    let pressTimer = null; // Timer for long-press detection

    // Specific deletion logic for an intermediate via marker
    const deleteMarkerAction = () => {
      map.removeLayer(newViaMarker);
      // Filter this specific marker out of the array
      intermediateViaMarkers = intermediateViaMarkers.filter((m) => m !== newViaMarker);
      updateRouteWithIntermediateVias();
    };

    // --- START: Add the new long-press logic ---
    newViaMarker.on("mousedown", (e) => {
      if (e.originalEvent.pointerType === "touch" || e.originalEvent.button === 2) {
        return;
      }
      pressTimer = setTimeout(() => {
        deleteMarkerAction();
      }, 800);
    });

    const clearPressTimer = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    newViaMarker.on("mouseup", clearPressTimer);
    newViaMarker.on("dragstart", clearPressTimer);

    newViaMarker.on("contextmenu", (e) => {
      L.DomEvent.stop(e);
      if (e.originalEvent.pointerType === "touch") {
        deleteMarkerAction();
      }
    });
    // --- END: Add the new long-press logic ---

    // Keep the original dragend handler
    newViaMarker.on("dragend", updateRouteWithIntermediateVias);

    // Add the new marker to the array and update the route
    intermediateViaMarkers.push(newViaMarker);
    updateRouteWithIntermediateVias();
  };

  function setupRoutingControl(provider) {
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    const router = provider === "osrm" ? osrmRouter : mapboxRouter;
    routingControl = L.Routing.control({
      waypoints: [],
      router: router,
      lineOptions: { styles: [{ opacity: 0, weight: 0 }] },
      routeWhileDragging: false,
      show: false,
      addWaypoints: false,
      createMarker: () => null,
    }).addTo(map);

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
          const distanceDisplay = formatDistance(route.summary.totalDistance);

          function formatDuration(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            let parts = [];
            if (h > 0) parts.push(h + " h");
            if (m > 0 || h === 0) parts.push(m + " m");
            return parts.join(" ");
          }
          const formattedTime = formatDuration(route.summary.totalTime);

          summaryContainer.innerHTML = `<b>Distance:</b> ${distanceDisplay} &nbsp;&nbsp; <b>Time:</b> ${formattedTime}`;
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
            if (distanceM > 0) {
              distanceStr = `(${formatDistance(distanceM)})`;
            }
            item.textContent = `${instr.text} ${distanceStr}`;
            directionsList.appendChild(item);
          });
        } else {
          directionsList.innerHTML =
            '<div class="direction-item">No turn-by-turn directions available.</div>';
        }

        if (shouldFitBounds) {
          map.fitBounds(L.latLngBounds(processedCoordinates), { padding: [50, 50] });
        }

        // --- START: MODIFIED In-Place Route Update ---
        // If a route already exists on the map, we update it in-place to prevent
        // it from being deselected, which would incorrectly close the elevation panel.
        if (currentRoutePath) {
          currentRoutePath.setLatLngs(processedCoordinates);
          currentRoutePath.feature.properties.name = route.name || "Calculated Route";
          currentRoutePath.feature.properties.totalDistance = route.summary.totalDistance;
        } else {
          // If no route exists, this is the first calculation, so we create the layer.
          const routeColorName = "Yellow";
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

          // --- START: FINAL Click and Long-Press Logic for Route ---
          let pressTimer = null;
          let wasLongPress = false;

          newRoutePath.on("mousedown", (e) => {
            if (e.originalEvent.pointerType === "touch") {
              return;
            }
            wasLongPress = false;
            pressTimer = setTimeout(() => {
              wasLongPress = true;
              addIntermediateViaPoint(e.latlng);
            }, 800);
          });

          newRoutePath.on("mouseup", () => {
            clearTimeout(pressTimer);
          });

          newRoutePath.on("click", (e) => {
            L.DomEvent.stop(e);
            if (!wasLongPress) {
              selectItem(newRoutePath);
            }
            wasLongPress = false;
          });

          newRoutePath.on("contextmenu", (e) => {
            L.DomEvent.stop(e);
            if (e.originalEvent.pointerType === "touch") {
              wasLongPress = true;
              addIntermediateViaPoint(e.latlng);
            }
          });
          // --- END: FINAL Click and Long-Press Logic for Route ---

          drawnItems.addLayer(newRoutePath);
          newRoutePath.addTo(map);
          currentRoutePath = newRoutePath; // Assign the new path to the global variable
        }
        // --- END: MODIFIED In-Place Route Update ---

        updateOverviewList();
        updateDrawControlStates();

        // Re-select the route if it was selected before a unit change,
        // or select it if it's a brand new calculation.
        if (wasRouteSelectedOnUnitRefresh || !isUnitRefreshInProgress) {
          selectItem(currentRoutePath);
        }
        isUnitRefreshInProgress = false; // Always reset the flag
        wasRouteSelectedOnUnitRefresh = false; // Always reset the flag

        saveRouteBtn.disabled = false;
      }
    });

    routingControl.on("routingerror", (e) => {
      console.error("Routing error:", e.error);
      if (e.error && e.error.target && e.error.target.responseText) {
        try {
          const apiResponse = JSON.parse(e.error.target.responseText);
          if (apiResponse && apiResponse.message) {
            Swal.fire({
              icon: "error",
              iconColor: "var(--swal-color-error)",
              title: "Routing Service Error",
              text: apiResponse.message,
            });
            return;
          }
        } catch (err) {
          console.warn("Could not parse API error response:", err);
        }
      }
      if (e.error && e.error.status === "NoRoute") {
        Swal.fire({
          icon: "warning",
          iconColor: "var(--swal-color-warning)",
          title: "No Route Found",
          text: "A route could not be found between the specified locations. Please check if the locations are accessible by the selected mode of transport.",
        });
      } else {
        Swal.fire({
          icon: "error",
          iconColor: "var(--swal-color-error)",
          title: "Routing Unavailable",
          text: "The routing service could not be reached or returned an unknown error. Please try again later.",
        });
      }
    });
  }

  const savedProvider = localStorage.getItem("routingProvider") || "mapbox";
  setupRoutingControl(savedProvider);

  const routingPanelContainer = document.getElementById("routing-panel");
  L.DomEvent.disableClickPropagation(routingPanelContainer);
  L.DomEvent.disableScrollPropagation(routingPanelContainer);

  const startInput = document.getElementById("route-start");
  const endInput = document.getElementById("route-end");
  const viaInput = document.getElementById("route-via");
  const clearRouteBtn = document.getElementById("clear-route-btn");
  saveRouteBtn = document.getElementById("save-route-btn");
  saveRouteBtn.disabled = true;
  const profileSelect = document.getElementById("route-profile");
  const selectStartBtn = document.getElementById("select-start-on-map");
  const selectEndBtn = document.getElementById("select-end-on-map");
  const selectViaBtn = document.getElementById("select-via-on-map");
  customCursorStart = document.getElementById("custom-cursor-start");
  customCursorEnd = document.getElementById("custom-cursor-end");
  customCursorVia = document.getElementById("custom-cursor-via");

  // --- NEW: Select all text in routing inputs on focus ---
  [startInput, viaInput, endInput].forEach((input) => {
    input.addEventListener("focus", function () {
      this.select();
    });
  });

  clearRouteBtn.disabled = true;

  profileSelect.addEventListener("change", () => {
    if (startMarker && endMarker) {
      calculateNewRoute();
    }
  });

  const directionsHeader = document.getElementById("directions-panel-header");
  const directionsPanel = document.getElementById("directions-panel");
  directionsHeader.addEventListener("click", () => {
    directionsPanel.classList.toggle("collapsed");
  });

  setupAutocomplete(startInput, document.getElementById("route-start-suggestions"), (latlng) => {
    currentStartLatLng = latlng;
    startInput.style.color = "var(--color-black)";
    if (startMarker) {
      startMarker.setLatLng(latlng);
    } else {
      startMarker = L.marker(latlng, {
        icon: createSvgIcon(routingColorStart, 1),
        title: ROUTING_MARKER_HINT,
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(startMarker, "start");
    }
    updateClearButtonState();
    calculateNewRoute();
  });

  setupAutocomplete(endInput, document.getElementById("route-end-suggestions"), (latlng) => {
    currentEndLatLng = latlng;
    endInput.style.color = "var(--color-black)";
    if (endMarker) {
      endMarker.setLatLng(latlng);
    } else {
      endMarker = L.marker(latlng, {
        icon: createSvgIcon(routingColorEnd, 1),
        title: ROUTING_MARKER_HINT,
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(endMarker, "end");
    }
    updateClearButtonState();
    calculateNewRoute();
  });

  setupAutocomplete(viaInput, document.getElementById("route-via-suggestions"), (latlng) => {
    currentViaLatLng = latlng;
    viaInput.style.color = "var(--color-black)";
    if (viaMarker) {
      viaMarker.setLatLng(latlng);
    } else {
      viaMarker = L.marker(latlng, {
        icon: createSvgIcon(routingColorVia, 1),
        title: ROUTING_MARKER_HINT,
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(viaMarker, "via");
    }
    updateClearButtonState();
    updateRouteWithIntermediateVias();
  });

  const updateClearButtonState = () => {
    const hasContent =
      startInput.value || endInput.value || viaInput.value || startMarker || endMarker;
    clearRouteBtn.disabled = !hasContent;
  };

  startInput.addEventListener("input", updateClearButtonState);
  endInput.addEventListener("input", updateClearButtonState);
  viaInput.addEventListener("input", updateClearButtonState);

  function addDragHandlersToRoutingMarker(marker, type) {
    const isStart = type === "start";
    const isVia = type === "via";
    const input = isStart ? startInput : isVia ? viaInput : endInput;
    let pressTimer = null; // Timer for long-press detection

    // Centralized deletion logic
    const deleteMarkerAction = () => {
      clearRoutingPoint(type);
    };

    marker.on("dragend", () => {
      const newLatLng = marker.getLatLng();
      if (isStart) currentStartLatLng = newLatLng;
      else if (isVia) currentViaLatLng = newLatLng;
      else currentEndLatLng = newLatLng;
      input.value = `${newLatLng.lat.toFixed(5)}, ${newLatLng.lng.toFixed(5)}`;
      input.style.color = "var(--color-black)";

      if (startMarker && endMarker) {
        // MODIFIED: Always use the update function for dragging
        // to preserve intermediate via points for a better user experience.
        updateRouteWithIntermediateVias();
      }
    });

    // --- START: Long-press logic for deletion ---
    marker.on("mousedown", (e) => {
      // Touch events are handled by contextmenu.
      if (e.originalEvent.pointerType === "touch") {
        return;
      }
      // A right-click shouldn't start a long-press timer.
      if (e.originalEvent.button === 2) {
        return;
      }
      pressTimer = setTimeout(() => {
        deleteMarkerAction();
      }, 800);
    });

    const clearPressTimer = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    marker.on("mouseup", clearPressTimer);
    marker.on("dragstart", clearPressTimer); // Important: cancel on drag

    marker.on("contextmenu", (e) => {
      L.DomEvent.stop(e); // Prevent default map context menu.

      // On touch devices, this is our long-press.
      if (e.originalEvent.pointerType === "touch") {
        deleteMarkerAction();
      }
      // For mouse right-click, we do nothing, effectively disabling it.
    });
    // --- END: Long-press logic for deletion ---
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

    intermediateViaMarkers.forEach((marker) => map.removeLayer(marker));
    intermediateViaMarkers = [];

    startInput.value = "";
    endInput.value = "";
    viaInput.value = "";
    currentStartLatLng = null;
    currentEndLatLng = null;
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

    updateClearButtonState();
  };

  clearRouteBtn.addEventListener("click", () => {
    clearRouting();
  });

  // --- MODIFIED: Generalized function to handle start, via, or end ---
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
          title: ROUTING_MARKER_HINT,
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(startMarker, "start");
      }
    } else if (type === "via") {
      currentViaLatLng = latlng;
      viaInput.value = locationString;
      if (viaMarker) {
        viaMarker.setLatLng(latlng);
      } else {
        viaMarker = L.marker(latlng, {
          icon: createSvgIcon(routingColorVia, 1),
          title: ROUTING_MARKER_HINT,
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(viaMarker, "via");
      }
    } else {
      // 'end' case
      currentEndLatLng = latlng;
      endInput.value = locationString;
      if (endMarker) {
        endMarker.setLatLng(latlng);
      } else {
        endMarker = L.marker(latlng, {
          icon: createSvgIcon(routingColorEnd, 1),
          title: ROUTING_MARKER_HINT,
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(endMarker, "end");
      }
    }
    updateClearButtonState();

    if (type === "via") {
      updateRouteWithIntermediateVias();
    } else {
      calculateNewRoute();
    }

    exitRoutePointSelectionMode();
  };

  const handleRoutingLocation = (type) => {
    const onLocationAquired = (latlng) => {
      if (!latlng || typeof latlng.lat !== "number" || typeof latlng.lng !== "number") {
        Swal.fire({
          icon: "error",
          iconColor: "var(--swal-color-error)",
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
        Swal.fire({
          icon: "error",
          iconColor: "var(--swal-color-error)",
          title: "Location Error",
          text: e.message,
        });
      });
  };

  // --- MODIFIED: Use a loop to set up "Use Current Location" buttons ---
  ["start", "via", "end"].forEach((type) => {
    const btn = document.getElementById(`use-current-location-${type}`);
    if (btn) {
      btn.addEventListener("click", (e) => {
        L.DomEvent.stop(e);
        handleRoutingLocation(type);
      });
    }
  });

  // --- NEW: Generic function to clear a single routing point ---
  const clearRoutingPoint = (type) => {
    switch (type) {
      case "start":
        if (startMarker) map.removeLayer(startMarker);
        startMarker = null;
        currentStartLatLng = null;
        startInput.value = "";
        clearRouteLine();
        break;
      case "end":
        if (endMarker) map.removeLayer(endMarker);
        endMarker = null;
        currentEndLatLng = null;
        endInput.value = "";
        clearRouteLine();
        break;
      case "via":
        if (viaMarker) map.removeLayer(viaMarker);
        viaMarker = null;
        currentViaLatLng = null;
        viaInput.value = "";
        if (startMarker && endMarker) {
          // This is the default behavior: only clears the main via point.
          updateRouteWithIntermediateVias();

          // To clear ALL via points comment the line above and uncomment the line below.
          // calculateNewRoute();
        }
        break;
    }
    updateClearButtonState();
  };

  // --- NEW: Use a loop to set up "Clear" buttons ---
  ["start", "via", "end"].forEach((type) => {
    const btn = document.getElementById(`clear-point-${type}`);
    if (btn) {
      btn.addEventListener("click", (e) => {
        L.DomEvent.stop(e);
        clearRoutingPoint(type);
      });
    }
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
            title: ROUTING_MARKER_HINT,
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
            title: ROUTING_MARKER_HINT,
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
            title: ROUTING_MARKER_HINT,
            draggable: true,
          }).addTo(map);
          addDragHandlersToRoutingMarker(endMarker, "end");
        }
      }

      updateClearButtonState();

      if (routePointSelectionMode === "via") {
        if (startMarker && endMarker) updateRouteWithIntermediateVias();
      } else {
        calculateNewRoute();
      }

      exitRoutePointSelectionMode();
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
      iconColor: "var(--swal-color-success)",
      title: "Route Saved!",
      text: 'The route has been added to the "Drawn Items" layer.',
      timer: 2500,
      showConfirmButton: false,
    });
  });

  // This function will be called from main.js when the user toggles the unit setting.
  const redisplayCurrentRoute = () => {
    // Check if there is an active route to recalculate/redisplay.
    if (currentRoutePath && routingControl) {
      wasRouteSelectedOnUnitRefresh = globallySelectedItem === currentRoutePath;
      const waypoints = routingControl.getWaypoints();
      // Check for waypoints that have a valid latLng.
      const validWaypoints = waypoints.filter((wp) => wp.latLng);
      if (validWaypoints.length > 1) {
        // Set the flags before re-triggering the route calculation.
        shouldFitBounds = false; // Don't re-zoom the map on unit change.
        isUnitRefreshInProgress = true; // Flag that a unit refresh is occurring.
        routingControl.setWaypoints(validWaypoints);
      }
    }
  };

  window.app = window.app || {};
  window.app.setupRoutingControl = setupRoutingControl;
  window.app.clearRouting = clearRouting;
  window.app.redisplayCurrentRoute = redisplayCurrentRoute;
}
