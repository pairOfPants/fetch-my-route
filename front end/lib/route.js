'use server'

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminDb;

function getAdminDb() {
  if (adminDb) return adminDb;
  
  try {
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
    if (!geojson) throw new Error('Missing geojson');

    const db = getAdminDb();
    const docRef = db.collection('mapData').doc(docName);
    
    console.log(`Server: Saving GeoJSON to document: ${docName}`);
    await docRef.set({
      geojsonData: JSON.stringify(geojson),
      updatedAt: new Date(),
      version: 1
    });

    console.log('Server: Successfully saved GeoJSON');
    return { success: true, message: 'GeoJSON edits saved successfully' };
  } catch (error) {
    console.error('Server: Error saving GeoJSON:', error);
    throw error;
  }
}

export async function getGeojsonEdits(docName = 'campusEdits') {
  try {
    const db = getAdminDb();
    const docRef = db.collection('mapData').doc(docName);
    const docSnap = await docRef.get();
    
    console.log(`Server: Retrieving GeoJSON from document: ${docName}`);
    console.log(`Server: Document exists: ${docSnap.exists}`);
    
    if (docSnap.exists) {
      const data = docSnap.data();
      console.log('Server: Retrieved GeoJSON from database');
      return { 
        success: true, 
        geojson: JSON.parse(data.geojsonData) 
      };
    } else {
      console.log('Server: No edits found, will use original');
      return { success: false, geojson: null };
    }
  } catch (error) {
    console.error('Server: Error retrieving GeoJSON:', error);
    return { success: false, geojson: null };
  }
}

export async function deleteGeojsonEdits(docName = 'campusEdits') {
  try {
    const db = getAdminDb();
    const docRef = db.collection('mapData').doc(docName);
    
    await docRef.delete();

    console.log('Successfully deleted GeoJSON');
    return { success: true, message: 'GeoJSON deleted successfully' };
  } catch (error) {
    console.error('Error deleting GeoJSON:', error);
    return { success: true, message: 'No edits to delete' };
  }
}
