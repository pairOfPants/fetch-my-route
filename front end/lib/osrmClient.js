/**
 * OSRM API client for fetching routes from our local server
 */

const OSRM_BASE_URL = 'http://localhost:5000';

/**
 * Fetch route from OSRM server
 * @param {number} startLat - Starting latitude
 * @param {number} startLon - Starting longitude
 * @param {number} endLat - Ending latitude
 * @param {number} endLon - Ending longitude
 * @returns {Promise<Object>} Route data with geometry and distance
 */
export async function getRoute(startLat, startLon, endLat, endLon) {
  try {
    const url = `${OSRM_BASE_URL}/route/v1/foot/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`OSRM server responded with ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }
    
    const route = data.routes[0];
    
    return {
      geometry: route.geometry.coordinates, // Array of [lon, lat]
      distance: route.distance, // meters
      duration: route.duration, // seconds
      waypoints: data.waypoints
    };
  } catch (error) {
    console.error('OSRM routing error:', error);
    throw error;
  }
}

/**
 * Check if OSRM server is available
 * @returns {Promise<boolean>}
 */
export async function isOSRMAvailable() {
  try {
    const response = await fetch(`${OSRM_BASE_URL}/route/v1/foot/-76.7134,39.2531;-76.7125,39.2566`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate basic turn instructions from route geometry
 * @param {Array} coordinates - Array of [lon, lat]
 * @returns {Array} Array of instruction objects
 */
export function generateBasicInstructions(coordinates) {
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

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = prevCoord;
    const [lon2, lat2] = coordinates[i];
    const dist = haversine(lat1, lon1, lat2, lon2);
    const currBearing = bearing(lat1, lon1, lat2, lon2);

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
