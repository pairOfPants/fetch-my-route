/*
  Simple campus routing on Leaflet using campus.geojson (TypeScript port)
  - Builds a graph from LineString/MultiLineString features that look like walkable/driveable paths
  - Click to set Start and End; computes shortest path (_dijkstra) along the graph
*/

// Minimal declarations to avoid installing Leaflet typings in this demo.
// If you install @types/leaflet, remove these and rely on real types instead.
declare const L: any;

type LatLngTuple = [number, number];

interface GraphNode {
  lat: number;
  lng: number;
  neighbors: Map<string, number>;
}

interface Graph {
  nodes: Map<string, GraphNode>;
  bounds: any; // L.LatLngBounds
  displayFeatures: any[]; // GeoJSON.Feature[]
}

interface NearestNodeResult {
  key: string;
  lat: number;
  lng: number;
  d: number;
}

interface _state {
  map: any | null; // L.Map
  geojson: any | null; // GeoJSON.FeatureCollection
  graph: Graph | null;
  startKey: string | null;
  endKey: string | null;
  startMarker: any | null; // L.Marker
  endMarker: any | null; // L.Marker
  routeLine: any | null; // L.Polyline
  mode: 'start' | 'end';
  mapClickEnabled?: boolean;
  _routingInProgress?: boolean;
}

const _state: _state = {
  map: null,
  geojson: null,
  graph: null,
  startKey: null,
  endKey: null,
  startMarker: null,
  endMarker: null,
  routeLine: null,
  mode: 'start',
};

// Optional hard-coded campus suggestions. If you prefer fully local suggestions
// populate this array with { display_name, lat, lon } entries for common UMBC
// 39., -76.
// 39., -76. 39., -76. 39., -76.git c
// buildings. If non-empty, these will be matched first (simple substring match).
const _campusSuggestions: Array<{ display_name: string; lat: string; lon: string; }> = [
  { display_name: 'Administration Building', lat: '39.253139642304824', lon: '-76.71346680103554' },
  { display_name: 'Albin O. Kuhn Library & Gallery', lat: '39.25660870000', lon: '-76.71245780000' },
  { display_name: 'Engineering and Information Technology Building (EIT)', lat: '39.25457800522658', lon: '-76.7140007717771' },
  { display_name: 'Retriever Activities Center (RAC)', lat: '39.25519773199664', lon: '-76.71493830501481' },
  { display_name: 'University Center (UC)', lat: '39.254311897833894', lon: '-76.71321113149463' },
  { display_name: 'Fine Arts Building', lat: '39.25507302014908', lon: '-76.7134835986718' },
  { display_name: 'Performing Arts and Humanities Building (PAHB)', lat: '39.25519773199664', lon: '-76.71493830501481' },
  { display_name: 'Math & Psychology Building', lat: '39.25414744528721', lon: '-76.71235531860366' },
  { display_name: 'Biological Sciences Building', lat: '39.25478924768158', lon: '-76.71211805398877' },
  { display_name: 'Chemistry Building', lat: '39.25501939795551', lon: '-76.71303157922023' },
  { display_name: 'Physics Building', lat: '39.254509055300275', lon: '-76.70955550430352' },
  { display_name: 'Information Technology/Engineering (ITE)', lat: '39.25384780762936', lon: '-76.71410470533095' },
  { display_name: 'Public Policy Building', lat: '39.25532623674318', lon: '-76.70925261800328' },
  { display_name: 'Sondheim Hall', lat: '39.25341011749078', lon: '-76.71285953326642' },
  { display_name: 'Sherman Hall', lat: '39.253570103778465', lon: '-76.71356789706488' },
  { display_name: 'The Commons', lat: '39.255054104325616', lon: '-76.71070371980493' },
  { display_name: 'Patapsco Hall', lat: '39.255081965955036', lon: '-76.70673668410498' },
  { display_name: 'Potomac Hall', lat: '39.25606238825957', lon: '-76.70651576586262' },
  { display_name: 'Chesapeake Hall', lat: '39.256849988344115', lon: '-76.70873138610621' },
  { display_name: 'Susquehanna Hall', lat: '39.255639813873316', lon: '-76.70848158822243' },
  { display_name: 'Erickson Hall', lat: '39.25727595128962', lon: '-76.70971290743068' },
  { display_name: 'Harbor Hall', lat: '39.2574527259495', lon: '-76.70849733643549' },
  { display_name: 'Walker Avenue Apartments', lat: '39.25954838908427', lon: '-76.71396897666577' },
  { display_name: 'West Hill Apartments', lat: '39.258901446872265', lon: '-76.71259174840102' },
  { display_name: 'Hillside Apartments', lat: '39.2583895527449', lon: '-76.7090028757811' },
  { display_name: 'True Grits Dining Hall', lat: '39.255776326112745', lon: '-76.70773529041553' },
  { display_name: 'UMBC Event Center', lat: '39.25236663879639', lon: '-76.70744131697373' },
  { display_name: 'Chesapeake Employers Insurance Arena', lat: '39.25236663879639', lon: '-76.70744131697373' },
  { display_name: 'Administration Parking Garage', lat: '39.25302693252615', lon: '-76.71420411442547' },
  { display_name: 'Commons Garage', lat: '39.253422965942974', lon: '-76.7094846596835' },
  { display_name: 'Walker Avenue Garage', lat: '39.25727870467512', lon: '-76.71231647640951' },
  { display_name: 'PAHB Parking Lot', lat: '39.255380076952584', lon: '-76.71460837990287' },
  { display_name: 'UMBC Bookstore', lat: '39.254591718818936', lon: '-76.7108989975142' },
  { display_name: 'UMBC Stadium', lat: '39.250562339226114', lon: '-76.70737195403173' },
  { display_name: 'UMBC Technology Center', lat: '39.25519728191527', lon: '-76.70236441392518' },
  { display_name: 'bwtech@UMBC North', lat: '39.24946312236066', lon: '-76.7144157716465' },
  { display_name: 'bwtech@UMBC South', lat: '39.24813201069917', lon: '-76.71439688284313' }
];

/** _initMap: Initializes the map and loads data */
function _initMap(): void {
  _state.map = L.map('map');

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 16,
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(_state.map);

  fetch('./OSM-data/campus.geojson')
    .then(r => r.json())
    .then((data: any) => {
      _state.geojson = data;
      const graph = _buildGraphFromGeoJSON(data);
      _state.graph = graph;

      // Show the path network on the map (light gray)
      L.geoJSON(graph.displayFeatures, {
        style: { color: '#808080', weight: 2, opacity: 0.7 }
      }).addTo(_state.map);

      if (graph.bounds && graph.bounds.isValid()) {
        _state.map.fitBounds(graph.bounds.pad(0.05));
      } else if (data.bbox) {
        const [minX, minY, maxX, maxY] = data.bbox as [number, number, number, number];
        _state.map.fitBounds([[minY, minX], [maxY, maxX]]);
      } else {
        //_state.map.setView([39.255, -76.712], 15);
        _state.map.setView([40, -70], 15);
        _state.map.locate();
      }

      _attachHandlers();
    })
    .catch(err => {
      console.error('Failed to load campus.geojson', err);
      alert('Could not load campus.geojson. Make sure the file is present in the same folder.');
    });
}

/** _attachHandlers: wires up UI and map interactions */
function _attachHandlers(): void {
  const modeBtn = document.getElementById('mode-btn') as HTMLButtonElement;
  const modeLabel = document.getElementById('mode-label') as HTMLSpanElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const startInput = document.getElementById('start-input') as HTMLInputElement;
  const endInput = document.getElementById('end-input') as HTMLInputElement;

  // Map click mode (disabled by default). When enabled the mode cycles between
  // setting start and end on each click — this preserves original behavior.
  _state.mapClickEnabled = false;
  modeBtn.addEventListener('click', () => {
    _state.mapClickEnabled = !_state.mapClickEnabled;
    modeBtn.textContent = `Map Click: ${_state.mapClickEnabled ? 'On' : 'Off'}`;
    modeLabel.textContent = _state.mapClickEnabled ? 'Click map to set Start / End' : 'Use the search fields and click Route.';
  });

  clearBtn.addEventListener('click', _clearAll);

  // Only allow Enter to trigger route if both inputs have values and not during suggestion selection
  startInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && startInput.value && endInput.value) {
      const startSug = document.getElementById('start-suggestions') as HTMLUListElement;
      const endSug = document.getElementById('end-suggestions') as HTMLUListElement;
      if (!startSug.innerHTML && !endSug.innerHTML) {
        _routeFromInputs();
      }
    }
  });
  endInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && startInput.value && endInput.value) {
      const startSug = document.getElementById('start-suggestions') as HTMLUListElement;
      const endSug = document.getElementById('end-suggestions') as HTMLUListElement;
      if (!startSug.innerHTML && !endSug.innerHTML) {
        _routeFromInputs();
      }
    }
  });

  // Suggestion handling (debounced)
  const startSuggestionsEl = document.getElementById('start-suggestions') as HTMLUListElement;
  const endSuggestionsEl = document.getElementById('end-suggestions') as HTMLUListElement;
  const feedbackEl = document.getElementById('search-feedback') as HTMLDivElement;

  const debouncedStart = _debounce((q: string) => _updateSuggestions(q, startSuggestionsEl, 'start'), 300);
  const debouncedEnd = _debounce((q: string) => _updateSuggestions(q, endSuggestionsEl, 'end'), 300);

  startInput.addEventListener('input', (e: Event) => { feedbackEl.textContent = ''; debouncedStart((e.target as HTMLInputElement).value); });
  endInput.addEventListener('input', (e: Event) => { feedbackEl.textContent = ''; debouncedEnd((e.target as HTMLInputElement).value); });

  // Close suggestions on outside click
  document.addEventListener('click', (ev: MouseEvent) => {
    const target = ev.target as HTMLElement | null;
    if (!target || !target.closest('.search-group')) {
      startSuggestionsEl.innerHTML = '';
      endSuggestionsEl.innerHTML = '';
    }
  });

  _state.map.on('click', (e: any) => {
    if (!_state.mapClickEnabled) return;
    // alternate setting start/end based on which is set already
    if (!_state.startKey) _state.mode = 'start';
    else if (!_state.endKey && _state.startKey) _state.mode = 'end';
    else {
      // both set: reset to start to begin a new route
      _clearAll();
      _state.mode = 'start';
    }
    _onMapClick(e);
  });
}

/** _routeFromInputs: geocode, snap to graph, route */
function _routeFromInputs(): void {
  const startStr = (document.getElementById('start-input') as HTMLInputElement).value.trim();
  const endStr = (document.getElementById('end-input') as HTMLInputElement).value.trim();
  const feedbackEl = document.getElementById('search-feedback') as HTMLDivElement;
  if (!startStr || !endStr) {
    alert('Please enter both Start and End locations.');
    return;
  }

  Promise.all([ _geocodeNominatim(startStr), _geocodeNominatim(endStr) ])
    .then(([s, e]) => {
      if (!s || !e) {
        const parts: string[] = [];
        if (!s) parts.push('Start');
        if (!e) parts.push('End');
        feedbackEl.textContent = `${parts.join(' and ')} location not found.`;
        return;
      }
      // Snap to nearest nodes in the graph
      if (!_state.graph) return;
      const nearestS = _findNearestNode(parseFloat(s.lat), parseFloat(s.lon), _state.graph);
      const nearestE = _findNearestNode(parseFloat(e.lat), parseFloat(e.lon), _state.graph);
      if (!nearestS || !nearestE) {
        alert('Could not find nearby path nodes for one or both locations.');
        return;
      }
      _state.startKey = nearestS.key;
      _state.endKey = nearestE.key;
      _placeMarker('start', nearestS.lat, nearestS.lng);
      _placeMarker('end', nearestE.lat, nearestE.lng);
      _tryRoute();
    })
    .catch(err => {
      console.error('Geocoding error', err);
      alert('Geocoding failed. See console for details.');
    });
}

/** _geocodeNominatim: forward geocoding, first result or null */
function _geocodeNominatim(q: string): Promise<any | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`;
  return fetch(url, { headers: { 'Accept-Language': 'en' } })
    .then(r => r.json())
    .then((results: any[]) => results && results.length ? results[0] : null)
    .catch(() => null);
}

import { validateInput, suggestBuildingsFromInput } from './inputValidate.js';

/** _suggestNominatim: suggestions using fuzzy matching */

function _suggestNominatim(q: string, limit = 5): Promise<any[]> {
  if (!q || q.trim().length === 0) return Promise.resolve([]);
  if (!Array.isArray(_campusSuggestions) || _campusSuggestions.length === 0) {
    return Promise.resolve([]);
  }

  // Use our imported functions for validation and suggestions
  const words = validateInput(q);
  const matches = suggestBuildingsFromInput(words, _campusSuggestions);
  
  return Promise.resolve(matches.slice(0, limit));
}

/** _updateSuggestions: render suggestion list */
function _updateSuggestions(query: string, listEl: HTMLElement, which: 'start' | 'end'): void {
  listEl.innerHTML = '';
  if (!query || query.trim().length === 0) return;
  _suggestNominatim(query, 6).then(results => {
    if (!results || results.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No suggestions';
      li.setAttribute('aria-disabled', 'true');
      listEl.appendChild(li);
      return;
    }
    for (const r of results) {
      const li = document.createElement('li');
      li.textContent = r.display_name;
      li.tabIndex = 0;
      li.addEventListener('click', () => _selectSuggestion(r, which));
      li.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') _selectSuggestion(r, which); });
      listEl.appendChild(li);
    }
  }).catch(() => {
    const li = document.createElement('li');
    li.textContent = 'Error fetching suggestions';
    listEl.appendChild(li);
  });
}

/** _selectSuggestion: fill input and maybe route */
function _selectSuggestion(result: any, which: 'start' | 'end'): void {
  const startInput = document.getElementById('start-input') as HTMLInputElement;
  const endInput = document.getElementById('end-input') as HTMLInputElement;
  const listEl = document.getElementById(which === 'start' ? 'start-suggestions' : 'end-suggestions') as HTMLElement;
  if (which === 'start') {
    startInput.value = result.display_name;
    (startInput as any).dataset.lat = result.lat;
    (startInput as any).dataset.lon = result.lon;
  } else {
    endInput.value = result.display_name;
    (endInput as any).dataset.lat = result.lat;
    (endInput as any).dataset.lon = result.lon;
  }
  listEl.innerHTML = '';
  if ((startInput as any).dataset.lat && (startInput as any).dataset.lon && (endInput as any).dataset.lat && (endInput as any).dataset.lon) {
    if (!_state.graph) return;
    const nearestS = _findNearestNode(parseFloat((startInput as any).dataset.lat), parseFloat((startInput as any).dataset.lon), _state.graph);
    const nearestE = _findNearestNode(parseFloat((endInput as any).dataset.lat), parseFloat((endInput as any).dataset.lon), _state.graph);
    const feedbackEl = document.getElementById('search-feedback') as HTMLDivElement;
    if (!nearestS || !nearestE) {
      feedbackEl.textContent = 'Could not find nearby path nodes for one or both selected places.';
      return;
    }
    _state.startKey = nearestS.key;
    _state.endKey = nearestE.key;
    _placeMarker('start', nearestS.lat, nearestS.lng);
    _placeMarker('end', nearestE.lat, nearestE.lng);
    _tryRoute();
  }
}

/** Simple _debounce helper */
function _debounce<F extends (...args: any[]) => void>(fn: F, wait: number): F {
  let t: any = null;
  const wrapped = function(this: any, ...args: Parameters<F>) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  } as unknown as F;
  return wrapped;
}

/** _onMapClick: handle click -> snap to node */
function _onMapClick(e: any): void {
  if (!_state.graph) return;
  const { lat, lng } = e.latlng as { lat: number; lng: number };
  const nearest = _findNearestNode(lat, lng, _state.graph);
  if (!nearest) {
    alert('No nearby path node found.');
    return;
  }

  if (_state.mode === 'start') {
    _state.startKey = nearest.key;
    _placeMarker('start', nearest.lat, nearest.lng);
  } else {
    _state.endKey = nearest.key;
    _placeMarker('end', nearest.lat, nearest.lng);
  }

  _tryRoute();
}

/** _clearAll: reset UI and _state */
function _clearAll(): void {
  _state.startKey = null;
  _state.endKey = null;
  if (_state.startMarker) { _state.map.removeLayer(_state.startMarker); _state.startMarker = null; }
  if (_state.endMarker) { _state.map.removeLayer(_state.endMarker); _state.endMarker = null; }
  if (_state.routeLine) { _state.map.removeLayer(_state.routeLine); _state.routeLine = null; }
  _setDistanceLabel('');
  const startInput = document.getElementById('start-input') as HTMLInputElement;
  const endInput = document.getElementById('end-input') as HTMLInputElement;
  startInput.value = '';
  endInput.value = '';

}

/** _placeMarker: place start/end markers */
function _placeMarker(which: 'start' | 'end', lat: number, lng: number): void {
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background:${which === 'start' ? '#22c55e' : '#ef4444'};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,.6);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  const marker = L.marker([lat, lng], { icon });
  marker.addTo(_state.map);

  if (which === 'start') {
    if (_state.startMarker) _state.map.removeLayer(_state.startMarker);
    _state.startMarker = marker;
  } else {
    if (_state.endMarker) _state.map.removeLayer(_state.endMarker);
    _state.endMarker = marker;
  }
}

/** _setDistanceLabel: update UI */
function _setDistanceLabel(text: string): void {
  const el = document.getElementById('distance-label') as HTMLSpanElement;
  el.textContent = text;
}

/** _tryRoute: compute and draw shortest path */
function _tryRoute(): void {
  if (!_state.startKey || !_state.endKey || !_state.graph) return;
  if (_state.startKey === _state.endKey) {
    if (_state.routeLine) { _state.map.removeLayer(_state.routeLine); _state.routeLine = null; }
    _setDistanceLabel('Start and End are the same node.');
    return;
  }

  if (_state._routingInProgress) return;
  _state._routingInProgress = true;

  const { path, distance } = _dijkstra(_state.graph, _state.startKey, _state.endKey);
  if (!path || path.length === 0 || !isFinite(distance)) {
    if (_state.startMarker) { _state.map.removeLayer(_state.startMarker); _state.startMarker = null; }
    if (_state.endMarker) { _state.map.removeLayer(_state.endMarker); _state.endMarker = null; }
    _setDistanceLabel('No route found between the selected points.');
    _state._routingInProgress = false;
    return;
  }

  const latlngs: LatLngTuple[] = path.map(k => {
    const n = _state.graph!.nodes.get(k)!;
    return [n.lat, n.lng];
  });

  if (_state.routeLine) _state.map.removeLayer(_state.routeLine);
  _state.routeLine = L.polyline(latlngs, { color: '#2563eb', weight: 6, opacity: 0.85, className: 'route-line' });
  _state.routeLine.addTo(_state.map);

  const pretty = _formatMeters(distance);
  _setDistanceLabel(`Distance: ${pretty}`);
  _state._routingInProgress = false;
}

/** _buildGraphFromGeoJSON: parse and build graph */
function _buildGraphFromGeoJSON(geojson: any): Graph {
  const nodes: Map<string, GraphNode> = new Map();
  const bounds = L.latLngBounds([]);
  const displayFeatures: any[] = [];

  function nodeKey(lat: number, lng: number): string {
    return `${lat.toFixed(6)},${lng.toFixed(6)}`;
  }

  function addNode(lat: number, lng: number): string {
    const key = nodeKey(lat, lng);
    if (!nodes.has(key)) {
      nodes.set(key, { lat, lng, neighbors: new Map() });
    }
    bounds.extend([lat, lng]);
    return key;
    }

  function addEdge(aKey: string, bKey: string): void {
    if (aKey === bKey) return;
    const a = nodes.get(aKey)!;
    const b = nodes.get(bKey)!;
    const w = _haversine(a.lat, a.lng, b.lat, b.lng);
    a.neighbors.set(bKey, Math.min(a.neighbors.get(bKey) ?? Infinity, w));
    b.neighbors.set(aKey, Math.min(b.neighbors.get(aKey) ?? Infinity, w));
  }

  function shouldUseFeature(feat: any): boolean {
    if (!feat || !feat.geometry) return false;
    const t = feat.geometry.type;
    if (t !== 'LineString' && t !== 'MultiLineString') return false;
    const p = (feat.properties || {});
    const tag = (p.highway || p.footway || p.path || p.sidewalk || p.cycleway || p.pedestrian || p.service || p.track || p.steps);
    if (p.power || p.fence_type || p.barrier) return false;
    if (typeof tag !== 'undefined') return true;
    return true;
  }

  function processLine(coords: Array<[number, number]>): void {
    if (!coords || coords.length < 2) return;
    let prevKey: string | null = null;
    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      const key = addNode(lat, lng);
      if (prevKey) addEdge(prevKey, key);
      prevKey = key;
    }
  }

  (geojson.features || []).forEach((feat: any) => {
    if (!shouldUseFeature(feat)) return;
    const g = feat.geometry;
    if (g.type === 'LineString') {
      processLine(g.coordinates);
      displayFeatures.push(feat);
    } else if (g.type === 'MultiLineString') {
      for (const part of g.coordinates) processLine(part);
      displayFeatures.push(feat);
    }
  });

  return { nodes, bounds, displayFeatures };
}

/** _dijkstra: shortest path */
function _dijkstra(graph: Graph, startKey: string, endKey: string): { path: string[]; distance: number } {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();

  const pq = new _MinHeap<{ key: string; d: number }>();
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

  const path: string[] = [];
  let u: string | undefined = endKey;
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

/** Minimal binary min-heap for _dijkstra */
class _MinHeap<T extends { d: number }> {
  private a: T[] = [];
  isEmpty(): boolean { return this.a.length === 0; }
  push(x: T): void { this.a.push(x); this.bubbleUp(this.a.length - 1); }
  pop(): T {
    if (this.a.length === 1) return this.a.pop() as T;
    const top = this.a[0];
    this.a[0] = this.a.pop() as T;
    this.bubbleDown(0);
    return top;
  }
  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.a[p].d <= this.a[i].d) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  private bubbleDown(i: number): void {
    const n = this.a.length;
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let m = i;
      if (l < n && this.a[l].d < this.a[m].d) m = l;
      if (r < n && this.a[r].d < this.a[m].d) m = r;
      if (m === i) break;
      [this.a[m], this.a[i]] = [this.a[i], this.a[m]];
      i = m;
    }
  }
}

/** _findNearestNode: nearest by _haversine */
function _findNearestNode(lat: number, lng: number, graph: Graph): NearestNodeResult | null {
  let best: NearestNodeResult | null = null;
  let bestD = Infinity;
  for (const [k, n] of graph.nodes) {
    const d = _haversine(lat, lng, n.lat, n.lng);
    if (d < bestD) { bestD = d; best = { key: k, lat: n.lat, lng: n.lng, d }; }
  }
  return best;
}

/** _haversine: distance in meters */
function _haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** _formatMeters: pretty distance */
function _formatMeters(m: number): string {
  if (m < 1000) return `${m.toFixed(0)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

// Initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initMap);
} else {
  _initMap();
}
