'use server'

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function saveGeojsonEdits(geojson, filename = 'campusEdits.geojson') {
  try {
    if (!geojson || !filename) {
      throw new Error('Missing geojson or filename');
    }

    // Only allow saving to campusEdits.geojson (security)
    if (filename !== 'campusEdits.geojson') {
      throw new Error('Invalid filename');
    }

    // Ensure directory exists
    const dirPath = join(process.cwd(), 'public', 'OSM-data');
    await mkdir(dirPath, { recursive: true });

    // Write to public/OSM-data/campusEdits.geojson
    const filePath = join(dirPath, filename);
    
    console.log(`Writing GeoJSON edits to: ${filePath}`);
    await writeFile(filePath, JSON.stringify(geojson, null, 2), 'utf-8');
    console.log(`Successfully wrote GeoJSON to ${filePath}`);

    return { success: true, message: 'GeoJSON edits saved successfully', path: filePath };
  } catch (error) {
    console.error('Error saving GeoJSON edits:', error);
    throw error;
  }
}
