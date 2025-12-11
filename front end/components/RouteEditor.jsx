'use client';

import { useState, useRef, useEffect } from "react";
import { Trash2, Pencil, Navigation, Plus } from "lucide-react";
import { saveGeojsonEdits, getGeojsonEdits, deleteGeojsonEdits } from "@/lib/route";

export default function RouteEditor({ isAdmin = false, onGoToUserView }) {
  const [geojson, setGeojson] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editCoords, setEditCoords] = useState([]);
  const [status, setStatus] = useState("");
  const [addSegmentMode, setAddSegmentMode] = useState(false);
  const [drawingCoords, setDrawingCoords] = useState([]);
  const [drawingMarkers, setDrawingMarkers] = useState([]);

  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const mapContainerRef = useRef(null);
  const drawnLayerRef = useRef(null);
  const vertexMarkersRef = useRef([]);
  const selectedLayerRef = useRef(null);
  const fittedOnceRef = useRef(false);
  const mapInteractivityDisabledRef = useRef(false);

  const DEFAULT_CENTER = [39.25540482760391, -76.71198247080514];
  const DEFAULT_ZOOM = 17;

  // Load geojson or edits
  const loadGeojson = async () => {
    try {
      const editsResult = await getGeojsonEdits("campusEdits");
      if (editsResult.success && editsResult.geojson) {
        setGeojson(editsResult.geojson);
        return;
      }
      const res = await fetch("/OSM-data/campus.geojson");
      const data = await res.json();
      setGeojson(data);
    } catch (err) {
      console.error("RouteEditor: Failed to load geojson:", err);
      setStatus("Failed to load campus.geojson");
    }
  };

  useEffect(() => {
    loadGeojson();
  }, []);

  // Initialize Leaflet map once geojson and container are ready
  useEffect(() => {
    let cleanupResize = null;

    const init = async () => {
      if (!geojson || !mapContainerRef.current) return;

      try {
        const L = (await import("leaflet")).default;
        leafletRef.current = L;

        // Destroy any previous map to avoid weird size / clipping issues
        if (mapRef.current) {
          try {
            mapRef.current.remove();
          } catch {}
          mapRef.current = null;
        }

        const map = L.map(mapContainerRef.current, { zoomControl: false });
        mapRef.current = map;

        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          minZoom: 17,
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        L.control.zoom({ position: "topleft" }).addTo(map);

        const invalidate = () => {
          try {
            map.invalidateSize();
          } catch {}
        };

        // Kick it a couple times after layout settles
        setTimeout(invalidate, 50);
        setTimeout(invalidate, 250);

        // Invalidate on window resize
        const resizeHandler = () => invalidate();
        window.addEventListener("resize", resizeHandler);
        cleanupResize = () => window.removeEventListener("resize", resizeHandler);

        // Fit to all campus paths once
        if (!fittedOnceRef.current) {
          const bounds = L.latLngBounds([]);
          (geojson.features || []).forEach((feat) => {
            const g = feat?.geometry;
            if (!g) return;
            const coords =
              g.type === "LineString"
                ? g.coordinates
                : g.type === "MultiLineString"
                ? g.coordinates.flat()
                : [];
            coords.forEach(([lon, lat]) => bounds.extend([lat, lon]));
          });
          if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.05));
          }
          fittedOnceRef.current = true;
        }

        // Draw all segments
        const group = L.layerGroup().addTo(map);
        drawnLayerRef.current = group;

        (geojson.features || []).forEach((feat, i) => {
          const g = feat.geometry;
          const coords =
            g.type === "LineString"
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
            selectedLayerRef.current = poly;
            group.eachLayer((layer) => {
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
      if (cleanupResize) cleanupResize();
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }
    };
  }, [geojson, editMode]);

  // Save edits helper
  const saveEditsToFile = async (updatedGeojson) => {
    setStatus("Saving...");
    try {
      const result = await saveGeojsonEdits(updatedGeojson, "campusEdits");
      console.log("RouteEditor: Save result:", result);
      setStatus("Route edits saved!");
    } catch (err) {
      console.error("RouteEditor: Error saving edits:", err);
      setStatus("Error saving edits.");
    }
  };

  // Redraw all segments (used after edits)
  const redrawAll = (preserveHighlight = true) => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
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
      const coords =
        g.type === "LineString"
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
        group.eachLayer((layer) => {
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

  // Update selected polyline from editCoords
  const updateSelectedPolylineFromEditCoords = () => {
    const L = leafletRef.current;
    const poly = selectedLayerRef.current;
    if (!L || !poly || !Array.isArray(editCoords) || editCoords.length === 0)
      return;
    const latlngs = editCoords.map((p) => [p.lat, p.lon]);
    try {
      poly.setLatLngs(latlngs);
      poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
    } catch {}
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
    saveEditsToFile(newGeojson);
    redrawAll(false);
  };

  // Start editing
  const handleEdit = () => {
    if (selectedIdx == null || !geojson) return;
    const feat = geojson.features[selectedIdx];
    let coords = [];
    if (feat.geometry.type === "LineString") coords = feat.geometry.coordinates;
    else if (feat.geometry.type === "MultiLineString")
      coords = feat.geometry.coordinates[0];

    const pts = coords.map(([lon, lat]) => ({ lat, lon }));
    setEditCoords(pts);
    setEditMode(true);
    setStatus("Drag vertices to edit. Click Save when done.");

    if (selectedLayerRef.current && selectedLayerRef.current.setStyle) {
      selectedLayerRef.current.setStyle({
        color: "#FFCB05",
        weight: 8,
        opacity: 1,
      });
    }

    disableMapInteractivity();

    const L = leafletRef.current;
    if (!L || !mapRef.current) return;
    vertexMarkersRef.current.forEach((m) => {
      try {
        mapRef.current.removeLayer(m);
      } catch {}
    });
    vertexMarkersRef.current = [];

    const vertexIcon = L.divIcon({
      className: "vertex-marker",
      html: `<div style="width:12px;height:12px;border-radius:50%;background:#FFCB05;border:2px solid #111;box-shadow:0 0 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    pts.forEach((pt, idx) => {
      const m = L.marker([pt.lat, pt.lon], {
        draggable: true,
        icon: vertexIcon,
      });
      m.on("drag", (e) => {
        const ll = e.target.getLatLng();
        setEditCoords((prev) => {
          const next = prev.map((p, i) =>
            i === idx ? { lat: ll.lat, lon: ll.lng } : p
          );
          const poly = selectedLayerRef.current;
          if (poly) {
            try {
              poly.setLatLngs(next.map((p) => [p.lat, p.lon]));
              poly.setStyle({ color: "#FFCB05", weight: 8, opacity: 1 });
            } catch {}
          }
          return next;
        });
      });
      m.on("dragend", (e) => {
        const ll = e.target.getLatLng();
        setEditCoords((prev) => {
          const next = prev.map((p, i) =>
            i === idx ? { lat: ll.lat, lon: ll.lng } : p
          );
          updateSelectedPolylineFromEditCoords();
          return next;
        });
      });
      m.addTo(mapRef.current);
      vertexMarkersRef.current.push(m);
    });
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditCoords([]);
    vertexMarkersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    vertexMarkersRef.current = [];
    if (selectedLayerRef.current && selectedLayerRef.current.setStyle) {
      selectedLayerRef.current.setStyle({
        color: "#FFCB05",
        weight: 8,
        opacity: 1,
      });
    }
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
      const parts = Array.isArray(feat.geometry.coordinates)
        ? feat.geometry.coordinates.slice()
        : [];
      parts[0] = newCoords;
      feat.geometry.coordinates = parts;
    }

    const newFeatures = geojson.features.map((f, i) =>
      i === selectedIdx ? feat : f
    );
    const newGeojson = { ...geojson, features: newFeatures };
    setGeojson(newGeojson);

    setEditMode(false);
    setEditCoords([]);
    vertexMarkersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    vertexMarkersRef.current = [];

    if (selectedLayerRef.current && selectedLayerRef.current.setStyle) {
      selectedLayerRef.current.setStyle({
        color: "#FFCB05",
        weight: 8,
        opacity: 1,
      });
    }

    enableMapInteractivity();
    setStatus("Segment updated.");
    saveEditsToFile(newGeojson);
    redrawAll(true);
  };

  // Reset map back to original
  const handleResetMap = () => {
    setSelectedIdx(null);
    setEditMode(false);
    setEditCoords([]);
    selectedLayerRef.current = null;
    fittedOnceRef.current = false;

    if (mapRef.current) {
      try {
        mapRef.current.off();
        mapRef.current.remove();
      } catch {}
      mapRef.current = null;
    }
    if (mapContainerRef.current && mapContainerRef.current._leaflet_id) {
      mapContainerRef.current._leaflet_id = undefined;
    }
    if (drawnLayerRef.current) drawnLayerRef.current = null;
    vertexMarkersRef.current = [];

    const resetToOriginal = async () => {
      try {
        await deleteGeojsonEdits("campusEdits");
        const res = await fetch("/OSM-data/campus.geojson");
        const data = await res.json();
        setGeojson(data);
        setStatus("Map reset to original data. All edits deleted.");
      } catch (err) {
        console.error("Error during reset:", err);
        setStatus("Failed to reset map.");
      }
    };

    resetToOriginal();
  };

  // --- Add new segment (unchanged from your version) -----------------------
  const startAddSegment = () => {
    if (!mapRef.current) return;
    setAddSegmentMode(true);
    setDrawingCoords([]);
    setDrawingMarkers([]);
    setStatus(
      "Click on the map to add points. Click 'Done Drawing' when finished."
    );

    const L = leafletRef.current;
    if (!L) return;

    if (mapRef.current._drawingClickHandler) {
      mapRef.current.off("click", mapRef.current._drawingClickHandler);
    }

    const clickHandler = (e) => {
      const newCoord = { lat: e.latlng.lat, lon: e.latlng.lng };
      setDrawingCoords((prev) => {
        const updatedCoords = [...prev, newCoord];

        const markerIcon = L.divIcon({
          className: "drawing-vertex-marker",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#FF6B6B;border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.4)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker([newCoord.lat, newCoord.lon], {
          icon: markerIcon,
        }).addTo(mapRef.current);
        setDrawingMarkers((prevMarkers) => [...prevMarkers, marker]);

        if (updatedCoords.length > 1) {
          const latlngs = updatedCoords.map((c) => [c.lat, c.lon]);

          if (mapRef.current._drawingPolyline) {
            try {
              mapRef.current.removeLayer(mapRef.current._drawingPolyline);
            } catch {}
          }

          const polyline = L.polyline(latlngs, {
            color: "#FF6B6B",
            weight: 3,
            opacity: 0.8,
            dashArray: "5, 5",
          }).addTo(mapRef.current);

          mapRef.current._drawingPolyline = polyline;
        }

        setStatus(
          `Points: ${updatedCoords.length}. Click to add more, then "Done Drawing" or "Edit Lines".`
        );
        return updatedCoords;
      });
    };

    mapRef.current._drawingClickHandler = clickHandler;
    mapRef.current.on("click", clickHandler);
  };

  const finishDrawing = () => {
    if (drawingCoords.length < 2) {
      setStatus("Need at least 2 points to create a segment.");
      return;
    }

    setAddSegmentMode(false);
    setStatus("Edit the line or click 'Save Segment' to finalize.");

    if (mapRef.current._drawingClickHandler) {
      mapRef.current.off("click", mapRef.current._drawingClickHandler);
      mapRef.current._drawingClickHandler = null;
    }

    const pts = drawingCoords;
    setEditCoords(pts);
    setEditMode(true);

    drawingMarkers.forEach((m) => {
      try {
        mapRef.current.removeLayer(m);
      } catch {}
    });
    setDrawingMarkers([]);

    const L = leafletRef.current;
    const vertexIcon = L.divIcon({
      className: "vertex-marker",
      html: `<div style="width:12px;height:12px;border-radius:50%;background:#FFCB05;border:2px solid #111;box-shadow:0 0 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    const newMarkers = [];
    pts.forEach((pt, idx) => {
      const m = L.marker([pt.lat, pt.lon], {
        draggable: true,
        icon: vertexIcon,
      });
      m.on("drag", (e) => {
        const ll = e.target.getLatLng();
        setEditCoords((prev) => {
          const next = prev.map((p, i) =>
            i === idx ? { lat: ll.lat, lon: ll.lng } : p
          );
          updateDrawingPolyline(next);
          return next;
        });
      });
      m.addTo(mapRef.current);
      newMarkers.push(m);
    });
    setDrawingMarkers(newMarkers);

    updateDrawingPolyline(pts);
  };

  const updateDrawingPolyline = (coords) => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;

    if (mapRef.current._drawingPolyline) {
      try {
        mapRef.current.removeLayer(mapRef.current._drawingPolyline);
      } catch {}
    }

    const latlngs = coords.map((c) => [c.lat, c.lon]);
    const polyline = L.polyline(latlngs, {
      color: "#FF6B6B",
      weight: 3,
      opacity: 0.8,
      dashArray: "5, 5",
    }).addTo(mapRef.current);
    mapRef.current._drawingPolyline = polyline;
  };

  const cancelAddSegment = () => {
    if (mapRef.current?._drawingClickHandler) {
      mapRef.current.off("click", mapRef.current._drawingClickHandler);
      mapRef.current._drawingClickHandler = null;
    }

    drawingMarkers.forEach((m) => {
      try {
        mapRef.current.removeLayer(m);
      } catch {}
    });
    setDrawingMarkers([]);

    if (mapRef.current?._drawingPolyline) {
      try {
        mapRef.current.removeLayer(mapRef.current._drawingPolyline);
      } catch {}
      mapRef.current._drawingPolyline = null;
    }

    setAddSegmentMode(false);
    setEditMode(false);
    setDrawingCoords([]);
    setEditCoords([]);
    enableMapInteractivity();
    setStatus("Add segment cancelled.");
  };

  const saveNewSegment = () => {
    if (editCoords.length < 2) {
      setStatus("Need at least 2 points to save a segment.");
      return;
    }

    const newFeature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: editCoords.map(({ lat, lon }) => [lon, lat]),
      },
      properties: {},
    };

    const newFeatures = [...(geojson.features || []), newFeature];
    const newGeojson = { ...geojson, features: newFeatures };
    setGeojson(newGeojson);

    drawingMarkers.forEach((m) => {
      try {
        mapRef.current.removeLayer(m);
      } catch {}
    });
    setDrawingMarkers([]);

    if (mapRef.current?._drawingPolyline) {
      try {
        mapRef.current.removeLayer(mapRef.current._drawingPolyline);
      } catch {}
      mapRef.current._drawingPolyline = null;
    }

    setAddSegmentMode(false);
    setEditMode(false);
    setDrawingCoords([]);
    setEditCoords([]);
    setSelectedIdx(null);
    enableMapInteractivity();

    setStatus("Segment added!");
    saveEditsToFile(newGeojson);
    redrawAll(false);
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-black via-slate-900 to-slate-950 text-white flex flex-col overflow-hidden">
      {/* Soft radial glow behind content */}
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-amber-400 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-emerald-500 blur-3xl opacity-60" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-3 sm:px-6 lg:px-8 py-4 border-b border-slate-800/70 bg-black/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-black shadow-md">
            <Pencil className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">
                Edit Campus Routes
              </h1>
              <span className="rounded-full bg-amber-400/10 border border-amber-400/40 text-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Editor
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Adjust walking paths and test the navigation experience.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && typeof onGoToUserView === "function" && (
            <button
              onClick={onGoToUserView}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800 hover:border-slate-600 transition-colors"
            >
              <Navigation className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">User View</span>
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 px-2 sm:px-4 lg:px-6 xl:px-8 py-3 sm:py-4 lg:py-5 overflow-hidden">
        <div className="w-full h-full grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
          {/* Map card */}
<section className="relative h-full rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-2xl shadow-black/40 overflow-hidden">
  {/* MAP FIRST */}
  <div className="relative h-[calc(100%-3.25rem)] min-h-0">
    <div className="absolute inset-0" ref={mapContainerRef} />
  </div>

  {/* TITLE / CONTROLS AT BOTTOM */}
  <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-slate-800/80 bg-slate-950/60">
    <div>
      <h2 className="text-sm sm:text-base font-semibold tracking-tight text-slate-50">
        Campus Map Preview
      </h2>
      <p className="text-[11px] text-slate-400">
        Click a segment to select it, then edit or delete using the side panel.
      </p>
    </div>
    <button
      onClick={handleResetMap}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800 hover:border-slate-500 transition-colors"
    >
      Reset Map
    </button>
  </div>
</section>


          {/* Controls card */}
          <section className="h-full rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-xl shadow-black/40 p-4 sm:p-5 flex flex-col gap-4 overflow-hidden">
            {/* Status pill */}
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 flex items-start gap-2">
              <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              <p>{status || "Editor ready. Select or draw a segment to begin."}</p>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              {!addSegmentMode && !editMode && (
                <button
                  onClick={startAddSegment}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 text-black text-xs font-semibold px-3 py-2 shadow-md shadow-amber-400/40 hover:shadow-lg hover:-translate-y-0.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add New Segment
                </button>
              )}

              {addSegmentMode && (
                <>
                  <button
                    onClick={finishDrawing}
                    disabled={drawingCoords.length < 2}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-black text-xs font-semibold px-3 py-2 shadow-md shadow-emerald-500/40 hover:shadow-lg hover:-translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    Done Drawing
                  </button>
                  <button
                    onClick={cancelAddSegment}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 text-slate-100 text-xs font-medium px-3 py-2 hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                </>
              )}

              {editMode && !addSegmentMode && (
                <>
                  <button
                    onClick={handleSaveEdit}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-black text-xs font-semibold px-3 py-2 shadow-md shadow-emerald-500/40 hover:shadow-lg hover:-translate-y-0.5 transition"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 text-slate-100 text-xs font-medium px-3 py-2 hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                </>
              )}

              {!addSegmentMode && (
                <>
                  <button
                    onClick={handleEdit}
                    disabled={selectedIdx == null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 text-slate-100 text-xs font-medium px-3 py-2 hover:bg-slate-700 transition disabled:opacity-40 disabled:hover:bg-slate-800"
                  >
                    <Pencil className="w-4 h-4 text-amber-300" />
                    Edit Segment
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={selectedIdx == null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 text-slate-50 text-xs font-medium px-3 py-2 hover:bg-red-700 transition disabled:opacity-40 disabled:hover:bg-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </>
              )}
            </div>

            {/* Info panels */}
            <div className="flex-1 grid grid-cols-1 gap-3 text-[11px] text-slate-200 overflow-auto pr-1">
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <h3 className="text-xs font-semibold text-slate-100 mb-1.5">
                  Selected Segment
                </h3>
                <div className="h-32 rounded-lg bg-slate-900/80 border border-slate-800 overflow-auto px-2 py-1.5 font-mono text-[10px]">
                  {selectedIdx != null && geojson?.features?.[selectedIdx]
                    ? JSON.stringify(geojson.features[selectedIdx], null, 2)
                    : "// Click a highlighted path on the map to inspect its data."}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <h3 className="text-xs font-semibold text-slate-100 mb-1.5">
                  GeoJSON Snapshot
                </h3>
                <div className="h-32 rounded-lg bg-slate-900/80 border border-slate-800 overflow-auto px-2 py-1.5 font-mono text-[10px]">
                  {geojson
                    ? JSON.stringify(geojson, null, 2)
                    : "// Loading campus.geojson..."}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 mt-1">
              Saved edits are stored in{" "}
              <span className="font-semibold text-amber-200">campusEdits</span>{" "}
              and used by the main routing engine. Walk important changes on
              campus before rolling them out to students.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
