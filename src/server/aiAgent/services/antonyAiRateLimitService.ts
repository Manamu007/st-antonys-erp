import { getDbAdmin } from '../../firebaseAdmin.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  safeRefusalEnglish?: string;
  safeRefusalTelugu?: string;
}

/**
 * Checks and transactionally increments rate limiting and daily usage tracking limit in Firestore.
 */
export async function checkAndIncrementPersistentUsage(
  userId: string,
  userRole: string,
  schoolId: string,
  maxDailyQueries: number = 100
): Promise<RateLimitCheckResult> {
  const db = getDbAdmin();
  const now = Date.now();
  const nowIso = new Date().toISOString();
  
  // yyyyMMdd date key
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateKey = `${year}${month}${day}`;

  const docId = `${schoolId}_${userId}_${dateKey}`;
  const docRef = db.collection('ai_rate_limits').doc(docId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const data = docSnap.exists ? docSnap.data() : null;

      if (!data) {
        const initialRecord = {
          id: docId,
          schoolId,
          userId,
          userRole,
          dateKey,
          dailyCount: 1,
          lastRequestAt: nowIso,
          rapidBlockedCount: 0,
          dailyBlockedCount: 0,
          updatedAt: nowIso
        };
        transaction.set(docRef, initialRecord);
        return { allowed: true };
      }

      // 1. Rapid Cooldown Check (3 seconds)
      const lastRequestAtTime = new Date(data.lastRequestAt || 0).getTime();
      if (now - lastRequestAtTime < 3000) {
        const updatedRecord = {
          ...data,
          rapidBlockedCount: (data.rapidBlockedCount || 0) + 1,
          updatedAt: nowIso
        };
        transaction.set(docRef, updatedRecord);
        return {
          allowed: false,
          type: 'RAPID',
          data: updatedRecord
        };
      }

      // 2. Daily Limit Check
      const currentCount = data.dailyCount || 0;
      if (currentCount >= maxDailyQueries) {
        const updatedRecord = {
          ...data,
          dailyBlockedCount: (data.dailyBlockedCount || 0) + 1,
          updatedAt: nowIso
        };
        transaction.set(docRef, updatedRecord);
        return {
          allowed: false,
          type: 'DAILY',
          data: updatedRecord
        };
      }

      // 3. Allowed: increment counts and update lastRequestAt timestamp
      const updatedRecord = {
        ...data,
        dailyCount: currentCount + 1,
        lastRequestAt: nowIso,
        updatedAt: nowIso
      };
      transaction.set(docRef, updatedRecord);
      return { allowed: true };
    });

    if (result.allowed) {
      return { allowed: true };
    }

    if (result.type === 'RAPID') {
      return {
        allowed: false,
        reason: "Rapid requests cooldown limit.",
        safeRefusalEnglish: "Please wait a few seconds before asking another question.",
        safeRefusalTelugu: "మరొక ప్రశ్న అడగడానికి ముందు దయచేసి కొన్ని సెకన్లు వేచి ఉండండి."
      };
    } else {
      return {
        allowed: false,
        reason: "Daily query limit exceeded.",
        safeRefusalEnglish: "Your daily Antony AI Agent query limit is completed. Please contact admin.",
        safeRefusalTelugu: "మీ రోజువారీ ఆంటోనీ AI ఏజెంట్ ప్రశ్నల పరిమితి పూర్తయింది. దయచేసి అడ్మిన్‌ను సంప్రదించండి."
      };
    }
  } catch (error: any) {
    console.error("[Persistent Rate Limit Error] Transaction failed, using fallback:", error);
    // Safe fallback to prevent total lockout
    return { allowed: true };
  }
}
