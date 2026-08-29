export interface AppPermission {
  id: string;
  label: string; // Changed from name to label per request
  category: string; // Made dynamic string
  description: string;
}

export interface CustomRole {
  id?: string;
  name: string;
  description: string;
  permissions: string[]; // List of permission IDs
  isAdmin?: boolean;
  isSystem?: boolean; // System roles cannot be deleted
  isDeleted?: boolean; // Soft deletion support
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'principal' | 'vice_principal' | 'teacher' | 'student' | 'accountant' | 'clerk' | 'parent' | 'driver' | 'attendant' | 'helper' | 'aya' | 'coordinator' | 'receptionist' | 'warden' | 'hostel_warden' | 'staff' | 'front_office' | string;

export interface TransportStop {
  id: string;
  busId: string;
  villageName: string;
  fee: number;
  latitude: number;
  longitude: number;
  order: number;
}

export interface SchoolBus {
  id: string;
  busNumber: string;
  driverName: string;
  driverPhone: string;
  driverId?: string; // UID of the driver user
  helperName?: string;
  helperPhone?: string;
  helperId?: string; // UID of the helper user
  status: 'active' | 'maintenance' | 'on-road';
  currentLat?: number;
  currentLng?: number;
  lastUpdate?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  name: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  photoURL?: string;
  photoUrl?: string;
  facePhotoURL?: string;
  facePhotoUrl?: string;
  photoManuallyUploaded?: boolean;
  whatsappNumber?: string;
  status?: 'active' | 'inactive';
  dropDate?: string;
  transportStatus?: 'active' | 'inactive';
  transportDropDate?: string;
  createdAt: string;
  transportBusId?: string;
  transportStopId?: string;
  caste?: string;
  religion?: string;
  hostelName?: string;
  busRoute?: string;
  penNumber?: string;
  admissionNumber?: string;
  customId?: string;
  staffId?: string;
  subCaste?: string;
  // Staff specific fields
  staffType?: 'teaching' | 'non-teaching';
  designation?: string;
  department?: string;
  dateOfJoining?: string;
  gender?: 'male' | 'female' | 'other' | string;
  bloodGroup?: string;
  aadharNumber?: string;
  bankDetails?: {
    accountNumber: string;
    bankName: string;
    ifscCode: string;
  };
  address?: string;
  emergencyContact?: string;
  experience?: string;
  qualification?: string;
  subjects?: string[];
  teachingClasses?: string[];
  classTeacherBatchName?: string;
  phone?: string;
  classId?: string;
  batchId?: string;
  classIds?: string[];
  batchIds?: string[];
  subjectAssignments?: Array<{ classId: string; batchId: string; subjectId: string }>;
  staffBatches?: string[];
  rollNumber?: string;
  rollNo?: string;
  maxPeriodsPerDay?: number;
  siblingKey?: string | null;
  isTeacherPortal?: boolean;
  students_view_all?: boolean;
  // Additional fields used in different parts of the app
  id?: string;
  class?: string;
  section?: string;
  batch?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentName?: string;
  motherName?: string;
  village?: string;
  villageName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  studentAadharNumber?: string;
  admissionDate?: string;
  dateOfBirth?: string;
  dob?: string;
  transportType?: 'school' | 'private';
  feeType?: 'hostel' | 'day_schooler';
  feeConcessionType?: string;
  feeConcessionAmount?: number;
  lastTermConcessionType?: 'percentage' | 'fixed' | 'none';
  lastTermConcessionValue?: number;
  concession?: string;
  academicYear?: string;
  lastClassFeeDue?: number;
  oldFeeConcession?: number;
  isVirtual?: boolean;
}

export interface StudentDetails {
  uid: string;
  rollNumber: string;
  classId: string;
  batchId: string;
  gender?: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  bloodGroup?: string;
  admissionDate?: string;
  parentName: string;
  parentEmail?: string;
  contact: string;
  whatsappNumber?: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  rationCardNumber?: string;
  studentAadharNumber?: string;
  motherAadharNumber?: string;
  fatherAadharNumber?: string;
  motherBankDetails?: {
    accountNumber: string;
    bankName: string;
    ifscCode: string;
  };
  apparId?: string;
  childId?: string;
  penNumber?: string;
  admissionNumber?: string;
  caste?: string;
  subCaste?: string;
  religion?: string;
  hostelName?: string;
  busRoute?: string;
  transportType?: 'school' | 'private';
  feeType: 'hostel' | 'day_schooler';
  feeConcessionType?: string;
  feeConcessionAmount?: number;
  lastTermConcessionType?: 'percentage' | 'fixed' | 'none';
  lastTermConcessionValue?: number;
  photoURL?: string;
  status?: 'active' | 'inactive' | 'non_attending';
  dropDate?: string;
  performanceInsights?: string;
  academicYear: string;
  oldFeeConcession?: number;
}

export interface TeacherDetails {
  uid: string;
  employeeId: string;
  subjects: string[];
  qualification: string;
}

export interface AttendanceRecord {
  id?: string;
  date: string;
  studentId: string;
  status: 'present' | 'absent';
  predicted?: boolean;
}

export interface FeeStructure {
  id?: string;
  name: string;
  academicYear: string;
  type: 'school' | 'hostel' | 'transport';
  term1: number;
  term2: number;
  term3: number;
  term1DueDate?: string;
  term2DueDate?: string;
  term3DueDate?: string;
  admissionFee?: number;
  iplFee?: number;
  healthCardFee?: number;
  hostelTuitionFee?: number;
  total: number;
  createdAt: string;
}

export interface FeeRecord {
  id?: string;
  studentId: string;
  academicYear: string;
  totalAmount: number;
  paidAmount: number;
  concessionAmount?: number;
  oldFee?: number;
  oldFeeConcession?: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'partial';
  prediction?: string;
  paidComponents?: {
    term1?: number;
    term2?: number;
    term3?: number;
    hostel_term1?: number;
    hostel_term2?: number;
    hostel_term3?: number;
    transport_term1?: number;
    transport_term2?: number;
    transport_term3?: number;
    transport?: number;
    admission?: number;
    ipl?: number;
    healthCard?: number;
    other?: number;
  };
  paymentHistory?: any[];
  updatedAt?: string;
}

export interface PaymentRecord {
  id?: string;
  studentId: string;
  studentUid?: string;
  amount: number;
  date: string;
  method: 'cash' | 'online' | 'cheque' | 'razorpay' | 'razorpay_online' | 'razorpay_sandbox' | string;
  reference?: string;
  remarks?: string;
  academicYear: string;
  component: 'term1' | 'term2' | 'term3' | 'hostel_term1' | 'hostel_term2' | 'hostel_term3' | 'transport' | 'transport_term1' | 'transport_term2' | 'transport_term3' | 'admission' | 'ipl' | 'healthCard' | 'other' | string;
  paymentTime?: string;
  receiptBookId?: string;
  receiptBookName?: string;
  serialNumber?: string;
  orderId?: string;
  paymentId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  merchantName?: string;
  mid?: string;
  tid?: string;
  checkoutMode?: string;
  status?: 'success' | 'pending' | 'failed' | 'voided' | string;
  verifiedAt?: string;
  createdAt?: string;
}

export interface PaymentTransactionAudit {
  id?: string;
  orderId: string;
  paymentId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature?: string;
  merchantName: string;
  mid: string;
  tid: string;
  checkoutMode: 'embedded_collect_now' | 'collect_now_hosted' | 'sandbox_collect_now' | string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  academicYear: string;
  amount: number;
  components: Record<string, number>;
  status: 'verified_success' | 'step2_logged' | 'pending_verification' | 'failed' | 'voided';
  step2LoggedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  currency: string;
  payerContact?: string;
  payerEmail?: string;
}

export interface FeeConcession {
  id?: string;
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  appliedTo: 'school' | 'transport' | 'hostel';
  classId?: string; // Optional field for class-wide application
  description?: string;
  createdAt: string;
}

export interface Expenditure {
  id?: string;
  amount: number;
  date: string;
  category: string;
  description: string;
  paymentMethod: 'cash' | 'online' | 'cheque';
  reference?: string;
  staffId?: string; // For Staff Advances
  isDeducted?: boolean; // For tracking salary deductions
  deductionDate?: string; // Date when it was deducted
  recordedBy: string;
  createdAt: string;
}

export interface ExamRecord {
  id?: string;
  title: string;
  type: 'FA' | 'SA';
  date: string;
  classId: string;
  academicYear: string;
  subjects: string[];
  maxMarks: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'published';
}

export interface ResultRecord {
  id?: string;
  examId: string;
  studentId: string;
  subjectId: string;
  academicYear: string;
  subMarks?: {
    st1?: number | 'Absent';
    st2?: number | 'Absent';
    hw?: number | 'Absent';
    written?: number | 'Absent';
  };
  marks: number | 'Absent';
  totalMarks: number;
  percentage: number;
  grade: string;
  rank?: number;
  aiComments?: string;
  createdAt: string;
}

export interface TimetableSlot {
  id?: string;
  batchId: string;
  day: string;
  periodIndex: string; // The label or index of the slot
  subjectId: string;
  teacherId: string;
  roomId: string;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

export interface PeriodSlot {
  subjectId: string;
  teacherId: string;
  roomId?: string;
  startTime: string;
  endTime: string;
  label: string;
  isBreak?: boolean;
}

export interface TimetableDoc {
  id?: string;
  batchId: string;
  day: string;
  periods: PeriodSlot[];
}

export interface TimetableSettings {
  slots: {
    label: string;
    start: string;
    end: string;
    isBreak?: boolean;
    isFixed?: boolean; // For Lunch, Assembly, etc.
  }[];
  workingDays: string[];
}

export interface TimetableRecord {
  id?: string;
  batchId: string;
  day: string;
  periods: PeriodSlot[];
}

export interface HomeworkRecord {
  id?: string;
  class: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  aiSuggestions?: string;
}

export interface MessageRecord {
  id?: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  type: 'notification' | 'chat';
}

export interface BookRecord {
  id?: string;
  title: string;
  author: string;
  isbn: string;
  status: 'available' | 'issued';
}

export interface ReceiptBook {
  id?: string;
  name: string;
  prefix: string;
  startFrom: number;
  currentSerial: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransportRecord {
  id?: string;
  routeName: string;
  busNumber: string;
  driverName: string;
  stops: string[];
  optimization?: string;
}

export interface ClassRecord {
  id?: string;
  name: string;
  code: string;
  description?: string;
  subjectIds?: string[];
}

export interface BatchRecord {
  id?: string;
  classId: string;
  className?: string;
  name: string;
  classTeacherId?: string;
  classTeacher?: string;
  classTeacherName?: string;
  classTeacherEmail?: string;
  subjectIds?: string[];
}

export interface SubjectRecord {
  id?: string;
  name: string;
  code: string;
  type: 'theory' | 'practical' | 'both';
}

export interface LandingPageConfig {
  id?: string;
  hero: {
    title: string;
    description: string;
    bannerImage?: string;
    ctaText: string;
  };
  features: {
    id: string;
    title: string;
    description: string;
    icon?: string;
  }[];
  stats: {
    id: string;
    label: string;
    value: string;
    icon?: string;
  }[];
  about: {
    title: string;
    content: string;
    image?: string;
  };
  contact: {
    email: string;
    phone: string;
    address: string;
    mapUrl?: string;
  };
  socialLinks: {
    platform: string;
    url: string;
  }[];
  updatedAt: string;
}

export interface CertificateTemplate {
  id: string;
  type: 'TC' | 'Study' | 'Bonafide';
  name: string;
  paperSize?: 'A4' | 'A5'; // Default to A4
  content: string; // Keep for backward compatibility or simple templates
  backgroundURL?: string; 
  placeholders: string[]; 
  placeholderPositions?: Record<string, { x: number, y: number }>; // Map of placeholder names to percentage coordinates
  updatedAt: string;
}

export interface HostelBlock {
  id: string;
  name: string;
  capacity: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HostelRoom {
  id: string;
  blockId: string;
  roomNumber: string;
  capacity: number; // beds in this room
  occupiedCount: number;
  description?: string;
}

export interface IssuedCertificate {
  id: string;
  studentId: string;
  templateId: string;
  type: 'TC' | 'Study' | 'Bonafide';
  certificateNumber: string;
  issuedDate: string;
  issuedBy: string;
  academicYear: string;
  content: string; 
  placeholderPositions?: Record<string, { x: number, y: number }>; // Inherited from template
  metadata: Record<string, any>; 
}
