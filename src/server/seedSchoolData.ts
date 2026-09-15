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
  { id: 'batch_10_ipl', classId: 'cls_10', className: 'Class 10', name: 'Section IPL', classTeacherName: 'Hari Babu', classTeacherEmail: 'stantony10ipl@gmail.com' },
  { id: 'batch_10_m', classId: 'cls_10', className: 'Class 10', name: 'Section M', classTeacherName: 'Ramana Murthy', classTeacherEmail: 'stantonys10m@gmail.com' },
  { id: 'batch_10_s', classId: 'cls_10', className: 'Class 10', name: 'Section S', classTeacherName: 'Srilatha K', classTeacherEmail: 'stantonys10s@gmail.com' },
  
  // Class 9 Batches
  { id: 'batch_9_ipl', classId: 'cls_9', className: 'Class 9', name: 'Section IPL', classTeacherName: 'Venkatesh P', classTeacherEmail: 'stantonys9ipl@gmail.com' },
  { id: 'batch_9_m', classId: 'cls_9', className: 'Class 9', name: 'Section M', classTeacherName: 'Lakshmi Devi', classTeacherEmail: 'stantonys9m@gmail.com' },
  { id: 'batch_9_s', classId: 'cls_9', className: 'Class 9', name: 'Section S', classTeacherName: 'Anand Rao', classTeacherEmail: 'stantonys9s@gmail.com' },

  // Class 8 Batches
  { id: 'batch_8_a', classId: 'cls_8', className: 'Class 8', name: 'Section A', classTeacherName: 'Kavitha M', classTeacherEmail: 'stantonys8a@gmail.com' },
  { id: 'batch_8_b', classId: 'cls_8', className: 'Class 8', name: 'Section B', classTeacherName: 'Nagesh V', classTeacherEmail: 'stantonys8b@gmail.com' },

  // Class 7 Batches
  { id: 'batch_7_a', classId: 'cls_7', className: 'Class 7', name: 'Section A', classTeacherName: 'Prasanna T', classTeacherEmail: 'stantonys7a@gmail.com' },
  
  // Class 6 Batches
  { id: 'batch_6_a', classId: 'cls_6', className: 'Class 6', name: 'Section A', classTeacherName: 'Suresh B', classTeacherEmail: 'stantonys6a@gmail.com' },

  // Primary Batches
  { id: 'batch_5_a', classId: 'cls_5', className: 'Class 5', name: 'Section A', classTeacherName: 'Bhavani K', classTeacherEmail: 'stantonys5a@gmail.com' },
  { id: 'batch_4_a', classId: 'cls_4', className: 'Class 4', name: 'Section A', classTeacherName: 'Radha P', classTeacherEmail: 'stantonys4a@gmail.com' },
  { id: 'batch_3_a', classId: 'cls_3', className: 'Class 3', name: 'Section A', classTeacherName: 'Sita M', classTeacherEmail: 'stantonys3a@gmail.com' },
  { id: 'batch_2_a', classId: 'cls_2', className: 'Class 2', name: 'Section A', classTeacherName: 'Geetha R', classTeacherEmail: 'stantonys2a@gmail.com' },
  { id: 'batch_1_a', classId: 'cls_1', className: 'Class 1', name: 'Section A', classTeacherName: 'Madhavi L', classTeacherEmail: 'stantonys1a@gmail.com' },
  
  // Pre-Primary
  { id: 'batch_ukg', classId: 'cls_ukg', className: 'UKG', name: 'Section A', classTeacherName: 'Mary Grace', classTeacherEmail: 'stantonysukg@gmail.com' },
  { id: 'batch_lkg', classId: 'cls_lkg', className: 'LKG', name: 'Section A', classTeacherName: 'Esther Rani', classTeacherEmail: 'stantonyslkg@gmail.com' },
  { id: 'batch_nur', classId: 'cls_nur', className: 'Nursery', name: 'Section A', classTeacherName: 'Anitha B', classTeacherEmail: 'stantonysnur@gmail.com' }
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
