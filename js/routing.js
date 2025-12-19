// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

/**
 * Initializes the routing functionality including routing control, markers,
 * user input handlers, and provider configuration.
 */
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
  });

  const PROVIDER_CONFIG = {
    mapbox: {
      router: mapboxRouter,
      profiles: {
        driving: "driving",
        bike: "cycling",
        foot: "walking",
      },
      profileFormatter: (profile) => `mapbox/${profile}`,
    },
    osrm: {
      router: osrmRouter,
      profiles: {
        driving: "driving",
        bike: "bike",
        foot: "foot",
      },
      profileFormatter: (profile) => profile,
    },
  };

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

  const calculateNewRoute = () => {
    if (!currentStartLatLng || !currentEndLatLng) {
      return;
    }

    shouldFitBounds = true;
    intermediateViaMarkers.forEach((marker) => map.removeLayer(marker));
    intermediateViaMarkers = [];
    saveRouteBtn.disabled = true;

    const selectedProfile = document.querySelector("#routing-profile-selector .profile-btn.active")
      .dataset.profile;
    const currentProvider = localStorage.getItem("routingProvider") || "mapbox";

    const config = PROVIDER_CONFIG[currentProvider];
    if (!config) {
      console.error(`No configuration found for provider: ${currentProvider}`);
      return;
    }

    const apiProfile = config.profiles[selectedProfile] || config.profiles["driving"];
    const finalProfile = config.profileFormatter(apiProfile);
    routingControl.getRouter().options.profile = finalProfile;

    const waypoints = [L.latLng(currentStartLatLng)];
    if (currentViaLatLng) {
      waypoints.push(L.latLng(currentViaLatLng));
    }
    waypoints.push(L.latLng(currentEndLatLng));

    setWaypointsAndLog(waypoints);
  };

  /**
   * Sets waypoints on the routing control and logs the provider being used.
   */
  const setWaypointsAndLog = (waypoints) => {
    const providerMap = { mapbox: "Mapbox", osrm: "OSRM" };
    const currentProvider = localStorage.getItem("routingProvider") || "mapbox";
    const providerDisplayName = providerMap[currentProvider] || currentProvider;
    console.log(`Fetching route from: ${providerDisplayName}`);
    routingControl.setWaypoints(waypoints);
  };

  /**
   * Recalculates the route including all intermediate via markers without changing map bounds.
   */
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

  /**
   * Adds an intermediate via point marker to the route at the specified location.
   */
  const addIntermediateViaPoint = (latlng) => {
    const newViaMarker = L.marker(latlng, {
      icon: createMarkerIcon(routingColorVia, 1),
      draggable: true,
      title: ROUTING_MARKER_HINT,
    }).addTo(map);

    const deleteMarkerAction = () => {
      map.removeLayer(newViaMarker);
      intermediateViaMarkers = intermediateViaMarkers.filter((m) => m !== newViaMarker);
      updateRouteWithIntermediateVias();
    };

    let pressTimer = null;

    newViaMarker.on("mousedown", (e) => {
      if (e.originalEvent.pointerType === "touch" || e.originalEvent.button === 2) {
        return;
      }
      pressTimer = setTimeout(deleteMarkerAction, 800);
    });

    const cancelPressTimer = () => {
      clearTimeout(pressTimer);
    };

    newViaMarker.on("mouseup", cancelPressTimer);
    newViaMarker.on("dragstart", cancelPressTimer);

    newViaMarker.on("contextmenu", (e) => {
      L.DomEvent.stop(e);
      deleteMarkerAction();
    });

    newViaMarker.on("dragend", updateRouteWithIntermediateVias);
    intermediateViaMarkers.push(newViaMarker);
    updateRouteWithIntermediateVias();
  };

  /**
   * Sets up the routing control with the specified provider and attaches event handlers.
   */
  function setupRoutingControl(provider) {
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    const router = PROVIDER_CONFIG[provider]?.router || PROVIDER_CONFIG["mapbox"].router;

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

        const startInput = document.getElementById("route-start");
        const endInput = document.getElementById("route-end");
        const startName = startInput.value.trim() || "Start";
        const endName = endInput.value.trim() || "End";
        const newRouteName = `Route: ${startName} to ${endName}`;

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

        if (currentRoutePath) {
          currentRoutePath.setLatLngs(processedCoordinates);
          currentRoutePath.feature.properties.name = newRouteName;
          currentRoutePath.feature.properties.totalDistance = route.summary.totalDistance;
        } else {
          const routeColorName = "Yellow";
          const routeColor = ORGANIC_MAPS_COLORS.find((c) => c.name === routeColorName).css;
          const newRoutePath = L.polyline(processedCoordinates, {
            ...STYLE_CONFIG.path.default,
            color: routeColor,
          });

          newRoutePath.feature = {
            properties: {
              name: newRouteName,
              omColorName: routeColorName,
              totalDistance: route.summary.totalDistance,
            },
          };
          newRoutePath.pathType = "route";

          let pressTimer = null;
          let wasLongPress = false;

          newRoutePath.on("mousedown", (e) => {
            if (e.originalEvent.button === 2) {
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
            wasLongPress = true;
            addIntermediateViaPoint(e.latlng);
          });

          drawnItems.addLayer(newRoutePath);
          newRoutePath.addTo(map);
          currentRoutePath = newRoutePath;
        }

        updateOverviewList();
        updateDrawControlStates();

        if (wasRouteSelectedOnUnitRefresh || !isUnitRefreshInProgress) {
          selectItem(currentRoutePath);
        }
        isUnitRefreshInProgress = false;
        wasRouteSelectedOnUnitRefresh = false;

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
  const profileButtons = document.querySelectorAll("#routing-profile-selector .profile-btn");
  const selectStartBtn = document.getElementById("select-start-on-map");
  const selectEndBtn = document.getElementById("select-end-on-map");
  const selectViaBtn = document.getElementById("select-via-on-map");
  customCursorStart = document.getElementById("custom-cursor-start");
  customCursorEnd = document.getElementById("custom-cursor-end");
  customCursorVia = document.getElementById("custom-cursor-via");

  [startInput, viaInput, endInput].forEach((input) => {
    input.addEventListener("focus", function () {
      this.select();
    });
  });

  clearRouteBtn.disabled = true;

  profileButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      L.DomEvent.stop(e);

      profileButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      if (startMarker && endMarker) {
        calculateNewRoute();
      }
    });
  });

  const directionsHeader = document.getElementById("directions-panel-header");
  const directionsPanel = document.getElementById("directions-panel");
  directionsHeader.addEventListener("click", () => {
    directionsPanel.classList.toggle("collapsed");
  });

  // Use search modal for start input
  attachSearchModalToInput(startInput, "Set Start Point", (latlng, label) => {
    currentStartLatLng = latlng;
    startInput.style.color = "var(--color-black)";
    if (startMarker) {
      startMarker.setLatLng(latlng);
    } else {
      startMarker = L.marker(latlng, {
        icon: createMarkerIcon(routingColorStart, 1),
        title: ROUTING_MARKER_HINT,
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(startMarker, "start");
    }
    updateClearButtonState();
    calculateNewRoute();
  });

  // Use search modal for end input
  attachSearchModalToInput(endInput, "Set End Point", (latlng, label) => {
    currentEndLatLng = latlng;
    endInput.style.color = "var(--color-black)";
    if (endMarker) {
      endMarker.setLatLng(latlng);
    } else {
      endMarker = L.marker(latlng, {
        icon: createMarkerIcon(routingColorEnd, 1),
        title: ROUTING_MARKER_HINT,
        draggable: true,
      }).addTo(map);
      addDragHandlersToRoutingMarker(endMarker, "end");
    }
    updateClearButtonState();
    calculateNewRoute();
  });

  // Use search modal for via input
  attachSearchModalToInput(viaInput, "Set Via Point", (latlng, label) => {
    currentViaLatLng = latlng;
    viaInput.style.color = "var(--color-black)";
    if (viaMarker) {
      viaMarker.setLatLng(latlng);
    } else {
      viaMarker = L.marker(latlng, {
        icon: createMarkerIcon(routingColorVia, 1),
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

  /**
   * Adds drag and delete handlers to routing markers (start/end/via).
   */
  function addDragHandlersToRoutingMarker(marker, type) {
    const isStart = type === "start";
    const isVia = type === "via";
    const input = isStart ? startInput : isVia ? viaInput : endInput;
    let pressTimer = null;

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
        updateRouteWithIntermediateVias();
      }
    });

    marker.on("mousedown", (e) => {
      if (e.originalEvent.pointerType === "touch" || e.originalEvent.button === 2) {
        return;
      }
      pressTimer = setTimeout(deleteMarkerAction, 800);
    });

    const cancelPressTimer = () => {
      clearTimeout(pressTimer);
    };

    marker.on("mouseup", cancelPressTimer);
    marker.on("dragstart", cancelPressTimer);

    marker.on("contextmenu", (e) => {
      L.DomEvent.stop(e);
      deleteMarkerAction();
    });
  }

  /**
   * Clears all routing markers, inputs, and route path from the map.
   */
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

  /**
   * Updates a routing point (start/via/end) with a new location and optional label.
   */
  const updateRoutingPoint = (latlng, type, label) => {
    const locationString = label || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;

    if (type === "start") {
      currentStartLatLng = latlng;
      startInput.value = locationString;
      if (startMarker) {
        startMarker.setLatLng(latlng);
      } else {
        startMarker = L.marker(latlng, {
          icon: createMarkerIcon(routingColorStart, 1),
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
          icon: createMarkerIcon(routingColorVia, 1),
          title: ROUTING_MARKER_HINT,
          draggable: true,
        }).addTo(map);
        addDragHandlersToRoutingMarker(viaMarker, "via");
      }
    } else {
      currentEndLatLng = latlng;
      endInput.value = locationString;
      if (endMarker) {
        endMarker.setLatLng(latlng);
      } else {
        endMarker = L.marker(latlng, {
          icon: createMarkerIcon(routingColorEnd, 1),
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

  /**
   * Handles getting the user's current location for a routing point.
   */
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
      // Pass the specific label for "Use my current location"
      updateRoutingPoint(latlng, type, "Your location");
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

  ["start", "via", "end"].forEach((type) => {
    const btn = document.getElementById(`use-current-location-${type}`);
    if (btn) {
      btn.addEventListener("click", (e) => {
        L.DomEvent.stop(e);
        handleRoutingLocation(type);
      });
    }
  });

  /**
   * Clears a single routing point (start/via/end) and updates the route accordingly.
   */
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
          updateRouteWithIntermediateVias();
        }
        break;
    }
    updateClearButtonState();
  };

  ["start", "via", "end"].forEach((type) => {
    const btn = document.getElementById(`clear-point-${type}`);
    if (btn) {
      btn.addEventListener("click", (e) => {
        L.DomEvent.stop(e);
        clearRoutingPoint(type);
      });
    }
  });

  const handleManualInputChange = (type) => {
    let input, currentLatLngValue;

    if (type === "start") {
      input = startInput;
      currentLatLngValue = currentStartLatLng;
    } else if (type === "via") {
      input = viaInput;
      currentLatLngValue = currentViaLatLng;
    } else {
      input = endInput;
      currentLatLngValue = currentEndLatLng;
    }

    if (input.value.trim() === "" && currentLatLngValue) {
      clearRoutingPoint(type);
    }
  };

  startInput.addEventListener("input", () => handleManualInputChange("start"));
  viaInput.addEventListener("input", () => handleManualInputChange("via"));
  endInput.addEventListener("input", () => handleManualInputChange("end"));

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
            icon: createMarkerIcon(routingColorStart, 1),
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
            icon: createMarkerIcon(routingColorVia, 1),
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
            icon: createMarkerIcon(routingColorEnd, 1),
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

    let coordsToUse = currentRoutePath.getLatLngs();
    let simplificationHappened = false;

    if (enablePathSimplification) {
      const originalCoords = coordsToUse.map((latlng) => [latlng.lng, latlng.lat]);
      const simplifiedResult = simplifyPath(
        originalCoords,
        "LineString",
        routeSimplificationConfig
      );

      if (simplifiedResult.simplified) {
        coordsToUse = simplifiedResult.coords.map((c) => L.latLng(c[1], c[0]));
        simplificationHappened = true;
      }
    }

    const newPath = L.polyline(coordsToUse, {
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

    if (simplificationHappened) {
      Swal.fire({
        icon: "success",
        iconColor: "var(--swal-color-success)",
        title: "Route Saved & Optimized!",
        text: 'The route was simplified and added to the "Drawn Items" layer.',
        timer: 2500,
        showConfirmButton: false,
      });
    } else {
      Swal.fire({
        icon: "success",
        iconColor: "var(--swal-color-success)",
        title: "Route Saved!",
        text: 'The route has been added to the "Drawn Items" layer.',
        timer: 2500,
        showConfirmButton: false,
      });
    }
  });

  /**
   * Recalculates and redisplays the current route when unit settings change.
   * Called from main.js when the user toggles between metric and imperial units.
   */
  const redisplayCurrentRoute = () => {
    if (currentRoutePath && routingControl) {
      wasRouteSelectedOnUnitRefresh = globallySelectedItem === currentRoutePath;
      const waypoints = routingControl.getWaypoints();
      const validWaypoints = waypoints.filter((wp) => wp.latLng);
      if (validWaypoints.length > 1) {
        shouldFitBounds = false;
        isUnitRefreshInProgress = true;
        routingControl.setWaypoints(validWaypoints);
      }
    }
  };

  window.app = window.app || {};
  window.app.setupRoutingControl = setupRoutingControl;
  window.app.clearRouting = clearRouting;
  window.app.redisplayCurrentRoute = redisplayCurrentRoute;
  window.app.updateRoutingPoint = updateRoutingPoint;
}
