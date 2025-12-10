'use server'

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
let adminDb;

function getAdminDb() {
  if (adminDb) return adminDb;
  
  try {
    // Check if app already initialized
    if (getApps().length === 0) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
    adminDb = getFirestore();
    return adminDb;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw error;
  }
}

export async function saveGeojsonEdits(geojson, docName = 'campusEdits') {
  try {
    if (!geojson) {
      throw new Error('Missing geojson');
    }

    const db = getAdminDb();
    const docRef = db.collection('mapData').doc(docName);
    
    console.log(`Writing GeoJSON edits to Firestore: mapData/${docName}`);
    await docRef.set({
      geojsonData: JSON.stringify(geojson), // Serialize to string
      updatedAt: new Date(),
      version: 1
    });
    console.log(`Successfully wrote GeoJSON to Firestore`);

    return { success: true, message: 'GeoJSON edits saved to database successfully' };
  } catch (error) {
    console.error('Error saving GeoJSON edits:', error);
    throw error;
  }
}

export async function getGeojsonEdits(docName = 'campusEdits') {
  try {
    const db = getAdminDb();
    const docRef = db.collection('mapData').doc(docName);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      console.log(`Retrieved GeoJSON edits from Firestore`);
      const data = docSnap.data();
      return { 
        success: true, 
        geojson: JSON.parse(data.geojsonData) // Parse back to object
      };
    } else {
      console.log('No edits document found, will use original');
      return { success: false, geojson: null };
    }
  } catch (error) {
    console.error('Error retrieving GeoJSON edits:', error);
    return { success: false, geojson: null };
  }
}

export async function deleteGeojsonEdits(docName = 'campusEdits') {
  try {
    const db = getAdminDb();
    const docRef = db.collection('mapData').doc(docName);
    
    console.log(`Deleting GeoJSON edits from Firestore: mapData/${docName}`);
    await docRef.delete();
    console.log(`Successfully deleted GeoJSON from Firestore`);

    return { success: true, message: 'GeoJSON edits deleted from database successfully' };
  } catch (error) {
    console.error('Error deleting GeoJSON edits:', error);
    // Document doesn't exist is not an error
    if (error.code === 'not-found') {
      console.log('Edits document does not exist, nothing to delete');
      return { success: true, message: 'No edits to delete' };
    }
    throw error;
  }
}
