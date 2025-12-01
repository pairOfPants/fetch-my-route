'use client'

import { useMemo, useRef, useState, useEffect } from "react";
import {
  LogOut,
  Bookmark,
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function MapRoutePage({ onBackToSplash, user }) {
  const [leftPct, setLeftPct] = useState(50);
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
  const userDisplayName = user?.displayName || user?.email || null;

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
  const startKeyRef = useRef(null);
  const endKeyRef = useRef(null);
  const mapClickEnabledRef = useRef(false);
  const placingRef = useRef("start");

  const brand = useMemo(
    () => ({ gold: "#FFCB05", black: "#000000", ink: "#111111" }),
    []
  );

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

  const instructionCards = [
    { id: 1, text: "Turn on Map Click to drop Start then Destination. We snap to the nearest walkable path." },
    { id: 2, text: "Or type locations and press Route. We geocode with OpenStreetMap and snap to campus paths." },
    { id: 3, text: "Use Clear to reset markers and the blue line. Drag the handle to resize map vs. details." },
    { id: 4, text: "Saved routes simply fill the start/destination fields—press Route to draw them." },
    { id: 5, text: "Accessibility: toggle high contrast or bump text size in the footer at any time." },
    { id: 6, text: "Routing happens locally with campus data bundled in the app; no external API keys required." },
  ];

  const savedRoutesList = [
    { id: "rt1", name: "Commons → ENG", start: "Commons Lot", dest: "Engineering Building" },
    { id: "rt2", name: "Parking → Library", start: "Lot 22 Parking", dest: "AOK Library" },
    { id: "rt3", name: "The Quad → CMSC446", start: "Main Quad", dest: "ITE 106" },
    { id: "rt4", name: "return home", start: "your location", dest: "Chesapeake Hall 205" },
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
          minZoom: 15,
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(mapInstance);
        L.control.zoom({ position: "topright" }).addTo(mapInstance);

        const res = await fetch("/OSM-data/campus.geojson");
        const data = await res.json();
        const graph = buildGraphFromGeoJSON(L, data);
        graphRef.current = graph;

        L.geoJSON(graph.displayFeatures, {
          style: { color: "#94a3b8", weight: 2, opacity: 0.6 },
        }).addTo(mapInstance);

        if (graph.bounds && graph.bounds.isValid()) {
          mapInstance.fitBounds(graph.bounds.pad(0.05));
        } else {
          mapInstance.setView([39.255, -76.712], 16);
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
    tryRoute();
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

    if (startMarkerRef.current && mapRef.current) mapRef.current.removeLayer(startMarkerRef.current);
    if (endMarkerRef.current && mapRef.current) mapRef.current.removeLayer(endMarkerRef.current);
    if (routeLineRef.current && mapRef.current) mapRef.current.removeLayer(routeLineRef.current);
    startMarkerRef.current = null;
    endMarkerRef.current = null;
    routeLineRef.current = null;
    startKeyRef.current = null;
    endKeyRef.current = null;
    setStartInput("");
    setDestInput("");
  };

  const tryRoute = () => {
    if (!graphRef.current || !startKeyRef.current || !endKeyRef.current) return;
    if (startKeyRef.current === endKeyRef.current) {
      if (routeLineRef.current && mapRef.current) mapRef.current.removeLayer(routeLineRef.current);
      setDistanceLabel("Start and destination match.");
      return;
    }

    const { path, distance } = dijkstra(graphRef.current, startKeyRef.current, endKeyRef.current);
    if (!path || path.length === 0 || !isFinite(distance)) {
      setStatusMessage("No route found between those points.");
      return;
    }

    const L = leafletRef.current;
    const latlngs = path.map((k) => {
      const n = graphRef.current.nodes.get(k);
      return [n.lat, n.lng];
    });

    if (routeLineRef.current && mapRef.current) mapRef.current.removeLayer(routeLineRef.current);
    routeLineRef.current = L.polyline(latlngs, {
      color: "#2563eb",
      weight: 6,
      opacity: 0.85,
      className: "route-line",
    });
    routeLineRef.current.addTo(mapRef.current);
    setDistanceLabel(formatMeters(distance));
    setStatusMessage("Route drawn using campus paths.");
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
    tryRoute();
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
      { name: "Administration Building", lat: 39.253139642304824, lon: -76.71346680103554 },
      { name: "Albin O. Kuhn Library", lat: 39.25638818964179, lon: -76.71142946588373 },
      { name: "Biological Sciences Building", lat: 39.25478924768158, lon: -76.71211805398877 },
      { name: "Chemistry Building", lat: 39.25501939795551, lon: -76.71303157922023 },
      { name: "Chesapeake Employers Insurance Arena", lat: 39.25236663879639, lon: -76.70744131697373 },
      { name: "Engineering Building", lat: 39.254579817103114, lon: -76.71373618817292 },
      { name: "Fine Arts Building", lat: 39.25507302014908, lon: -76.7134835986718 },
      { name: "Information Technology and Engineering (ITE) Building", lat: 39.25384780762936, lon: -76.71410470533095 },
      { name: "Interdisciplinary Life Sciences Building", lat: 39.25393191088295, lon: -76.71108146644416 },
      { name: "Math & Psychology Building", lat: 39.254399, lon: -76.712625 },
      { name: "Performing Arts and Humanities Building", lat: 39.25519773199664, lon: -76.71493830501481 },
      { name: "Physics Building", lat: 39.254509055300275, lon: -76.70955550430352 },
      { name: "Public Policy Building", lat: 39.25532623674318, lon: -76.70925261800328 },
      { name: "Retriever Activities Center (RAC)", lat: 39.252914008110466, lon: -76.71254218232883 },
      { name: "Sherman Hall", lat: 39.253570103778465, lon: -76.71356789706488 },
      { name: "Sondheim Hall", lat: 39.25341011749078, lon: -76.71285953326642 },
      { name: "The Commons", lat: 39.255054104325616, lon: -76.71070371980493 },
      { name: "True Grits Dining Hall", lat: 39.255776326112745, lon: -76.70773529041553 },
      { name: "University Center", lat: 39.254311897833894, lon: -76.71321113149463 },
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

  const findCampusMatch = (query) => {
    const q = normalize(query);
    if (!q) return null;
    let best = null;
    let bestScore = 0;
    campusBuildings.forEach((b) => {
      const name = normalize(b.name);
      const tokens = q.split(" ").filter(Boolean);
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
    tryRoute();
  };

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
      <header className="flex items-center justify-between px-6 py-3 gap-4 flex-wrap" style={{ background: brand.black }}>
        <div className="flex gap-3 w-full max-w-[760px]">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Start location"
              value={startInput}
              onChange={(e) => handleInputChange("start", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") routeFromInputs(); }}
              className="w-full rounded-lg px-3 py-2 bg-white focus:outline-none"
              aria-label="Start location"
            />
            {startSuggestions.length > 0 && (
              <Suggestions list={startSuggestions} onSelect={(s) => handleSuggestionSelect("start", s)} />
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
              <Suggestions list={destSuggestions} onSelect={(s) => handleSuggestionSelect("dest", s)} />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
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
            onClick={toggleMapClick}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold border"
            style={{ background: mapClickEnabled ? brand.gold : "#0f172a", color: mapClickEnabled ? "#111" : brand.gold, borderColor: "#2b2b2b" }}
            disabled={!mapReady}
          >
            <MousePointerClick className="h-4 w-4" />
            Map Click: {mapClickEnabled ? "On" : "Off"}
          </button>
          {userDisplayName && (
            <div className="text-right mr-1 leading-tight text-white">
              <p className="text-xs uppercase tracking-wide text-white/70">Signed in</p>
              <p className="font-semibold">{userDisplayName}</p>
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
      </header>

      {/* MAIN SPLIT */}
      <div
        ref={containerRef}
        className="relative flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: `${leftPct}% 12px ${100 - leftPct}%` }}
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
            <div
              className="px-3 py-2 rounded-lg text-xs leading-snug max-w-[240px] shadow"
              style={{ background: "rgba(0,0,0,0.6)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="font-semibold mb-1">Tip</p>
              <p>Turn on Map Click to drop start/destination, or type locations and press Route. Paths snap to campus walkways.</p>
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
              </div>
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
                top: "50%",
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
              <div className="space-y-3">
                {savedRoutesList.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setConfirmRoute(r)}
                    className="w-full text-left p-3 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition"
                  >
                    {r.name}
                    <div className="text-xs opacity-70 mt-1">
                      Start: {r.start} • Destination: {r.dest}
                    </div>
                  </button>
                ))}
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
                      <div className="text-xs opacity-70 mt-1">
                        Start: {confirmRoute.start} • Destination: {confirmRoute.dest}
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

  (geojson.features || []).forEach((feat) => {
    if (!shouldUseFeature(feat)) return;
    const g = feat.geometry;
    if (g.type === "LineString") {
      processLine(g.coordinates);
      displayFeatures.push(feat);
    } else if (g.type === "MultiLineString") {
      g.coordinates.forEach((part) => processLine(part));
      displayFeatures.push(feat);
    }
  });

  return { nodes, bounds, displayFeatures };
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
