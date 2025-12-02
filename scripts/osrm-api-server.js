const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5000;
const geojsonPath = path.resolve(__dirname, '../front end/public/OSM-data/campus.geojson');

let graph = null;

// Load and build graph
function buildGraphFromGeoJSON(geojson) {
  const nodes = new Map();
  const nodeKey = (lat, lng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;
  
  const addNode = (lat, lng) => {
    const key = nodeKey(lat, lng);
    if (!nodes.has(key)) {
      nodes.set(key, { lat, lng, neighbors: new Map() });
    }
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
    if (!feat?.geometry) return;
    const g = feat.geometry;
    if (g.type === 'LineString') {
      processLine(g.coordinates);
    } else if (g.type === 'MultiLineString') {
      g.coordinates.forEach((part) => processLine(part));
    }
  });
  
  return { nodes };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

function dijkstra(graph, startKey, endKey) {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const pq = [];
  
  graph.nodes.forEach((_, k) => dist.set(k, Infinity));
  dist.set(startKey, 0);
  pq.push({ key: startKey, d: 0 });
  
  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d);
    const { key: u } = pq.shift();
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

// Initialize graph
console.log('Loading campus graph...');
const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
graph = buildGraphFromGeoJSON(geojson);
console.log(`Graph loaded: ${graph.nodes.size} nodes`);

// Create server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Parse route request: /route/v1/foot/{lon1},{lat1};{lon2},{lat2}
  const routeMatch = parsedUrl.pathname.match(/^\/route\/v1\/(\w+)\/(-?\d+\.?\d*),(-?\d+\.?\d*);(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
  
  if (!routeMatch) {
    console.log('Invalid URL format');
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'InvalidUrl', message: 'Invalid route request' }));
    return;
  }
  
  const [, profile, lon1, lat1, lon2, lat2] = routeMatch;
  console.log(`Routing: ${lat1},${lon1} -> ${lat2},${lon2}`);
  
  const start = findNearestNode(parseFloat(lat1), parseFloat(lon1), graph);
  const end = findNearestNode(parseFloat(lat2), parseFloat(lon2), graph);
  
  if (!start || !end) {
    console.log('No nearby nodes found');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'NoRoute', message: 'No route found' }));
    return;
  }
  
  console.log(`Nearest nodes: ${start.key} -> ${end.key}`);
  const { path, distance } = dijkstra(graph, start.key, end.key);
  
  if (!path || path.length === 0 || !isFinite(distance)) {
    console.log('Dijkstra found no path');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'NoRoute', message: 'No route found' }));
    return;
  }
  
  console.log(`Route found: ${path.length} nodes, ${distance.toFixed(2)}m`);
  
  // Convert path to coordinates
  const coordinates = path.map(k => {
    const n = graph.nodes.get(k);
    return [n.lng, n.lat];
  });
  
  // OSRM-compatible response
  const response = {
    code: 'Ok',
    routes: [{
      geometry: {
        type: 'LineString',
        coordinates
      },
      distance: distance,
      duration: distance / 1.4, // ~1.4 m/s walking speed
      legs: [{
        distance: distance,
        duration: distance / 1.4,
        steps: []
      }]
    }],
    waypoints: [
      { location: [start.lng, start.lat], name: 'Start' },
      { location: [end.lng, end.lat], name: 'End' }
    ]
  };
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
});

server.listen(PORT, () => {
  console.log(`\n=== OSRM-compatible API server running ===`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Example: http://localhost:${PORT}/route/v1/foot/-76.7134,39.2531;-76.7125,39.2566?geometries=geojson`);
});
