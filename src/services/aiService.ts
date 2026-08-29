import { GoogleGenAI } from "@google/genai";
import { dbService } from "./dbService";

const getApiKey = async () => {
  const schoolSettings = await dbService.get('settings', 'school');
  const isEnabled = schoolSettings?.aiApiKeyEnabled ?? true;
  if (!isEnabled) return null;

  const key = schoolSettings?.aiApiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key || key === 'YOUR_GEMINI_API_KEY' || key === 'GEMINI_API_KEY') {
    return null;
  }
  return key;
};

const trackSpending = async () => {
  try {
    const schoolSettings = await dbService.get('settings', 'school');
    const currentSpending = schoolSettings?.aiSpending || 0;
    // Estimated cost per request in INR (approx ₹0.05 per request for Gemini Flash)
    await dbService.update('settings', 'school', { 
      aiSpending: currentSpending + 0.05 
    });
  } catch (error) {
    console.error("Error tracking AI spending:", error);
  }
};

export const generateAIContent = async (prompt: string, systemInstruction?: string) => {
  const key = await getApiKey();
  if (!key) {
    return "AI insights currently unavailable due to missing or disabled configuration.";
  }

  const ai = new GoogleGenAI({ apiKey: key });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || "You are an AI assistant for St. Antony's School ERP system. Provide helpful, accurate, and professional insights."
      }
    });
    
    await trackSpending();
    return response.text;
  } catch (error) {
    console.error("AI Generation Error:", error);
    return "AI insights currently unavailable.";
  }
};

export const getAttendanceInsights = async (attendanceData: any[]) => {
  // Aggregate data to dramatically cut down prompt tokens and lower costs
  const total = attendanceData.length;
  const presentCount = attendanceData.filter(d => d.status === 'present' || d.status === 'Present').length;
  const absentCount = total - presentCount;
  const attendanceRate = total > 0 ? ((presentCount / total) * 100).toFixed(1) : "0";
  
  const dateMap: any = {};
  attendanceData.forEach(d => {
    const dStr = d.date || 'unknown';
    if (!dateMap[dStr]) dateMap[dStr] = { present: 0, total: 0 };
    dateMap[dStr].total++;
    if (d.status === 'present' || d.status === 'Present') dateMap[dStr].present++;
  });
  
  const dailyTrends = Object.entries(dateMap).slice(-10).map(([date, stats]: any) => ({
    date,
    attendanceRate: stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : "0"
  }));

  const summary = {
    totalRecords: total,
    presentCount,
    absentCount,
    overallAttendanceRate: `${attendanceRate}%`,
    recentDailyTrends: dailyTrends
  };

  const prompt = `Analyze this attendance data summary and predict absentee patterns: ${JSON.stringify(summary)}`;
  return generateAIContent(prompt, "You are an expert educational data analyst. Predict future absentee patterns based on historical data.");
};

export const getPerformanceInsights = async (resultsData: any[]) => {
  // Aggregate results data to save tokens and minimize AI bills
  const total = resultsData.length;
  if (total === 0) return "No results available to analyze.";

  const scores = resultsData.map(r => Number(r.marks || r.score || r.obtainedMarks || 0)).filter(n => !isNaN(n));
  const avgMarks = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "0";
  const maxMark = scores.length > 0 ? Math.max(...scores) : 0;
  const minMark = scores.length > 0 ? Math.min(...scores) : 0;

  const summary = {
    totalStudents: total,
    averageMarks: avgMarks,
    highestMark: maxMark,
    lowestMark: minMark,
    sampleScores: resultsData.slice(0, 15).map(r => ({
      studentName: r.studentName || r.name || 'Student',
      obtainedMarks: r.marks || r.score || r.obtainedMarks,
      maxMarks: r.maxMarks || 100,
      subject: r.subjectName || r.subject || 'Subject'
    }))
  };

  const prompt = `Analyze these student results and provide performance insights: ${JSON.stringify(summary)}`;
  return generateAIContent(prompt, "You are an expert academic counselor. Provide constructive feedback and performance analysis for students.");
};

export const getLessonPlan = async (subject: string, topic: string, grade: string) => {
  const prompt = `Generate a comprehensive lesson plan for ${subject}, Topic: ${topic}, Grade: ${grade}.`;
  return generateAIContent(prompt, "You are an experienced teacher. Create engaging and structured lesson plans.");
};

export const getHomeworkSuggestions = async (subject: string, topic: string) => {
  const prompt = `Suggest 2-3 extremely short, simple, and highly meaningful homework assignments for ${subject} on the topic: ${topic}. Each idea should be brief (1-2 sentences) and highly practical. Avoid any introductory or concluding text, unnecessary explanation, or conversational fluff.`;
  return generateAIContent(prompt, "You are a creative educator. Provide only direct, brief, simple and highly meaningful homework suggestions with no extra chatty preamble.");
};

export const getFeePrediction = async (feeHistory: any[]) => {
  // Compress fee history to reduce token usage and cost
  const total = feeHistory.length;
  if (total === 0) return "No payment history available.";

  const paidCount = feeHistory.filter(f => f.status === 'paid' || f.status === 'Paid').length;
  const pendingCount = feeHistory.filter(f => f.status === 'pending' || f.status === 'Pending').length;

  const totalPaid = feeHistory.reduce((sum, f) => sum + Number(f.paidAmount || f.amountPaid || 0), 0);
  const totalPending = feeHistory.reduce((sum, f) => sum + Number(f.pendingAmount || f.amountPending || f.balance || 0), 0);

  const summary = {
    totalRecords: total,
    paidStatusCount: paidCount,
    pendingStatusCount: pendingCount,
    totalCollectedAmount: totalPaid,
    totalOutstandingAmount: totalPending,
    recentPayments: feeHistory.slice(-10).map(f => ({
      status: f.status,
      amount: f.paidAmount || f.amountPaid || f.amount,
      date: f.paymentDate || f.date || 'unknown'
    }))
  };

  const prompt = `Analyze this fee payment history and predict potential late payments: ${JSON.stringify(summary)}`;
  return generateAIContent(prompt, "You are a financial analyst for a school. Predict payment risks based on history.");
};

export const getReportCardComments = async (studentName: string, performance: any) => {
  const prompt = `Generate professional report card comments for ${studentName} based on these results: ${JSON.stringify(performance)}`;
  return generateAIContent(prompt, "You are a school teacher writing report card comments. Be professional, encouraging, and specific.");
};

export const generateExamQuestions = async (subject: string, topic: string, grade: string, type: string, count: number) => {
  const prompt = `Generate ${count} ${type} questions for ${subject}, Topic: ${topic}, Grade: ${grade}. Include answers.`;
  return generateAIContent(prompt, "You are an expert examiner. Create balanced, challenging, and curriculum-aligned exam questions.");
};

export const analyzeImportData = async (data: any[], type: 'students' | 'teachers' | 'staff') => {
  const prompt = `Analyze this ${type} import data and provide a summary of classes, batches, and any potential data issues or interesting trends: ${JSON.stringify(data.slice(0, 20))}`;
  return generateAIContent(prompt, `You are a data analyst for St. Antony's School. Summarize the ${type} data being imported.`);
};

export const extractHandwrittenMarks = async (base64Image: string, students: any[], selectedExam: any) => {
  const isFA = selectedExam.type === 'FA';
  const fields = isFA ? ['st1 (max 10)', 'st2 (max 10)', 'hw (max 5)', 'faWritten (max 25)'] : ['saWritten (max 100)'];
  
  const prompt = `
    I am providing an image of a handwritten marks sheet for an exam (${selectedExam.title}).
    Your task is to extract the marks for each student listed below.
    
    Expected Students:
    ${JSON.stringify(students.map(s => ({ id: s.id, name: s.name, rollNumber: s.rollNumber })))}
 
    Extraction Fields per student: ${fields.join(', ')}
 
    Instructions:
    1. Scan the image for a table containing marks.
    2. Map the handwritten scores to the correct student based on their Name or Roll Number.
    3. Return the result as a JSON object with a "marks" array.
    4. Each item in "marks" must have studentId and the extracted score fields.
    5. If a mark is unreadable, use null.
 
    Format: { "marks": [{ "studentId": "...", "${fields[0].split(' ')[0]}": 10, ... }] }
  `;
 
  try {
    const key = await getApiKey();
    if (!key) throw new Error("AI Disabled");
    const aiInstance = new GoogleGenAI({ apiKey: key });

    const response = await aiInstance.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Image.split(',')[1],
                mimeType: "image/jpeg"
              }
            }
          ]
        }
      ]
    });
    
    await trackSpending();
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Invalid AI response format");
  } catch (error) {
    console.error("Handwriting AI Error:", error);
    return { marks: [] };
  }
};

export const identifyPeopleFromPhoto = async (base64Image: string, peopleList: any[], type: 'student' | 'staff' = 'student') => {
  const prompt = `
    I am providing a group photo of ${type === 'staff' ? 'staff members/teachers' : 'students in a classroom'}. 
    Your task is to identify the people present in this photo based on the registered list provided below.
    
    Registered List:
    ${JSON.stringify(peopleList.map(s => ({ id: s.uid, name: s.name, photo: s.profilePhoto })))}
 
    Instructions:
    1. Carefully scan the group photo for faces.
    2. Match detected faces against the names in the registered list.
    3. Return the result as a JSON object with:
       - "identified": Array of IDs (from the list) who are clearly present.
       - "pending": Array of objects for faces that are visible but you are unsure of their identity. 
         Each pending object must have:
         - "x": Horizontal position percentage (0-100).
         - "y": Vertical position percentage (0-100).
         - "possibleNames": Array of 2-3 names from the list that could be a match.
 
    Format: { "identified": ["id1", "id2"], "pending": [{ "x": 25, "y": 40, "possibleNames": ["Name 1", "Name 2"] }] }
  `;
 
  try {
    const key = await getApiKey();
    if (!key) throw new Error("AI Disabled");
    const aiInstance = new GoogleGenAI({ apiKey: key });

    const response = await aiInstance.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Image.split(',')[1],
                mimeType: "image/jpeg"
              }
            }
          ]
        }
      ]
    });
    
    await trackSpending();
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Invalid AI response format");
  } catch (error) {
    console.error("Smart Attendance AI Error:", error);
    return { identified: [], pending: [] };
  }
};

export const parseLeaveRequest = async (message: string) => {
  const prompt = `
    Analyze this message and extract leave request details. 
    Message: "${message}"
 
    JSON Format to return:
    {
      "type": "sick" | "personal" | "casual" | "other",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "reason": "Summarized reason",
      "days": 1
    }
 
    Guidelines:
    - If the end date is not mentioned, assume it is the same as the start date.
    - If no dates are mentioned, use the current date ${new Date().toISOString().split('T')[0]} as the start date.
    - Return ONLY the JSON object.
  `;
  
  try {
    const key = await getApiKey();
    if (!key) throw new Error("AI Disabled");
    const aiInstance = new GoogleGenAI({ apiKey: key });

    const response = await aiInstance.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    
    await trackSpending();
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error("Leave AI Parsing Error:", error);
    return null;
  }
};

export const getSubstitutionSuggestions = async (absentTeacher: any, freeTeachers: any[], periodDetails: any) => {
  const prompt = `
    Find the best substitute teacher for:
    Absent Teacher: ${absentTeacher.name} (Specializes in ${absentTeacher.subjects?.join(', ')})
    Period: ${periodDetails.label} (${periodDetails.startTime} - ${periodDetails.endTime})
    Batch: ${periodDetails.batchName}
    Subject: ${periodDetails.subjectName}
 
    Available (Leisure) Teachers:
    ${JSON.stringify(freeTeachers.map(t => ({ id: t.uid, name: t.name, specialties: t.subjects || [] })))}
 
    Instructions:
    1. Prioritize teachers who teach the SAME subject as the current period.
    2. Secondarily prioritize teachers who teach in the same grade or department.
    3. Return a JSON object with:
       - "substituteId": Best candidate's ID
       - "reason": Why they were chosen
 
    Format: { "substituteId": "...", "reason": "..." }
  `;
 
  try {
    const key = await getApiKey();
    if (!key) throw new Error("AI Disabled");
    const aiInstance = new GoogleGenAI({ apiKey: key });

    const response = await aiInstance.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    
    await trackSpending();
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error("Substitution AI Error:", error);
    return null;
  }
};

export const getBirthdayWish = async (personName: string, role: string) => {
  const prompt = `Generate a warm and professional birthday wish for ${personName}, who is a ${role} at St. Antony's School. The message should be friendly and suitable for WhatsApp.`;
  return generateAIContent(prompt, "You are a friendly school assistant. Create personalized and heartwarming birthday wishes.");
};

export const getRiskPrediction = async (studentData: any) => {
  const prompt = `
    Analyze this student's diagnostic data and predict their academic risk level:
    ${JSON.stringify(studentData)}
 
    Provide a JSON response with:
    - riskScore: 0-100 (percentage integer)
    - label: "Low Risk" | "At Risk" | "Moderate Chronic" | "Extreme Chronic"
    - dropoutProbability: number (0-100)
    - noDropoutProbability: number (0-100)
    - flaggedIndicators: array of reasons why (e.g., ["Low Attendance (72%)", "Poor Early Assessments"])
    - performanceImpact: { "Math": number, "Science": number, "English": number } (expected scores or relative impact)
    - recommendations: array of actionable steps
 
    Format: { "riskScore": 75, "label": "At Risk", ... }
    Return ONLY JSON.
  `;
  
  try {
    const key = await getApiKey();
    if (!key) throw new Error("AI Disabled");
    const aiInstance = new GoogleGenAI({ apiKey: key });

    const response = await aiInstance.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    await trackSpending();
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return null;
  } catch (error) {
    console.error("Risk Prediction Error:", error);
    return null;
  }
};

export const getStrategicAnalysis = async (dataSummary: any) => {
  const prompt = `
    Analyze this comprehensive school data and act as a Strategic AI Consultant for St. Antony's School.
    Data Summary: ${JSON.stringify(dataSummary)}
    
    Provide a multi-section analysis in raw HTML format (using Tailwind classes for styling) covering:
    1. 🚀 PERFORMANCE TRENDS: Significant improvements or declines.
    2. ⚠️ RISK ALERTS: Specifically identify batches or groups at risk (academic or administrative).
    3. 💡 DECISION SUPPORT: Concrete recommendations for school management (e.g., resource allocation, teacher training).
    4. 📈 PREDICTIVE OUTLOOK: Expected trends for the next cycle.
    
    Rules:
    - Use clear, professional, yet bold language.
    - Use Tailwind utility classes for colors: text-indigo-600, text-rose-600, etc.
    - Make suggestions actionable.
    - Keep it focused on school management decisions.
  `;
  return generateAIContent(prompt, "You are a professional Strategic Management Consultant for high-performing schools. Your advice is data-driven and focused on educational excellence and operational efficiency.");
};

export const getSmartBotResponse = async (query: string, context: string) => {
  const prompt = `
    User Query: "${query}"
    
    Current Date: ${new Date().toLocaleDateString()}
    Time: ${new Date().toLocaleTimeString()}
    
    School Context (ERP Data):
    ${context}
    
    Instructions:
    1. BILINGUAL SUPPORT: 
       - If the user query is in TELUGU, MUST answer in TELUGU.
       - If the user query is in ENGLISH, answer in ENGLISH.
    
    2. HOLIDAY & WORKING DAYS:
       - Use "holidays" data to answer about schedule.
    
    3. ERP DATA ANALYSIS:
       - Answer accurately based on the provided JSON context.

    4. RESPONSE STYLE:
       - Concise, warm, and professional.
       - Use emojis.
  `;
  return generateAIContent(prompt, "You are St. Antony's School Smart Bot. You help parents/students analyze school data.");
};

export const generateAITimetable = async (data: {
  batches: any[],
  subjects: any[],
  teachers: any[],
  slots: any[],
  days: string[]
}) => {
  const prompt = `
    Generate a school timetable for:
    Batches: ${JSON.stringify(data.batches.map(b => ({ name: b.name })))}
    Subjects: ${JSON.stringify(data.subjects.map(s => ({ name: s.name })))}
    Teachers: ${JSON.stringify(data.teachers.map(t => ({ name: t.name, specialties: t.subjects || [] })))}
    Period Slots: ${JSON.stringify(data.slots)}
    Days: ${data.days.join(', ')}
 
    Return ONLY valid JSON array.
  `;
 
  try {
    const key = await getApiKey();
    if (!key) throw new Error("AI Disabled");
    const aiInstance = new GoogleGenAI({ apiKey: key });

    const response = await aiInstance.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    await trackSpending();
    const text = response.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return null;
  } catch (error) {
    console.error("Timetable Error:", error);
    return null;
  }
};
