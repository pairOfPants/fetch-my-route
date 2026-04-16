'use client'

import { useMemo, useRef, useState, useEffect } from "react";
import { CAMPUS_BUILDINGS } from "@/lib/campusBuildings";
import { getGeojsonEdits } from "@/lib/route";
import {
  buildGraphFromGeoJSON,
  dijkstra,
  findNearestNode,
  formatMeters,
  generateInstructionsWithContext,
  haversine,
} from "@/lib/mapRouteUtils";
import {
  LogOut,
  Bookmark,
  BookmarkPlus,
  Route,
  Clock,
  Accessibility as A11yIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  X,
  GripVertical,
  BookOpenText,
  Settings,
  Contrast,
  Text,
  MapPin,
  Navigation,
  MousePointerClick,
  Trash2,
  Pencil,
  Wrench,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { getRoute, isOSRMAvailable } from "@/lib/osrmClient";

export default function MapRoutePage({ onBackToSplash, user, isAdmin = false, onGoToEditRoutes }) {
  const [leftPct, setLeftPct] = useState(50);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [showNewRouteModal, setShowNewRouteModal] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteStart, setNewRouteStart] = useState("");
  const [newRouteDest, setNewRouteDest] = useState("");
  const [newRouteStartSuggestions, setNewRouteStartSuggestions] = useState([]);
  const [newRouteDestSuggestions, setNewRouteDestSuggestions] = useState([]);
  const [newRouteErrors, setNewRouteErrors] = useState({ name: "", start: "", dest: "" });
  const [editingRoute, setEditingRoute] = useState(null);

  const [confirmRoute, setConfirmRoute] = useState(null);
  const [startInput, setStartInput] = useState("");
  const [destInput, setDestInput] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [mapClickEnabled, setMapClickEnabled] = useState(false);
  const [placing, setPlacing] = useState("start");
  const [distanceLabel, setDistanceLabel] = useState("");
  const [statusMessage, setStatusMessage] = useState("Pick a start and destination to draw a route.");
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [pendingRoute, setPendingRoute] = useState(null);
  const [saveName, setSaveName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [useOSRM, setUseOSRM] = useState(false);
  const [instructions, setInstructions] = useState([]);
  const [showRouteToast, setShowRouteToast] = useState(false);
  const userDisplayName = user?.displayName || user?.email || null;
  const userId = user?.uid || null;
  const isAuthenticated = Boolean(userId);

  // bottom bar modals
  const [open, setOpen] = useState(null); // 'how', 'a11y', 'settings'

  // shared a11y prefs
  const [highContrast, setHighContrast] = useState(false);
  const [textScale, setTextScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  const containerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const graphRef = useRef(null);
  const drawnLayerRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const userMarkerRef = useRef(null);
  const userPulseRef = useRef(null);
  const pulseTimerRef = useRef(null);
  const watchIdRef = useRef(null);
  const startKeyRef = useRef(null);
  const endKeyRef = useRef(null);
  const mapClickEnabledRef = useRef(false);
  const placingRef = useRef("start");

  const pawMarkersRef = useRef([]);

  // Live tracking state
  const [isTracking, setIsTracking] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [gpsInfo, setGpsInfo] = useState({ accuracy: null, speed: null });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const brand = useMemo(
    () => ({ gold: "#FFCB05", black: "#000000", ink: "#111111" }),
    []
  );
  // Default map view for UMBC
  const DEFAULT_CENTER = [39.25540482760391, -76.71198247080514];
  const DEFAULT_ZOOM = 17;
  const SAVED_ROUTES_KEY = "letsleave:savedRoutes";

  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem("letsleave:prefs") || "{}");
    if (typeof prefs.highContrast === "boolean") setHighContrast(prefs.highContrast);
    if (typeof prefs.textScale === "number") setTextScale(prefs.textScale);
  }, []);
  // Detect reduced motion preference
  useEffect(() => {
    try {
      const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq) {
        setPrefersReducedMotion(!!mq.matches);
        const handler = (e) => setPrefersReducedMotion(!!e.matches);
        mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
        return () => {
          mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler);
        };
      }
    } catch {}
  }, []);
  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem("letsleave:prefs") || "{}");
    localStorage.setItem(
      "letsleave:prefs",
      JSON.stringify({ ...prefs, highContrast, textScale })
    );
  }, [highContrast, textScale]);


useEffect(() => {
  const updateIsMobile = () => {
    if (typeof window === "undefined") return;
    setIsMobile(window.innerWidth < 768);
  };
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);
  return () => window.removeEventListener("resize", updateIsMobile);
}, []);

  useEffect(() => {
    if (!isAuthenticated) {
      try {
        const stored = JSON.parse(localStorage.getItem(SAVED_ROUTES_KEY) || "[]");
        if (Array.isArray(stored)) setSavedRoutes(stored);
      } catch {
        setSavedRoutes([]);
      }
      return;
    }

    const routesRef = collection(db, "users", userId, "routes");
    const unsubscribe = onSnapshot(
      routesRef,
      (snapshot) => {
        const routes = snapshot.docs
          .map((d) => {
            const data = d.data() || {};
            return {
              id: d.id,
              name: data.name || `${data.start || "Start"} -> ${data.dest || "Destination"}`,
              start: data.start || "",
              dest: data.dest || "",
              createdAt: data.createdAt?.toMillis?.() ?? 0,
            };
          })
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setSavedRoutes(routes);
      },
      (err) => {
        console.error("Failed to load saved routes", err);
        setStatusMessage("Unable to load saved routes right now.");
        setSavedRoutes([]);
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated, userId]);

  useEffect(() => {
    if (isAuthenticated) return;
    try {
      localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(savedRoutes));
    } catch {
      /* no-op */
    }
  }, [savedRoutes, isAuthenticated]);

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const fullyCollapseLeft = () => setLeftPct(0);
  const fullyCollapseRight = () => setLeftPct(100);
  const resetSplit = () => setLeftPct(50);

  const startDrag = (e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startLeft = leftPct;

    const onMove = (ev) => {
      const clientX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const delta = ((clientX - startX) / rect.width) * 100;
      setLeftPct((_) => clamp(startLeft + delta, 0, 100));
    };

    const stop = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", stop);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", stop);
  };

  // close with ESC (both saved routes + confirm)
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") {
        setConfirmRoute(null);
        setShowSavedRoutes(false);
        setOpen(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // auto-hide 'Route found' toast
  useEffect(() => {
    if (!showRouteToast) return;
    const t = setTimeout(() => setShowRouteToast(false), 2500);
    return () => clearTimeout(t);
  }, [showRouteToast]);


  useEffect(() => {
    mapClickEnabledRef.current = mapClickEnabled;
  }, [mapClickEnabled]);

  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);

  const [mapContainerId] = useState(() => `map-container-${Date.now()}-${Math.random()}`);

  useEffect(() => {
    let clickHandler = null;
    let mapInstance = null;

    const init = async () => {
      // Create a completely fresh div element
      const existingContainer = document.getElementById(mapContainerId);
      if (existingContainer) {
        existingContainer.remove();
      }
      
      const newContainer = document.createElement('div');
      newContainer.id = mapContainerId;
      newContainer.className = 'absolute inset-0';
      
      if (mapContainerRef.current) {
        mapContainerRef.current.innerHTML = '';
        mapContainerRef.current.appendChild(newContainer);
      }

      try {
        const L = (await import("leaflet")).default;
        
        // Import Leaflet CSS dynamically
        if (typeof document !== 'undefined') {
          const existingLink = document.querySelector('link[href*="leaflet"]');
          if (!existingLink) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
            link.crossOrigin = '';
            document.head.appendChild(link);
          }
        }

        leafletRef.current = L;

        mapInstance = L.map(newContainer, { zoomControl: false });
        mapRef.current = mapInstance;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          minZoom: 17,
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(mapInstance);
        L.control.zoom({ position: "topleft" }).addTo(mapInstance);

        // Try to load edits from database first
        let geojsonData = null;
        try {
          console.log('MapRoutePage: Loading GeoJSON data...');
          const editsResult = await getGeojsonEdits('campusEdits');
          console.log('MapRoutePage: Database result:', editsResult);
          
          if (editsResult.success && editsResult.geojson) {
            console.log('MapRoutePage: Loaded GeoJSON edits from database');
            geojsonData = editsResult.geojson;
          }
        } catch (error) {
          console.error('MapRoutePage: Failed to get edits from database:', error);
        }

        // If no edits, load original
        if (!geojsonData) {
          console.log('MapRoutePage: No edits found, loading original campus.geojson');
          const res = await fetch("/OSM-data/campus.geojson");
          geojsonData = await res.json();
        }

        const graph = buildGraphFromGeoJSON(L, geojsonData);
        graphRef.current = graph;

        // Create initial layer group
        const group = L.layerGroup().addTo(mapInstance);
        drawnLayerRef.current = group;

        L.geoJSON(graph.displayFeatures, {
          style: { color: "#94a3b8", weight: 2, opacity: 0.6 },
        }).addTo(group);

        if (graph.bounds && graph.bounds.isValid()) {
          console.log("Fitting map to campus bounds", graph.bounds);
          mapInstance.fitBounds(graph.bounds.pad(0.05));
        } else {
          mapInstance.setView([39.25540482760391, -76.71198247080514], 17);
        }

        clickHandler = (e) => handleMapClick(e.latlng.lat, e.latlng.lng);
        mapInstance.on("click", clickHandler);

        setMapReady(true);
        setStatusMessage("Map ready. Enable Map Click or use the search boxes to start routing.");
      } catch (err) {
        console.error("Failed to initialize map", err);
        setStatusMessage("Unable to load map data. Check console for details.");
      }
    };

    init();

    return () => {
      if (mapInstance && clickHandler) {
        try {
          mapInstance.off("click", clickHandler);
          mapInstance.remove();
        } catch {}
      }
      // Remove the container entirely
      const container = document.getElementById(mapContainerId);
      if (container) {
        container.remove();
      }
    };
  }, [mapContainerId]);

  const pillPosStyle = useMemo(() => {
    if (leftPct <= 6) return { left: 16, transform: "translateY(-50%)" };
    if (leftPct >= 94) return { right: 16, transform: "translateY(-50%)" };
    return { left: "50%", transform: "translate(-50%, -50%)" };
  }, [leftPct]);

  // keep Leaflet tiles sized when the split pane changes
  useEffect(() => {
    if (!mapRef.current) return;
    // slight delay lets the DOM finish resizing before invalidateSize
    const t = setTimeout(() => {
      try {
        mapRef.current.invalidateSize();
      } catch {
        /* no-op */
      }
    }, 80);
    return () => clearTimeout(t);
  }, [leftPct]);

  const handleMapClick = (lat, lng) => {
    if (!mapClickEnabledRef.current) return;
    if (!graphRef.current) {
      setStatusMessage("Graph not ready yet.");
      return;
    }

    const nearest = findNearestNode(lat, lng, graphRef.current);
    if (!nearest) {
      setStatusMessage("No nearby path node—try a different spot.");
      return;
    }

    if (placingRef.current === "start") {
      startKeyRef.current = nearest.key;
      placeMarker("start", nearest.lat, nearest.lng);
      setStatusMessage("Start set. Click again to place destination.");
      setPlacing("end");
    } else {
      endKeyRef.current = nearest.key;
      placeMarker("end", nearest.lat, nearest.lng);
      setStatusMessage("Destination set. Drawing route...");
      setPlacing("start");
    }
    tryRoute({ start: startInput.trim(), dest: destInput.trim() });
  };

  const placeMarker = (which, lat, lng) => {
    const L = leafletRef.current;
    if (!mapRef.current || !L) return;

    // Use image icons instead of colored dots
    const startIcon = L.icon({
      iconUrl: "/assets/stick-figure.png",
      iconSize: [56, 56],
      iconAnchor: [28, 28],
      tooltipAnchor: [0, -14],
    });
    const endIcon = L.icon({
      iconUrl: "/assets/tennis-ball.png",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      tooltipAnchor: [0, -14],
    });

    const icon = which === "start" ? startIcon : endIcon;
    const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);

    if (which === "start") {
      if (startMarkerRef.current) mapRef.current.removeLayer(startMarkerRef.current);
      startMarkerRef.current = marker;
    } else {
      if (endMarkerRef.current) mapRef.current.removeLayer(endMarkerRef.current);
      endMarkerRef.current = marker;
    }
  };

  const clearAll = () => {
    // Stop any ongoing live tracking
    try { if (watchIdRef.current != null && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchIdRef.current); } catch {}
    watchIdRef.current = null;
    setIsTracking(false);
    // Stop pulsing and remove pulse layer
    if (pulseTimerRef.current) {
      clearInterval(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
    if (userPulseRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(userPulseRef.current); } catch {}
    }
    userPulseRef.current = null;

    startKeyRef.current = null;
    endKeyRef.current = null;
    setDistanceLabel("");
    setStatusMessage("Pick a start and destination to draw a route.");
    setPlacing("start");
    setStartSuggestions([]);
    setDestSuggestions([]);
    setPendingRoute(null);
    setSaveName("");
    setShowSaveModal(false);
    setInstructions([]); // <-- Clear instructions

    //remove start/end markers and polyline from route
    if (startMarkerRef.current && mapRef.current) mapRef.current.removeLayer(startMarkerRef.current);
    if (endMarkerRef.current && mapRef.current) mapRef.current.removeLayer(endMarkerRef.current);
    if (routeLineRef.current && mapRef.current) mapRef.current.removeLayer(routeLineRef.current);
    if (userMarkerRef.current && mapRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    startMarkerRef.current = null;
    endMarkerRef.current = null;
    routeLineRef.current = null;
    userMarkerRef.current = null;
    startKeyRef.current = null;
    endKeyRef.current = null;
    setStartInput("");
    setDestInput("");
    // Remove pawprints
    pawMarkersRef.current.forEach(marker => mapRef.current.removeLayer(marker));
    pawMarkersRef.current = [];
  };

  // Reset map to default view without clearing any markers or routes
  const resetMapView = () => {
    if (!mapRef.current) return;
    try {
      mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
      setStatusMessage("Map reset to default view.");
    } catch {}
  };

  useEffect(() => {
    // Check if OSRM server is available
    isOSRMAvailable().then(available => {
      setUseOSRM(available);
      if (available) {
        console.log('OSRM server is available for routing');
      } else {
        console.log('OSRM server not available, using local Dijkstra');
      }
    });
  }, []);

  const tryRoute = async (labels) => {
    if (!graphRef.current || !startKeyRef.current || !endKeyRef.current) {
      setPendingRoute(null);
      return false;
    }
    if (startKeyRef.current === endKeyRef.current) {
      if (routeLineRef.current && mapRef.current) mapRef.current.removeLayer(routeLineRef.current);
      setDistanceLabel("Start and destination match.");
      setPendingRoute(null);
      setInstructions([]); // Clear instructions if no route
      return false;
    }

    const L = leafletRef.current;
    let path, distance, latlngs, osrmGeometry;

    // Try OSRM first if available
    if (useOSRM) {
      try {
        const startNode = graphRef.current.nodes.get(startKeyRef.current);
        const endNode = graphRef.current.nodes.get(endKeyRef.current);
        setStatusMessage("Fetching route from OSRM server...");
        const osrmRoute = await getRoute(
          startNode.lat,
          startNode.lng,
          endNode.lat,
          endNode.lng
        );
        latlngs = osrmRoute.geometry.map(([lon, lat]) => [lat, lon]);
        distance = osrmRoute.distance;
        osrmGeometry = osrmRoute.geometry;
        setStatusMessage("Route generated using OSRM server.");
      } catch (error) {
        setStatusMessage("OSRM unavailable, using local routing...");
        setUseOSRM(false);
      }
    }

    // Fallback to local Dijkstra if OSRM failed or unavailable
    if (!latlngs) {
      const result = dijkstra(graphRef.current, startKeyRef.current, endKeyRef.current);
      path = result.path;
      distance = result.distance;
      if (!path || path.length === 0 || !isFinite(distance)) {
        setStatusMessage("No route found between those points.");
        setPendingRoute(null);
        setInstructions([]); // Clear instructions if no route
        return false;
      }
      latlngs = path.map((k) => {
        const n = graphRef.current.nodes.get(k);
        return [n.lat, n.lng];
      });
      // Convert to [lon, lat] for instruction generation
      osrmGeometry = latlngs.map(([lat, lon]) => [lon, lat]);
      setStatusMessage("Route drawn using local pathfinding.");
    }

    console.log('Drawing route with', latlngs.length, 'points');
    setShowRouteToast(true);

    if (routeLineRef.current && mapRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
    }

    // Reset paw markers for each new route
    pawMarkersRef.current.forEach((marker) => mapRef.current.removeLayer(marker));
    pawMarkersRef.current = [];

    // Base polyline
    routeLineRef.current = L.polyline(latlngs, {
      color: "yellow",
      weight: 10,
      opacity: 1,
    }).addTo(mapRef.current);

    // Pawprint icon
    const pawIcon = L.icon({
      iconUrl: "/assets/pawprint.png",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    // Place pawprints along the route
    latlngs.forEach((latlng, index) => {
      // Skip first (start icon) and last (end icon) vertices
      if (index === 0 || index === latlngs.length - 1) return;
      // Keep every other point for spacing
      if (index % 4 === 0) {
        const marker = L.marker(latlng, { icon: pawIcon }).addTo(mapRef.current);
        pawMarkersRef.current.push(marker);
      }
    });

    setDistanceLabel(formatMeters(distance));
    const normalizedStart = (labels?.start || startInput || "").trim();
    const normalizedDest = (labels?.dest || destInput || "").trim();
    if (normalizedStart && normalizedDest) {
      const defaultName = `${normalizedStart} -> ${normalizedDest}`;
      setPendingRoute({ start: normalizedStart, dest: normalizedDest });
      setSaveName(defaultName);
    } else {
      setPendingRoute(null);
    }

    // Generate and set instructions (building + floor aware)
    setInstructions(generateInstructionsWithContext(osrmGeometry, graphRef.current));

    return true;
  };

  const findCampusMatch = (query) => {
    const q = normalize(query);
    if (!q) return null;
    const tokens = q.split(" ").filter(Boolean);
    let best = null;
    let bestScore = 0;
    campusBuildings.forEach((b) => {
      const name = normalize(b.name);
      let score = 0;
      tokens.forEach((t) => {
        if (name.includes(t)) score += 1;
      });
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    });
    return bestScore > 0 ? best : null;
  };

  const geocode = async (query) => {
    if (!query) return null;
    const campus = findCampusMatch(query);
    if (campus) {
      return { lat: campus.lat, lon: campus.lon, display_name: campus.name, source: "campus" };
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const json = await res.json();
      return json && json.length ? json[0] : null;
    } catch (e) {
      console.error("Geocoding failed", e);
      return null;
    }
  };

  const routeFromInputs = async () => {
    if (!startInput.trim() || !destInput.trim()) {
      setStatusMessage("Enter both a start and destination.");
      return;
    }
    setStatusMessage("Looking for campus matches...");
    const [s, e] = await Promise.all([geocode(startInput), geocode(destInput)]);
    if (!s || !e) {
      setStatusMessage("Could not find one or both locations. Try a different description.");
      return;
    }

    const resolvedStartLabel = s.display_name || startInput.trim();
    const resolvedDestLabel = e.display_name || destInput.trim();
    setStartInput(resolvedStartLabel);
    setDestInput(resolvedDestLabel);

    if (!graphRef.current) {
      setStatusMessage("Graph not ready yet.");
      return;
    }

    const nearestS = findNearestNode(parseFloat(s.lat), parseFloat(s.lon), graphRef.current);
    const nearestE = findNearestNode(parseFloat(e.lat), parseFloat(e.lon), graphRef.current);
    if (!nearestS || !nearestE) {
      setStatusMessage("No nearby path nodes for those locations.");
      return;
    }

    startKeyRef.current = nearestS.key;
    endKeyRef.current = nearestE.key;
    placeMarker("start", nearestS.lat, nearestS.lng);
    placeMarker("end", nearestE.lat, nearestE.lng);
    setStatusMessage("Drawing route...");
    setPlacing("start");
    tryRoute({ start: resolvedStartLabel, dest: resolvedDestLabel });
  };

  const toggleMapClick = () => {
    setMapClickEnabled((prev) => {
      setStatusMessage(
        prev
          ? "Map Click turned off. Use the search boxes instead."
          : "Map Click on. First click sets Start, second sets Destination."
      );
      return !prev;
    });
  };

  const pillNextLabel = mapReady ? `Next click: ${placing === "start" ? "Start" : "Destination"}` : "Loading map...";
  const campusBuildings = CAMPUS_BUILDINGS;

  const loadConfirmedRoute = () => {
    if (!confirmRoute) return;
    setStartInput(confirmRoute.start);
    setDestInput(confirmRoute.dest);
    setConfirmRoute(null);
    setShowSavedRoutes(false);
  };

  const normalize = (value) => {
    if (value == null) return "";
    if (typeof value !== "string") {
      try {
        value = String(value);
      } catch {
        return "";
      }
    }

    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  };

const handleInputChange = (which, value) => {
  if (which === "start") setStartInput(value);
  else setDestInput(value);

  const list = buildSuggestions(value);
  if (which === "start") setStartSuggestions(list);
  else setDestSuggestions(list);
};

const buildSuggestions = (value) => {
  const q = normalize(value);
  if (!q) return [];
  return campusBuildings
    .filter((b) => normalize(b.name).includes(q))
    .slice(0, 6);
};

// NEW — handlers for the “Create Saved Route” modal
const handleNewRouteInputChange = (which, value) => {
  if (which === "start") {
    setNewRouteStart(value);
    setNewRouteStartSuggestions(buildSuggestions(value));
  } else {
    setNewRouteDest(value);
    setNewRouteDestSuggestions(buildSuggestions(value));
  }
};

const handleNewRouteSuggestionSelect = (which, suggestion) => {
  if (which === "start") {
    setNewRouteStart(suggestion.name);
    setNewRouteStartSuggestions([]);
  } else {
    setNewRouteDest(suggestion.name);
    setNewRouteDestSuggestions([]);
  }
};

//open the New Saved Route modal
const openNewRouteCreator = () => {
  if (!isAuthenticated) {
    setStatusMessage("Sign in with your @umbc.edu email to create saved routes.");
    return;
  }

  // Reset modal fields
  setNewRouteName("");
  setNewRouteStart("");
  setNewRouteDest("");
  setNewRouteStartSuggestions([]);
  setNewRouteDestSuggestions([]);
  setNewRouteErrors({ name: "", start: "", dest: "" });

  setShowNewRouteModal(true);
};

const openEditRoute = (route) => {
  if (!isAuthenticated) {
    setStatusMessage("Sign in to edit saved routes.");
    return;
  }
  if (!route) return;

  setEditingRoute(route);
  setNewRouteName(route.name || "");
  setNewRouteStart(route.start || "");
  setNewRouteDest(route.dest || "");
  setNewRouteStartSuggestions([]);
  setNewRouteDestSuggestions([]);
  setNewRouteErrors({ name: "", start: "", dest: "" });
  setShowNewRouteModal(true);
};


// save the route
const saveNewNamedRoute = async () => {
  if (!isAuthenticated || !userId) {
    setStatusMessage("Sign in to save routes.");
    setShowNewRouteModal(false);
    setEditingRoute(null);
    return;
  }

  const name = newRouteName.trim();
  const start = newRouteStart.trim();
  const dest = newRouteDest.trim();

  // Field-level validation
  const errors = {
    name: name ? "" : "Please enter a route name.",
    start: start ? "" : "Please choose a start building.",
    dest: dest ? "" : "Please choose a destination building.",
  };

  if (errors.name || errors.start || errors.dest) {
    setNewRouteErrors(errors);
    setStatusMessage("Fill in the highlighted fields to save this route.");
    return;
  }

  // No errors — clear any previous ones
  setNewRouteErrors({ name: "", start: "", dest: "" });

  try {
    if (editingRoute && editingRoute.id) {
      // Update existing route
      await updateDoc(doc(db, "users", userId, "routes", editingRoute.id), {
        name,
        start,
        dest,
        updatedAt: serverTimestamp(),
      });
      setStatusMessage("Saved route updated.");
    } else {
      // optional: max 5
      if (savedRoutes.length >= 5) {
        setStatusMessage("You can only store 5 saved routes. Delete one first.");
        return;
      }
      // Create new route
      await addDoc(collection(db, "users", userId, "routes"), {
        name,
        start,
        dest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatusMessage("Route saved!");
    }

    setShowNewRouteModal(false);
    setEditingRoute(null);
  } catch (err) {
    console.error("Failed to save route:", err);
    setStatusMessage("Unable to save route right now.");
  }
};
const handleSuggestionSelect = (which, suggestion) => {
    if (which === "start") {
      setStartInput(suggestion.name);
      setStartSuggestions([]);
    } else {
      setDestInput(suggestion.name);
      setDestSuggestions([]);
    }
    applySelection(which, suggestion.lat, suggestion.lon, suggestion.name);
  };

  const applySelection = (which, lat, lon, label) => {
    if (!mapRef.current) {
      setStatusMessage("Map not ready yet.");
      return;
    }
    if (!graphRef.current) {
      setStatusMessage("Graph not ready yet.");
      return;
    }
    const nearest = findNearestNode(lat, lon, graphRef.current);
    if (!nearest) {
      setStatusMessage("No nearby path nodes for that choice.");
      return;
    }
    if (which === "start") {
      startKeyRef.current = nearest.key;
      placeMarker("start", nearest.lat, nearest.lng);
      setPlacing("end");
    } else {
      endKeyRef.current = nearest.key;
      placeMarker("end", nearest.lat, nearest.lng);
      setPlacing("start");
    }
    setStatusMessage(`Selected ${label}. Drawing route if both points set.`);
    const startLabel = which === "start" ? label : startInput.trim();
    const destLabel = which === "dest" ? label : destInput.trim();
    tryRoute({ start: startLabel, dest: destLabel });
  };

  const openSaveModal = () => {
    if (!pendingRoute) return;
    if (!saveName.trim()) {
      setSaveName(`${pendingRoute.start} -> ${pendingRoute.dest}`);
    }
    setShowSavedRoutes(false);
    setConfirmRoute(null);
    setShowSaveModal(true);
  };

  const saveCurrentRoute = async () => {
    if (!pendingRoute) return;
    const nameToUse = (saveName || `${pendingRoute.start} -> ${pendingRoute.dest}`).trim();
    const existing = savedRoutes.find((r) => r.start === pendingRoute.start && r.dest === pendingRoute.dest);
    const listIsFull = savedRoutes.length >= 5 && !existing;
    if (listIsFull) {
      setStatusMessage("You can only keep 5 saved routes. Delete one before saving.");
      return;
    }

    if (!isAuthenticated) {
      const id = existing?.id || `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setSavedRoutes((prev) => {
        const withoutDup = prev.filter((r) => !(r.start === pendingRoute.start && r.dest === pendingRoute.dest));
        return [...withoutDup, { ...pendingRoute, id, name: nameToUse, createdAt: Date.now() }];
      });
      setStatusMessage("Route saved locally. Sign in to sync across devices.");
      setShowSaveModal(false);
      return;
    }

    try {
      const payload = {
        name: nameToUse,
        start: pendingRoute.start,
        dest: pendingRoute.dest,
        updatedAt: serverTimestamp(),
      };
      if (existing) {
        await updateDoc(doc(db, "users", userId, "routes", existing.id), payload);
      } else {
        await addDoc(collection(db, "users", userId, "routes"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setStatusMessage("Route saved to your account.");
      setShowSaveModal(false);
    } catch (err) {
      console.error("Failed to save route", err);
      setStatusMessage("Unable to save route right now. Please try again.");
    }
  };

  const deleteRoute = async (route) => {
    if (!route) return;
    if (confirmRoute?.id === route.id) setConfirmRoute(null);

    if (!isAuthenticated) {
      setSavedRoutes((prev) => prev.filter((r) => r.id !== route.id));
      setStatusMessage("Route deleted locally.");
      return;
    }

    try {
      await deleteDoc(doc(db, "users", userId, "routes", route.id));
      setStatusMessage("Route deleted from your account.");
    } catch (err) {
      console.error("Failed to delete route", err);
      setStatusMessage("Unable to delete route right now.");
    }
  };

  const placeUserMarker = (lat, lng) => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
    // Create or update the base user marker (solid dot)
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: "#3b82f6",
        color: "#1e3a8a",
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.7,
      }).addTo(mapRef.current);
    } else {
      try { userMarkerRef.current.setLatLng([lat, lng]); } catch {}
    }

    // Create or update the pulsing halo
    if (!prefersReducedMotion) {
      if (!userPulseRef.current) {
        userPulseRef.current = L.circleMarker([lat, lng], {
          radius: 12,
          fillColor: "#3b82f6",
          color: "#3b82f6",
          weight: 0,
          opacity: 0,
          fillOpacity: 0.25,
        }).addTo(mapRef.current);
      } else {
        try { userPulseRef.current.setLatLng([lat, lng]); } catch {}
      }
      // Start pulse animation if not running
      if (!pulseTimerRef.current) {
        const durationMs = 1200;
        const stepMs = 40;
        let t = 0;
        pulseTimerRef.current = setInterval(() => {
          if (!userPulseRef.current) return;
          t = (t + stepMs) % durationMs;
          const phase = t / durationMs; // 0..1
          const radius = 12 + phase * 20; // 12 -> 32
          const fillOpacity = 0.30 * (1 - phase); // 0.30 -> 0.0
          try {
            userPulseRef.current.setStyle({ radius, fillOpacity });
          } catch {}
        }, stepMs);
      }
    }
  };

  // Compute total length of a polyline in meters using Leaflet distance
  const polylineLengthMeters = (latlngs) => {
    const L = leafletRef.current;
    if (!L || !latlngs || latlngs.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < latlngs.length; i++) {
      const a = L.latLng(latlngs[i - 1][0], latlngs[i - 1][1]);
      const b = L.latLng(latlngs[i][0], latlngs[i][1]);
      total += a.distanceTo(b);
    }
    return total;
  };

  // Project a point onto the current route polyline to get nearest point and progress
  const projectToRoute = (lat, lng) => {
    if (!mapRef.current || !routeLineRef.current) return null;
    const L = leafletRef.current;
    const latlngs = routeLineRef.current.getLatLngs().map((p) => [p.lat, p.lng]);
    if (!latlngs || latlngs.length < 2) return null;

    const point = mapRef.current.latLngToLayerPoint([lat, lng]);
    let best = { dist2: Infinity, snapped: null, segIndex: -1, t: 0 };
    for (let i = 1; i < latlngs.length; i++) {
      const aLL = latlngs[i - 1];
      const bLL = latlngs[i];
      const a = mapRef.current.latLngToLayerPoint(aLL);
      const b = mapRef.current.latLngToLayerPoint(bLL);
      const ab = { x: b.x - a.x, y: b.y - a.y };
      const ap = { x: point.x - a.x, y: point.y - a.y };
      const ab2 = ab.x * ab.x + ab.y * ab.y;
      const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / ab2));
      const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      const dx = point.x - proj.x;
      const dy = point.y - proj.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best.dist2) {
        best = { dist2: d2, snapped: proj, segIndex: i - 1, t };
      }
    }

    // Convert snapped back to lat/lng
    const snappedLatLng = mapRef.current.layerPointToLatLng(best.snapped);

    // Compute distance along route to snapped point
    let traveled = 0;
    const latlngsLL = routeLineRef.current.getLatLngs();
    for (let i = 1; i <= best.segIndex; i++) {
      traveled += latlngsLL[i - 1].distanceTo(latlngsLL[i]);
    }
    if (best.segIndex >= 0) {
      const segA = latlngsLL[best.segIndex];
      const snappedLL = L.latLng(snappedLatLng.lat, snappedLatLng.lng);
      traveled += segA.distanceTo(snappedLL);
    }
    const total = polylineLengthMeters(latlngs);
    const offRouteMeters = L.latLng(lat, lng).distanceTo(L.latLng(snappedLatLng.lat, snappedLatLng.lng));

    return { snapped: [snappedLatLng.lat, snappedLatLng.lng], traveled, total, offRouteMeters };
  };

  const stopTracking = () => {
    try {
      if (watchIdRef.current != null && navigator.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    } catch {}
    watchIdRef.current = null;
    setIsTracking(false);
    // Stop pulse
    if (pulseTimerRef.current) {
      clearInterval(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
    if (userPulseRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(userPulseRef.current); } catch {}
    }
    userPulseRef.current = null;
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported in this browser.");
      return;
    }
    if (!mapRef.current) {
      setStatusMessage("Map not ready yet.");
      return;
    }
    if (!routeLineRef.current) {
      setStatusMessage("Draw a route first, then start tracking.");
      return;
    }
    // If already tracking, stop first
    if (watchIdRef.current != null) stopTracking();

    setStatusMessage("Starting live location tracking...");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        setGpsInfo({ accuracy: accuracy ?? null, speed: speed ?? null });
        placeUserMarker(lat, lng);
        if (followUser) {
          try {
            mapRef.current.panTo([lat, lng], { animate: true });
          } catch {}
        }
        const progress = projectToRoute(lat, lng);
        if (progress) {
          const pct = progress.total > 0 ? Math.min(100, Math.max(0, (progress.traveled / progress.total) * 100)) : 0;
          const off = Math.round(progress.offRouteMeters);
          if (off <= 25) {
            setStatusMessage(`On route • ${pct.toFixed(0)}% complete`);
          } else {
            setStatusMessage(`Off route by ~${off} m • ${pct.toFixed(0)}% complete`);
          }
        }
        if (!isTracking) setIsTracking(true);
      },
      (err) => {
        let msg = "Unable to track your location.";
        if (err.code === err.PERMISSION_DENIED) msg = "Location permission denied.";
        else if (err.code === err.TIMEOUT) msg = "Location request timed out.";
        setStatusMessage(msg);
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    watchIdRef.current = id;
    setIsTracking(true);
  };

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      try {
        if (watchIdRef.current != null && navigator.geolocation?.clearWatch) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      } catch {}
      // Cleanup pulse on unmount
      if (pulseTimerRef.current) {
        clearInterval(pulseTimerRef.current);
        pulseTimerRef.current = null;
      }
      if (userPulseRef.current && mapRef.current) {
        try { mapRef.current.removeLayer(userPulseRef.current); } catch {}
      }
      userPulseRef.current = null;
    };
  }, []);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported in this browser.");
      return;
    }
    if (!mapRef.current) {
      setStatusMessage("Map not ready yet.");
      return;
    }
    setIsLocating(true);
    setStatusMessage("Locating...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!graphRef.current) {
          setStatusMessage("Graph not ready yet.");
          return;
        }
        const nearest = findNearestNode(lat, lng, graphRef.current);
        if (!nearest) {
          setStatusMessage("No nearby path node for your location.");
          return;
        }
        startKeyRef.current = nearest.key;
        placeMarker("start", nearest.lat, nearest.lng);
        placeUserMarker(lat, lng);
        setStartInput("My location");
        setPlacing("end");
        try {
          mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 18), { duration: 0.5 });
        } catch {
          /* no-op */
        }
        setStatusMessage("Start set from your location. Enter a destination to route.");
        tryRoute({ start: "My location", dest: destInput.trim() });
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setStatusMessage("Location blocked. Allow permission to use Locate me.");
        } else if (err.code === err.TIMEOUT) {
          setStatusMessage("Timed out while getting location. Try again.");
        } else {
          setStatusMessage("Unable to get your location right now.");
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const canSaveCurrentRoute = Boolean(pendingRoute);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{
        background: brand.gold,
        fontSize: `calc(16px * ${textScale})`,
        filter: highContrast ? "contrast(1.12) saturate(1.05)" : undefined,
      }}
    >
      {/* TOP BAR */}
      <header
        className="flex flex-col md:flex-row md:items-center md:justify-between px-4 sm:px-6 py-3 gap-3 md:gap-4"
        style={{ background: brand.black }}
      >
        {/* Search inputs */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full md:max-w-[760px]">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder="Start location"
              value={startInput}
              onChange={(e) => handleInputChange("start", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") routeFromInputs(); }}
              className="w-full rounded-lg px-3 pr-24 py-2 bg-white focus:outline-none"
              aria-label="Start location"
            />
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={!mapReady || isLocating}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded-md text-xs font-semibold border bg-slate-900 text-white disabled:opacity-50"
              title="Use your current location as Start"
            >
              {isLocating ? "Locating..." : "Locate me"}
            </button>
            {startSuggestions.length > 0 && (
              <Suggestions list={startSuggestions} onSelect={(s) => handleSuggestionSelect("start", s)} />
            )}
          </div>
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder="Destination"
              value={destInput}
              onChange={(e) => handleInputChange("dest", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") routeFromInputs(); }}
              className="w-full rounded-lg px-3 py-2 bg-white focus:outline-none"
              aria-label="Destination"
            />
            {destSuggestions.length > 0 && (
              <Suggestions list={destSuggestions} onSelect={(s) => handleSuggestionSelect("dest", s)} />
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0 w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={routeFromInputs}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold border bg-white text-black"
              style={{ borderColor: "#d1d5db" }}
              disabled={!mapReady}
            >
              <Navigation className="h-4 w-4" />
              Route
            </button>
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border text-white"
              style={{ background: "#111827", borderColor: "#2b2b2b" }}
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </button>
            <button
              onClick={resetMapView}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border text-white"
              style={{ background: "#111827", borderColor: "#2b2b2b" }}
              disabled={!mapReady}
              title="Reset map view to default"
            >
              <Home className="h-4 w-4" /> Reset view
            </button>
            <button
              onClick={toggleMapClick}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border"
              style={{
                background: mapClickEnabled ? brand.gold : "#0f172a",
                color: mapClickEnabled ? "#111" : brand.gold,
                borderColor: "#2b2b2b",
              }}
              disabled={!mapReady}
            >
              <MousePointerClick className="h-4 w-4" />
              Map Click: {mapClickEnabled ? "On" : "Off"}
            </button>
            <button
              onClick={openSaveModal}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border"
              style={{
                background: canSaveCurrentRoute ? brand.gold : "#0f172a",
                color: canSaveCurrentRoute ? "#111" : "#9ca3af",
                borderColor: "#2b2b2b",
              }}
              disabled={!canSaveCurrentRoute}
              title={
                canSaveCurrentRoute
                  ? "Save this route for later use"
                  : "Enter start and destination, then draw a route"
              }
            >
              <BookmarkPlus className="h-4 w-4" />
              Save route
            </button>
            <button
              onClick={() => (isTracking ? stopTracking() : startTracking())}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border"
              style={{
                background: routeLineRef.current ? brand.gold : "#0f172a",
                color: routeLineRef.current ? "#111" : "#9ca3af",
                borderColor: "#2b2b2b",
              }}
              disabled={!routeLineRef.current}
              title={routeLineRef.current ? (isTracking ? "Stop live tracking" : "Start live tracking") : "Draw a route to enable tracking"}
            >
              <MapPin className="h-4 w-4" />
              {isTracking ? "Stop tracking" : "Start tracking"}
            </button>
            {isTracking && (
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border text-white" style={{ borderColor: "#2b2b2b", background: "#0f172a" }}>
                <input type="checkbox" checked={followUser} onChange={(e) => setFollowUser(e.target.checked)} />
                Follow
              </label>
            )}
            {/* Admin-only: go to Route Editor */}
            {isAdmin && typeof onGoToEditRoutes === 'function' && (
              <button
                onClick={onGoToEditRoutes}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border"
                style={{ background: brand.gold, color: "#111", borderColor: "#2b2b2b" }}
                title="Open route editor (admin)"
              >
                <Wrench className="h-4 w-4" />
                Edit Routes
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto md:ml-4">
            {userDisplayName && (
              <div className="text-right mr-1 leading-tight text-white">
                <p className="text-xs uppercase tracking-wide text-white/70">Signed in</p>
                <p className="font-semibold truncate max-w-[160px] sm:max-w-none">{userDisplayName}</p>
              </div>
            )}
            <button
              onClick={() => setShowSavedRoutes(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold border"
              style={{ background: brand.black, color: brand.gold, borderColor: "#2b2b2b" }}
            >
              <Bookmark className="h-4 w-4" /> Saved routes
            </button>
            <button
              onClick={onBackToSplash}
              aria-label="Logout"
              className="rounded-full p-2 border border-gray-600 hover:bg-white/10"
              style={{ color: brand.gold }}
              title="Log out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN SPLIT */}
      <div
        ref={containerRef}
        className="relative flex-1 grid overflow-hidden"
        style={
          isMobile
            ? { gridTemplateRows: `${leftPct}% 12px ${100 - leftPct}%` }
            : { gridTemplateColumns: `${leftPct}% 12px ${100 - leftPct}%` }
        }
      >
        {/* LEFT — map */}
        <div className="relative overflow-hidden z-0">
          <div className="absolute inset-0" ref={mapContainerRef} aria-label="Interactive campus map" />
          <div className="absolute top-4 left-4 z-[40] space-y-2">
            <div
              className="px-3 py-2 rounded-lg shadow text-sm font-semibold"
              style={{ background: "rgba(0,0,0,0.7)", color: "#f8fafc", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-lime-300" />
                <span>{pillNextLabel}</span>
              </div>
              {distanceLabel && (
                <div className="mt-1 text-xs text-white/80">Distance: {distanceLabel}</div>
              )}
            </div>
          </div>
        </div>

        {/* DIVIDER */}
        <div
          className="relative cursor-col-resize select-none z-[60]"
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          onDoubleClick={resetSplit}
          style={{ background: "rgba(0,0,0,0.25)" }}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/60 rounded" />
          <div className="group absolute top-1/2 -translate-y-1/2" style={pillPosStyle}>
            <div
              className="
                flex items-center gap-2 border shadow-xl rounded-full overflow-hidden
                transition-all duration-200
                w-11 group-hover:w-[176px] h-11 relative z-[5]
              "
              style={{ background: brand.gold, borderColor: "#8c6a00", borderWidth: 2 }}
            >
              <div className="h-11 w-11 grid place-items-center shrink-0">
                <GripVertical className="h-6 w-6 text-black/70" />
              </div>
              <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <button
                  onClick={(e) => { e.stopPropagation(); fullyCollapseLeft(); }}
                  aria-label="Collapse map"
                  title="Collapse map"
                  className="p-2 rounded-full hover:bg-black/10"
                >
                  <ChevronLeft className="h-4 w-4 text-black" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); resetSplit(); }}
                  aria-label="Reset split"
                  title="Reset"
                  className="p-2 rounded-full hover:bg-black/10"
                >
                  <RotateCcw className="h-4 w-4 text-black" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); fullyCollapseRight(); }}
                  aria-label="Collapse directions"
                  title="Collapse directions"
                  className="p-2 rounded-full hover:bg-black/10"
                >
                  <ChevronRight className="h-4 w-4 text-black" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — directions / status */}
        <div className="relative overflow-hidden z-0 flex items-center justify-center" style={{ background: "#0f172a" }}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 flex flex-col w-[94%] max-w-[1200px] h-full"
          >
            <div className="sticky top-0 px-4 pt-5 pb-3 bg-black/50 shadow rounded-t-xl backdrop-blur">
              <div className="w-full rounded-xl border border-white/10 shadow bg-black/85 text-white px-4 py-3 flex items-center gap-3 flex-wrap">
                <Route className="h-4 w-4" />
                <span className="font-semibold">Route status</span>
                <span className="text-sm text-white/80">{statusMessage}</span>
                <span className="ml-auto inline-flex items-center gap-3 text-xs opacity-90 whitespace-nowrap">
                  <Clock className="h-3.5 w-3.5" /> {distanceLabel ? `Distance ${distanceLabel}` : "Waiting for route"}
                  <A11yIcon className="h-3.5 w-3.5" /> step-free focus
                </span>
                {isTracking && (
                  <span className="inline-flex items-center gap-2 text-xs opacity-90 whitespace-nowrap ml-3">
                    <MapPin className="h-3.5 w-3.5" />
                    {gpsInfo.accuracy != null ? `±${Math.round(gpsInfo.accuracy)} m` : "tracking"}
                    {gpsInfo.speed != null && ` • ${(gpsInfo.speed * 3.6).toFixed(0)} km/h`}
                  </span>
                )}
              </div>
              {/* Human-readable instructions (scrollable) */}
              {instructions.length > 0 && (
                <div className="mt-3 bg-white/10 rounded-lg p-3 text-white text-sm max-h-56 overflow-y-auto">
                  <div className="font-semibold mb-1">Directions:</div>
                  <ol className="list-decimal pl-5 space-y-1">
                    {instructions.map((inst, idx) => (
                      <li key={idx}>
                        {inst.type}
                        {inst.type !== 'Arrive at destination' && inst.distance
                          ? ` in ${inst.distance} meters`
                          : ''}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto px-4 pb-6" />
          </motion.div>
        </div>
      </div>

      {/* FOOTER with working buttons */}
      <footer className="flex-none w-full px-6 py-3 text-white" style={{ background: brand.ink }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button onClick={() => setOpen("how")} className="hover:underline inline-flex items-center gap-2">
              <BookOpenText className="h-4 w-4" /> How to use
            </button>
            <button onClick={() => setOpen("a11y")} className="hover:underline inline-flex items-center gap-2">
              <A11yIcon className="h-4 w-4" /> Accessibility
            </button>
            <button onClick={() => setOpen("settings")} className="hover:underline inline-flex items-center gap-2">
              <Settings className="h-4 w-4" /> Settings
            </button>
          </div>
          <div className="text-sm opacity-60">© {new Date().getFullYear()} Let’s Leave</div>
        </div>
      </footer>

      {/* SAVE ROUTE PROMPT */}
      <AnimatePresence>
        {showSaveModal && pendingRoute && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[95]"
              onClick={() => setShowSaveModal(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="fixed z-[105] rounded-2xl shadow-xl p-6 w-[92vw] max-w-[480px] border-2 text-white"
              style={{
                background: brand.black,
                borderColor: brand.gold,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">Save this route</h2>
                <button onClick={() => setShowSaveModal(false)} className="hover:opacity-80">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="block text-xs uppercase tracking-wide text-white/70 mb-1">Name</span>
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 bg-white text-black focus:outline-none"
                    placeholder={`${pendingRoute.start} -> ${pendingRoute.dest}`}
                  />
                </label>
                <div className="text-xs opacity-80 bg-white/5 border border-white/10 rounded-lg p-3 space-y-1">
                  <div>Start: {pendingRoute.start}</div>
                  <div>Destination: {pendingRoute.dest}</div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCurrentRoute}
                  className="px-3 py-2 rounded-lg font-semibold"
                  style={{ background: brand.gold, color: "#111" }}
                >
                  Save route
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* SAVED ROUTES + CONFIRM */}
      <AnimatePresence>
        {showSavedRoutes && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
              onClick={() => { setShowSavedRoutes(false); setConfirmRoute(null); }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="fixed z-[100] rounded-2xl shadow-xl p-6 w-[92vw] max-w-[420px] border-2 text-white"
              style={{
                background: brand.black,
                borderColor: brand.gold,
                top: "45%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">Saved Routes</h2>
{isAuthenticated && (
<button type="button" onClick={(e)=>{e.stopPropagation(); openNewRouteCreator();}} className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 text-black hover:bg-amber-300 border border-amber-500">+ Add route</button>)}
                <button onClick={() => { setShowSavedRoutes(false); setConfirmRoute(null); }} className="hover:opacity-80">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 pr-1">
                {!isAuthenticated ? (
              <div className="text-sm bg-amber-500/20 border border-amber-400/40 rounded-lg p-3 text-amber-200">
              <p className="font-bold mb-1 text-amber-300">
                🚫 Retriever Account Required
              </p>
              <p className="text-xs leading-relaxed">
                Guests can view the map, but saved routes are a <strong>UMBC-only</strong> feature.
                Sign in with your <span className="font-semibold">@umbc.edu</span> email 
                to save routes and access them later.
              </p>
            </div>
                ) : savedRoutes.length === 0 ? (

                  <div className="text-sm opacity-80 bg-white/5 border border-white/10 rounded-lg p-3">
                    Save a route after drawing it to see it here.
                  </div>
                ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {savedRoutes.map((r) => (
                        <div
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setConfirmRoute(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setConfirmRoute(r);
                            }
                          }}
                          className="w-full text-left p-3 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition flex items-start justify-between gap-3 cursor-pointer"
                          style={{ wordBreak: "break-word", whiteSpace: "normal" }}
                          title={`Start: ${r.start} | Destination: ${r.dest}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold break-words">{r.name}</div>
                            <div className="text-xs opacity-70 mt-1 break-words">
                              Start: {r.start} | Destination: {r.dest}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditRoute(r);
                              }}
                              className="p-2 rounded-md bg-white/10 hover:bg-white/20 border border-white/20"
                              title="Edit saved route"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteRoute(r);
                              }}
                              className="p-2 rounded-md bg-white/10 hover:bg-white/20 border border-white/20"
                              title="Delete saved route"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>

            <AnimatePresence>
              {confirmRoute && (
                <>
                  <motion.div
                    className="fixed inset-0 z-[110]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                  <motion.div
                    className="fixed z-[120] rounded-xl shadow-xl p-5 w-[92vw] max-w-[420px] border text-white"
                    style={{
                      background: "#0b0b0b",
                      borderColor: brand.gold,
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                    initial={{ opacity: 0, scale: 0.9, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 6 }}
                  >
                    <div className="mb-4">
                      <div className="font-semibold mb-1">Load this route?</div>
                      <div className="text-sm opacity-90">{confirmRoute.name}</div>
                      <div className="text-xs opacity-70 mt-1" style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
                        Start: {confirmRoute.start} | Destination: {confirmRoute.dest}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setConfirmRoute(null)}
                        className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={loadConfirmedRoute}
                        className="px-3 py-2 rounded-lg font-semibold"
                        style={{ background: brand.gold, color: "#111" }}
                      >
                        Load
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>

      
<AnimatePresence>
{showNewRouteModal && (
  <>
    <motion.div className="fixed inset-0 bg-black/70 z-[115]"
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      onClick={()=>{setShowNewRouteModal(false); setEditingRoute(null);}} />
    <motion.div className="fixed z-[125] rounded-2xl shadow-xl p-6 w-[92vw] max-w-[480px] border-2 text-white"
      style={{background:"#0b0b0b", borderColor:"#FFCB05", top:"50%", left:"50%", transform:"translate(-50%, -50%)"}}
      initial={{opacity:0, scale:0.9, y:8}} animate={{opacity:1, scale:1, y:0}} exit={{opacity:0, scale:0.9, y:8}}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-lg">{editingRoute ? "Edit Saved Route" : "New Saved Route"}</h2>
        <button onClick={()=>{setShowNewRouteModal(false); setEditingRoute(null);}} className="hover:opacity-80"><X className="h-5 w-5"/></button>
      </div>
      {(newRouteErrors.name || newRouteErrors.start || newRouteErrors.dest) && (
        <div className="mb-3 text-xs bg-red-500/15 border border-red-500/60 text-red-100 rounded-lg px-3 py-2">
          Please fix the highlighted fields to continue.
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-xs mb-1">Route name</label>
          <input
            type="text"
            value={newRouteName}
            onChange={(e)=>setNewRouteName(e.target.value)}
            className={`w-full rounded-lg px-3 py-2 bg-white text-black ${newRouteErrors.name ? "border border-red-500" : ""}`}
          />
          {newRouteErrors.name && (
            <p className="mt-1 text-xs text-red-300">{newRouteErrors.name}</p>
          )}
        </div>
        <div className="relative">
          <label className="block text-xs mb-1">Start</label>
          <input
            type="text"
            value={newRouteStart}
            onChange={(e)=>handleNewRouteInputChange("start", e.target.value)}
            className={`w-full rounded-lg px-3 py-2 bg-white text-black ${newRouteErrors.start ? "border border-red-500" : ""}`}
          />
          {newRouteStartSuggestions.length>0 && (
            <Suggestions
              list={newRouteStartSuggestions}
              onSelect={(s)=>handleNewRouteSuggestionSelect("start", s)}
            />
          )}
          {newRouteErrors.start && (
            <p className="mt-1 text-xs text-red-300">{newRouteErrors.start}</p>
          )}
        </div>
        <div className="relative">
          <label className="block text-xs mb-1">Destination</label>
          <input
            type="text"
            value={newRouteDest}
            onChange={(e)=>handleNewRouteInputChange("dest", e.target.value)}
            className={`w-full rounded-lg px-3 py-2 bg-white text-black ${newRouteErrors.dest ? "border border-red-500" : ""}`}
          />
          {newRouteDestSuggestions.length>0 && (
            <Suggestions
              list={newRouteDestSuggestions}
              onSelect={(s)=>handleNewRouteSuggestionSelect("dest", s)}
            />
          )}
          {newRouteErrors.dest && (
            <p className="mt-1 text-xs text-red-300">{newRouteErrors.dest}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={()=>{setShowNewRouteModal(false); setEditingRoute(null);}} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15">Cancel</button>
        <button onClick={saveNewNamedRoute} className="px-3 py-2 rounded-lg font-semibold" style={{background:"#FFCB05", color:"#111"}}>{editingRoute ? "Save changes" : "Save route"}</button>
      </div>    </motion.div>
  </>
)}
</AnimatePresence>

{/* ROUTE FOUND TOAST */}
<AnimatePresence>
   {showRouteToast && (
    <motion.div
      className="fixed z-[130] pointer-events-none"
      style={{
        bottom: "850px",     // Just above bottom bar, floating on the map
        left: "21%",
        transform: "translateX(-50%)",
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
    >
      <div
        className="
          rounded-xl 
          px-4 py-3 
          shadow-2xl 
          border 
          flex items-center gap-2 text-sm font-semibold
        "
        style={{
          background: "#FFCB05",   // Retriever Gold
          color: "#111",           // Black text
          borderColor: "#000",     // Slight black border
        }}
      >
        <Navigation className="h-4 w-4 text-black" />
        <span>Route found! Check the right panel for directions.</span>
      </div>
    </motion.div>
  )}
</AnimatePresence>


{/* BOTTOM BAR MODALS */}
      <AnimatePresence>
        {open === "how" && (
          <Modal onClose={() => setOpen(null)} title="How to use">
            <ul className="list-disc pl-5 space-y-2">
              <li>Drag the center handle to resize map vs. directions.</li>
              <li>Use ◄ ► on the handle to snap either side closed.</li>
              <li>Enter Start/Destination at the top; saved routes can auto-fill.</li>
              <li>Use the Map Click button to simply click your start/destination if you do not know the names of the buildings.</li>
              <li>Click the Save Route button to save your current route for future use. (Note: Does not work on routes using map click.)</li>
              <li>Go to your Save Routes in order to load previous routes into the search bars.</li>
              <li>Use the Clear button to clear the current route</li>
              <li>Use the Locate me button to use your location as the starting point, then hit the Route button.</li>
              <li>Adjust text size and contrast in Accessibility.</li>
            </ul>
          </Modal>
        )}
        {open === "a11y" && (
          <Modal onClose={() => setOpen(null)} title="Accessibility">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2">
                  <Contrast className="h-4 w-4" /> High contrast
                </span>
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={(e) => setHighContrast(e.target.checked)}
                />
              </label>

              <div>
                <div className="mb-2 inline-flex items-center gap-2">
                  <Text className="h-4 w-4" /> Text size
                </div>
                <div className="flex gap-2">
                  {[1, 1.1, 1.25].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTextScale(s)}
                      className={`px-3 py-2 rounded-lg border ${
                        textScale === s
                          ? "bg-white text-black"
                          : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                      }`}
                    >
                      {s === 1 ? "100%" : s === 1.1 ? "110%" : "125%"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Modal>
        )}
        {open === "settings" && (
          <Modal onClose={() => setOpen(null)} title="Settings">
            <div className="space-y-3">
              <button
                onClick={resetSplit}
                className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/20"
              >
                Reset panel split
              </button>
              <button
                onClick={() => { setStartInput(""); setDestInput(""); }}
                className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/20"
              >
                Clear start/destination
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("letsleave:prefs");
                  setHighContrast(false);
                  setTextScale(1);
                }}
                className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/20"
              >
                Reset accessibility preferences
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Suggestions({ list, onSelect }) {
  return (
    <ul className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white text-black shadow z-50 max-h-64 overflow-auto">
      {list.map((s) => (
        <li key={s.name}>
          <button
            type="button"
            onClick={() => onSelect(s)}
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-black"
          >
            {s.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Reusable modal */
function Modal({ title, children, onClose }) {
  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="fixed z-[100] rounded-2xl shadow-xl p-6 w-[92vw] max-w-[560px] border-2 text-white"
        style={{
          background: "#0b0b0b",
          borderColor: "#FFCB05",
          top: "50%",
          left: "50%",
          transform: "translate(-100%, 100%)",
        }}
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="hover:opacity-80">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </>
  );
}

