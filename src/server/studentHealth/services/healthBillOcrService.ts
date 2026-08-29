import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from "@google/genai";
import { HealthBillOcrResult } from "../../../modules/studentHealth/types/index.js";

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for OCR processing. Please set it in Settings > Secrets.');
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.pdf': return 'application/pdf';
    case '.gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}

export async function processBillImage(filePath: string): Promise<HealthBillOcrResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found at path: ${filePath}`);
  }

  const mimeType = getMimeType(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString("base64");

  const prompt = `Analyze this medical receipt/hospital bill.
Extract all details from the bill, including the student/patient name, class/batch, patient's address, hospital details, date of bill, doctor's name, treatments, medicines (with quantity and prices), and amount breakdowns such as doctor fees, medicine amounts, lab fees, other charges, and the absolute total amount.
Note that the ADDRESS field on the bill can often contain the student's class and batch/section tags (e.g. "9th A" or "10th B"), so you MUST extract the full address string into the patientAddress key.
If a field is missing, please leave it empty.
Provide structured data conforming precisely to the strict JSON schema. Ensure your output is purely JSON.`;

  try {
    const response = await getAiClient().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        },
        prompt
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: { type: Type.STRING },
            className: { type: Type.STRING },
            batchName: { type: Type.STRING },
            patientAddress: { type: Type.STRING },
            admissionNumber: { type: Type.STRING },
            hospitalName: { type: Type.STRING },
            billNumber: { type: Type.STRING },
            billDate: { type: Type.STRING },
            doctorName: { type: Type.STRING },
            treatmentDescription: { type: Type.STRING },
            doctorFee: { type: Type.NUMBER },
            labFee: { type: Type.NUMBER },
            medicineAmount: { type: Type.NUMBER },
            otherCharges: { type: Type.NUMBER },
            totalAmount: { type: Type.NUMBER },
            medicines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.STRING },
                  amount: { type: Type.NUMBER }
                },
                required: ["name"]
              }
            }
          },
          required: ["treatmentDescription", "totalAmount"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text returned from Gemini API");
    }

    const data = JSON.parse(text);

    return {
      studentName: data.studentName || undefined,
      className: data.className || undefined,
      batchName: data.batchName || undefined,
      patientAddress: data.patientAddress || undefined,
      admissionNumber: data.admissionNumber || undefined,
      hospitalName: data.hospitalName || undefined,
      billNumber: data.billNumber || undefined,
      billDate: data.billDate || undefined,
      doctorName: data.doctorName || undefined,
      treatmentDescription: data.treatmentDescription || "Medical Treatment",
      medicines: data.medicines || [],
      doctorFee: data.doctorFee || 0,
      labFee: data.labFee || 0,
      medicineAmount: data.medicineAmount || 0,
      otherCharges: data.otherCharges || 0,
      totalAmount: data.totalAmount || 0,
      confidence: 0.9, // Estimated high-quality extraction from gemini-2.5-flash
      rawText: text,
      warnings: []
    };
  } catch (error) {
    console.error("[healthBillOcrService] Error processing image:", error);
    throw new Error(`OCR Processing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
