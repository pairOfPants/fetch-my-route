const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Paths
const geojsonPath = path.resolve(__dirname, '../front end/public/OSM-data/campus.geojson');
const osmPath = path.resolve(__dirname, '../front end/public/OSM-data/campus.osm');
const osrmPath = path.resolve(__dirname, '../front end/public/OSM-data/campus.osrm');
const footProfile = '/usr/local/share/osrm/profiles/foot.lua'; // Adjust if needed

function checkFileExists(file) {
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
}

function run(cmd, desc) {
  console.log(`\n=== ${desc} ===`);
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function geojsonToOSM(geojsonPath, osmPath) {
  console.log(`\n=== Converting GeoJSON to OSM XML ===`);
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  
  let osmXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  osmXml += '<osm version="0.6" generator="geojson-to-osm">\n';
  
  let nodeId = 1;
  let wayId = 1;
  const nodeMap = new Map();

  const addNodesForLine = (coords) => {
    let ndRefs = '';
    coords.forEach(([lon, lat]) => {
      const key = `${lat.toFixed(7)},${lon.toFixed(7)}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, nodeId);
        osmXml += `  <node id="${nodeId}" lat="${lat}" lon="${lon}" version="1"/>\n`;
        nodeId++;
      }
      ndRefs += `    <nd ref="${nodeMap.get(key)}"/>\n`;
    });
    return ndRefs;
  };

  const emitWay = (coords, props = {}) => {
    osmXml += `  <way id="${wayId}" version="1">\n`;
    osmXml += addNodesForLine(coords);

    // Determine highway tag
    let highway = props.highway;
    // Normalize staircase entrance to steps
    if (!highway && props.entrance === 'staircase') highway = 'steps';
    if (!highway) highway = 'footway';
    osmXml += `    <tag k="highway" v="${highway}"/>\n`;

    // Pass through level if present (supports single or semicolon list)
    if (typeof props.level === 'string' && props.level.length > 0) {
      osmXml += `    <tag k="level" v="${props.level}"/>\n`;
    }

    // Pass through indoor tag if present
    if (typeof props.indoor === 'string' && props.indoor.length > 0) {
      osmXml += `    <tag k="indoor" v="${props.indoor}"/>\n`;
    }

    // Optional: mark elevators explicitly if present
    if (highway === 'elevator') {
      osmXml += `    <tag k="indoor" v="elevator"/>\n`;
      // If level missing, still emit to help vertical detection
      if (!(typeof props.level === 'string' && props.level.length > 0)) {
        // ...leave without level; current geojson may already include it elsewhere...
      }
    }

    // Optional: propagate wheelchair if present
    if (typeof props.wheelchair === 'string') {
      osmXml += `    <tag k="wheelchair" v="${props.wheelchair}"/>\n`;
    }

    osmXml += '  </way>\n';
    wayId++;
  };
  
  (geojson.features || []).forEach(feature => {
    if (!feature || !feature.geometry) return;
    const props = feature.properties || {};
    if (feature.geometry.type === 'LineString') {
      emitWay(feature.geometry.coordinates, props);
    } else if (feature.geometry.type === 'MultiLineString') {
      feature.geometry.coordinates.forEach(lineCoords => emitWay(lineCoords, props));
    }
    // Ignore non-line geometries for routing conversion
  });
  
  osmXml += '</osm>\n';
  fs.writeFileSync(osmPath, osmXml, 'utf8');
  console.log(`Converted ${geojson.features.length} features to OSM XML`);
}

checkFileExists(geojsonPath);

// 1. Convert GeoJSON to OSM XML using JavaScript
geojsonToOSM(geojsonPath, osmPath);
checkFileExists(osmPath);

console.log('\n=== Setup Complete ===');
console.log('OSM file generated successfully at:', osmPath);
console.log('\nTo start the routing API server, run:');
console.log('  node scripts/osrm-api-server.js');
console.log('\nThis will start an OSRM-compatible API at http://localhost:5000');
console.log('No Docker or OSRM binaries required!');
