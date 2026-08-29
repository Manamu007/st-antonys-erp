export interface HealthMedicineItem {
  name: string;
  quantity?: string;
  amount?: number;
}

export interface StudentHealthAccount {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  className: string;
  batchName: string;
  studentType: "HOSTELER" | "DAY_SCHOLAR";
  healthCardEnabled: boolean;
  openingBalance: number;
  currentBalance: number;
  totalMedicalBills: number;
  totalDeductedFromCard: number;
  totalExtraPayable: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

export interface StudentHealthBill {
  id: string;
  schoolId: string;
  hospitalId: string;
  hospitalName: string;

  studentId: string;
  studentName: string;
  className: string;
  batchName: string;
  admissionNumber?: string;
  studentType: "HOSTELER" | "DAY_SCHOLAR";

  billNumber?: string;
  billDate: string;
  doctorName?: string;
  treatmentDescription: string;

  medicines: HealthMedicineItem[];

  doctorFee: number;
  medicineAmount: number;
  labFee: number;
  otherCharges: number;
  totalAmount: number;

  deductedFromHealthCard: number;
  extraPayableAmount: number;
  balanceBefore: number;
  balanceAfter: number;

  imageUrl?: string;
  ocrRawText?: string;
  ocrConfidence?: number;
  ocrWarnings?: string[];

  entryMode: "OCR_UPLOAD" | "MANUAL";
  status: "DRAFT" | "PENDING_ADMIN_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";

  fatherName?: string;
  phone?: string;

  createdByUserId: string;
  createdByRole: string;
  approvedByUserId?: string;
  approvedAt?: string;
  rejectedByUserId?: string;
  rejectedAt?: string;
  rejectionReason?: string;

  createdAt: string;
  updatedAt: string;
}

export interface SchoolHospital {
  id: string;
  schoolId: string;
  hospitalName: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  loginUserId?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

export interface StudentHealthLedgerEntry {
  id: string;
  schoolId: string;
  studentId: string;
  billId: string;
  hospitalId: string;
  transactionType: "BILL_APPROVAL" | "CARD_TOPUP" | "REVERSAL" | "MANUAL_ADJUSTMENT";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  extraPayableAmount: number;
  remarks?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface StudentHealthAuditLog {
  id: string;
  schoolId: string;
  hospitalId?: string;
  studentId?: string;
  billId?: string;
  userId: string;
  role: string;
  action: "HOSPITAL_BILL_UPLOADED" | "HOSPITAL_BILL_MANUALLY_CREATED" | "OCR_PROCESSED" | "STUDENT_MATCH_CONFIRMED" | "BILL_SUBMITTED_FOR_REVIEW" | "BILL_APPROVED" | "BILL_REJECTED" | "HEALTH_CARD_DEDUCTED" | "BILL_EDITED_BY_ADMIN" | "BILL_CANCELLED";
  beforeData?: any;
  afterData?: any;
  createdAt: string;
  ipAddress?: string;
}

export interface HealthBillOcrResult {
  studentName?: string;
  className?: string;
  batchName?: string;
  admissionNumber?: string;
  patientAddress?: string;
  hospitalName?: string;
  billNumber?: string;
  billDate?: string;
  doctorName?: string;
  treatmentDescription?: string;
  medicines?: HealthMedicineItem[];
  doctorFee?: number;
  labFee?: number;
  medicineAmount?: number;
  otherCharges?: number;
  totalAmount?: number;
  confidence: number;
  rawText: string;
  warnings: string[];
}

export interface StudentMatchResult {
  studentId: string;
  studentName: string;
  className: string;
  batchName: string;
  admissionNumber?: string;
  studentType: "HOSTELER" | "DAY_SCHOLAR";
  confidence: number;
  matchReasons: string[];
  fatherName?: string;
  phone?: string;
}
