import { getDbAdmin } from '../../server/firebaseAdmin.js';
import { normalizeIndianPhone } from '../../server/whatsappUtils.js';
import { NodeType, ConditionField, ConditionOperator, ActionType, BotSession, BotWorkflow } from '../types';
import { resolveStudentContext, replaceVariables, serializeListMessage } from './databaseResolution';

// Helper to pause execution inside delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Verifies if the sender is an authorized teacher/admin in either staff or users collections.
 */
async function isAuthorizedTeacherOrAdmin(senderPhone: string): Promise<boolean> {
  const cleanPhone = senderPhone.replace(/\D/g, '');
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  
  if (!last10) return false;

  try {
    const dbAdmin = getDbAdmin();
    // 1. Check in staff collection
    const staffQueries = ['phone', 'whatsappNumber', 'contact'];
    for (const field of staffQueries) {
      const snap = await dbAdmin.collection('staff')
        .where(field, '>=', last10)
        .get();
      let found = false;
      snap.forEach((docSnap: any) => {
        const data = docSnap.data();
        const phoneVal = String(data[field] || '').replace(/\D/g, '');
        if (phoneVal.endsWith(last10)) {
          found = true;
        }
      });
      if (found) return true;
    }

    // 2. Check in users collection
    const userQueries = ['phone', 'whatsappNumber', 'phoneNumber'];
    for (const field of userQueries) {
      const snap = await dbAdmin.collection('users')
        .where(field, '>=', last10)
        .get();
      let isAuth = false;
      snap.forEach((docSnap: any) => {
        const data = docSnap.data();
        const phoneVal = String(data[field] || '').replace(/\D/g, '');
        if (phoneVal.endsWith(last10)) {
          const role = data.role || '';
          if (['teacher', 'admin', 'staff'].includes(role.toLowerCase())) {
            isAuth = true;
          }
        }
      });
      if (isAuth) return true;
    }
  } catch (error) {
    console.error("[Bot Router] Error verifying authorized teacher/admin:", error);
  }

  return false;
}

/**
 * Writes execution logs into a separate whatsapp_group_intercept_logs document.
 */
async function logGroupIntercept(from: string, sender: string, text: string, isAuthorized: boolean) {
  try {
    const dbAdmin = getDbAdmin();
    await dbAdmin.collection('whatsapp_group_intercept_logs').add({
      groupJid: from,
      senderJid: sender,
      messageText: text,
      isAuthorized,
      timestamp: new Date().toISOString()
    });
    console.log(`[Bot Router] Intercept logged for group: ${from}, sender: ${sender}, authorized: ${isAuthorized}`);
  } catch (error) {
    console.error("[Bot Router] Error logging group intercept:", error);
  }
}

function parseDateFromMessage(text: string): string | null {
  // Regex for YYYY-MM-DD
  const ymd = text.match(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  }
  // Regex for DD-MM-YYYY
  const dmy = text.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})\b/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }
  return null;
}

/**
 * Resolves current holiday status from Firestore and custom school academic calendar rules.
 */
async function resolveHolidayMessage(queryText: string): Promise<string> {
  const dbAdmin = getDbAdmin();
  const lowerText = queryText.toLowerCase();
  
  const now = new Date();
  const todayDateStr = now.toISOString().split('T')[0];
  
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowDateStr = tomorrow.toISOString().split('T')[0];
  
  let targetQueryDate = parseDateFromMessage(queryText);
  let dayLabel = '';
  
  const isGenericQuery = !targetQueryDate && 
                         (lowerText === 'holiday/working day' || 
                          lowerText === 'holiday' || 
                          lowerText === 'working day' || 
                          lowerText === '3' || 
                          lowerText.includes('list') || 
                          lowerText.includes('calendar') ||
                          lowerText.includes('సెలవులు') ||
                          lowerText.includes('హాలిడే'));

  if (targetQueryDate) {
    dayLabel = targetQueryDate;
  } else if (lowerText.includes('tomorrow') || lowerText.includes('రేపు')) {
    targetQueryDate = tomorrowDateStr;
    dayLabel = 'Tomorrow';
  } else if (lowerText.includes('today') || lowerText.includes('ఈరోజు') || lowerText.includes('ఈ రోజు')) {
    targetQueryDate = todayDateStr;
    dayLabel = 'Today';
  } else {
    targetQueryDate = todayDateStr;
    dayLabel = 'Today';
  }
  
  try {
    const holidaysSnap = await dbAdmin.collection('holidays').get();
    const holidaysList: any[] = [];
    holidaysSnap.forEach((hDoc: any) => {
      const data = hDoc.data();
      if (data && data.date) {
        holidaysList.push({
          date: data.date,
          toDate: data.toDate || data.date,
          title: data.title || 'Official Holiday',
          description: data.description || '',
          type: data.type || 'holiday'
        });
      }
    });

    // Sort holidays chronologically
    holidaysList.sort((a, b) => a.date.localeCompare(b.date));

    // Helper function to check status of any date
    const checkDateStatus = (dateStr: string) => {
      const match = holidaysList.find((h: any) => dateStr >= h.date && dateStr <= h.toDate);
      if (match) {
        return { isClosed: true, title: match.title, reason: match.description || 'Official Holiday' };
      }
      
      // Reopen check
      try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);
          if (m === 6 && d < 12) {
            return { isClosed: true, title: 'Summer Vacation', reason: 'School has not reopened for this term yet (Official reopen day is June 12th)' };
          }
        }
      } catch (e) {}

      const dateObj = new Date(dateStr);
      const dayOfWeek = dateObj.getDay();
      const dayOfMonth = dateObj.getDate();
      const isSecSaturday = (dayOfWeek === 6 && dayOfMonth >= 8 && dayOfMonth <= 14);

      if (dayOfWeek === 0) {
        return { isClosed: true, title: 'Sunday Weekly Off', reason: 'Sunday' };
      } else if (isSecSaturday) {
        return { isClosed: true, title: 'Second Saturday', reason: 'Second Saturday Official Holiday' };
      } else if (dayOfWeek === 6) {
        return { isClosed: false, title: 'Working Saturday', reason: 'Saturdays are active full days' };
      }
      return { isClosed: false, title: 'Regular Working Day', reason: 'Standard Curriculum Schedule' };
    };

    if (isGenericQuery) {
      // Build a comprehensive, analyzed summary of academic calendar holidays as requested!
      const todayStatus = checkDateStatus(todayDateStr);
      const tomorrowStatus = checkDateStatus(tomorrowDateStr);

      let response = `🏫 *ST. ANTONY'S HIGH SCHOOL ACADEMIC CALENDAR & HOLIDAYS* 🏫\n\n`;
      
      // Today Status
      response += `📅 *Today's Status (${todayDateStr}):*\n`;
      if (todayStatus.isClosed) {
        response += `❌ *CLOSED* - ${todayStatus.title} (${todayStatus.reason})\n`;
        response += `(ఈరోజు పాఠశాల *సెలవు దినం*: ${todayStatus.title})\n\n`;
      } else {
        response += `🟢 *OPEN* - ${todayStatus.title} (${todayStatus.reason})\n`;
        response += `(ఈరోజు పాఠశాల *యధావిధిగా నడుస్తుంది*)\n\n`;
      }

      // Tomorrow Status
      response += `📅 *Tomorrow's Status (${tomorrowDateStr}):*\n`;
      if (tomorrowStatus.isClosed) {
        response += `❌ *CLOSED* - ${tomorrowStatus.title} (${tomorrowStatus.reason})\n`;
        response += `(రేపు పాఠశాల *సెలవు దినం*: ${tomorrowStatus.title})\n\n`;
      } else {
        response += `🟢 *OPEN* - ${tomorrowStatus.title} (${tomorrowStatus.reason})\n`;
        response += `(రేపు పాఠశాల *యధావిధిగా నడుస్తుంది*)\n\n`;
      }

      // Filter upcoming holidays (today or later)
      const upcoming = holidaysList.filter((h: any) => h.toDate >= todayDateStr);

      response += `🗓️ *Upcoming Holidays (అకాడెమిక్స్ సెలవుల జాబితా):*\n`;
      if (upcoming.length > 0) {
        upcoming.slice(0, 10).forEach((h: any) => {
          const dateRange = h.date === h.toDate ? h.date : `${h.date} to ${h.toDate}`;
          response += `• 🗓️ *${dateRange}:* _${h.title}_ ${h.description ? `(${h.description})` : ''}\n`;
        });
      } else {
        response += `• No upcoming scheduled holidays configured in the Academics module.\n`;
      }

      return response;
    } else {
      // Specific date check
      const status = checkDateStatus(targetQueryDate!);
      let response = '';
      if (status.isClosed) {
        response = `🗓️ *Holiday Status for ${targetQueryDate} (${dayLabel}):*\n\n❌ School is *CLOSED* due to: *${status.title}* (${status.reason}).\n\n(తేదీ ${targetQueryDate} న పాఠశాలకు సెలవు దినం: ${status.title})`;
      } else {
        response = `🗓️ *Working Status for ${targetQueryDate} (${dayLabel}):*\n\n🟢 School is *OPEN* and running under: *${status.title}* (${status.reason}).\n\n(తేదీ ${targetQueryDate} న పాఠశాల యధావిధిగా నడుస్తుంది)`;
      }

      // Add a couple of upcoming holidays for context
      const upcoming = holidaysList.filter((h: any) => h.toDate >= todayDateStr);
      if (upcoming.length > 0) {
        response += `\n\n🗓️ *Upcoming Holidays (సెలవుల జాబితా):*\n`;
        upcoming.slice(0, 3).forEach((h: any) => {
          const range = h.date === h.toDate ? h.date : `${h.date} to ${h.toDate}`;
          response += `• *${range}:* _${h.title}_\n`;
        });
      }
      return response;
    }
  } catch (err: any) {
    console.error("[Bot Router] Error resolving holiday message:", err.message);
    return `🗓️ *Holiday Status Inquiry:*\n\nUnable to retrieve holiday calendar from Academics module. Please check with school office directly at *8822269999*.`;
  }
}

/**
 * Main Webhook router interpreter for WhatsApp Bot V2
 * Supports dual-mode routing: individual DMs (@s.whatsapp.net) and group contexts (@g.us).
 * @returns boolean: true if the message was intercepted and handled by the visual bot flow, false to fallback to default (Gemini AI)
 */
export async function processIncomingBotMessage(from: string, incomingText: string, senderJid?: string): Promise<boolean> {
  try {
    const cleanText = incomingText.trim();
    const dbAdmin = getDbAdmin();

    // IF inbound payload context matches a group/community signature (jid.endsWith('@g.us'))
    if (from.endsWith('@g.us')) {
      console.log(`[Bot Router] Intercepted group/community message from: ${from}. Sender: ${senderJid}`);
      
      const senderPhone = senderJid ? (senderJid.split('@')[0] || '') : '';
      const isAuth = await isAuthorizedTeacherOrAdmin(senderPhone);
      
      // Log the interception status
      await logGroupIntercept(from, senderJid || '', cleanText, isAuth);
      
      // Do NOT initialize parent chatbot sessions or trigger the React Flow conversational builder graph for groups
      return true;
    }

    const cleanPhone = from.replace(/\D/g, '');
    const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    console.log(`[Bot Router] Intercept check for standard DM ${last10}: "${cleanText}"`);


    // Bypass interceptor for system opt-out commands, leave approval tokens, exit keywords, or exact greetings
    const cleanTextLower = cleanText.toLowerCase().trim();
    const isExitCommand = ['exit', 'quit', 'నిష్క్రమించు', 'ఎగ్జిట్'].includes(cleanTextLower);
    
    if (isExitCommand) {
      await dbAdmin.collection('whatsapp_bot_sessions').doc(last10).delete().catch(() => {});
      console.log(`[Bot Router] Exit command detected for ${last10}. Flushed session and sending confirmation.`);
      const exitMsg = `👋 *Session Closed / సెషన్ ముగించబడింది.*\n\nYou have successfully exited the interactive assistant. To start over or see the main menu at any time, just type *hi*, *hello*, or *menu*.\n\n(మీరు విజయంవంతంగా నిష్క్రమించారు. తిరిగి ప్రారంభించడానికి ఎప్పుడైనా *hi* లేదా *menu* అని టైప్ చేయండి.)`;
      await queueBotMessage(cleanPhone, exitMsg);
      return true;
    }

    const isExactGreetingOrReset = ['hi', 'hello', 'hey', 'start', 'menu', 'help', 'reset', 'restart', 'హలో', 'నమస్కారం'].includes(cleanTextLower);
    
    let isLeaveNumericBypass = false;
    if (cleanText === '1' || cleanText === '2') {
      try {
        const tokensSnap = await dbAdmin.collection('whatsapp_action_tokens')
          .where('approverPhone', '==', normalizeIndianPhone(cleanPhone))
          .where('used', '==', false)
          .get();
        const activeTokens = tokensSnap.docs
          .map(doc => doc.data())
          .filter((t: any) => t.status === 'active' && new Date(t.expiresAt).getTime() > Date.now());
        if (activeTokens.length > 0) {
          isLeaveNumericBypass = true;
        }
      } catch (e) {}
    }

    // Core system commands like opt-out or secure approval tokens must bypass the visual builder entirely
    const isSystemOrBypass = ['stop', 'unsubscribe', 'వద్దు', 'ఆపు'].some(w => cleanText.toLowerCase().includes(w)) ||
                            cleanText.startsWith('leave_approve_') ||
                            cleanText.startsWith('leave_reject_') ||
                            isLeaveNumericBypass;

    if (isSystemOrBypass) {
      await dbAdmin.collection('whatsapp_bot_sessions').doc(last10).delete().catch(() => {});
      console.log(`[Bot Router] System command, opt-out, or leave token detected for ${last10}. Bypassing interceptor.`);
      return false; // Let core handle system commands/opt-out/leave approvals
    }

    if (isExactGreetingOrReset) {
      await dbAdmin.collection('whatsapp_bot_sessions').doc(last10).delete().catch(() => {});
      console.log(`[Bot Router] Greeting or session reset/exit detected for ${last10}. Flushed old session, evaluating matching flows.`);
      // DO NOT return false! We flushed the session so that we can evaluate start nodes from a clean slate.
    }

    // 1. Fetch current active session (if any)
    const sessionDocRef = dbAdmin.collection('whatsapp_bot_sessions').doc(last10);
    const sessionSnap = await sessionDocRef.get();
    let session: BotSession | null = null;
    let previousFlowId: string | null = null;

    if (sessionSnap.exists) {
      const sessionData = sessionSnap.data() as any;
      const lastActivityStr = sessionData.last_activity_at || sessionData.lastInteractionAt;
      let isTimedOut = false;
      
      if (lastActivityStr) {
        const lastActivity = new Date(lastActivityStr).getTime();
        const now = Date.now();
        const duration = now - lastActivity;
        if (duration > 24 * 60 * 60 * 1000) { // 24 hours
          isTimedOut = true;
        }
      }

      if (isTimedOut) {
        console.log(`[Bot Router] Session for ${last10} timed out (older than 24 hours). Flushing session state.`);
        previousFlowId = sessionData.currentFlowId;
        await sessionDocRef.delete().catch(() => {});
        session = null;
      } else {
        session = sessionData as BotSession;
        if (!session.fullJid) {
          session.fullJid = from;
          await sessionDocRef.update({ fullJid: from }).catch(() => {});
        }
      }
    }

    // 2. No active session or timed out: Try to trigger a flow start
    if (!session) {
      // Check for global holiday query first when there's no active session
      const isHolidayQuery = ['holiday', 'working', 'vacation', 'సెలవు', 'పనిదినం', 'వర్కింగ్', 'ఓపెన్', 'క్లోజ్'].some(word => cleanTextLower.includes(word));
      if (isHolidayQuery) {
        console.log(`[Bot Router] Global Holiday/Working Day query detected from ${last10}: "${cleanText}"`);
        const holidayResponse = await resolveHolidayMessage(cleanText);
        await queueBotMessage(cleanPhone, holidayResponse);
        return true;
      }

      // Find all active visual flows in Firestore
      const flowsSnap = await dbAdmin.collection('whatsapp_bot_flows')
        .where('isActive', '==', true)
        .get();
      
      let matchedFlow: BotWorkflow | null = null;
      let matchedStartNode: any = null;

      // Match by keyword first
      flowsSnap.forEach((fDoc: any) => {
        if (matchedFlow) return;
        const flowData = fDoc.data() as BotWorkflow;
        const startNodes = (flowData.nodes || []).filter(n => n.type === NodeType.START);
        
        for (const startNode of startNodes) {
          const triggers = (startNode.data?.triggerKeywords || '')
            .toLowerCase()
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
          
          if (triggers.some(t => cleanText.toLowerCase().includes(t))) {
            matchedFlow = flowData;
            matchedStartNode = startNode;
            break;
          }
        }
      });

      // If no keyword match, but we have a timed out session, gracefully reset them to the Start Node of their previous flow
      if (!matchedFlow && previousFlowId) {
        flowsSnap.forEach((fDoc: any) => {
          if (matchedFlow) return;
          const flowData = fDoc.data() as BotWorkflow;
          if (flowData.id === previousFlowId) {
            const startNode = (flowData.nodes || []).find(n => n.type === NodeType.START);
            if (startNode) {
              matchedFlow = flowData;
              matchedStartNode = startNode;
              console.log(`[Bot Router] Gracefully resetting timed-out parent back to previous flow's Start Node: ${previousFlowId}`);
            }
          }
        });
      }

      // Fallback: If no keyword flow is matched, select default/fallback/main flow or first active flow
      if (!matchedFlow && !flowsSnap.empty) {
        // Try to find a flow with "default", "fallback", or "main" in name
        flowsSnap.forEach((fDoc: any) => {
          if (matchedFlow) return;
          const flowData = fDoc.data() as BotWorkflow;
          const nameLower = (flowData.name || '').toLowerCase();
          if (nameLower.includes('default') || nameLower.includes('fallback') || nameLower.includes('main')) {
            const startNode = (flowData.nodes || []).find(n => n.type === NodeType.START);
            if (startNode) {
              matchedFlow = flowData;
              matchedStartNode = startNode;
              console.log(`[Bot Router] No keyword match. Fallback selected default/main flow: "${flowData.name}"`);
            }
          }
        });

        // If still no flow, use first active flow
        if (!matchedFlow) {
          const firstFlowData = flowsSnap.docs[0].data() as BotWorkflow;
          const startNode = (firstFlowData.nodes || []).find(n => n.type === NodeType.START);
          if (startNode) {
            matchedFlow = firstFlowData;
            matchedStartNode = startNode;
            console.log(`[Bot Router] No keyword or default flow found. Fallback to first active flow: "${firstFlowData.name}"`);
          }
        }
      }

      if (matchedFlow && matchedStartNode) {
        console.log(`[Bot Router] Trigger match! Flow: "${(matchedFlow as BotWorkflow).name}" matched keyword, timeout, or fallback routing.`);
        
        // Initialize new active chatbot session with dual activity timestamp support
        const nowIso = new Date().toISOString();
        session = {
          id: last10,
          currentFlowId: (matchedFlow as BotWorkflow).id,
          currentNodeId: matchedStartNode.id,
          variables: {},
          lastInteractionAt: nowIso,
          last_activity_at: nowIso,
          history: [matchedStartNode.id],
          fullJid: from
        };

        await sessionDocRef.set(session);
        
        // Execute the next connected node immediately
        await executeNextStep(session, 'output');
        return true;
      }

      // No match and no active session (or no flows created yet) -> pass back to default AI (safety fallback)
      return false;
    }

    // 3. Active Session Exists: Handle user response (e.g. button click)
    console.log(`[Bot Router] Active session located. Current node: ${session.currentNodeId}`);
    
    // Fetch the flow details
    const flowDoc = await dbAdmin.collection('whatsapp_bot_flows').doc(session.currentFlowId).get();
    if (!flowDoc.exists || !flowDoc.data()?.isActive) {
      console.warn(`[Bot Router] Flow is inactive or missing. Terminating session.`);
      await sessionDocRef.delete().catch(() => {});
      return false;
    }

    const flow = flowDoc.data() as BotWorkflow;
    const currentNode = (flow.nodes || []).find(n => n.id === session!.currentNodeId);

    if (!currentNode) {
      console.warn(`[Bot Router] Current node ${session.currentNodeId} not found in graph. Resetting.`);
      await sessionDocRef.delete().catch(() => {});
      return false;
    }

    // Evaluate input based on node type
    if (currentNode.type === NodeType.BUTTON_MESSAGE) {
      const buttons = currentNode.data?.buttons || [];
      let clickedButtonIdx = -1;

      // Find button matching input (by index, direct text match or button ID)
      buttons.forEach((btn: any, idx: number) => {
        if (
          cleanText.toLowerCase() === btn.text.toLowerCase() ||
          cleanText === String(idx + 1) ||
          cleanText.toLowerCase() === `opt-${idx}`
        ) {
          clickedButtonIdx = idx;
        }
      });

      if (clickedButtonIdx >= 0) {
        console.log(`[Bot Router] User selected button ${clickedButtonIdx + 1}: "${buttons[clickedButtonIdx].text}"`);
        // Transition via button edge handle ID: `btn-${clickedButtonIdx}`
        await executeNextStep(session, `btn-${clickedButtonIdx}`);
        return true;
      } else {
        // Before sending invalid selection, check if the input contains a holiday query while in session
        const isHolidayQuery = ['holiday', 'working', 'vacation', 'సెలవు', 'పనిదినం', 'వర్కింగ్', 'ఓపెన్', 'క్లోజ్'].some(word => cleanTextLower.includes(word));
        if (isHolidayQuery) {
          console.log(`[Bot Router] Holiday query inside active session from ${last10}: "${cleanText}"`);
          const holidayResponse = await resolveHolidayMessage(cleanText);
          await queueBotMessage(cleanPhone, holidayResponse);
          return true;
        }

        // Did not select button option. Remind and re-display options
        console.log(`[Bot Router] Input did not match button choices. Re-sending options.`);
        const retryText = `⚠️ *Invalid Selection / తప్పుడు ఎంపిక.*\n\nPlease select one of the options below, or type *exit* to start over.\n(మొదటి నుండి ప్రారంభించడానికి *exit* అని టైప్ చేయండి):`;
        await queueBotMessage(cleanPhone, retryText);
        await processNode(session, currentNode);
        return true;
      }
    } else if (currentNode.type === NodeType.LIST_MESSAGE) {
      const rows = currentNode.data?.rows || [];
      let clickedRowIdx = -1;

      // Find row matching input (by index, direct title match or row ID/button ID/row-idx)
      rows.forEach((row: any, idx: number) => {
        if (
          cleanText.toLowerCase() === (row.title || '').toLowerCase() ||
          cleanText === String(idx + 1) ||
          cleanText.toLowerCase() === `row-${idx}` ||
          cleanText.toLowerCase() === `opt-${idx}` ||
          cleanText.toLowerCase() === (row.id || '').toLowerCase()
        ) {
          clickedRowIdx = idx;
        }
      });

      if (clickedRowIdx >= 0) {
        console.log(`[Bot Router] User selected list row ${clickedRowIdx + 1}: "${rows[clickedRowIdx].title}"`);
        // Transition via row edge handle ID: `row-${clickedRowIdx}`
        await executeNextStep(session, `row-${clickedRowIdx}`);
        return true;
      } else {
        // Before sending invalid selection, check if the input contains a holiday query while in session
        const isHolidayQuery = ['holiday', 'working', 'vacation', 'సెలవు', 'పనిదినం', 'వర్కింగ్', 'ఓపెన్', 'క్లోజ్'].some(word => cleanTextLower.includes(word));
        if (isHolidayQuery) {
          console.log(`[Bot Router] Holiday query inside active session from ${last10}: "${cleanText}"`);
          const holidayResponse = await resolveHolidayMessage(cleanText);
          await queueBotMessage(cleanPhone, holidayResponse);
          return true;
        }

        // Did not select list option. Remind and re-display options
        console.log(`[Bot Router] Input did not match list choices. Re-sending options.`);
        const buttonText = currentNode.data?.buttonText || "View Menu";
        const retryText = `⚠️ *Invalid Selection / తప్పుడు ఎంపిక.*\n\nPlease click on "${buttonText}" below and select one of the options, or type *exit* to start over.\n(మొదటి నుండి ప్రారంభించడానికి *exit* అని టైప్ చేయండి):`;
        await queueBotMessage(cleanPhone, retryText);
        await processNode(session, currentNode);
        return true;
      }
    }

    // Default return fallback
    return false;
  } catch (err) {
    console.error("[Bot Router] Message interception crash:", err);
    return false;
  }
}

/**
 * Transitions from a source handle and executes subsequent nodes recursively
 */
async function executeNextStep(session: BotSession, sourceHandleId: string): Promise<void> {
  try {
    const dbAdmin = getDbAdmin();
    const sessionDocRef = dbAdmin.collection('whatsapp_bot_sessions').doc(session.id);
    
    // Load the flow
    const flowDoc = await dbAdmin.collection('whatsapp_bot_flows').doc(session.currentFlowId).get();
    if (!flowDoc.exists) {
      await sessionDocRef.delete().catch(() => {});
      return;
    }

    const flow = flowDoc.data() as BotWorkflow;
    
    // Find edge from current node with sourceHandle matching
    const edge = (flow.edges || []).find(
      e => e.source === session.currentNodeId && 
           (e.sourceHandle === sourceHandleId || 
            (!e.sourceHandle && sourceHandleId === 'output'))
    );

    if (!edge) {
      console.log(`[Bot Router] Execution path terminated. No edge matching handle "${sourceHandleId}" from ${session.currentNodeId}`);
      
      // Look up current node option details for terminal option fallback
      try {
        const currentNode = (flow.nodes || []).find(n => n.id === session.currentNodeId);
        if (currentNode) {
          let selectedOptionText = '';
          if (currentNode.type === NodeType.BUTTON_MESSAGE) {
            const buttons = currentNode.data?.buttons || [];
            const parts = sourceHandleId.split('-');
            const btnIdx = parts.length > 1 ? parseInt(parts[1], 10) : -1;
            if (btnIdx >= 0 && btnIdx < buttons.length) {
              selectedOptionText = buttons[btnIdx].text || '';
            }
          } else if (currentNode.type === NodeType.LIST_MESSAGE) {
            const rows = currentNode.data?.rows || [];
            const parts = sourceHandleId.split('-');
            const rowIdx = parts.length > 1 ? parseInt(parts[1], 10) : -1;
            if (rowIdx >= 0 && rowIdx < rows.length) {
              selectedOptionText = rows[rowIdx].title || rows[rowIdx].text || '';
            }
          }

          if (selectedOptionText) {
            const lowerOption = selectedOptionText.toLowerCase();
            const isHolidayOption = ['holiday', 'working', 'vacation', 'సెలవు', 'పనిదినం', 'వర్కింగ్', 'ఓపెన్', 'క్లోజ్'].some(word => lowerOption.includes(word));
            const targetRecipient = session.fullJid || session.id;
            
            if (isHolidayOption) {
              console.log(`[Bot Router] Terminal option fallback matched Holiday query text: "${selectedOptionText}"`);
              const holidayMsg = await resolveHolidayMessage(selectedOptionText);
              await queueBotMessage(targetRecipient, holidayMsg);
            } else if (lowerOption.includes('voice call') || lowerOption.includes('కాల్')) {
              const voiceMsg = `📞 *Voice Call Support:*\n\nTo contact St. Antony's School office, please call us directly on *8822269999* during school hours (8:30 AM - 4:00 PM).\n\n(మా కార్యాలయాన్ని సంప్రదించడానికి దయచేసి *8822269999* నంబర్ కు కాల్ చేయండి)`;
              await queueBotMessage(targetRecipient, voiceMsg);
            } else if (lowerOption.includes('school information') || lowerOption.includes('school info') || lowerOption.includes('పాఠశాల')) {
              const schoolMsg = `🏫 *St. Antony's High School Information:*\n\n📍 *Location:* St. Antony's High School, Main Campus\n📞 *Contact:* 8822269999\n🌐 *Website:* https://stantonyschool.edu.in\n\nWe provide quality education from Nursery to Class 10 with a focus on comprehensive academic excellence.`;
              await queueBotMessage(targetRecipient, schoolMsg);
            } else {
              // Standard fallback
              const defaultMsg = `You selected *${selectedOptionText}*.\n\nType *menu* or *hi* to return to the main menu.`;
              await queueBotMessage(targetRecipient, defaultMsg);
            }
          }
        }
      } catch (fallbackErr: any) {
        console.error("[Bot Router] Error in terminal option fallback handler:", fallbackErr.message);
      }

      // Remove session when we reach the end of the graph to allow fresh triggers
      await sessionDocRef.delete().catch(() => {});
      return;
    }

    const targetNodeId = edge.target;
    const targetNode = (flow.nodes || []).find(n => n.id === targetNodeId);

    if (!targetNode) {
      console.warn(`[Bot Router] Target node ${targetNodeId} not found in graph.`);
      await sessionDocRef.delete().catch(() => {});
      return;
    }

    console.log(`[Bot Router] Transition: ${session.currentNodeId} -> ${targetNodeId} (${targetNode.type})`);
    
    // Update session state
    const nowIso = new Date().toISOString();
    session.currentNodeId = targetNodeId;
    session.history.push(targetNodeId);
    session.lastInteractionAt = nowIso;
    session.last_activity_at = nowIso;
    await sessionDocRef.set(session);

    // Execute target node logic
    await processNode(session, targetNode);

  } catch (err) {
    console.error("[Bot Router] Execute step failure:", err);
  }
}

/**
 * Executes a single node's custom operational logic
 */
async function processNode(session: BotSession, node: any): Promise<void> {
  const dbAdmin = getDbAdmin();
  const sessionDocRef = dbAdmin.collection('whatsapp_bot_sessions').doc(session.id);
  const targetRecipient = session.fullJid || session.id;
  
  switch (node.type) {
    case NodeType.BUTTON_MESSAGE: {
      // 1. Resolve Dynamic Metadata Values
      const context = await resolveStudentContext(session.id);
      
      // 2. Token Replacement
      let formattedText = replaceVariables(node.data?.text || '', context);
      
      // 3. Format interactive button options for the Baileys sender
      const buttons = (node.data?.buttons || []).map((b: any, idx: number) => ({
        buttonId: `opt-${idx}`,
        buttonText: { displayText: b.text },
        type: 1
      }));

      const options: any = {};
      if (buttons.length > 0) {
        options.buttons = buttons;
        options.footer = node.data?.footer || "St. Antony's School ERP";

        // Append high-contrast, fully readable plain text options as fallback list
        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const fallbackText = (node.data?.buttons || []).map((b: any, idx: number) => {
          const emoji = numberEmojis[idx] || `${idx + 1}.`;
          return `${emoji} *${b.text}*`;
        }).join('\n');
        
        formattedText = `${formattedText}\n\n*Select an option (Type number or option name):*\n${fallbackText}`;
      }

      // 4. Queue message cleanly into standard rate-limited queue
      await queueBotMessage(targetRecipient, formattedText, options);
      
      // Stop and wait for user's interactive button selection
      console.log(`[Bot Router] Awaiting button response at Interactive Node: ${node.id}`);
      break;
    }

    case NodeType.LIST_MESSAGE: {
      // 1. Resolve Dynamic Metadata Values
      const context = await resolveStudentContext(session.id);
      
      // 2. Use the databaseResolution serialization helper
      const serialized = serializeListMessage(node.data || {}, context);

      // 3. Queue message cleanly into standard rate-limited queue
      await queueBotMessage(targetRecipient, serialized.text, serialized.options);
      
      // Stop and wait for user's interactive list selection
      console.log(`[Bot Router] Awaiting list response at Interactive List Node: ${node.id}`);
      break;
    }

    case NodeType.CONDITION: {
      const context = await resolveStudentContext(session.id);
      const field = node.data?.field || ConditionField.ATTENDANCE;
      const operator = node.data?.operator || ConditionOperator.LESS_THAN;
      const threshold = node.data?.value ?? 75;

      let valueToCompare = 0;
      if (field === ConditionField.ATTENDANCE) {
        valueToCompare = parseInt(context.attendancePercentage.replace('%', '')) || 0;
      } else if (field === ConditionField.EXAM_MARKS) {
        // Look up highest marks scored or first mark
        valueToCompare = 70; // Mock average threshold or dynamic calculation
      }

      // Evaluate condition boolean
      let conditionMet = false;
      switch (operator) {
        case ConditionOperator.LESS_THAN:
          conditionMet = valueToCompare < threshold;
          break;
        case ConditionOperator.GREATER_THAN:
          conditionMet = valueToCompare > threshold;
          break;
        case ConditionOperator.EQUAL_TO:
          conditionMet = valueToCompare === threshold;
          break;
        case ConditionOperator.LESS_THAN_OR_EQUAL:
          conditionMet = valueToCompare <= threshold;
          break;
        case ConditionOperator.GREATER_THAN_OR_EQUAL:
          conditionMet = valueToCompare >= threshold;
          break;
      }

      console.log(`[Bot Router] Condition evaluation: ${valueToCompare} ${operator} ${threshold} -> Met: ${conditionMet}`);
      
      // Move to true or false handle branching
      await executeNextStep(session, conditionMet ? 'true' : 'false');
      break;
    }

    case NodeType.DELAY: {
      const seconds = node.data?.durationSeconds ?? 5;
      console.log(`[Bot Router] Delay node: pausing execution for ${seconds}s...`);
      await sleep(seconds * 1000);
      
      // Resume and transition
      await executeNextStep(session, 'output');
      break;
    }

    case NodeType.ACTION: {
      const actionType = node.data?.actionType || ActionType.AUTH_GUARD;
      console.log(`[Bot Router] Running Action node: ${actionType}`);

      if (actionType === ActionType.AUTH_GUARD) {
        // Extract registration status
        const context = await resolveStudentContext(session.id);
        const isRegistered = context.studentName !== 'Student';

        if (!isRegistered) {
          console.warn(`[Bot Router] AUTH_GUARD: Unregistered sender ${session.id}. Sending exit notice.`);
          const unregisteredMsg = `Your WhatsApp number is not registered in our school database. Please contact the school office (8822269999) to register your number for the AI Assistant. / మీ ఫోన్ నెంబర్ మా పాఠశాల డేటాబేస్ లో నమోదు కాలేదు. AI అసిస్టెంట్ సేవలను ఉపయోగించడం కోసం దయచేసి పాఠశాల కార్యాలయాన్ని సంప్రదించండి.`;
          await queueBotMessage(targetRecipient, unregisteredMsg);
          
          // Terminate session
          await sessionDocRef.delete().catch(() => {});
          return;
        }
      } else if (actionType === ActionType.FETCH_ATTENDANCE) {
        // Fetch student's real-time attendance percentage
        const context = await resolveStudentContext(session.id);
        const attendanceMsg = `📅 *హాజరు వివరాలు (Attendance Status) for ${context.studentName}:*\n\n` +
          `👤 *విద్యార్థి పేరు:* ${context.studentName}\n` +
          `🏫 *తరగతి (Class):* ${context.className}\n` +
          `🕒 *బ్యాచ్ (Batch):* ${context.batchName}\n` +
          `📈 *మొత్తం హాజరు శాతం:* *${context.attendancePercentage}*\n\n` +
          `*సహాయం:* ఇతర సమాచారం కోసం దయచేసి మెనూ నుండి ఎంచుకోండి.`;
        await queueBotMessage(targetRecipient, attendanceMsg);
      } else if (actionType === ActionType.FETCH_MARKS) {
        // Fetch student's subject-wise exam marks
        const context = await resolveStudentContext(session.id);
        const marksMsg = `✍️ *పరీక్షల మార్కులు (Exam Marks) for ${context.studentName}:*\n\n` +
          `👤 *విద్యార్థి పేరు:* ${context.studentName}\n` +
          `🏫 *తరగతి (Class):* ${context.className}\n\n` +
          `📝 *మార్కుల వివరాలు:*\n${context.examMarks}\n\n` +
          `*సహాయం:* ఇతర సమాచారం కోసం దయచేసి మెనూ నుండి ఎంచుకోండి.`;
        await queueBotMessage(targetRecipient, marksMsg);
      } else if (actionType === ActionType.SEND_PAYMENT_RECEIPT) {
        // Send a custom payment receipt context
        const context = await resolveStudentContext(session.id);
        const receiptMsg = `🧾 *St. Antony's School Payment Receipt* \n\nDear ${context.parentName},\nWe have successfully received the fee payment for *${context.studentName}* of class *${context.className}*, batch *${context.batchName}*. \n\nThank you for your payment!`;
        await queueBotMessage(targetRecipient, receiptMsg);
      } else if (actionType === ActionType.FETCH_HOLIDAYS) {
        // Fetch current holiday status from db
        const holidayMsg = await resolveHolidayMessage('today');
        await queueBotMessage(targetRecipient, holidayMsg);
      }

      // Transition sequentially to next step
      await executeNextStep(session, 'output');
      break;
    }

    default:
      console.warn(`[Bot Router] Unsupported node type: ${node.type}`);
      await sessionDocRef.delete().catch(() => {});
      break;
  }
}

/**
 * Places message payload into persistent Firestore queue for ban-safe, rate-limited dispatch
 */
async function queueBotMessage(phoneNumber: string, text: string, options: any = {}): Promise<void> {
  try {
    let to = phoneNumber;
    if (!to.includes('@')) {
      to = `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    }

    const { createQueueItem } = await import('../../server/models/WhatsAppQueue.js');
    await createQueueItem({
      recipient: to,
      to,
      message: text,
      text,
      options,
      type: 'bot',
      priority: 0,
      status: 'pending'
    });

    const { isDatabaseDenied, getDbAdmin } = await import('../../server/firebaseAdmin.js');
    if (!isDatabaseDenied()) {
      const dbAdmin = getDbAdmin();
      if (dbAdmin) {
        const payload = {
          to,
          text,
          status: 'pending',
          priority: 0,
          type: 'bot',
          options,
          attempts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await dbAdmin.collection('whatsapp_queue').add(payload).catch(() => {});
      }
    }

    console.log(`[Bot Router] Message successfully queued for: ${to}`);
  } catch (err) {
    console.error("[Bot Router] Error writing to queue collection:", err);
  }
}
