export type Role = 
  | 'super_admin' 
  | 'admin' 
  | 'principal' 
  | 'vice_principal' 
  | 'coordinator'
  | 'teacher'
  | 'teacher_subject' 
  | 'teacher_class' 
  | 'student' 
  | 'parent' 
  | 'accountant' 
  | 'clerk' 
  | 'warden' 
  | 'receptionist'
  | 'transport_staff'
  | 'driver'
  | 'helper'
  | 'attendant'
  | 'aya'
  | 'hospital'
  | 'hospital_user'
  | 'doctor'
  | 'play_school_incharge';

export const PERMISSIONS = {
  // Global View Permissions
  VIEW_NOTICES: 'view_notices',
  VIEW_ATTENDANCE: 'view_attendance',
  VIEW_FEES: 'view_fees',
  VIEW_MARKS: 'view_marks',
  VIEW_TIMETABLE: 'view_timetable',
  VIEW_STAFF: 'view_staff',
  VIEW_STUDENTS: 'view_students',
  VIEW_HOSTEL: 'view_hostel',
  VIEW_FRONT_OFFICE: 'view_front_office',
  VIEW_LIBRARY: 'view_library',
  VIEW_CERTIFICATES: 'view_certificates',
  VIEW_TRANSPORT: 'view_transport',
  VIEW_REPORTS: 'view_reports',
  VIEW_EXAMS: 'exams_view',
  VIEW_EXAMS_ALL: 'exams_view_all',
  VIEW_LEAVES: 'leaves_view',
  VIEW_HOMEWORK: 'homework_view',
  VIEW_HOMEWORK_ALL: 'homework_view_all',

  // Students Module
  STUDENTS_VIEW: 'students_view',
  STUDENTS_VIEW_ALL: 'students_view_all',
  STUDENTS_CREATE: 'students_create',
  STUDENTS_EDIT_BASIC: 'students_edit_basic',
  STUDENTS_EDIT_ACADEMIC: 'students_edit_academic',
  STUDENTS_EDIT_PARENT: 'students_edit_parent',
  STUDENTS_MANAGE_CONCESSIONS: 'students_manage_concessions',
  STUDENTS_DELETE: 'students_delete',
  STUDENTS_PROMOTE: 'students_promote',

  // Staff Module
  STAFF_VIEW: 'staff_view',
  STAFF_VIEW_ALL: 'staff_view_all',
  STAFF_CREATE: 'staff_create',
  STAFF_EDIT: 'staff_edit',
  STAFF_DELETE: 'staff_delete',
  STAFF_MANAGE: 'staff_manage',
  STAFF_ATTENDANCE_VIEW: 'staff_attendance_view',
  STAFF_FINANCE: 'staff_finance',

  // Academics Module
  CLASSES_VIEW: 'classes_view',
  CLASSES_VIEW_ALL: 'classes_view_all',
  CLASSES_MANAGE: 'classes_manage',
  BATCHES_VIEW: 'batches_view',
  BATCHES_VIEW_ALL: 'batches_view_all',
  BATCHES_MANAGE: 'batches_manage',
  SUBJECTS_VIEW: 'subjects_view',
  SUBJECTS_VIEW_ALL: 'subjects_view_all',
  SUBJECTS_MANAGE: 'subjects_manage',
  HOLIDAYS_VIEW: 'holidays_view',
  HOLIDAYS_MANAGE: 'holidays_manage',
  TIMETABLE_MANAGE: 'timetable_manage',
  TIMETABLE_VIEW_MY: 'timetable_view_my',
  TIMETABLE_VIEW_ALL: 'timetable_view_all',

  // --- టైమ్‌టేబుల్ మైక్రో పర్మిషన్స్ (కొత్తగా జోడించినవి) ---
  TIMETABLE_EDIT_DUTY: 'timetable_edit_duty',
  TIMETABLE_IMPORT_DATA: 'timetable_import_data',
  TIMETABLE_AI_DRAFT: 'timetable_ai_draft',

  // Exams & Marks
  EXAMS_MANAGE: 'exams_manage',
  EXAMS_VIEW_MY: 'exams_view_my',
  EDIT_MARKS: 'edit_marks',
  VIEW_CLASS_MARKSHEETS: 'view_class_marksheets',
  VIEW_CENTRAL_REGISTER: 'view_central_register',

  // --- హోమ్‌వర్క్ & ఎగ్జామ్స్ మైక్రో పర్మిషన్స్ (కొత్తగా జోడించినవి) ---
  HOMEWORK_VIEW_MY: 'homework_view_my',
  EXAMS_VIEW_MY_STRICT: 'exams_view_my_strict',

  // Fees & Finance
  FEES_VIEW: 'fees_view',
  FEES_VIEW_MY: 'fees_view_my',
  FEES_COLLECT: 'fees_collect',
  FEES_MANAGE_STRUCTURE: 'fees_manage_structure',
  FEES_STRUCTURE_VIEW: 'fees_structure_view',
  FEES_CONCESSIONS: 'fees_concessions',
  FEES_CONCESSIONS_VIEW: 'fees_concessions_view',
  FEES_BALANCE_SHEET: 'fees_balance_sheet',
  FEES_BALANCE_SHEET_MANAGE: 'fees_balance_sheet_manage',
  MANAGE_PAYMENTS: 'manage_payments',
  MANAGE_EXPENDITURES: 'manage_expenditures',
  VIEW_BALANCE_SHEETS: 'view_balance_sheets',
  GRANT_CONCESSIONS: 'grant_concessions',
  EDIT_FEE_STRUCTURE: 'edit_fee_structure',
  PAYROLL_MANAGE: 'payroll_manage',
  
  // Attendance & Leaves
  ATTENDANCE_VIEW: 'attendance_view',
  ATTENDANCE_VIEW_ALL: 'attendance_view_all',
  ATTENDANCE_MANAGE: 'attendance_manage',
  ATTENDANCE_VIEW_MY: 'attendance_view_my',   // కొత్తగా జోడించినవి
  ATTENDANCE_MANAGE_MY: 'attendance_manage_my', // కొత్తగా జోడించినవి
  LEAVES_MANAGE: 'leaves_manage',
  LEAVES_VIEW_MY: 'leaves_view_my',
  STAFF_LEAVES_VIEW: 'staff_leaves_view',
  STAFF_LEAVES_VIEW_ALL: 'staff_leaves_view_all',
  STAFF_LEAVES_APPROVE: 'staff_leaves_approve',
  STUDENT_LEAVES_VIEW: 'student_leaves_view',
  STUDENT_LEAVES_APPROVE: 'student_leaves_approve',
  APPLY_LEAVE: 'apply_leave',
  APPROVE_LEAVE: 'approve_leave',

  // Portal & Student/Parent Specific
  PORTAL_STUDENT_VIEW_FEES: 'portal_student_view_fees',
  PORTAL_STUDENT_VIEW_SCHOOL_FEE: 'portal_student_view_school_fee',
  PORTAL_STUDENT_VIEW_TRANSPORT_FEE: 'portal_student_view_transport_fee',
  PORTAL_STUDENT_VIEW_HOSTEL_FEE: 'portal_student_view_hostel_fee',
  PORTAL_STUDENT_VIEW_OTHER_FEE: 'portal_student_view_other_fee',
  PORTAL_STUDENT_PAY_FEES: 'portal_student_pay_fees',
  PORTAL_STUDENT_VIEW_SUBJECTS: 'portal_student_view_subjects',
  PORTAL_STUDENT_VIEW_MARKS: 'portal_student_view_marks',
  PORTAL_STUDENT_VIEW_TIMETABLE: 'portal_student_view_timetable',
  PORTAL_STUDENT_VIEW_ATTENDANCE: 'portal_student_view_attendance',
  PORTAL_STUDENT_APPLY_LEAVE: 'portal_student_apply_leave',
  PORTAL_STUDENT_VIEW_TRANSPORT: 'portal_student_view_transport',
  PORTAL_STUDENT_VIEW_TEACHERS: 'portal_student_view_teachers',
  PORTAL_STUDENT_VIEW_HOMEWORK: 'portal_student_view_homework',
  PORTAL_STUDENT_VIEW_HOSTEL: 'portal_student_view_hostel',
  DRIVER_PORTAL_VIEW: 'driver_portal_view',

  // Specialized Modules
  MANAGE_HOSTEL: 'manage_hostel',
  HOSTEL_VIEW: 'hostel_view',
  HOSTEL_MANAGE: 'hostel_manage',
  HOSTEL_STUDENTS_MANAGE: 'hostel_students_manage',
  HOSTEL_MESS_MANAGE: 'hostel_mess_manage',
  HOSTEL_BLOCKS_MANAGE: 'hostel_blocks_manage',
  HOSTEL_OUTING_MANAGE: 'hostel_outing_manage',
  
  MANAGE_STUDENTS: 'manage_students',
  MANAGE_STAFF: 'manage_staff',
  MANAGE_FRONT_OFFICE: 'manage_front_office',
  
  MANAGE_LIBRARY: 'manage_library',
  LIBRARY_VIEW: 'library_view',
  LIBRARY_MANAGE: 'library_manage',
  
  MANAGE_CERTIFICATES: 'manage_certificates',
  CERTIFICATES_VIEW: 'certificates_view',
  CERTIFICATES_MANAGE: 'certificates_manage',
  
  MANAGE_TRANSPORT: 'manage_transport',
  TRANSPORT_VIEW: 'transport_view',
  TRANSPORT_MANAGE: 'transport_manage',

  MANAGE_HOMEWORK: 'homework_manage',

  // Settings & System
  MANAGE_ROLES: 'manage_roles',
  SETTINGS_SCHOOL: 'settings_school',
  SETTINGS_LOGS: 'settings_logs',
  
  // AI & Advanced
  USE_AI_ANALYSIS: 'use_ai_analysis',
  AI_RISK_ENGINE_VIEW: 'ai_risk_engine_view',
  AI_RISK_ENGINE_VIEW_ALL: 'ai_risk_engine_view_all',
  AI_ASSISTANT_HUB_VIEW: 'ai_assistant_hub_view',
  AI_ASSISTANT_HUB_MANAGE: 'ai_assistant_hub_manage',
  PERFORMANCE_INSIGHTS_VIEW: 'performance_insights_view',
  PERFORMANCE_INSIGHTS_VIEW_ALL: 'performance_insights_view_all',
  PERIOD_SUBSTITUTION: 'period_substitution',
  
  // Communication
  COMMUNICATION_VIEW: 'communication_view',
  WHATSAPP_SEND: 'whatsapp_send',
  WHATSAPP_BROADCAST: 'whatsapp_broadcast',
  WHATSAPP_BIRTHDAYS: 'whatsapp_birthdays',
  NOTIFICATIONS_SEND: 'notifications_send'
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS),
  
  principal: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_FEES,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_STAFF,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_HOSTEL,
    PERMISSIONS.VIEW_FRONT_OFFICE,
    PERMISSIONS.VIEW_LIBRARY,
    PERMISSIONS.VIEW_CERTIFICATES,
    PERMISSIONS.VIEW_TRANSPORT,
    PERMISSIONS.VIEW_CLASS_MARKSHEETS,
    PERMISSIONS.VIEW_CENTRAL_REGISTER,
    PERMISSIONS.VIEW_BALANCE_SHEETS,
    PERMISSIONS.APPROVE_LEAVE,
    PERMISSIONS.GRANT_CONCESSIONS,
    PERMISSIONS.USE_AI_ANALYSIS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.COMMUNICATION_VIEW,
    'students_view',
    'students_view_all',
    'staff_view',
    'staff_view_all',
    'attendance_view_all',
    'classes_view_all',
    'batches_view_all',
    'subjects_view_all',
    'ai_risk_engine_view_all',
    'performance_insights_view_all',
    'homework_view',
    'exams_view'
  ],

  vice_principal: [
    ...Object.values(PERMISSIONS).filter(p => p !== PERMISSIONS.MANAGE_ROLES)
  ],

  coordinator: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_FEES,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_STAFF,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.APPROVE_LEAVE,
    PERMISSIONS.PERIOD_SUBSTITUTION,
    PERMISSIONS.VIEW_CLASS_MARKSHEETS,
    PERMISSIONS.VIEW_CENTRAL_REGISTER,
    PERMISSIONS.COMMUNICATION_VIEW,
    PERMISSIONS.WHATSAPP_SEND,
    PERMISSIONS.WHATSAPP_BROADCAST,
    'students_view',
    'students_view_all',
    'staff_view',
    'attendance_view_all',
    'homework_view',
    'exams_view'
  ],

  // --- సాధారణ టీチャーలకు పూర్తి లాకింగ్ పర్మిషన్లు ---
  teacher: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_LIBRARY,
    PERMISSIONS.USE_AI_ANALYSIS,
    PERMISSIONS.APPLY_LEAVE,
    PERMISSIONS.EDIT_MARKS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOMEWORK,
    PERMISSIONS.PORTAL_STUDENT_VIEW_SUBJECTS,
    'students_view',
    'homework_view_my',       // కేవలం స్వంత హోమ్‌వర్క్ మాత్రమే
    'exams_view_my_strict',   // కేవలం స్వంత ఎగ్జామ్స్ మాత్రమే
    'timetable_view_my',      // కేవలం స్వంత టైమ్‌టేబుల్ మాత్రమే (View All, Edit Duty, AI Draft తొలగించబడ్డాయి)
    'attendance_view_my'      // కేవలం స్వంత క్లాస్ అటెండెన్స్
  ],

  // --- క్లాస్ టీచర్లకు పర్మిషన్లు ---
  teacher_class: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_LIBRARY,
    PERMISSIONS.USE_AI_ANALYSIS,
    PERMISSIONS.APPLY_LEAVE,
    PERMISSIONS.EDIT_MARKS,
    PERMISSIONS.VIEW_CLASS_MARKSHEETS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOMEWORK,
    PERMISSIONS.PORTAL_STUDENT_VIEW_SUBJECTS,
    'students_view',
    'homework_view_my',
    'exams_view_my_strict',
    'attendance_manage_my',   // కేవలం స్వంత క్లాస్ మేనేజ్‌మెంట్
    'timetable_view_my',
    'attendance_view_my'
  ],

  // --- సబ్జెక్ట్ టీచర్లకు పర్మిషన్లు ---
  teacher_subject: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_LIBRARY,
    PERMISSIONS.USE_AI_ANALYSIS,
    PERMISSIONS.APPLY_LEAVE,
    PERMISSIONS.EDIT_MARKS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOMEWORK,
    'students_view',
    'homework_view_my',
    'exams_view_my_strict',
    'timetable_view_my',
    'attendance_view_my'
  ],

  student: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_FEES,
    PERMISSIONS.VIEW_TRANSPORT,
    PERMISSIONS.VIEW_HOSTEL,
    PERMISSIONS.VIEW_LIBRARY,
    PERMISSIONS.VIEW_CERTIFICATES,
    PERMISSIONS.APPLY_LEAVE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_FEES,
    PERMISSIONS.PORTAL_STUDENT_VIEW_SCHOOL_FEE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TRANSPORT_FEE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOSTEL_FEE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_OTHER_FEE,
    PERMISSIONS.PORTAL_STUDENT_PAY_FEES,
    PERMISSIONS.PORTAL_STUDENT_VIEW_SUBJECTS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_MARKS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TIMETABLE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_ATTENDANCE,
    PERMISSIONS.PORTAL_STUDENT_APPLY_LEAVE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TRANSPORT,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TEACHERS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOMEWORK,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOSTEL
  ],

  parent: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_FEES,
    PERMISSIONS.VIEW_TRANSPORT,
    PERMISSIONS.VIEW_HOSTEL,
    PERMISSIONS.PORTAL_STUDENT_VIEW_FEES,
    PERMISSIONS.PORTAL_STUDENT_VIEW_SCHOOL_FEE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TRANSPORT_FEE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOSTEL_FEE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_OTHER_FEE,
    PERMISSIONS.PORTAL_STUDENT_PAY_FEES,
    PERMISSIONS.PORTAL_STUDENT_VIEW_SUBJECTS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_MARKS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TIMETABLE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_ATTENDANCE,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TRANSPORT,
    PERMISSIONS.PORTAL_STUDENT_VIEW_TEACHERS,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOMEWORK,
    PERMISSIONS.PORTAL_STUDENT_VIEW_HOSTEL,
    PERMISSIONS.PORTAL_STUDENT_APPLY_LEAVE
  ],

  accountant: [
    PERMISSIONS.VIEW_FEES,
    PERMISSIONS.MANAGE_PAYMENTS,
    PERMISSIONS.MANAGE_EXPENDITURES,
    PERMISSIONS.VIEW_BALANCE_SHEETS,
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_STAFF,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_REPORTS,
    'fees_view',
    'fees_collect',
    'fees_balance_sheet',
    'fees_manage_structure',
    'payroll_manage'
  ],

  clerk: [
    PERMISSIONS.MANAGE_STUDENTS,
    PERMISSIONS.MANAGE_STAFF,
    PERMISSIONS.MANAGE_CERTIFICATES,
    PERMISSIONS.MANAGE_LIBRARY,
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.VIEW_CENTRAL_REGISTER,
    PERMISSIONS.VIEW_HOSTEL,
    PERMISSIONS.VIEW_CERTIFICATES,
    PERMISSIONS.VIEW_LIBRARY,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_STAFF,
    PERMISSIONS.VIEW_TRANSPORT,
    PERMISSIONS.WHATSAPP_SEND,
    PERMISSIONS.WHATSAPP_BROADCAST,
    'students_view',
    'students_view_all',
    'students_create',
    'students_edit_basic',
    'staff_view',
    'staff_view_all',
    'staff_create',
    'staff_edit',
    'library_view',
    'library_manage',
    'hostel_view',
    'hostel_students_manage'
  ],

  warden: [
    PERMISSIONS.VIEW_HOSTEL,
    PERMISSIONS.MANAGE_HOSTEL,
    PERMISSIONS.VIEW_NOTICES,
    'hostel_view',
    'hostel_manage',
    'hostel_students_manage'
  ],

  receptionist: [
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_ALL,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_VIEW_MY,
    PERMISSIONS.ATTENDANCE_MANAGE_MY,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.STUDENTS_VIEW,
    PERMISSIONS.STUDENTS_VIEW_ALL,
    PERMISSIONS.VIEW_STAFF,
    PERMISSIONS.STAFF_VIEW,
    PERMISSIONS.STAFF_VIEW_ALL,
    PERMISSIONS.STAFF_ATTENDANCE_VIEW,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.EDIT_MARKS,
    PERMISSIONS.VIEW_CLASS_MARKSHEETS,
    PERMISSIONS.VIEW_CENTRAL_REGISTER,
    PERMISSIONS.VIEW_EXAMS,
    PERMISSIONS.VIEW_EXAMS_ALL,
    PERMISSIONS.CLASSES_VIEW,
    PERMISSIONS.CLASSES_VIEW_ALL,
    PERMISSIONS.BATCHES_VIEW,
    PERMISSIONS.BATCHES_VIEW_ALL,
    PERMISSIONS.VIEW_FRONT_OFFICE,
    PERMISSIONS.MANAGE_FRONT_OFFICE,
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.WHATSAPP_SEND,
    'view_attendance',
    'attendance_view',
    'attendance_view_all',
    'attendance_manage',
    'attendance_view_my',
    'attendance_manage_my',
    'view_students',
    'students_view',
    'students_view_all',
    'view_staff',
    'staff_view',
    'staff_view_all',
    'staff_attendance_view',
    'staff_manage',
    'view_marks',
    'edit_marks',
    'view_class_marksheets',
    'view_central_register',
    'exams_view',
    'exams_view_all',
    'classes_view',
    'classes_view_all',
    'batches_view',
    'batches_view_all',
    'view_front_office',
    'manage_front_office'
  ],

  transport_staff: [
    PERMISSIONS.VIEW_TRANSPORT,
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.APPLY_LEAVE,
    'transport_view'
  ],

  driver: [
    'driver_portal_view'
  ],

  helper: [
    PERMISSIONS.VIEW_TRANSPORT,
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.APPLY_LEAVE,
    'transport_view'
  ],

  attendant: [
    PERMISSIONS.VIEW_TRANSPORT,
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.APPLY_LEAVE,
    'transport_view'
  ],

  aya: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.APPLY_LEAVE
  ],

  doctor: [
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_NOTICES,
    'students_view',
    'students_view_all'
  ],

  hospital: [
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_NOTICES,
    'students_view',
    'students_view_all'
  ],

  hospital_user: [
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_NOTICES,
    'students_view',
    'students_view_all'
  ],

  play_school_incharge: [
    PERMISSIONS.VIEW_NOTICES,
    PERMISSIONS.VIEW_ATTENDANCE,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.VIEW_MARKS,
    PERMISSIONS.VIEW_EXAMS,
    PERMISSIONS.VIEW_FEES,
    PERMISSIONS.VIEW_TIMETABLE,
    PERMISSIONS.APPLY_LEAVE,
    PERMISSIONS.LEAVES_MANAGE,
    'students_view'
  ]
};