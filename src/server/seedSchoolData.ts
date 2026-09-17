import { Db } from 'mongodb';

export const INITIAL_CLASSES = [
  { id: 'cls_nur', name: 'Nursery', code: 'NUR', description: 'Pre-Primary Nursery', subjectIds: ['subj_eng', 'subj_rhymes'] },
  { id: 'cls_lkg', name: 'LKG', code: 'LKG', description: 'Lower Kindergarten', subjectIds: ['subj_eng', 'subj_math', 'subj_rhymes'] },
  { id: 'cls_ukg', name: 'UKG', code: 'UKG', description: 'Upper Kindergarten', subjectIds: ['subj_eng', 'subj_math', 'subj_evs'] },
  { id: 'cls_1', name: 'Class 1', code: 'I', description: 'Primary Class 1', subjectIds: ['subj_tel', 'subj_eng', 'subj_math', 'subj_evs'] },
  { id: 'cls_2', name: 'Class 2', code: 'II', description: 'Primary Class 2', subjectIds: ['subj_tel', 'subj_eng', 'subj_math', 'subj_evs'] },
  { id: 'cls_3', name: 'Class 3', code: 'III', description: 'Primary Class 3', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] },
  { id: 'cls_4', name: 'Class 4', code: 'IV', description: 'Primary Class 4', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] },
  { id: 'cls_5', name: 'Class 5', code: 'V', description: 'Primary Class 5', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] },
  { id: 'cls_6', name: 'Class 6', code: 'VI', description: 'High School Class 6', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] },
  { id: 'cls_7', name: 'Class 7', code: 'VII', description: 'High School Class 7', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] },
  { id: 'cls_8', name: 'Class 8', code: 'VIII', description: 'High School Class 8', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] },
  { id: 'cls_9', name: 'Class 9', code: 'IX', description: 'High School Class 9', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] },
  { id: 'cls_10', name: 'Class 10', code: 'X', description: 'SSC Board Class 10', subjectIds: ['subj_tel', 'subj_hin', 'subj_eng', 'subj_math', 'subj_sci', 'subj_soc'] }
];

export const INITIAL_BATCHES = [
  // Class 10 Batches
  { id: '10 Class_IPL', classId: '10_Class_Class', className: '10 Class', name: 'Section IPL', section: 'IPL', code: '10-IPL', classTeacherName: 'Hari Babu', classTeacherEmail: 'stantony10ipl@gmail.com', aliases: ['batch_10_ipl', '10 Class_IPL', 'IPL', 'Section IPL'] },
  { id: '10 Class_M-Batch', classId: '10_Class_Class', className: '10 Class', name: 'Section M', section: 'M-Batch', code: '10-M', classTeacherName: 'Ramana Murthy', classTeacherEmail: 'stantonys10m@gmail.com', aliases: ['batch_10_m', '10 Class_M-Batch', 'M-Batch', 'Section M'] },
  { id: '10 Class_S-Batch', classId: '10_Class_Class', className: '10 Class', name: 'Section S', section: 'S-Batch', code: '10-S', classTeacherName: 'Nayab Rasool', classTeacherEmail: 'stantonys10ths@gmail.com', aliases: ['batch_10_s', '10 Class_S-Batch', 'S-Batch', 'Section S'] },
  
  // Class 9 Batches
  { id: '9 Class_IPL', classId: '9_Class_Class', className: '9 Class', name: 'Section IPL', section: 'IPL', code: '9-IPL', classTeacherName: 'Chinna Obanna.G', classTeacherEmail: 'chinnaobanna426@gmail.com', aliases: ['batch_9_ipl', '9 Class_IPL', 'IPL', 'Section IPL'] },
  { id: '9 Class_M-Batch', classId: '9_Class_Class', className: '9 Class', name: 'Section M', section: 'M-Batch', code: '9-M', classTeacherName: 'Chinnaiah.M', classTeacherEmail: 'mundlapatichinnaiah5@gmail.com', aliases: ['batch_9_m', '9 Class_M-Batch', 'M-Batch', 'Section M'] },
  { id: '9 Class_S-Batch', classId: '9_Class_Class', className: '9 Class', name: 'Section S', section: 'S-Batch', code: '9-S', classTeacherName: 'Bala Guravaiah.U', classTeacherEmail: 'stantonysc9s@gmail.com', aliases: ['batch_9_s', '9 Class_S-Batch', 'S-Batch', 'Section S'] },

  // Class 8 Batches
  { id: '8 Class_IPL', classId: '8_Class_Class', className: '8 Class', name: 'Section IPL', section: 'IPL', code: '8-IPL', classTeacherName: 'Kavitha M', classTeacherEmail: 'stantonys8a@gmail.com', aliases: ['batch_8_a', '8 Class_IPL', 'IPL', 'Section IPL'] },
  { id: '8 Class_M-Batch', classId: '8_Class_Class', className: '8 Class', name: 'Section M', section: 'M-Batch', code: '8-M', classTeacherName: 'Vinod Kumar. M', classTeacherEmail: 'stantonys8m@gmail.com', aliases: ['batch_8_b', '8 Class_M-Batch', 'M-Batch', 'Section M'] },
  { id: '8 Class_S-Batch', classId: '8_Class_Class', className: '8 Class', name: 'Section S', section: 'S-Batch', code: '8-S', classTeacherName: 'Praveen Kumar. P', classTeacherEmail: 'stantonys8s@gmail.com', aliases: ['8 Class_S-Batch', 'S-Batch', 'Section S'] },

  // Class 7 Batches
  { id: '7 Class_IPL', classId: '7_Class_Class', className: '7 Class', name: 'Section IPL', section: 'IPL', code: '7-IPL', classTeacherName: 'Prasanna T', classTeacherEmail: 'stantonys7a@gmail.com', aliases: ['batch_7_a', '7 Class_IPL', 'IPL', 'Section IPL'] },
  { id: '7 Class_M-Batch', classId: '7_Class_Class', className: '7 Class', name: 'Section M', section: 'M-Batch', code: '7-M', classTeacherName: 'Sravani.Ch', classTeacherEmail: 'sravanicherukuri77@gmail.com', aliases: ['7 Class_M-Batch', 'M-Batch', 'Section M'] },
  { id: '7 Class_S-Batch', classId: '7_Class_Class', className: '7 Class', name: 'Section S', section: 'S-Batch', code: '7-S', classTeacherName: 'Vasantha.M', classTeacherEmail: 'mummadivasantha123@gmail.com', aliases: ['7 Class_S-Batch', 'S-Batch', 'Section S'] },

  // Class 6 Batches
  { id: '6 Class_IPL', classId: '6_Class_Class', className: '6 Class', name: 'Section IPL', section: 'IPL', code: '6-IPL', classTeacherName: 'Suresh B', classTeacherEmail: 'stantonys6a@gmail.com', aliases: ['batch_6_a', '6 Class_IPL', 'IPL', 'Section IPL'] },
  { id: '6 Class_M-Batch', classId: '6_Class_Class', className: '6 Class', name: 'Section M', section: 'M-Batch', code: '6-M', classTeacherName: 'Gopi Krishna.K', classTeacherEmail: 'stantonys6m@gmail.com', aliases: ['6 Class_M-Batch', 'M-Batch', 'Section M'] },
  { id: '6 Class_S-Batch', classId: '6_Class_Class', className: '6 Class', name: 'Section S', section: 'S-Batch', code: '6-S', classTeacherName: 'Sreekanth.K', classTeacherEmail: 'sreekanthkakarla24@gmail.com', aliases: ['6 Class_S-Batch', 'S-Batch', 'Section S'] },

  // Class 5 Batches
  { id: '5 Class_A-Section', classId: '5_Class_Class', className: '5 Class', name: 'Section A', section: 'A-Section', code: '5-A', classTeacherName: 'Bhavani K', classTeacherEmail: 'stantonys5a@gmail.com', aliases: ['batch_5_a', '5 Class_A-Section', 'Section A'] },
  { id: '5 Class_B-Section', classId: '5_Class_Class', className: '5 Class', name: 'Section B', section: 'B-Section', code: '5-B', classTeacherName: 'Bhagya Lakshmi.B', classTeacherEmail: 'bhagyalakshmibatla@gmail.com', aliases: ['5 Class_B-Section', 'Section B'] },
  { id: '5 Class_C-Section', classId: '5_Class_Class', className: '5 Class', name: 'Section C', section: 'C-Section', code: '5-C', classTeacherName: 'Giri Babu.B', classTeacherEmail: 'badiginchagiribabu123@gmail.com', aliases: ['5 Class_C-Section', 'Section C'] },
  { id: '5 Class_M-Batch', classId: '5_Class_Class', className: '5 Class', name: 'Section M', section: 'M-Batch', code: '5-M', classTeacherName: 'Priya.S', classTeacherEmail: 'stantonys5m@gmail.com', aliases: ['5 Class_M-Batch', 'M-Batch', 'Section M'] },

  // Class 4 Batches
  { id: '4 Class_A-Section', classId: '4_Class_Class', className: '4 Class', name: 'Section A', section: 'A-Section', code: '4-A', classTeacherName: 'Radha P', classTeacherEmail: 'stantonys4a@gmail.com', aliases: ['batch_4_a', '4 Class_A-Section', 'Section A'] },
  { id: '4 Class_B-Section', classId: '4_Class_Class', className: '4 Class', name: 'Section B', section: 'B-Section', code: '4-B', classTeacherName: 'Sireesha.K', classTeacherEmail: 'stantonys4b@gmail.com', aliases: ['4 Class_B-Section', 'Section B'] },
  { id: '4 Class_C-Section', classId: '4_Class_Class', className: '4 Class', name: 'Section C', section: 'C-Section', code: '4-C', classTeacherName: 'Kalyani.G', classTeacherEmail: 'stantonys4c@gmail.com', aliases: ['4 Class_C-Section', 'Section C'] },
  { id: '4 Class_M-Batch', classId: '4_Class_Class', className: '4 Class', name: 'Section M', section: 'M-Batch', code: '4-M', classTeacherName: 'Sailaja.V', classTeacherEmail: 'stantonys4m@gmail.com', aliases: ['4 Class_M-Batch', 'M-Batch', 'Section M'] },

  // Class 3 Batches
  { id: '3 Class_A-Section', classId: '3_Class_Class', className: '3 Class', name: 'Section A', section: 'A-Section', code: '3-A', classTeacherName: 'Sita M', classTeacherEmail: 'stantonys3a@gmail.com', aliases: ['batch_3_a', '3 Class_A-Section', 'Section A'] },
  { id: '3 Class_B-Section', classId: '3_Class_Class', className: '3 Class', name: 'Section B', section: 'B-Section', code: '3-B', classTeacherName: 'Sunitha.P', classTeacherEmail: 'stantonys3b@gmail.com', aliases: ['3 Class_B-Section', 'Section B'] },
  { id: '3 Class_C-Section', classId: '3_Class_Class', className: '3 Class', name: 'Section C', section: 'C-Section', code: '3-C', classTeacherName: 'Anuradha.K', classTeacherEmail: 'stantonys3c@gmail.com', aliases: ['3 Class_C-Section', 'Section C'] },
  { id: '3 Class_M-Batch', classId: '3_Class_Class', className: '3 Class', name: 'Section M', section: 'M-Batch', code: '3-M', classTeacherName: 'Venkata Rao.T', classTeacherEmail: 'stantonys3m@gmail.com', aliases: ['3 Class_M-Batch', 'M-Batch', 'Section M'] },

  // Class 2 Batches
  { id: '2 Class_A-Section', classId: '2_Class_Class', className: '2 Class', name: 'Section A', section: 'A-Section', code: '2-A', classTeacherName: 'Geetha R', classTeacherEmail: 'stantonys2a@gmail.com', aliases: ['batch_2_a', '2 Class_A-Section', 'Section A'] },
  { id: '2 Class_B-Section', classId: '2_Class_Class', className: '2 Class', name: 'Section B', section: 'B-Section', code: '2-B', classTeacherName: 'Sujatha.M', classTeacherEmail: 'stantonys2b@gmail.com', aliases: ['2 Class_B-Section', 'Section B'] },
  { id: '2 Class_M-Batch', classId: '2_Class_Class', className: '2 Class', name: 'Section M', section: 'M-Batch', code: '2-M', classTeacherName: 'Bhavani.D', classTeacherEmail: 'stantonys2m@gmail.com', aliases: ['2 Class_M-Batch', 'M-Batch', 'Section M'] },

  // Class 1 Batches
  { id: '1 Class_A-Section', classId: '1_Class_Class', className: '1 Class', name: 'Section A', section: 'A-Section', code: '1-A', classTeacherName: 'Madhavi L', classTeacherEmail: 'stantonys1a@gmail.com', aliases: ['batch_1_a', '1 Class_A-Section', 'Section A'] },
  { id: '1 Class_B-Section', classId: '1_Class_Class', className: '1 Class', name: 'Section B', section: 'B-Section', code: '1-B', classTeacherName: 'Jhansi.T', classTeacherEmail: 'stantonys1b@gmail.com', aliases: ['1 Class_B-Section', 'Section B'] },
  { id: '1 Class_M-Batch', classId: '1_Class_Class', className: '1 Class', name: 'Section M', section: 'M-Batch', code: '1-M', classTeacherName: 'Padmavathi.A', classTeacherEmail: 'stantonys1m@gmail.com', aliases: ['1 Class_M-Batch', 'M-Batch', 'Section M'] },

  // UKG
  { id: 'UKG_SectionA', classId: 'UKG_Class', className: 'UKG', name: 'Section A', section: 'A', code: 'UKG-A', classTeacherName: 'Mary Grace', classTeacherEmail: 'stantonysukg@gmail.com', aliases: ['batch_ukg', 'UKG_SectionA', 'Section A'] },
  { id: 'UKG_SectionB', classId: 'UKG_Class', className: 'UKG', name: 'Section B', section: 'B', code: 'UKG-B', classTeacherName: 'Buela.D', classTeacherEmail: 'beulahdasari1012@gmail.com', aliases: ['UKG_SectionB', 'Section B'] },
  { id: 'UKG_SectionC', classId: 'UKG_Class', className: 'UKG', name: 'Section C', section: 'C', code: 'UKG-C', classTeacherName: 'Bhagya Lakshmi.K', classTeacherEmail: 'mksuribhagya@gmail.com', aliases: ['UKG_SectionC', 'Section C'] },

  // LKG
  { id: 'LKG_SectionA', classId: 'LKG_Class', className: 'LKG', name: 'Section A', section: 'A', code: 'LKG-A', classTeacherName: 'Esther Rani', classTeacherEmail: 'stantonyslkg@gmail.com', aliases: ['batch_lkg', 'LKG_SectionA', 'Section A'] },
  { id: 'LKG_SectionB', classId: 'LKG_Class', className: 'LKG', name: 'Section B', section: 'B', code: 'LKG-B', classTeacherName: 'Esther Rani', classTeacherEmail: 'stantonyslkg@gmail.com', aliases: ['LKG_SectionB', 'Section B'] },
  { id: 'LKG_SectionC', classId: 'LKG_Class', className: 'LKG', name: 'Section C', section: 'C', code: 'LKG-C', classTeacherName: 'Mounika.K', classTeacherEmail: 'mounikakothakota52@gmail.com', aliases: ['LKG_SectionC', 'Section C'] },

  // Nursery
  { id: 'Nursery_SectionA', classId: 'Nursery_Class', className: 'Nursery', name: 'Section A', section: 'A', code: 'NUR-A', classTeacherName: 'Kavitha.J', classTeacherEmail: 'bukkakavitha0210@gmail.com', aliases: ['batch_nur', 'Nursery_SectionA', 'Section A'] },
  { id: 'Nursery_SectionB', classId: 'Nursery_Class', className: 'Nursery', name: 'Section B', section: 'B', code: 'NUR-B', classTeacherName: 'Fareeda.Sk', classTeacherEmail: 'shaikfarida96@gmail.com', aliases: ['Nursery_SectionB', 'Section B'] }
];

export const OFFICIAL_HOLIDAYS_2026_27 = [
  { id: 'hol_republic_day_2026', title: 'Republic Day', name: 'Republic Day', date: '2026-01-26', toDate: '2026-01-26', type: 'holiday', description: 'National Festival - 77th Republic Day of India Celebration' },
  { id: 'hol_maha_shivaratri_2026', title: 'Maha Shivaratri', name: 'Maha Shivaratri', date: '2026-02-15', toDate: '2026-02-15', type: 'holiday', description: 'Auspicious Hindu Religious Festival Holiday' },
  { id: 'hol_holi_2026', title: 'Holi', name: 'Holi', date: '2026-03-04', toDate: '2026-03-04', type: 'holiday', description: 'Festival of Colors Celebration' },
  { id: 'hol_ugadi_2026', title: 'Ugadi (Telugu New Year)', name: 'Ugadi (Telugu New Year)', date: '2026-03-20', toDate: '2026-03-20', type: 'holiday', description: 'Andhra Pradesh Telugu New Year Festival' },
  { id: 'hol_sri_rama_navami_2026', title: 'Sri Rama Navami', name: 'Sri Rama Navami', date: '2026-03-28', toDate: '2026-03-28', type: 'holiday', description: 'Celebration of the birth of Lord Rama' },
  { id: 'hol_good_friday_2026', title: 'Good Friday', name: 'Good Friday', date: '2026-04-03', toDate: '2026-04-03', type: 'holiday', description: 'Holy Friday Observance' },
  { id: 'hol_ambedkar_jayanti_2026', title: 'Dr. B.R. Ambedkar Jayanti', name: 'Dr. B.R. Ambedkar Jayanti', date: '2026-04-14', toDate: '2026-04-14', type: 'holiday', description: 'Commemoration of Bharat Ratna Dr. B.R. Ambedkar' },
  { id: 'hol_summer_vacation_2026', title: 'Summer Vacation', name: 'Summer Vacation', date: '2026-04-24', toDate: '2026-06-11', type: 'holiday', description: 'Annual Summer Holidays for students and staff' },
  { id: 'hol_bakrid_2026', title: 'Bakrid (Eid-ul-Adha)', name: 'Bakrid (Eid-ul-Adha)', date: '2026-05-27', toDate: '2026-05-27', type: 'holiday', description: 'Islamic Holy Feast of Sacrifice' },
  { id: 'hol_muharram_2026', title: 'Muharram', name: 'Muharram', date: '2026-06-26', toDate: '2026-06-26', type: 'holiday', description: 'First month of the Islamic Calendar observance' },
  { id: 'hol_independence_day_2026', title: 'Independence Day', name: 'Independence Day', date: '2026-08-15', toDate: '2026-08-15', type: 'holiday', description: 'National Independence Day Flag Hoisting & Celebrations' },
  { id: 'hol_krishna_janmashtami_2026', title: 'Sri Krishna Janmashtami', name: 'Sri Krishna Janmashtami', date: '2026-09-04', toDate: '2026-09-04', type: 'holiday', description: 'Gokulashtami / Sri Krishna Jayanthi Celebrations' },
  { id: 'hol_vinayaka_chavithi_2026', title: 'Vinayaka Chavithi', name: 'Vinayaka Chavithi', date: '2026-09-14', toDate: '2026-09-15', type: 'holiday', description: 'Ganesh Chaturthi Festivities' },
  { id: 'hol_milad_un_nabi_2026', title: 'Milad-un-Nabi', name: 'Milad-un-Nabi', date: '2026-09-25', toDate: '2026-09-25', type: 'holiday', description: 'Prophet Muhammad Birthday Observance' },
  { id: 'hol_gandhi_jayanti_2026', title: 'Mahatma Gandhi Jayanti', name: 'Mahatma Gandhi Jayanti', date: '2026-10-02', toDate: '2026-10-02', type: 'holiday', description: 'Father of the Nation Birthday Commemoration' },
  { id: 'hol_dasara_vacation_2026', title: 'Dasara (Dussehra) Vacation', name: 'Dasara (Dussehra) Vacation', date: '2026-10-14', toDate: '2026-10-24', type: 'holiday', description: 'Vijayadashami / Navaratri School Vacation' },
  { id: 'hol_deepavali_2026', title: 'Deepavali (Diwali)', name: 'Deepavali (Diwali)', date: '2026-11-08', toDate: '2026-11-09', type: 'holiday', description: 'Festival of Lights Celebrations' },
  { id: 'hol_christmas_vacation_2026', title: 'Christmas Vacation', name: 'Christmas Vacation', date: '2026-12-23', toDate: '2026-12-26', type: 'holiday', description: 'Holy Christmas Festivities & Winter Break' },
  { id: 'hol_sankranti_vacation_2027', title: 'Sankranti Holidays', name: 'Sankranti Holidays', date: '2027-01-11', toDate: '2027-01-17', type: 'holiday', description: 'Makara Sankranti / Pongal Harvest Festival Holidays' },
  { id: 'hol_republic_day_2027', title: 'Republic Day 2027', name: 'Republic Day 2027', date: '2027-01-26', toDate: '2027-01-26', type: 'holiday', description: 'National Republic Day Celebration' }
];

export const INITIAL_SUBJECTS = [
  { id: 'subj_tel', name: 'Telugu', code: 'TEL', type: 'theory' },
  { id: 'subj_hin', name: 'Hindi', code: 'HIN', type: 'theory' },
  { id: 'subj_eng', name: 'English', code: 'ENG', type: 'theory' },
  { id: 'subj_math', name: 'Mathematics', code: 'MATH', type: 'both' },
  { id: 'subj_sci', name: 'General Science', code: 'SCI', type: 'both' },
  { id: 'subj_soc', name: 'Social Studies', code: 'SOC', type: 'theory' },
  { id: 'subj_comp', name: 'Computer Science', code: 'COMP', type: 'both' },
  { id: 'subj_evs', name: 'Environmental Studies', code: 'EVS', type: 'theory' },
  { id: 'subj_rhymes', name: 'Rhymes & Activities', code: 'RHY', type: 'practical' }
];

// Empty by default - no hardcoded mock or sample student fixtures
export const INITIAL_STUDENTS: any[] = [];
// Empty by default - no hardcoded mock or sample staff fixtures
export const INITIAL_STAFF: any[] = [];

export const INITIAL_SETTINGS = {
  id: 'general',
  schoolName: "St. Antony's EM High School",
  affiliationNumber: 'AP-1954-STA',
  schoolCode: 'STA-523316',
  currentAcademicYear: '2026-27',
  academicYears: ['2026-27', '2025-26', '2024-25'],
  terms: ['Term 1', 'Term 2', 'Term 3'],
  currentTerm: 'Term 1',
  phone: '8822269999',
  email: 'antonyschool14@gmail.com',
  address: "St. Antony's High School, Main Campus, Markapur, Andhra Pradesh",
  website: 'https://stantonyschool.edu.in',
  currency: 'INR',
  currencySymbol: '₹',
  updatedAt: new Date().toISOString()
};

/**
 * Initializes schema and school configuration in MongoDB if empty.
 * Strictly operates only when MongoDB is connected.
 */
export async function seedSchoolDataIfEmpty(mongoDb?: Db | null): Promise<{ seeded: boolean; counts: Record<string, number> }> {
  if (!mongoDb) {
    return { seeded: false, counts: {} };
  }

  const collectionsData: Record<string, any[]> = {
    classes: INITIAL_CLASSES,
    batches: INITIAL_BATCHES,
    subjects: INITIAL_SUBJECTS,
    holidays: OFFICIAL_HOLIDAYS_2026_27,
    students: INITIAL_STUDENTS,
    staff: INITIAL_STAFF,
    settings: [
      { ...INITIAL_SETTINGS, id: 'school', uid: 'school' },
      INITIAL_SETTINGS
    ]
  };

  const counts: Record<string, number> = {};
  let seededAny = false;

  for (const [colName, defaultItems] of Object.entries(collectionsData)) {
    try {
      const col = mongoDb.collection(colName);
      const count = await col.countDocuments();
      counts[colName] = count;

      if (count === 0 && defaultItems.length > 0) {
        const cleaned = defaultItems.map(item => {
          const { _id, ...rest } = item;
          return {
            id: rest.id || rest.uid,
            uid: rest.uid || rest.id,
            ...rest
          };
        });
        if (cleaned.length > 0) {
          await col.insertMany(cleaned, { ordered: false });
          counts[colName] = cleaned.length;
          seededAny = true;
        }
      }
    } catch (mErr) {
      console.warn(`[SeedData] MongoDB seed notice for ${colName}:`, mErr);
    }
  }

  // Ensure default administrator account is registered in MongoDB
  try {
    const uCol = mongoDb.collection('users');
    await uCol.updateOne(
      { email: 'manamunagaraju@gmail.com' },
      { 
        $set: { 
          name: 'Nagaraju Manamu', 
          role: 'admin', 
          status: 'active', 
          id: 'aI2aVI9eclRb0SodNvKGbyJhkR12', 
          uid: 'aI2aVI9eclRb0SodNvKGbyJhkR12' 
        } 
      },
      { upsert: true }
    );
  } catch (uErr) {
    console.warn('[SeedData] users admin ensure notice:', uErr);
  }

  return { seeded: seededAny, counts };
}
