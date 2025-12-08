'use client'

import { useState, useRef, useEffect } from "react";
import { X, Trash2, Pencil, Navigation } from "lucide-react";

export default function RouteEditor({ isAdmin = false, onGoToUserView }) {
  const [geojson, setGeojson] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editCoords, setEditCoords] = useState([]);
  const [status, setStatus] = useState("");

  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const mapContainerRef = useRef(null);
  const drawnLayerRef = useRef(null);
  const vertexMarkersRef = useRef([]);
  const selectedLayerRef = useRef(null); // track highlighted segment
  const fittedOnceRef = useRef(false);   // avoid refitting view after init
  const DEFAULT_CENTER = [39.25540482760391, -76.71198247080514];
  const DEFAULT_ZOOM = 17;
  const mapInteractivityDisabledRef = useRef(false);

  useEffect(() => {
    fetch("/OSM-data/campus.geojson")
      .then(r => r.json())
      .then(setGeojson)
      .catch(() => setStatus("Failed to load campus.geojson"));
  }, []);

  // Initialize Leaflet map once geojson is ready; do NOT depend on editMode
  useEffect(() => {
    let L = null;

    const init = async () => {
      if (!geojson) return;
      if (mapRef.current) return;

      try {
        L = (await import("leaflet")).default;
        leafletRef.current = L;

        if (mapContainerRef.current && mapContainerRef.current._leaflet_id) {
          try { mapRef.current?.remove(); } catch {}
          mapContainerRef.current._leaflet_id = undefined;
        }

        const map = L.map(mapContainerRef.current, { zoomControl: false });
        mapRef.current = map;

        // Ensure the map has a center and zoom before anything else
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          minZoom: 17,
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        L.control.zoom({ position: "topleft" }).addTo(map);

        // Force size recalculation once the container is in the DOM
        setTimeout(() => {
          try { map.invalidateSize(); } catch {}
        }, 50);

        // Fit only once, and only if bounds can be computed from geojson
        if (!fittedOnceRef.current) {
          const bounds = L.latLngBounds([]);
          (geojson.features || []).forEach(feat => {
            const g = feat?.geometry;
            if (!g) return;
            const coords = g.type === "LineString"
              ? g.coordinates
              : g.type === "MultiLineString"
              ? g.coordinates.flat()
              : [];
            coords.forEach(([lon, lat]) => bounds.extend([lat, lon]));
          });
          if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.05));
          } // else keep DEFAULT_CENTER/DEFAULT_ZOOM
          fittedOnceRef.current = true;
        }

        // Draw segments
        const group = L.layerGroup().addTo(map);
        drawnLayerRef.current = group;

        (geojson.features || []).forEach((feat, i) => {
          const g = feat.geometry;
          const coords = g.type === "LineString"
            ? g.coordinates
            : g.type === "MultiLineString"
            ? g.coordinates[0]
            : null;
          if (!coords) return;
          const latlngs = coords.map(([lon, lat]) => [lat, lon]);
          const poly = L.polyline(latlngs, {
            color: "#2563eb",
            weight: 4,
            opacity: 0.7,
          }).addTo(group);

          poly.on("click", () => {
            if (editMode) return; // keep current selection during edit
            setSelectedIdx(i);
            selectedLayerRef.current = poly;
            // highlight selection, leave it glowing
            group.eachLayer(layer => {
              if (layer.setStyle) {
                layer.setStyle({ color: "#2563eb", weight: 4, opacity: 0.7 });
              }
            });
            poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
          });
        });

        setStatus("Editor ready. Click a segment to select, then Edit or Delete.");
      } catch (err) {
        console.error("Failed to initialize RouteEditor map", err);
        setStatus("Unable to initialize editor map.");
      }
    };

    init();

    return () => {
      try {
        vertexMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m));
        vertexMarkersRef.current = [];
        if (drawnLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(drawnLayerRef.current);
          drawnLayerRef.current = null;
        }
        if (mapRef.current) {
          mapRef.current.off();
          mapRef.current.remove();
          mapRef.current = null;
        }
        if (mapContainerRef.current && mapContainerRef.current._leaflet_id) {
          mapContainerRef.current._leaflet_id = undefined;
        }
        selectedLayerRef.current = null;
        fittedOnceRef.current = false;
      } catch {}
    };
  }, [geojson]); // removed editMode from deps

  // Helper: Save GeoJSON to server (simple POST, adjust as needed)
  const saveGeojson = async (newGeojson) => {
    setStatus("Saving...");
    try {
      await fetch("/api/save-geojson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGeojson),
      });
      setStatus("Saved!");
    } catch {
      setStatus("Failed to save.");
    }
  };

  // Delete selected line
  const handleDelete = () => {
    if (selectedIdx == null || !geojson) return;
    const newFeatures = geojson.features.filter((_, i) => i !== selectedIdx);
    const newGeojson = { ...geojson, features: newFeatures };
    setGeojson(newGeojson);
    setSelectedIdx(null);
    selectedLayerRef.current = null;
    setStatus("Segment deleted.");
    saveGeojson(newGeojson);
    redrawAll(false); // don't refit or change view
  };

  // Helper: update the highlighted polyline's geometry from editCoords
  const updateSelectedPolylineFromEditCoords = () => {
    const L = leafletRef.current;
    const poly = selectedLayerRef.current;
    if (!L || !poly || !Array.isArray(editCoords) || editCoords.length === 0) return;
    const latlngs = editCoords.map(p => [p.lat, p.lon]);
    try {
      poly.setLatLngs(latlngs);
      // keep highlight style
      poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
    } catch {}
  };

  const redrawAll = (preserveHighlight = true) => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
    if (drawnLayerRef.current) {
      try { mapRef.current.removeLayer(drawnLayerRef.current); } catch {}
      drawnLayerRef.current = null;
    }
    const group = L.layerGroup().addTo(mapRef.current);
    drawnLayerRef.current = group;
    (geojson.features || []).forEach((feat, i) => {
      const g = feat.geometry;
      const coords = g.type === "LineString"
        ? g.coordinates
        : g.type === "MultiLineString"
        ? g.coordinates[0]
        : null;
      if (!coords) return;
      const latlngs = coords.map(([lon, lat]) => [lat, lon]);
      const isSelected = preserveHighlight && selectedIdx === i;
      const poly = L.polyline(latlngs, {
        color: isSelected ? "#FFCB05" : "#2563eb",
        weight: isSelected ? 8 : 4,
        opacity: isSelected ? 1 : 0.7,
      }).addTo(group);
      if (isSelected) selectedLayerRef.current = poly;
      poly.on("click", () => {
        if (editMode) return;
        setSelectedIdx(i);
        selectedLayerRef.current = poly;
        group.eachLayer(layer => {
          if (layer.setStyle) {
            layer.setStyle({ color: "#2563eb", weight: 4, opacity: 0.7 });
          }
        });
        poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
      });
    });
  };

  const enableMapInteractivity = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      mapInteractivityDisabledRef.current = false;
    } catch {}
  };

  const disableMapInteractivity = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      mapInteractivityDisabledRef.current = true;
    } catch {}
  };

  // Start editing: allow dragging vertices
  const handleEdit = () => {
    if (selectedIdx == null || !geojson) return;
    const feat = geojson.features[selectedIdx];
    let coords = [];
    if (feat.geometry.type === "LineString") coords = feat.geometry.coordinates;
    else if (feat.geometry.type === "MultiLineString") coords = feat.geometry.coordinates[0];

    const pts = coords.map(([lon, lat]) => ({ lat, lon }));
    setEditCoords(pts);
    setEditMode(true);
    setStatus("Drag vertices to edit. Click Save when done.");

    // Keep selection glowing; do NOT refit or redraw map
    if (selectedLayerRef.current && selectedLayerRef.current.setStyle) {
      selectedLayerRef.current.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
    }

    // Disable map panning/zooming while editing
    disableMapInteractivity();

    // Create REAL draggable markers for each vertex using a tiny divIcon
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
    // Clear any previous edit markers
    vertexMarkersRef.current.forEach(m => { try { mapRef.current.removeLayer(m); } catch {} });
    vertexMarkersRef.current = [];

    const vertexIcon = L.divIcon({
      className: "vertex-marker",
      html: `<div style="width:12px;height:12px;border-radius:50%;background:#FFCB05;border:2px solid #111;box-shadow:0 0 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    pts.forEach((pt, idx) => {
      const m = L.marker([pt.lat, pt.lon], { draggable: true, icon: vertexIcon });
      m.on("drag", (e) => {
        const ll = e.target.getLatLng();
        // Update editCoords and immediately reflect on selected polyline
        setEditCoords(prev => {
          const next = prev.map((p, i) => (i === idx ? { lat: ll.lat, lon: ll.lng } : p));
          // Optimistically update the drawn polyline using next coordinates
          const poly = selectedLayerRef.current;
          if (poly) {
            try {
              poly.setLatLngs(next.map(p => [p.lat, p.lon]));
              poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
            } catch {}
          }
          return next;
        });
      });
      m.on("dragend", (e) => {
        const ll = e.target.getLatLng();
        setEditCoords(prev => {
          const next = prev.map((p, i) => (i === idx ? { lat: ll.lat, lon: ll.lng } : p));
          updateSelectedPolylineFromEditCoords();
          return next;
        });
      });
      m.addTo(mapRef.current);
      vertexMarkersRef.current.push(m);
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditMode(false);
    setEditCoords([]);
    vertexMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m));
    vertexMarkersRef.current = [];
    // Preserve highlight; selection stays glowing
    if (selectedLayerRef.current && selectedLayerRef.current.setStyle) {
      selectedLayerRef.current.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
    }
    // Re-enable map interactivity
    enableMapInteractivity();
    setStatus("");
  };

  // Save edited segment
  const handleSaveEdit = () => {
    if (selectedIdx == null || !geojson) return;
    const feat = { ...geojson.features[selectedIdx] };
    const newCoords = editCoords.map(({ lon, lat }) => [lon, lat]);

    if (feat.geometry.type === "LineString") {
      feat.geometry.coordinates = newCoords;
    } else if (feat.geometry.type === "MultiLineString") {
      // Update the first part of the MultiLineString
      const parts = Array.isArray(feat.geometry.coordinates) ? feat.geometry.coordinates.slice() : [];
      parts[0] = newCoords;
      feat.geometry.coordinates = parts;
    }

    const newFeatures = geojson.features.map((f, i) => (i === selectedIdx ? feat : f));
    const newGeojson = { ...geojson, features: newFeatures };
    setGeojson(newGeojson);

    // Exit edit mode and clean up markers
    setEditMode(false);
    setEditCoords([]);
    vertexMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m));
    vertexMarkersRef.current = [];

    // Keep selection highlighted
    if (selectedLayerRef.current && selectedLayerRef.current.setStyle) {
      selectedLayerRef.current.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
    }

    // Re-enable map interactivity
    enableMapInteractivity();

    setStatus("Segment updated.");
    saveGeojson(newGeojson);

    // Redraw without refitting or resetting view, and preserve highlight
    redrawAll(true);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Map section */}
      <div className="relative flex-none" style={{ height: '70vh' }}>
        <div className="absolute inset-0" ref={mapContainerRef} />
      </div>

      {/* Bottom panel */}
      <div
        className="flex-none p-4 bg-white shadow-md border-t"
        style={{ maxHeight: '30vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Route Editor</h2>
          <div className="flex items-center gap-2">
            {/* Admin-only: go to User View */}
            {isAdmin && typeof onGoToUserView === 'function' && (
              <button
                onClick={onGoToUserView}
                className="px-3 py-1 text-sm font-medium rounded-md border bg-black text-white hover:bg-gray-800"
                title="Open map navigation"
              >
                <Navigation className="inline w-4 h-4 mr-1" />
                User View
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              title="Reset editor"
            >
              Reset Map
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
          <div className="flex-1 mb-2 sm:mb-0">
            <span className="text-sm text-gray-600">{status}</span>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleEdit}
              disabled={selectedIdx == null}
              className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-300"
            >
              <Pencil className="w-4 h-4 mr-1 inline" />
              Edit Segment
            </button>
            <button
              onClick={handleDelete}
              disabled={selectedIdx == null}
              className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-300"
            >
              <Trash2 className="w-4 h-4 mr-1 inline" />
              Delete Segment
            </button>
          </div>
        </div>

        {editMode && (
          <div className="mb-3">
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 mr-2"
            >
              Save Changes
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Constrain content heights to avoid panel growth */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GeoJSON Data
            </label>
            <textarea
              value={JSON.stringify(geojson, null, 2)}
              readOnly
              className="w-full h-40 p-2 text-xs border rounded-md resize-none bg-gray-50 overflow-auto"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selected Segment
            </label>
            <pre className="w-full h-40 p-2 text-xs bg-gray-50 border rounded-md overflow-auto">
              {selectedIdx != null
                ? JSON.stringify(geojson.features[selectedIdx], null, 2)
                : "No segment selected"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
