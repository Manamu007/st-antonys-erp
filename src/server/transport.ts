import express from 'express';
import { getDbAdmin, isDatabaseDenied, setDatabaseDenied } from './firebaseAdmin.js';
import { sendMessage } from './whatsapp.js';
import { extractParentPhone } from './whatsappUtils.js';

const router = express.Router();

/**
 * Trigger Proximity Alert
 * This would normally be called by a GPS background service.
 * For the demo, we call it manually or via simulation.
 */
router.post('/alert', async (req, res) => {
  const { busId, stopId } = req.body;

  try {
    const db = getDbAdmin();
    // 1. Get Stop details
    const stopDoc = await db.collection('stops').doc(stopId).get().catch(e => {
      console.error("Admin stops read error:", e);
      throw new Error(`Permission denied on 'stops' collection: ${e.message}`);
    });
    if (!stopDoc.exists) return res.status(404).json({ error: 'Stop not found' });
    const stopData = stopDoc.data();

    // 2. Get Bus details
    const busDoc = await db.collection('buses').doc(busId).get().catch(e => {
      console.error("Admin buses read error:", e);
      throw new Error(`Permission denied on 'buses' collection: ${e.message}`);
    });
    if (!busDoc.exists) return res.status(404).json({ error: 'Bus not found' });
    const busData = busDoc.data();

    // 3. Find students assigned to this bus and this stop
    const studentsSnapshot = await db.collection('users')
      .where('role', '==', 'student')
      .where('transportBusId', '==', busId)
      .where('transportStopId', '==', stopId)
      .get().catch(e => {
        console.error("Admin users search error:", e);
        throw new Error(`Permission denied on 'users' search: ${e.message}`);
      });

    const notifications = [];

    for (const studentDoc of studentsSnapshot.docs) {
      const student = studentDoc.data();
      const parentPhone = extractParentPhone(student);

      if (parentPhone) {
        const trackingUrl = `https://${req.get('host')}/track/${busId}`;
        const message = `🚌 *School Bus Alert*\n\nDear Parent, Bus ${busData?.busNumber} is approximately 5 minutes away from *${stopData?.villageName}*.\n\nPlease be ready at the pickup point.\n\n📍 Live Tracking: ${trackingUrl}`;
        
        notifications.push(
          sendMessage(parentPhone, message)
            .catch(err => console.error(`WhatsApp fail for ${parentPhone}:`, err))
        );
      }
    }

    await Promise.all(notifications);

    res.json({ 
      success: true, 
      sentCount: notifications.length,
      message: `Alerts sent for ${stopData?.villageName}`
    });

  } catch (error: any) {
    console.error("Proximity alert error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update Bus Location
 */
router.post('/location', async (req, res) => {
  const { busId, lat, lng } = req.body;

  try {
    const db = getDbAdmin();
    await db.collection('buses').doc(busId).update({
      currentLat: lat,
      currentLng: lng,
      lastUpdate: new Date().toISOString(),
      status: 'on-road'
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Request Tracking Link over WhatsApp
 */
router.post('/request-link', async (req, res) => {
  const { userId, customPhone } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const db = getDbAdmin();
    
    // 1. Get user profile
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    const userData = userDoc.data();
    
    const busId = userData?.transportBusId;
    if (!busId) {
      return res.status(400).json({ error: 'No active school bus is assigned to your profile in the transport registry' });
    }

    // 2. Load Bus details
    const busDoc = await db.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      return res.status(404).json({ error: 'Assigned bus details not found in database registry' });
    }
    const busData = busDoc.data();

    // 3. Determine recipient mobile
    // Support using customPhone entered in UI, or fall back to user's registered phone
    let recipientPhone = customPhone || extractParentPhone(userData);
    
    if (!recipientPhone) {
      return res.status(400).json({ error: 'No WhatsApp number or contact number found for your profile. Please update your profile or specify a phone number.' });
    }

    // Modern tracking URL
    const trackingUrl = `https://${req.get('host')}/track/${busId}`;

    const message = `🚌 *Active Transit Tracking Link*\n\nHello *${userData.name || 'Student'}*,\n\nYou requested the tracking link for your assigned Bus *${busData?.busNumber || ''}*.\n\n📍 Live Tracking: ${trackingUrl}\n⏱️ Status: ${busData?.status === 'on-road' ? '🟢 On-Road (Broadcasting)' : '🟡 Standby / Offline'}\n\nSt. Antony's School ERP`;

    await sendMessage(recipientPhone, message, {}, 'single');

    res.json({
      success: true,
      recipient: recipientPhone,
      message: `Tracking link successfully queued for delivery to WhatsApp mobile ${recipientPhone}`
    });

  } catch (error: any) {
    console.error("Link request error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all stop backups
 */
router.get('/stop-backups', async (req, res) => {
  if (isDatabaseDenied()) {
    return res.json([]);
  }
  try {
    const db = getDbAdmin();
    // Default limit to 100 to avoid excessive memory or socket overhead
    const snapshot = await db.collection('stop_backups').orderBy('timestamp', 'desc').limit(100).get();
    const backups = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(backups);
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json([]);
    }
    console.error("Error fetching stop backups:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Add a stop backup
 */
router.post('/stop-backups', async (req, res) => {
  const { docId, data } = req.body;
  if (isDatabaseDenied()) {
    return res.json({ success: true, id: docId || 'sb_' + Date.now() });
  }
  try {
    const db = getDbAdmin();
    if (docId) {
      await db.collection('stop_backups').doc(docId).set(data);
      res.json({ success: true, id: docId });
    } else {
      const docRef = await db.collection('stop_backups').add(data);
      res.json({ success: true, id: docRef.id });
    }
  } catch (error: any) {
    const errText = (error?.message || String(error)).toLowerCase();
    if (errText.includes('billing') || errText.includes('permission_denied') || errText.includes('requires billing')) {
      setDatabaseDenied(true);
      return res.json({ success: true, id: docId || 'sb_' + Date.now() });
    }
    console.error("Error creating stop backup:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
