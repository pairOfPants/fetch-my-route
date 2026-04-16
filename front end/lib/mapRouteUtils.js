export function buildGraphFromGeoJSON(L, geojson) {
  const nodes = new Map();
  const bounds = L.latLngBounds([]);
  const displayFeatures = [];
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
    const weight = haversine(a.lat, a.lng, b.lat, b.lng);
    a.neighbors.set(bKey, Math.min(a.neighbors.get(bKey) ?? Infinity, weight));
    b.neighbors.set(aKey, Math.min(b.neighbors.get(aKey) ?? Infinity, weight));
  };

  const shouldUseFeature = (feature) => {
    if (!feature?.geometry) return false;
    const { type } = feature.geometry;
    if (type !== "LineString" && type !== "MultiLineString") return false;

    const props = feature.properties || {};
    if (props.power || props.fence_type || props.barrier) return false;
    return true;
  };

  const processLine = (coordinates) => {
    if (!coordinates || coordinates.length < 2) return;

    let previousKey = null;
    coordinates.forEach(([lng, lat]) => {
      const key = addNode(lat, lng);
      if (previousKey) addEdge(previousKey, key);
      previousKey = key;
    });
  };

  const collectBuildingArea = (feature) => {
    const props = feature.properties || {};
    const name = props.name || props["building:name"] || null;
    const isBuildingTagged = props.building || name;
    if (!isBuildingTagged) return;

    const { geometry } = feature;
    const polygonSets =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : null;

    if (!polygonSets) return;

    const rings = polygonSets.map((polygon) =>
      polygon.map((ring) => ring.map(([lon, lat]) => [lat, lon]))
    );

    buildingAreas.push({ name, props, rings });
  };

  (geojson.features || []).forEach((feature) => {
    if (!feature?.geometry) return;

    const { geometry } = feature;
    if (geometry.type === "LineString") {
      if (!shouldUseFeature(feature)) return;
      processLine(geometry.coordinates);
      displayFeatures.push(feature);
      return;
    }

    if (geometry.type === "MultiLineString") {
      if (!shouldUseFeature(feature)) return;
      geometry.coordinates.forEach((part) => processLine(part));
      displayFeatures.push(feature);
      return;
    }

    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
      collectBuildingArea(feature);
    }
  });

  return { nodes, bounds, displayFeatures, buildingAreas };
}

export function dijkstra(graph, startKey, endKey) {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const pq = new MinHeap();

  graph.nodes.forEach((_, key) => dist.set(key, Infinity));
  dist.set(startKey, 0);
  pq.push({ key: startKey, d: 0 });

  while (!pq.isEmpty()) {
    const { key: currentKey } = pq.pop();
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    if (currentKey === endKey) break;

    const currentNode = graph.nodes.get(currentKey);
    if (!currentNode) continue;

    for (const [neighborKey, weight] of currentNode.neighbors) {
      if (visited.has(neighborKey)) continue;

      const alt = (dist.get(currentKey) ?? Infinity) + weight;
      if (alt < (dist.get(neighborKey) ?? Infinity)) {
        dist.set(neighborKey, alt);
        prev.set(neighborKey, currentKey);
        pq.push({ key: neighborKey, d: alt });
      }
    }
  }

  const path = [];
  let cursor = endKey;
  if (!prev.has(cursor) && cursor !== startKey) {
    return { path: [], distance: Infinity };
  }

  while (cursor) {
    path.unshift(cursor);
    if (cursor === startKey) break;
    cursor = prev.get(cursor);
  }

  return { path, distance: dist.get(endKey) ?? Infinity };
}

export function findNearestNode(lat, lng, graph) {
  let best = null;
  let bestDistance = Infinity;

  for (const [key, node] of graph.nodes) {
    const distance = haversine(lat, lng, node.lat, node.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { key, lat: node.lat, lng: node.lng, d: distance };
    }
  }

  return best;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

export function formatMeters(distanceMeters) {
  if (distanceMeters < 1000) return `${distanceMeters.toFixed(0)} m`;
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

export function generateInstructionsWithContext(coordinates, graph) {
  if (!coordinates || coordinates.length < 2) return [];

  const instructions = [];
  let prevBearing = null;
  let prevCoord = coordinates[0];
  let distanceSinceLast = 0;
  let prevContext = (() => {
    const [lon, lat] = prevCoord;
    return getContextForNode(lat, lon, graph);
  })();

  const TURN_THRESHOLD_DEG = 50;
  const MIN_SEGMENT_EMIT_M = 18;

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = prevCoord;
    const [lon2, lat2] = coordinates[i];
    const segmentDistance = haversine(lat1, lon1, lat2, lon2);
    const currentBearing = bearing(lat1, lon1, lat2, lon2);
    const currentContext = getContextForNode(lat2, lon2, graph);

    if (currentContext?.isBuilding && !prevContext?.isBuilding) {
      const buildingSuffix = currentContext.buildingName ? ` ${currentContext.buildingName}` : "";
      instructions.push({
        type: `Enter${buildingSuffix}`,
        at: i,
        distance: Math.round(distanceSinceLast),
      });
      distanceSinceLast = 0;
    }

    const prevFloorNum = prevContext?.floor != null ? Number(prevContext.floor) : null;
    const currentFloorNum = currentContext?.floor != null ? Number(currentContext.floor) : null;
    if (prevFloorNum != null && currentFloorNum != null && currentFloorNum !== prevFloorNum) {
      const direction = currentFloorNum > prevFloorNum ? "up" : "down";
      const verb = currentContext?.vertical ? "Take elevator" : "Go";
      instructions.push({
        type: `${verb} ${direction} to floor ${currentFloorNum}`,
        at: i,
        distance: Math.round(distanceSinceLast),
      });
      distanceSinceLast = 0;
    }

    if (prevBearing !== null) {
      let turnAngle = currentBearing - prevBearing;
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

    distanceSinceLast += segmentDistance;
    prevBearing = currentBearing;
    prevCoord = coordinates[i];
    prevContext = currentContext;
  }

  instructions.push({
    type: "Arrive at destination",
    at: coordinates.length - 1,
    distance: Math.round(distanceSinceLast),
  });

  const mergedInstructions = [];
  for (const instruction of instructions) {
    const previous = mergedInstructions[mergedInstructions.length - 1];
    if (previous && previous.type === instruction.type) {
      previous.distance += instruction.distance;
    } else {
      mergedInstructions.push(instruction);
    }
  }

  return mergedInstructions;
}

class MinHeap {
  constructor() {
    this.a = [];
  }

  isEmpty() {
    return this.a.length === 0;
  }

  push(value) {
    this.a.push(value);
    this.bubbleUp(this.a.length - 1);
  }

  pop() {
    if (this.a.length === 1) return this.a.pop();

    const top = this.a[0];
    this.a[0] = this.a.pop();
    this.bubbleDown(0);
    return top;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.a[parentIndex].d <= this.a[index].d) break;
      [this.a[parentIndex], this.a[index]] = [this.a[index], this.a[parentIndex]];
      index = parentIndex;
    }
  }

  bubbleDown(index) {
    const length = this.a.length;

    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let minIndex = index;

      if (left < length && this.a[left].d < this.a[minIndex].d) minIndex = left;
      if (right < length && this.a[right].d < this.a[minIndex].d) minIndex = right;
      if (minIndex === index) break;

      [this.a[minIndex], this.a[index]] = [this.a[index], this.a[minIndex]];
      index = minIndex;
    }
  }
}

function bearing(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function getContextForNode(lat, lng, graph) {
  const lineFeature = getFeatureAtNode(lat, lng, graph);
  const lineProps = lineFeature?.properties || {};
  const levelTag = lineProps.level ?? null;
  const buildingArea = getBuildingAtNode(lat, lng, graph);
  const buildingName = buildingArea?.name || lineProps["building:name"] || null;
  const isBuilding =
    Boolean(buildingArea) || lineProps.building === "yes" || lineProps.indoor === "room";
  const vertical =
    lineProps.highway === "steps" || lineProps.conveying === "yes" || lineProps.elevator === "yes";

  return { floor: levelTag, buildingName, isBuilding, vertical };
}

function getFeatureAtNode(lat, lng, graph) {
  if (!graph?.displayFeatures) return null;

  for (const feature of graph.displayFeatures) {
    const geometry = feature?.geometry;
    if (!geometry) continue;

    const coordinateSets =
      geometry.type === "LineString"
        ? [geometry.coordinates]
        : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : [];

    for (const coords of coordinateSets) {
      for (const [lon2, lat2] of coords) {
        if (Math.abs(lat2 - lat) < 1e-6 && Math.abs(lon2 - lng) < 1e-6) {
          return feature;
        }
      }
    }
  }

  return null;
}

function getBuildingAtNode(lat, lng, graph) {
  const areas = graph?.buildingAreas || [];
  for (const area of areas) {
    for (const rings of area.rings) {
      if (pointInPolygon(lat, lng, rings)) {
        return area;
      }
    }
  }

  return null;
}

function pointInPolygon(lat, lng, rings) {
  if (!rings || rings.length === 0) return false;
  if (!pointInRing(lat, lng, rings[0])) return false;

  for (let holeIndex = 1; holeIndex < rings.length; holeIndex++) {
    if (pointInRing(lat, lng, rings[holeIndex])) return false;
  }

  return true;
}

function pointInRing(lat, lng, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const intersect =
      xi > lng !== xj > lng &&
      lat < ((yj - yi) * (lng - xi)) / (xj - xi + 1e-12) + yi;

    if (intersect) inside = !inside;
  }

  return inside;
}
