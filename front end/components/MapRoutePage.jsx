'use client'

import { useMemo, useRef, useState, useEffect } from "react";
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { getRoute, isOSRMAvailable, generateBasicInstructions } from "@/lib/osrmClient";

export default function MapRoutePage({ onBackToSplash, user }) {
  const [leftPct, setLeftPct] = useState(50);
  const [isMobile, setIsMobile] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
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
  const [instructions, setInstructions] = useState([]); // <-- Add state for instructions
  const userDisplayName = user?.displayName || user?.email || null;
  const userId = user?.uid || null;
  const isAuthenticated = Boolean(userId);

  // bottom bar modals
  const [open, setOpen] = useState(null); // 'how', 'a11y', 'settings'

  // shared a11y prefs
  const [highContrast, setHighContrast] = useState(false);
  const [textScale, setTextScale] = useState(1);

  const containerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const graphRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const userMarkerRef = useRef(null);
  const startKeyRef = useRef(null);
  const endKeyRef = useRef(null);
  const mapClickEnabledRef = useRef(false);
  const placingRef = useRef("start");

  const pawMarkersRef = useRef([]); //for keeping track of paw print markers

  const brand = useMemo(
    () => ({ gold: "#FFCB05", black: "#000000", ink: "#111111" }),
    []
  );
  const SAVED_ROUTES_KEY = "letsleave:savedRoutes";

  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem("letsleave:prefs") || "{}");
    if (typeof prefs.highContrast === "boolean") setHighContrast(prefs.highContrast);
    if (typeof prefs.textScale === "number") setTextScale(prefs.textScale);
  }, []);
  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem("letsleave:prefs") || "{}");
    localStorage.setItem(
      "letsleave:prefs",
      JSON.stringify({ ...prefs, highContrast, textScale })
    );
  }, [highContrast, textScale]);


  useEffect(() => {
    const updateLayout = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setLeftPct(mobile ? 80 : 50);
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
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
  const resetSplit = () => setLeftPct(isMobile ? 80 : 50);

  const startDrag = (e) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const getPoint = (evt) => {
      const touch = evt.touches?.[0];
      if (touch) return { x: touch.clientX, y: touch.clientY };
      return { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
    };

    const startPoint = getPoint(e);
    const startPct = leftPct;

    const onMove = (ev) => {
      const p = getPoint(ev);
      const delta = isMobile
        ? ((p.y - startPoint.y) / rect.height) * 100
        : ((p.x - startPoint.x) / rect.width) * 100;
      setLeftPct(() => clamp(startPct + delta, 0, 100));
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

  const instructionCards = [
    { id: 1, text: "Turn on Map Click to drop Start then Destination. We snap to the nearest walkable path." },
    { id: 2, text: "Or type locations and press Route. We geocode with OpenStreetMap and snap to campus paths." },
    { id: 3, text: "Use Clear to reset markers and the blue line. Drag the handle to resize map vs. details." },
    { id: 4, text: "Saved routes simply fill the start/destination fields—press Route to draw them." },
    { id: 5, text: "Accessibility: toggle high contrast or bump text size in the footer at any time." },
    { id: 6, text: "Routing happens locally with campus data bundled in the app; no external API keys required." },
  ];


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

  useEffect(() => {
    mapClickEnabledRef.current = mapClickEnabled;
  }, [mapClickEnabled]);

  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);

  useEffect(() => {
    let clickHandler = null;
    let mapInstance = null;

    const init = async () => {
      if (mapRef.current) return; // already initialized
      try {
        const L = (await import("leaflet")).default;
        leafletRef.current = L;

        mapInstance = L.map(mapContainerRef.current, { zoomControl: false });
        mapRef.current = mapInstance;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          minZoom: 17,
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(mapInstance);
        L.control.zoom({ position: "topleft" }).addTo(mapInstance);

        const res = await fetch("/OSM-data/campus.geojson");
        const data = await res.json();
        const graph = buildGraphFromGeoJSON(L, data);
        graphRef.current = graph;

        L.geoJSON(graph.displayFeatures, {
          style: { color: "#94a3b8", weight: 2, opacity: 0.6 },
        }).addTo(mapInstance);

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
      if (mapInstance && clickHandler) mapInstance.off("click", clickHandler);
      if (mapInstance) mapInstance.remove();
      mapRef.current = null;
      if (mapContainerRef.current && mapContainerRef.current._leaflet_id) {
        mapContainerRef.current._leaflet_id = undefined;
      }
    };
  }, []);

  const pillPosStyle = useMemo(() => {
    if (isMobile) {
      if (leftPct <= 6) return { top: 16, left: "50%", transform: "translateX(-50%)" };
      if (leftPct >= 94) return { bottom: 16, left: "50%", transform: "translateX(-50%)" };
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    if (leftPct <= 6) return { left: 16, top: "50%", transform: "translateY(-50%)" };
    if (leftPct >= 94) return { right: 16, top: "50%", transform: "translateY(-50%)" };
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }, [leftPct, isMobile]);

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

    const icon = L.divIcon({
      className: "custom-marker",
      html: `<div style="background:${which === "start" ? "#22c55e" : "#ef4444"};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,.6);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const marker = L.marker([lat, lng], { icon });
    marker.addTo(mapRef.current);

    if (which === "start") {
      if (startMarkerRef.current) mapRef.current.removeLayer(startMarkerRef.current);
      startMarkerRef.current = marker;
    } else {
      if (endMarkerRef.current) mapRef.current.removeLayer(endMarkerRef.current);
      endMarkerRef.current = marker;
    }
  };

  const clearAll = () => {
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
      if (index % 2 === 0) {
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
  const campusBuildings = useMemo(
    () => [
    { name: 'Administration Building', lat: '39.253139642304824', lon: '-76.71346680103554' },
    { name: 'Albin O. Kuhn Library & Gallery', lat: '39.25630', lon: '-76.71155' },
    { name: 'Engineering Building', lat: '39.25457800522658', lon: '-76.7140007717771' },
    { name: 'Retriever Activities Center (RAC)', lat: '39.25289', lon: '-76.71298' },
    { name: 'University Center (UC)', lat: '39.254311897833894', lon: '-76.71321113149463' },
    { name: 'Fine Arts Building', lat: '39.25507302014908', lon: '-76.7134835986718' },
    { name: 'Performing Arts and Humanities Building (PAHB)', lat: '39.25519773199664', lon: '-76.71493830501481' },
    { name: 'Math & Psychology Building', lat: '39.25414744528721', lon: '-76.71235531860366' },
    { name: 'Biological Sciences Building', lat: '39.25477', lon: '-76.71217' },
    { name: 'Chemistry Building', lat: '39.25501939795551', lon: '-76.71303157922023' },
    { name: 'Physics Building', lat: '39.254509055300275', lon: '-76.70955550430352' },
    { name: 'Information Technology/Engineering (ITE)', lat: '39.25384780762936', lon: '-76.71410470533095' },
    { name: 'Public Policy Building', lat: '39.25532623674318', lon: '-76.70925261800328' },
    { name: 'Sondheim Hall', lat: '39.25341011749078', lon: '-76.71285953326642' },
    { name: 'Sherman Hall', lat: '39.25403', lon: '-76.71365' },
    { name: 'The Commons', lat: '39.255054104325616', lon: '-76.71070371980493' },
    { name: 'Patapsco Hall', lat: '39.255081965955036', lon: '-76.70673668410498' },
    { name: 'Potomac Hall', lat: '39.25606238825957', lon: '-76.70651576586262' },
    { name: 'Chesapeake Hall', lat: '39.256849988344115', lon: '-76.70873138610621' },
    { name: 'Susquehanna Hall', lat: '39.25540', lon: '-76.70864' },
    { name: 'Erickson Hall', lat: '39.25727595128962', lon: '-76.70971290743068' },
    { name: 'Harbor Hall', lat: '39.2574527259495', lon: '-76.70849733643549' },
    { name: 'Walker Avenue Apartments', lat: '39.25954838908427', lon: '-76.71396897666577' },
    { name: 'West Hill Apartments', lat: '39.258901446872265', lon: '-76.71259174840102' },
    { name: 'Hillside Apartments', lat: '39.2583895527449', lon: '-76.7090028757811' },
    { name: 'True Grits Dining Hall', lat: '39.255776326112745', lon: '-76.70773529041553' },
    { name: 'UMBC Event Center', lat: '39.25236663879639', lon: '-76.70744131697373' },
    { name: 'Chesapeake Employers Insurance Arena', lat: '39.252', lon: '-76.70744131697373' },
    { name: 'Administration Parking Garage', lat: '39.25201', lon: '-76.71284' },
    { name: 'Commons Garage', lat: '39.253422965942974', lon: '-76.7094846596835' },
    { name: 'Walker Avenue Garage', lat: '39.25727870467512', lon: '-76.71231647640951' },
    { name: 'PAHB Parking Lot', lat: '39.255380076952584', lon: '-76.71460837990287' },
    { name: 'UMBC Bookstore', lat: '39.254591718818936', lon: '-76.7108989975142' },
    { name: 'UMBC Stadium', lat: '39.250562339226114', lon: '-76.70737195403173' },
    { name: 'UMBC Technology Center', lat: '39.23471', lon: '-76.71377' },
    { name: 'bwtech@UMBC North', lat: '39.24946312236066', lon: '-76.7144157716465' },
    { name: 'bwtech@UMBC South', lat: '39.24813201069917', lon: '-76.71439688284313' },
    { name: 'Interdisciplinary Life Sciences Building', lat: '39.25393191088295', lon: '-76.71108146644416' }
],
    []
  );

  const loadConfirmedRoute = () => {
    if (!confirmRoute) return;
    setStartInput(confirmRoute.start);
    setDestInput(confirmRoute.dest);
    setConfirmRoute(null);
    setShowSavedRoutes(false);
  };

  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

 /**
 * Validates and splits an input string into words
 * @param m The input string to validate and split (e.g. "Performing Arts & Humanities 305")
 * @returns Array of words from the input string
 */
function validateInput(m) {
    // Remove any leading/trailing whitespace
    const trimmed = m.trim();
    // Split on whitespace and filter out any empty strings
    const words = trimmed.split(/\s+/).filter(word => word.length > 0);
    return words;
}
/**
 * Suggests buildings based on input words
 * @param input Array of words to match against building names
 * @param campusSuggestions Array of building suggestions with display_name property
 * @returns Filtered array of building names that match all input words
 */
function suggestBuildingsFromInput(input, campusSuggestions) {
    // Helper: compute Levenshtein distance between two strings
    function levenshtein(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++)
            dp[i][0] = i;
        for (let j = 0; j <= n; j++)
            dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }
    // Helper: decide if an input word matches a target word roughly
    function wordMatches(inputWord, targetWord) {
        const a = inputWord.toLowerCase();
        const b = targetWord.toLowerCase();
        if (b.indexOf(a) !== -1)
            return true; // substring
        if (a.indexOf(b) !== -1)
            return true; // inverse substring
        // Accept small typos: allow edit distance relative to length
        const maxDist = Math.max(1, Math.floor(Math.min(a.length, b.length) / 4));
        return levenshtein(a, b) <= maxDist;
    }
    // We'll include a building when ANY input word matches ANY word in the building's display name.
    // This is intentionally permissive to surface candidates when the user makes small typos.
    return campusSuggestions.filter(b => {
        const name = b.display_name || '';
        // Split the building name into words (also split on punctuation)
        const nameWords = name.split(/[^\w]+/).filter(Boolean);
        for (const iw of input) {
            for (const nw of nameWords) {
                if (wordMatches(iw, nw)) {
                    return true;
                }
            }
        }
        return false;
    });
}


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
      setStatusMessage("You can only keep 5 saved routes. Delete one before saving another.");
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
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    userMarkerRef.current = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: "#3b82f6",
      color: "#1e3a8a",
      weight: 2,
      opacity: 0.9,
      fillOpacity: 0.6,
    }).addTo(mapRef.current);
  };

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
        className="w-full px-3 py-3 md:px-6 md:py-3 gap-3 md:gap-4 flex flex-wrap md:flex-nowrap items-stretch md:items-center"
        style={{ background: brand.black }}
      >
        {/* Search inputs */}
        <div className="flex w-full md:max-w-[760px] gap-2 md:gap-3 flex-col md:flex-row">
          <div className="relative flex-1">
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
              <Suggestions
                list={startSuggestions}
                onSelect={(s) => handleSuggestionSelect("start", s)}
              />
            )}
          </div>

          <div className="relative flex-1">
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
              <Suggestions
                list={destSuggestions}
                onSelect={(s) => handleSuggestionSelect("dest", s)}
              />
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex w-full md:w-auto gap-2 flex-wrap justify-between md:justify-end items-center mt-1 md:mt-0 md:ml-auto">
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
            <RotateCcw className="h-4 w-4" />
            Clear
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
            <span className="hidden sm:inline">
              Map Click: {mapClickEnabled ? "On" : "Off"}
            </span>
            <span className="sm:hidden">
              {mapClickEnabled ? "Click On" : "Click Off"}
            </span>
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
            <span className="hidden md:inline">Save route</span>
            <span className="md:hidden">Save</span>
          </button>

          {userDisplayName && (
            <div className="hidden md:block text-right mr-1 leading-tight text-white">
              <p className="text-xs uppercase tracking-wide text-white/70">
                Signed in
              </p>
              <p className="font-semibold">{userDisplayName}</p>
            </div>
          )}

          <button
            onClick={() => setShowSavedRoutes(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold border"
            style={{ background: brand.black, color: brand.gold, borderColor: "#2b2b2b" }}
          >
            <Bookmark className="h-4 w-4" />
            <span className="hidden md:inline">Saved routes</span>
            <span className="md:hidden">Saved</span>
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
      </header>

      {/* MAIN SPLIT */}
      <div
        ref={containerRef}
        className="relative flex-1 grid overflow-hidden"
        style={isMobile ? { gridTemplateRows: `${leftPct}% 12px ${100 - leftPct}%` } : { gridTemplateColumns: `${leftPct}% 12px ${100 - leftPct}%` }}
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
          className={`relative select-none z-[60] ${isMobile ? "cursor-row-resize" : "cursor-col-resize"}`}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          onDoubleClick={resetSplit}
          style={{ background: "rgba(0,0,0,0.25)" }}
        >
          {isMobile ? (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/60 rounded" />
          ) : (
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/60 rounded" />
          )}
          <div className="group absolute" style={pillPosStyle}>
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
                  aria-label={isMobile ? "Collapse map area" : "Collapse map"}
                  title={isMobile ? "Collapse map area" : "Collapse map"}
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
                  aria-label={isMobile ? "Collapse details panel" : "Collapse directions"}
                  title={isMobile ? "Collapse details panel" : "Collapse directions"}
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

            <div className="flex-1 overflow-auto px-4 pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {instructionCards.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStep(s.id)}
                    className={`text-left rounded-xl shadow-sm p-4 transition border ${
                      activeStep === s.id
                        ? "bg-white/15 border-white/40"
                        : "bg-white/10 border-white/20 hover:bg-white/15"
                    }`}
                    style={{ color: "rgba(255,255,255,0.92)" }}
                  >
                    {idx + 1}. {s.text}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* FOOTER with working buttons */}
      <footer className="flex-none w-full px-6 py-3 text-white" style={{ background: brand.ink }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button onClick={() => setOpen("how")} className="hover:underline inline-flex items-center gap-2">
              <BookOpenText className="h-4 w-4" /> How it works
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
                <button onClick={() => { setShowSavedRoutes(false); setConfirmRoute(null); }} className="hover:opacity-80">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 pr-1">
                {savedRoutes.length === 0 ? (
                  <div className="text-sm opacity-80 bg-white/5 border border-white/10 rounded-lg p-3">
                    Save a route after drawing it to see it here.
                  </div>
                ) : (
                    savedRoutes.map((r) => (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setConfirmRoute(r)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setConfirmRoute(r); } }}
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
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteRoute(r); }}
                          className="p-2 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 shrink-0"
                          title="Delete saved route"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
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

      {/* BOTTOM BAR MODALS */}
      <AnimatePresence>
        {open === "how" && (
          <Modal onClose={() => setOpen(null)} title="How it works">
            <ul className="list-disc pl-5 space-y-2">
              <li>Drag the center handle to resize map vs. directions.</li>
              <li>Use ◄ ► on the handle to snap either side closed.</li>
              <li>Enter Start/Destination at the top; saved routes can auto-fill.</li>
              <li>Adjust text size and contrast for accessibility anytime.</li>
              <li>
                <strong>Tip:</strong> Add a <em>room number after a building</em> (e.g., “Engineering 236”)
                and we’ll route you to the <strong>correct floor</strong> of that building.
              </li>
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

function buildGraphFromGeoJSON(L, geojson) {
  const nodes = new Map();
  const bounds = L.latLngBounds([]);
  const displayFeatures = [];
  // Collect building areas (polygons) for name/context lookup
  const buildingAreas = [];

  const nodeKey = (lat, lng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

  const addNode = (lat, lng) => {
    const key = nodeKey(lat, lng);
    if (!nodes.has(key)) {
      nodes.set(key, { lat, lng, neighbors: new Map() });
    }
    bounds.extend([lat, lng]);
    return key;
  };

  const addEdge = (aKey, bKey) => {
    if (aKey === bKey) return;
    const a = nodes.get(aKey);
    const b = nodes.get(bKey);
    const w = haversine(a.lat, a.lng, b.lat, b.lng);
    a.neighbors.set(bKey, Math.min(a.neighbors.get(bKey) ?? Infinity, w));
    b.neighbors.set(aKey, Math.min(b.neighbors.get(aKey) ?? Infinity, w));
  };

  const shouldUseFeature = (feat) => {
    if (!feat || !feat.geometry) return false;
    const t = feat.geometry.type;
    if (t !== "LineString" && t !== "MultiLineString") return false;
    const p = feat.properties || {};
    const tag = p.highway || p.footway || p.path || p.sidewalk || p.cycleway || p.pedestrian || p.service || p.track || p.steps;
    if (p.power || p.fence_type || p.barrier) return false;
    if (typeof tag !== "undefined") return true;
    return true;
  };

  const processLine = (coords) => {
    if (!coords || coords.length < 2) return;
    let prevKey = null;
    coords.forEach(([lng, lat]) => {
      const key = addNode(lat, lng);
      if (prevKey) addEdge(prevKey, key);
      prevKey = key;
    });
  };

  // Helper: collect building polygons for later name lookup
  const collectBuildingArea = (feat) => {
    const props = feat.properties || {};
    const name = props.name || props["building:name"] || null;
    const isBuildingTagged = props.building || name;
    if (!isBuildingTagged) return;

    const geom = feat.geometry;
    const polySets =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
        ? geom.coordinates
        : null;
    if (!polySets) return;

    // Store as arrays of rings in [lat,lng] for point-in-polygon tests
    const rings = polySets.map((poly) =>
      poly.map((ring) => ring.map(([lon, lat]) => [lat, lon]))
    );
    buildingAreas.push({ name, props, rings });
  };

  (geojson.features || []).forEach((feat) => {
    if (!feat || !feat.geometry) return;
    const g = feat.geometry;
    if (g.type === "LineString") {
      if (shouldUseFeature(feat)) {
        processLine(g.coordinates);
        displayFeatures.push(feat);
      }
    } else if (g.type === "MultiLineString") {
      if (shouldUseFeature(feat)) {
        g.coordinates.forEach((part) => processLine(part));
        displayFeatures.push(feat);
      }
    } else if (g.type === "Polygon" || g.type === "MultiPolygon") {
      collectBuildingArea(feat);
    }
  });

  return { nodes, bounds, displayFeatures, buildingAreas };
}

function dijkstra(graph, startKey, endKey) {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const pq = new MinHeap();

  graph.nodes.forEach((_, k) => dist.set(k, Infinity));
  dist.set(startKey, 0);
  pq.push({ key: startKey, d: 0 });

  while (!pq.isEmpty()) {
    const { key: u } = pq.pop();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endKey) break;

    const uNode = graph.nodes.get(u);
    if (!uNode) continue;

    for (const [v, w] of uNode.neighbors) {
      if (visited.has(v)) continue;
      const alt = (dist.get(u) ?? Infinity) + w;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
        pq.push({ key: v, d: alt });
      }
    }
  }

  const path = [];
  let u = endKey;
  if (!prev.has(u) && u !== startKey) {
    return { path: [], distance: Infinity };
  }
  while (u) {
    path.unshift(u);
    if (u === startKey) break;
    u = prev.get(u);
  }
  return { path, distance: dist.get(endKey) ?? Infinity };
}

class MinHeap {
  constructor() {
    this.a = [];
  }
  isEmpty() {
    return this.a.length === 0;
  }
  push(x) {
    this.a.push(x);
    this.bubbleUp(this.a.length - 1);
  }
  pop() {
    if (this.a.length === 1) return this.a.pop();
    const top = this.a[0];
    this.a[0] = this.a.pop();
    this.bubbleDown(0);
    return top;
  }
  bubbleUp(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.a[p].d <= this.a[i].d) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  bubbleDown(i) {
    const n = this.a.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let m = i;
      if (l < n && this.a[l].d < this.a[m].d) m = l;
      if (r < n && this.a[r].d < this.a[m].d) m = r;
      if (m === i) break;
      [this.a[m], this.a[i]] = [this.a[i], this.a[m]];
      i = m;
    }
  }
}

function findNearestNode(lat, lng, graph) {
  let best = null;
  let bestD = Infinity;
  for (const [k, n] of graph.nodes) {
    const d = haversine(lat, lng, n.lat, n.lng);
    if (d < bestD) {
      bestD = d;
      best = { key: k, lat: n.lat, lng: n.lng, d };
    }
  }
  return best;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatMeters(m) {
  if (m < 1000) return `${m.toFixed(0)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function Suggestions({ list, onSelect }) {
  return (
    <ul className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white shadow z-50 max-h-64 overflow-auto">
      {list.map((s) => (
        <li key={s.name}>
          <button
            type="button"
            onClick={() => onSelect(s)}
            className="w-full text-left px-3 py-2 hover:bg-gray-100"
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
          transform: "translate(-50%, -50%)",
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

/***Below two functions are helper functions for drawing the pawprint markers evenly */
// Calculate distance between two latlngs in meters
function distanceBetween(a, b) {
  return mapRef.current.distance(a, b); // Leaflet's built-in distance
}

// Returns array of points spaced every 'spacing' meters along the polyline
function getEvenlySpacedPoints(latlngs, spacing = 10) {
  const points = [];
  if (latlngs.length === 0) return points;

  let remaining = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const start = latlngs[i];
    const end = latlngs[i + 1];
    const segmentDist = distanceBetween(start, end);
    let distAlongSegment = spacing - remaining;

    while (distAlongSegment < segmentDist) {
      const t = distAlongSegment / segmentDist;
      const lat = start.lat + t * (end.lat - start.lat);
      const lng = start.lng + t * (end.lng - start.lng);
      points.push(L.latLng(lat, lng));
      distAlongSegment += spacing;
    }

    remaining = distAlongSegment - segmentDist;
  }

  return points;
}

// Helper to extract floor info from OSM ways (features)
function getFloorForNode(lat, lng, graph) {
  // Find the feature (way) that contains this node and has a floor tag
  for (const feat of graph.displayFeatures || []) {
    if (!feat.geometry) continue;
    let coordsArr = [];
    if (feat.geometry.type === "LineString") {
      coordsArr = [feat.geometry.coordinates];
    } else if (feat.geometry.type === "MultiLineString") {
      coordsArr = feat.geometry.coordinates;
    }
    for (const coords of coordsArr) {
      for (const [lon, lat2] of coords) {
        if (Math.abs(lat2 - lat) < 1e-6 && Math.abs(lon - lng) < 1e-6) {
          if (feat.properties && feat.properties["floor:"]) {
            return feat.properties["floor:"];
          }
        }
      }
    }
  }
  return null;
}

// Enhanced instruction generator with floor transitions
function generateInstructionsWithFloors(coordinates, graph) {
  if (!coordinates || coordinates.length < 2) return [];

  function toRad(deg) { return deg * Math.PI / 180; }
  function toDeg(rad) { return rad * 180 / Math.PI; }
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  function bearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  const instructions = [];
  let prevBearing = null;
  let prevCoord = coordinates[0];
  let distanceSinceLast = 0;
  let prevFloor = null;

  // Try to get initial floor
  if (graph && graph.displayFeatures) {
    const [lon, lat] = prevCoord;
    prevFloor = getFloorForNode(lat, lon, graph);
  }

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = prevCoord;
    const [lon2, lat2] = coordinates[i];
    const dist = haversine(lat1, lon1, lat2, lon2);
    const currBearing = bearing(lat1, lon1, lat2, lon2);

    // Floor detection
    let currFloor = prevFloor;
    if (graph && graph.displayFeatures) {
      currFloor = getFloorForNode(lat2, lon2, graph) ?? prevFloor;
    }

    // Floor transition
    if (prevFloor !== null && currFloor !== null && currFloor !== prevFloor) {
      const upOrDown = Number(currFloor) > Number(prevFloor) ? "up" : "down";
      instructions.push({
        type: `Take elevator ${upOrDown} to floor ${currFloor}`,
        at: i,
        distance: Math.round(distanceSinceLast),
      });
      distanceSinceLast = 0;
      prevFloor = currFloor;
    }

    // Turn detection
    if (prevBearing !== null) {
      let turnAngle = currBearing - prevBearing;
      if (turnAngle > 180) turnAngle -= 360;
      if (turnAngle < -180) turnAngle += 360;

      if (Math.abs(turnAngle) > 30) { // threshold for a "turn"
        instructions.push({
          type: turnAngle > 0 ? 'Turn right' : 'Turn left',
          at: i,
          distance: Math.round(distanceSinceLast),
        });
        distanceSinceLast = 0;
      }
    }

    distanceSinceLast += dist;
    prevBearing = currBearing;
    prevCoord = coordinates[i];
  }

  // Final instruction
  instructions.push({
    type: 'Arrive at destination',
    at: coordinates.length - 1,
    distance: Math.round(distanceSinceLast),
  });

  return instructions;
}

// Helper: find feature that contains a node [lat,lng]
function getFeatureAtNode(lat, lng, graph) {
  if (!graph?.displayFeatures) return null;
  for (const feat of graph.displayFeatures) {
    const g = feat?.geometry;
    if (!g) continue;
    const sets = g.type === "LineString" ? [g.coordinates] :
                 g.type === "MultiLineString" ? g.coordinates : [];
    for (const coords of sets) {
      for (const [lon2, lat2] of coords) {
        if (Math.abs(lat2 - lat) < 1e-6 && Math.abs(lon2 - lng) < 1e-6) {
          return feat;
        }
      }
    }
  }
  return null;
}

// Point-in-polygon (ray casting) for one ring
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]; // lat, lng
    const [yj, xj] = ring[j];
    const intersect =
      ((xi > lng) !== (xj > lng)) &&
      (lat < ((yj - yi) * (lng - xi)) / (xj - xi + 1e-12) + yi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Polygon with holes: first ring is outer, subsequent rings are holes
function pointInPolygon(lat, lng, rings) {
  if (!rings || rings.length === 0) return false;
  const outer = rings[0];
  if (!pointInRing(lat, lng, outer)) return false;
  // Exclude if inside any hole
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lat, lng, rings[h])) return false;
  }
  return true;
}

// Helper: resolve building context at a node using building polygons
function getBuildingAtNode(lat, lng, graph) {
  const areas = graph?.buildingAreas || [];
  for (const area of areas) {
    // MultiPolygon: area.rings is an array of polygons; each polygon is array of rings
    for (const rings of area.rings) {
      if (pointInPolygon(lat, lng, rings)) {
        return area;
      }
    }
  }
  return null;
}

// Helper: extract floor and building info at a node
function getContextForNode(lat, lng, graph) {
  const lineFeat = getFeatureAtNode(lat, lng, graph);
  const lineProps = lineFeat?.properties || {};
  const levelTag = lineProps.level ?? null;

  // Prefer building polygon name over line feature names
  const buildingArea = getBuildingAtNode(lat, lng, graph);
  const buildingName = buildingArea?.name || lineProps["building:name"] || null;

  const isBuilding = Boolean(buildingArea) || lineProps.building === "yes" || lineProps["indoor"] === "room";
  const vertical = lineProps.highway === "steps" || lineProps["conveying"] === "yes" || lineProps["elevator"] === "yes";

  return { floor: levelTag, buildingName, isBuilding, vertical };
}

// Enhanced instruction generator: building entry + floor transitions + fewer turns
function generateInstructionsWithContext(coordinates, graph) {
  if (!coordinates || coordinates.length < 2) return [];

  function toRad(deg) { return deg * Math.PI / 180; }
  function toDeg(rad) { return rad * 180 / Math.PI; }
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  function bearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  const instructions = [];
  let prevBearing = null;
  let prevCoord = coordinates[0];
  let distanceSinceLast = 0;

  let prevCtx = (() => {
    const [lon, lat] = prevCoord;
    return getContextForNode(lat, lon, graph);
  })();

  const TURN_THRESHOLD_DEG = 50;  // less chatty
  const MIN_SEGMENT_EMIT_M = 18;  // avoid tiny segments

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = prevCoord;
    const [lon2, lat2] = coordinates[i];
    const dist = haversine(lat1, lon1, lat2, lon2);
    const currBearing = bearing(lat1, lon1, lat2, lon2);
    const currCtx = getContextForNode(lat2, lon2, graph);

    // Building entry
    if (currCtx?.isBuilding && !prevCtx?.isBuilding) {
      const bName = currCtx.buildingName ? ` ${currCtx.buildingName}` : "";
      instructions.push({
        type: `Enter${bName}`,
        at: i,
        distance: Math.round(distanceSinceLast),
      });
      distanceSinceLast = 0;
    }

    // Floor transitions (prefer explicit elevator wording if vertical segment flagged)
    const prevFloorNum = prevCtx?.floor != null ? Number(prevCtx.floor) : null;
    const currFloorNum = currCtx?.floor != null ? Number(currCtx.floor) : null;
    if (prevFloorNum != null && currFloorNum != null && currFloorNum !== prevFloorNum) {
      const dir = currFloorNum > prevFloorNum ? "up" : "down";
      const verb = currCtx?.vertical ? "Take elevator" : "Go";
      instructions.push({
        type: `${verb} ${dir} to floor ${currFloorNum}`,
        at: i,
        distance: Math.round(distanceSinceLast),
      });
      distanceSinceLast = 0;
    }

    // Turn detection (reduced noise)
    if (prevBearing !== null) {
      let turnAngle = currBearing - prevBearing;
      if (turnAngle > 180) turnAngle -= 360;
      if (turnAngle < -180) turnAngle += 360;

      if (Math.abs(turnAngle) >= TURN_THRESHOLD_DEG && distanceSinceLast >= MIN_SEGMENT_EMIT_M) {
        instructions.push({
          type: turnAngle > 0 ? "Turn right" : "Turn left",
          at: i,
          distance: Math.round(distanceSinceLast),
        });
        distanceSinceLast = 0;
      }
    }

    distanceSinceLast += dist;
    prevBearing = currBearing;
    prevCoord = coordinates[i];
    prevCtx = currCtx;
  }

  // Final instruction
  instructions.push({
    type: "Arrive at destination",
    at: coordinates.length - 1,
    distance: Math.round(distanceSinceLast),
  });

  // Collapse duplicates and micro-segments
  const filtered = [];
  for (const inst of instructions) {
    const last = filtered[filtered.length - 1];
    if (last && last.type === inst.type) {
      last.distance += inst.distance;
    } else {
      filtered.push(inst);
    }
  }
  return filtered;
}
