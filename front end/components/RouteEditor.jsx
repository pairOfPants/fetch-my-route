'use client'

import { useState, useRef, useEffect } from "react";
import { X, Trash2, Pencil } from "lucide-react";

export default function RouteEditor() {
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

  // Load GeoJSON on mount
  useEffect(() => {
    fetch("/OSM-data/campus.geojson")
      .then(r => r.json())
      .then(setGeojson)
      .catch(() => setStatus("Failed to load campus.geojson"));
  }, []);

  // Initialize Leaflet map once client-side and geojson ready
  useEffect(() => {
    let clickHandler = null;
    let L = null;

    const init = async () => {
      if (!geojson) return;
      if (mapRef.current) return; // already initialized

      try {
        L = (await import("leaflet")).default;
        leafletRef.current = L;

        // Clean any previous Leaflet instance on the container (fast-refresh or view toggles)
        if (mapContainerRef.current && mapContainerRef.current._leaflet_id) {
          try {
            mapRef.current?.remove();
          } catch {}
          mapContainerRef.current._leaflet_id = undefined;
        }

        const map = L.map(mapContainerRef.current, { zoomControl: false });
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          minZoom: 17,
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        L.control.zoom({ position: "topleft" }).addTo(map);

        // Compute bounds from geojson
        const bounds = L.latLngBounds([]);
        (geojson.features || []).forEach(feat => {
          const g = feat.geometry;
          const coords = g.type === "LineString"
            ? g.coordinates
            : g.type === "MultiLineString"
            ? g.coordinates.flat()
            : [];
          coords.forEach(([lon, lat]) => bounds.extend([lat, lon]));
        });
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.05));
        }

        // Draw all segments and attach click for selection
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
            if (editMode) return;
            setSelectedIdx(i);
            // highlight selection
            group.eachLayer(layer => {
              if (layer.setStyle) {
                layer.setStyle({ color: "#2563eb", weight: 4, opacity: 0.7 });
              }
            });
            poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
          });
        });

        setStatus("Editor ready. Click a segment to select, then Edit or Delete.");

        // cleanup
        clickHandler = () => {};
      } catch (err) {
        console.error("Failed to initialize RouteEditor map", err);
        setStatus("Unable to initialize editor map.");
      }
    };

    init();

    return () => {
      // teardown
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
      } catch {}
    };
  }, [geojson, editMode]);

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
    setStatus("Segment deleted.");
    saveGeojson(newGeojson);
    // Redraw layers
    redrawAll();
  };

  const redrawAll = () => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
    // Remove previous layer group
    if (drawnLayerRef.current) {
      try {
        mapRef.current.removeLayer(drawnLayerRef.current);
      } catch {}
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
      const poly = L.polyline(latlngs, {
        color: selectedIdx === i ? "#FFCB05" : "#2563eb",
        weight: selectedIdx === i ? 8 : 4,
        opacity: selectedIdx === i ? 1 : 0.7,
      }).addTo(group);
      poly.on("click", () => {
        if (editMode) return;
        setSelectedIdx(i);
        group.eachLayer(layer => {
          if (layer.setStyle) {
            layer.setStyle({ color: "#2563eb", weight: 4, opacity: 0.7 });
          }
        });
        poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
      });
    });
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

    // create draggable vertex markers
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
    vertexMarkersRef.current.forEach(m => mapRef.current.removeLayer(m));
    vertexMarkersRef.current = [];
    pts.forEach((pt, idx) => {
      const m = L.marker([pt.lat, pt.lon], { draggable: true });
      m.on("dragend", (e) => {
        const ll = e.target.getLatLng();
        setEditCoords(prev => prev.map((p, i) => (i === idx ? { lat: ll.lat, lon: ll.lng } : p)));
      });
      m.addTo(mapRef.current);
      vertexMarkersRef.current.push(m);
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditMode(false);
    setEditCoords([]);
    // remove markers
    vertexMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m));
    vertexMarkersRef.current = [];
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
      // Update the first part; extend as needed for multi-part edits
      feat.geometry.coordinates = Array.isArray(feat.geometry.coordinates)
        ? [newCoords, ...feat.geometry.coordinates.slice(1)]
        : [newCoords];
    }

    const newFeatures = geojson.features.map((f, i) => (i === selectedIdx ? feat : f));
    const newGeojson = { ...geojson, features: newFeatures };
    setGeojson(newGeojson);

    // Exit edit mode and clean up markers
    setEditMode(false);
    setEditCoords([]);
    vertexMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m));
    vertexMarkersRef.current = [];

    setStatus("Segment updated.");
    saveGeojson(newGeojson);
    redrawAll();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden" ref={mapContainerRef} />
      <div className="p-4 bg-white shadow-md">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Route Editor</h2>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 text-sm font-semibold text-white bg-blue-600 rounded-md shadow hover:bg-blue-500"
          >
            Reset Map
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 mb-3 sm:mr-3">
            <p className="text-sm text-gray-500">{status}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleEdit}
              disabled={selectedIdx == null}
              className="px-3 py-1 text-sm font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-500 disabled:bg-gray-300"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={selectedIdx == null}
              className="px-3 py-1 text-sm font-semibold text-white bg-red-600 rounded-md shadow hover:bg-red-500 disabled:bg-gray-300"
            >
              Delete
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!editMode}
              className="px-3 py-1 text-sm font-semibold text-white bg-blue-600 rounded-md shadow hover:bg-blue-500 disabled:bg-gray-300"
            >
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={!editMode}
              className="px-3 py-1 text-sm font-semibold text-white bg-gray-600 rounded-md shadow hover:bg-gray-500 disabled:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
