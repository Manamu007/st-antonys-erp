import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { dbService } from "./dbService";
import { where } from "firebase/firestore";

let ai: GoogleGenAI | null = null;

const SYSTEM_INSTRUCTION = `You are "Antony", the highly advanced AI Assistant for St. Antony's School ERP system.
You have direct, real-time access to the school's ERP database via specialized tools.

Capabilities & Responsibilities:
1. Student Information: You can look up student details, their class, parent info, and academic records.
2. Staff & Members: You can provide information about teachers, administrators, and their assigned subjects/classes.
3. Attendance: You can check attendance records for students and staff.
4. Fees & Finance: You can answer questions about fee structures, payments, and outstanding balances.
5. Academics: Access to exam schedules, marks, subjects, and classes.
6. Communication: You can retrieve school notices, events, and holidays.
7. General Enquiries: Answer questions about the school's history, facilities, and admissions.

School context:
- Founded in 2000.
- Modern campus with digital classrooms, library, and sports facilities.
- Focus: "Nurturing minds, building character, and shaping global leaders."

Guidelines:
- ALWAYS use the provided tools to fetch real data when users ask specific questions about the school's operations.
- Do NOT guess data; if the information isn't returned by a tool, state that you couldn't find it and suggest contacting the office.
- Maintain professional, helpful, and concise responses.
- Format numerical data (like marks or fees) clearly.
- If a user asks "Who are you?", identify as the official St. Antony's AI Agent.

You have FULL permission to access all ERP data to assist users.`;

const listCollectionTool: FunctionDeclaration = {
  name: "listCollection",
  description: "Fetch documents from a specific school ERP collection with optional filtering.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      collectionName: {
        type: Type.STRING,
        description: "The name of the collection (e.g., 'users', 'attendance', 'fees', 'examMarks', 'notices', 'classes', 'subjects', 'homework', 'leaves').",
      },
      filters: {
        type: Type.ARRAY,
        description: "Optional filters to apply.",
        items: {
          type: Type.OBJECT,
          properties: {
            field: { type: Type.STRING, description: "The field to filter by (e.g., 'role', 'classId', 'studentId', 'date')." },
            operator: { type: Type.STRING, description: "Filter operator (default is '=='). Use '==', '>', '<', '<=', '>=', 'array-contains'." },
            value: { type: Type.STRING, description: "The value to compare against." },
          },
          required: ["field", "value"],
        },
      },
      limit: {
        type: Type.NUMBER,
        description: "Maximum number of records to return (default is 20).",
      }
    },
    required: ["collectionName"],
  },
};

const getDocumentTool: FunctionDeclaration = {
  name: "getDocument",
  description: "Fetch a single document from a collection by its ID.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      collectionName: { type: Type.STRING, description: "The name of the collection." },
      documentId: { type: Type.STRING, description: "The document ID (UID)." },
    },
    required: ["collectionName", "documentId"],
  },
};

const tools = [
  { functionDeclarations: [listCollectionTool, getDocumentTool] }
];

export const geminiService = {
  async chat(message: string, history: { role: 'user' | 'model', parts: { text: string }[] }[] = []) {
    try {
      // 0. Check Settings for Enablement & API Key
      const schoolSettings = await dbService.get('settings', 'school');
      const isEnabled = schoolSettings?.aiApiKeyEnabled ?? true; // Default to true for backward compatibility
      const customApiKey = schoolSettings?.aiApiKey;

      if (!isEnabled) {
        throw new Error('AI Services are currently disabled in School Settings.');
      }

      const apiKeyToUse = customApiKey || import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKeyToUse) {
        throw new Error('AI API Key is not configured.');
      }

      // Re-initialize if custom key is provided
      let aiInstance: GoogleGenAI;
      if (customApiKey) {
        aiInstance = new GoogleGenAI({ apiKey: customApiKey });
      } else {
        if (!ai) ai = new GoogleGenAI({ apiKey: apiKeyToUse });
        aiInstance = ai;
      }

      // 1. Initial Call
      const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          ...history.map(h => ({ role: h.role, parts: h.parts })),
          { role: 'user', parts: [{ text: message }] }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: tools,
        },
      } as any);

      let finalContent = response;

      // 2. Handle Function Calls
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const toolResponses: any[] = [];

        for (const call of functionCalls) {
          const { name, args, id } = call;
          let toolResult: any;

          if (name === "listCollection") {
            const { collectionName, filters = [], limit = 20 } = args as any;
            const constraints = filters.map((f: any) => where(f.field, f.operator || '==', f.value));
            const data = await dbService.list(collectionName, constraints);
            toolResult = data?.slice(0, limit) || [];
          } else if (name === "getDocument") {
            const { collectionName, documentId } = args as any;
            toolResult = await dbService.get(collectionName, documentId);
          }

          toolResponses.push({
            functionResponse: {
              name,
              response: { content: toolResult },
              id
            }
          });
        }

        // 3. Final call with tool results
        const modelTurn = response.candidates?.[0]?.content;
        if (modelTurn) {
          finalContent = await aiInstance.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              ...history.map(h => ({ role: h.role, parts: h.parts })),
              { role: 'user', parts: [{ text: message }] },
              modelTurn,
              { role: 'user', parts: toolResponses }
            ],
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              tools: tools,
            },
          } as any);
        }
      }

      // 4. Update Simulated Spending (Demo purposes)
      // Estimated: ₹0.05 per request for Flash small context
      const currentSpending = schoolSettings?.aiSpending || 0;
      await dbService.update('settings', 'school', { 
        aiSpending: currentSpending + 0.05 
      });

      return finalContent.text || "";
    } catch (error) {
      console.error('Gemini Chat Error:', error);
      throw error;
    }
  }
};
