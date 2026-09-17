import fetch from 'node-fetch';

const BASE_URL = 'https://antonyschool.in/api/maintenance/db-proxy';

const BATCH_DEFINITIONS = [
  // Class 10
  {
    id: '10 Class_IPL',
    classId: '10_Class_Class',
    className: '10 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '10-IPL',
    classTeacherName: 'Hari Babu',
    classTeacherEmail: 'stantony10ipl@gmail.com',
    aliases: ['batch_10_ipl', '10 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '10 Class_M-Batch',
    classId: '10_Class_Class',
    className: '10 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '10-M',
    classTeacherName: 'Ramana Murthy',
    classTeacherEmail: 'stantonys10m@gmail.com',
    aliases: ['batch_10_m', '10 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '10 Class_S-Batch',
    classId: '10_Class_Class',
    className: '10 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '10-S',
    classTeacherName: 'Nayab Rasool',
    classTeacherEmail: 'stantonys10ths@gmail.com',
    aliases: ['batch_10_s', '10 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 9
  {
    id: '9 Class_IPL',
    classId: '9_Class_Class',
    className: '9 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '9-IPL',
    classTeacherName: 'Chinna Obanna.G',
    classTeacherEmail: 'chinnaobanna426@gmail.com',
    aliases: ['batch_9_ipl', '9 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '9 Class_M-Batch',
    classId: '9_Class_Class',
    className: '9 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '9-M',
    classTeacherName: 'Chinnaiah.M',
    classTeacherEmail: 'mundlapatichinnaiah5@gmail.com',
    aliases: ['batch_9_m', '9 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '9 Class_S-Batch',
    classId: '9_Class_Class',
    className: '9 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '9-S',
    classTeacherName: 'Bala Guravaiah.U',
    classTeacherEmail: 'stantonysc9s@gmail.com',
    aliases: ['batch_9_s', '9 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 8
  {
    id: '8 Class_IPL',
    classId: '8_Class_Class',
    className: '8 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '8-IPL',
    classTeacherName: 'Kavitha M',
    classTeacherEmail: 'stantonys8a@gmail.com',
    aliases: ['batch_8_a', '8 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '8 Class_M-Batch',
    classId: '8_Class_Class',
    className: '8 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '8-M',
    classTeacherName: 'Vinod Kumar. M',
    classTeacherEmail: 'stantonys8m@gmail.com',
    aliases: ['batch_8_b', '8 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '8 Class_S-Batch',
    classId: '8_Class_Class',
    className: '8 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '8-S',
    classTeacherName: 'Nagesh V',
    classTeacherEmail: 'stantonys8b@gmail.com',
    aliases: ['8 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 7
  {
    id: '7 Class_IPL',
    classId: '7_Class_Class',
    className: '7 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '7-IPL',
    classTeacherName: 'Divya Kumari.U.C',
    classTeacherEmail: 'divyamanamu4@gamail.com',
    aliases: ['batch_7_a', '7 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '7 Class_M-Batch',
    classId: '7_Class_Class',
    className: '7 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '7-M',
    classTeacherName: 'Rajashekar.A',
    classTeacherEmail: 'rajasekharaddala12@gmail.com',
    aliases: ['7 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '7 Class_S-Batch',
    classId: '7_Class_Class',
    className: '7 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '7-S',
    classTeacherName: 'Nageswar Reddy',
    classTeacherEmail: 'stantonys7ths@gmail.com',
    aliases: ['7 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 6
  {
    id: '6 Class_IPL',
    classId: '6_Class_Class',
    className: '6 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '6-IPL',
    classTeacherName: 'Fayaz.Sk',
    classTeacherEmail: 'stantonys6ipl@gmail.com',
    aliases: ['batch_6_a', '6 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '6 Class_M-Batch',
    classId: '6_Class_Class',
    className: '6 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '6-M',
    classTeacherName: 'Suresh B',
    classTeacherEmail: 'stantonys6a@gmail.com',
    aliases: ['6 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '6 Class_S-Batch',
    classId: '6_Class_Class',
    className: '6 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '6-S',
    classTeacherName: 'Kiran Babu.Tk',
    classTeacherEmail: 'kittumech3a3@gmail.com',
    aliases: ['6 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 5
  {
    id: '5 Class_IPL',
    classId: '5_Class_Class',
    className: '5 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '5-IPL',
    classTeacherName: 'Prabhavathi.G',
    classTeacherEmail: 'stantonys5ipl@gmail.com',
    aliases: ['batch_5_a', '5 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '5 Class_M-Batch',
    classId: '5_Class_Class',
    className: '5 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '5-M',
    classTeacherName: 'Mary Anne Nicholas',
    classTeacherEmail: 'stantonys5thm@gmail.com',
    aliases: ['5 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '5 Class_S-Batch',
    classId: '5_Class_Class',
    className: '5 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '5-S',
    classTeacherName: 'Bhavani K',
    classTeacherEmail: 'stantonys5a@gmail.com',
    aliases: ['5 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 4
  {
    id: '4 Class_IPL',
    classId: '4_Class_Class',
    className: '4 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '4-IPL',
    classTeacherName: 'Nissi.M',
    classTeacherEmail: 'stantonys4ipl@gmail.com',
    aliases: ['batch_4_a', '4 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '4 Class_M-Batch',
    classId: '4_Class_Class',
    className: '4 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '4-M',
    classTeacherName: 'Nazirunnisa.S',
    classTeacherEmail: 'stantonys4m@gmail.com',
    aliases: ['4 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '4 Class_S-Batch',
    classId: '4_Class_Class',
    className: '4 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '4-S',
    classTeacherName: 'Radha P',
    classTeacherEmail: 'stantonys4a@gmail.com',
    aliases: ['4 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 3
  {
    id: '3 Class_IPL',
    classId: '3_Class_Class',
    className: '3 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '3-IPL',
    classTeacherName: 'Sita M',
    classTeacherEmail: 'stantonys3a@gmail.com',
    aliases: ['batch_3_a', '3 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '3 Class_M-Batch',
    classId: '3_Class_Class',
    className: '3 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '3-M',
    classTeacherName: 'Sita M',
    classTeacherEmail: 'stantonys3a@gmail.com',
    aliases: ['3 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '3 Class_S-Batch',
    classId: '3_Class_Class',
    className: '3 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '3-S',
    classTeacherName: 'Sita M',
    classTeacherEmail: 'stantonys3a@gmail.com',
    aliases: ['3 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 2
  {
    id: '2 Class_IPL',
    classId: '2_Class_Class',
    className: '2 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '2-IPL',
    classTeacherName: 'Geetha R',
    classTeacherEmail: 'stantonys2a@gmail.com',
    aliases: ['batch_2_a', '2 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '2 Class_M-Batch',
    classId: '2_Class_Class',
    className: '2 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '2-M',
    classTeacherName: 'Geetha R',
    classTeacherEmail: 'stantonys2a@gmail.com',
    aliases: ['2 Class_M-Batch', 'M-Batch', 'Section M']
  },
  {
    id: '2 Class_S-Batch',
    classId: '2_Class_Class',
    className: '2 Class',
    name: 'Section S',
    section: 'S-Batch',
    code: '2-S',
    classTeacherName: 'Geetha R',
    classTeacherEmail: 'stantonys2a@gmail.com',
    aliases: ['2 Class_S-Batch', 'S-Batch', 'Section S']
  },

  // Class 1
  {
    id: '1 Class_IPL',
    classId: '1_Class_Class',
    className: '1 Class',
    name: 'Section IPL',
    section: 'IPL',
    code: '1-IPL',
    classTeacherName: 'Thriveni M',
    classTeacherEmail: 'stantonys1ipl@gmail.com',
    aliases: ['batch_1_a', '1 Class_IPL', 'IPL', 'Section IPL']
  },
  {
    id: '1 Class_M-Batch',
    classId: '1_Class_Class',
    className: '1 Class',
    name: 'Section M',
    section: 'M-Batch',
    code: '1-M',
    classTeacherName: 'Padmavathi.A',
    classTeacherEmail: 'stantonys1m@gmail.com',
    aliases: ['1 Class_M-Batch', 'M-Batch', 'Section M']
  },

  // UKG
  {
    id: 'UKG_SectionA',
    classId: 'UKG_Class',
    className: 'UKG',
    name: 'Section A',
    section: 'A',
    code: 'UKG-A',
    classTeacherName: 'Mary Grace',
    classTeacherEmail: 'stantonysukg@gmail.com',
    aliases: ['batch_ukg', 'UKG_SectionA', 'Section A']
  },
  {
    id: 'UKG_SectionB',
    classId: 'UKG_Class',
    className: 'UKG',
    name: 'Section B',
    section: 'B',
    code: 'UKG-B',
    classTeacherName: 'Buela.D',
    classTeacherEmail: 'beulahdasari1012@gmail.com',
    aliases: ['UKG_SectionB', 'Section B']
  },
  {
    id: 'UKG_SectionC',
    classId: 'UKG_Class',
    className: 'UKG',
    name: 'Section C',
    section: 'C',
    code: 'UKG-C',
    classTeacherName: 'Bhagya Lakshmi.K',
    classTeacherEmail: 'mksuribhagya@gmail.com',
    aliases: ['UKG_SectionC', 'Section C']
  },

  // LKG
  {
    id: 'LKG_SectionA',
    classId: 'LKG_Class',
    className: 'LKG',
    name: 'Section A',
    section: 'A',
    code: 'LKG-A',
    classTeacherName: 'Esther Rani',
    classTeacherEmail: 'stantonyslkg@gmail.com',
    aliases: ['batch_lkg', 'LKG_SectionA', 'Section A']
  },
  {
    id: 'LKG_SectionB',
    classId: 'LKG_Class',
    className: 'LKG',
    name: 'Section B',
    section: 'B',
    code: 'LKG-B',
    classTeacherName: 'Esther Rani',
    classTeacherEmail: 'stantonyslkg@gmail.com',
    aliases: ['LKG_SectionB', 'Section B']
  },
  {
    id: 'LKG_SectionC',
    classId: 'LKG_Class',
    className: 'LKG',
    name: 'Section C',
    section: 'C',
    code: 'LKG-C',
    classTeacherName: 'Mounika.K',
    classTeacherEmail: 'mounikakothakota52@gmail.com',
    aliases: ['LKG_SectionC', 'Section C']
  },

  // Nursery
  {
    id: 'Nursery_SectionA',
    classId: 'Nursery_Class',
    className: 'Nursery',
    name: 'Section A',
    section: 'A',
    code: 'NUR-A',
    classTeacherName: 'Kavitha.J',
    classTeacherEmail: 'bukkakavitha0210@gmail.com',
    aliases: ['batch_nur', 'Nursery_SectionA', 'Section A']
  },
  {
    id: 'Nursery_SectionB',
    classId: 'Nursery_Class',
    className: 'Nursery',
    name: 'Section B',
    section: 'B',
    code: 'NUR-B',
    classTeacherName: 'Fareeda.Sk',
    classTeacherEmail: 'shaikfarida96@gmail.com',
    aliases: ['Nursery_SectionB', 'Section B']
  }
];

export const OFFICIAL_HOLIDAYS_2026_27 = [
  {
    id: 'hol_republic_day_2026',
    title: 'Republic Day',
    name: 'Republic Day',
    date: '2026-01-26',
    toDate: '2026-01-26',
    type: 'holiday',
    description: 'National Festival - 77th Republic Day of India Celebration'
  },
  {
    id: 'hol_maha_shivaratri_2026',
    title: 'Maha Shivaratri',
    name: 'Maha Shivaratri',
    date: '2026-02-15',
    toDate: '2026-02-15',
    type: 'holiday',
    description: 'Auspicious Hindu Religious Festival Holiday'
  },
  {
    id: 'hol_holi_2026',
    title: 'Holi',
    name: 'Holi',
    date: '2026-03-04',
    toDate: '2026-03-04',
    type: 'holiday',
    description: 'Festival of Colors Celebration'
  },
  {
    id: 'hol_ugadi_2026',
    title: 'Ugadi (Telugu New Year)',
    name: 'Ugadi (Telugu New Year)',
    date: '2026-03-20',
    toDate: '2026-03-20',
    type: 'holiday',
    description: 'Andhra Pradesh Telugu New Year Festival'
  },
  {
    id: 'hol_sri_rama_navami_2026',
    title: 'Sri Rama Navami',
    name: 'Sri Rama Navami',
    date: '2026-03-28',
    toDate: '2026-03-28',
    type: 'holiday',
    description: 'Celebration of the birth of Lord Rama'
  },
  {
    id: 'hol_good_friday_2026',
    title: 'Good Friday',
    name: 'Good Friday',
    date: '2026-04-03',
    toDate: '2026-04-03',
    type: 'holiday',
    description: 'Holy Friday Observance'
  },
  {
    id: 'hol_ambedkar_jayanti_2026',
    title: 'Dr. B.R. Ambedkar Jayanti',
    name: 'Dr. B.R. Ambedkar Jayanti',
    date: '2026-04-14',
    toDate: '2026-04-14',
    type: 'holiday',
    description: 'Commemoration of Bharat Ratna Dr. B.R. Ambedkar'
  },
  {
    id: 'hol_summer_vacation_2026',
    title: 'Summer Vacation',
    name: 'Summer Vacation',
    date: '2026-04-24',
    toDate: '2026-06-11',
    type: 'holiday',
    description: 'Annual Summer Holidays for students and staff'
  },
  {
    id: 'hol_bakrid_2026',
    title: 'Bakrid (Eid-ul-Adha)',
    name: 'Bakrid (Eid-ul-Adha)',
    date: '2026-05-27',
    toDate: '2026-05-27',
    type: 'holiday',
    description: 'Islamic Holy Feast of Sacrifice'
  },
  {
    id: 'hol_muharram_2026',
    title: 'Muharram',
    name: 'Muharram',
    date: '2026-06-26',
    toDate: '2026-06-26',
    type: 'holiday',
    description: 'First month of the Islamic Calendar observance'
  },
  {
    id: 'hol_independence_day_2026',
    title: 'Independence Day',
    name: 'Independence Day',
    date: '2026-08-15',
    toDate: '2026-08-15',
    type: 'holiday',
    description: 'National Independence Day Flag Hoisting & Celebrations'
  },
  {
    id: 'hol_krishna_janmashtami_2026',
    title: 'Sri Krishna Janmashtami',
    name: 'Sri Krishna Janmashtami',
    date: '2026-09-04',
    toDate: '2026-09-04',
    type: 'holiday',
    description: 'Gokulashtami / Sri Krishna Jayanthi Celebrations'
  },
  {
    id: 'hol_vinayaka_chavithi_2026',
    title: 'Vinayaka Chavithi',
    name: 'Vinayaka Chavithi',
    date: '2026-09-14',
    toDate: '2026-09-15',
    type: 'holiday',
    description: 'Ganesh Chaturthi Festivities'
  },
  {
    id: 'hol_milad_un_nabi_2026',
    title: 'Milad-un-Nabi',
    name: 'Milad-un-Nabi',
    date: '2026-09-25',
    toDate: '2026-09-25',
    type: 'holiday',
    description: 'Prophet Muhammad Birthday Observance'
  },
  {
    id: 'hol_gandhi_jayanti_2026',
    title: 'Mahatma Gandhi Jayanti',
    name: 'Mahatma Gandhi Jayanti',
    date: '2026-10-02',
    toDate: '2026-10-02',
    type: 'holiday',
    description: 'Father of the Nation Birthday Commemoration'
  },
  {
    id: 'hol_dasara_vacation_2026',
    title: 'Dasara (Dussehra) Vacation',
    name: 'Dasara (Dussehra) Vacation',
    date: '2026-10-14',
    toDate: '2026-10-24',
    type: 'holiday',
    description: 'Vijayadashami / Navaratri School Vacation'
  },
  {
    id: 'hol_deepavali_2026',
    title: 'Deepavali (Diwali)',
    name: 'Deepavali (Diwali)',
    date: '2026-11-08',
    toDate: '2026-11-09',
    type: 'holiday',
    description: 'Festival of Lights Celebrations'
  },
  {
    id: 'hol_christmas_vacation_2026',
    title: 'Christmas Vacation',
    name: 'Christmas Vacation',
    date: '2026-12-23',
    toDate: '2026-12-26',
    type: 'holiday',
    description: 'Holy Christmas Festivities & Winter Break'
  },
  {
    id: 'hol_sankranti_vacation_2027',
    title: 'Sankranti Holidays',
    name: 'Sankranti Holidays',
    date: '2027-01-11',
    toDate: '2027-01-17',
    type: 'holiday',
    description: 'Makara Sankranti / Pongal Harvest Festival Holidays'
  },
  {
    id: 'hol_republic_day_2027',
    title: 'Republic Day 2027',
    name: 'Republic Day 2027',
    date: '2027-01-26',
    toDate: '2027-01-26',
    type: 'holiday',
    description: 'National Republic Day Celebration'
  }
];

async function run() {
  console.log('--- SYNCING BATCHES & HOLIDAYS TO MONGODB ---');

  // 1. Sync Batches
  console.log(`Setting ${BATCH_DEFINITIONS.length} batches in MongoDB...`);
  for (const b of BATCH_DEFINITIONS) {
    const payload = {
      ...b,
      id: b.id,
      uid: b.id,
      isUserModified: true,
      updatedAt: new Date().toISOString()
    };
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'set', path: 'batches', id: b.id, data: payload })
      });
      console.log(`Saved batch ${b.id}: status ${res.status}`);
    } catch (e: any) {
      console.error(`Failed to save batch ${b.id}:`, e.message);
    }
  }

  // 2. Also update legacy batch documents to point to standard classes
  const legacyBatches = [
    { id: 'batch_10_ipl', classId: '10_Class_Class', className: '10 Class', name: 'Section IPL' },
    { id: 'batch_10_m', classId: '10_Class_Class', className: '10 Class', name: 'Section M' },
    { id: 'batch_10_s', classId: '10_Class_Class', className: '10 Class', name: 'Section S' },
    { id: 'batch_9_ipl', classId: '9_Class_Class', className: '9 Class', name: 'Section IPL' },
    { id: 'batch_9_m', classId: '9_Class_Class', className: '9 Class', name: 'Section M' },
    { id: 'batch_9_s', classId: '9_Class_Class', className: '9 Class', name: 'Section S' },
    { id: 'batch_8_a', classId: '8_Class_Class', className: '8 Class', name: 'Section IPL' },
    { id: 'batch_8_b', classId: '8_Class_Class', className: '8 Class', name: 'Section M' },
    { id: 'batch_7_a', classId: '7_Class_Class', className: '7 Class', name: 'Section IPL' },
    { id: 'batch_6_a', classId: '6_Class_Class', className: '6 Class', name: 'Section IPL' },
    { id: 'batch_5_a', classId: '5_Class_Class', className: '5 Class', name: 'Section IPL' },
    { id: 'batch_4_a', classId: '4_Class_Class', className: '4 Class', name: 'Section IPL' },
    { id: 'batch_3_a', classId: '3_Class_Class', className: '3 Class', name: 'Section IPL' },
    { id: 'batch_2_a', classId: '2_Class_Class', className: '2 Class', name: 'Section IPL' },
    { id: 'batch_1_a', classId: '1_Class_Class', className: '1 Class', name: 'Section IPL' },
    { id: 'batch_ukg', classId: 'UKG_Class', className: 'UKG', name: 'Section A' },
    { id: 'batch_lkg', classId: 'LKG_Class', className: 'LKG', name: 'Section A' },
    { id: 'batch_nur', classId: 'Nursery_Class', className: 'Nursery', name: 'Section A' }
  ];

  for (const lb of legacyBatches) {
    try {
      await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'update',
          path: 'batches',
          id: lb.id,
          data: {
            classId: lb.classId,
            className: lb.className,
            name: lb.name,
            updatedAt: new Date().toISOString()
          }
        })
      });
    } catch (e: any) {
      console.warn(`Legacy batch notice ${lb.id}:`, e.message);
    }
  }

  // 3. Sync Holidays
  console.log(`Setting ${OFFICIAL_HOLIDAYS_2026_27.length} holidays in MongoDB...`);
  for (const h of OFFICIAL_HOLIDAYS_2026_27) {
    const payload = {
      ...h,
      id: h.id,
      uid: h.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'set', path: 'holidays', id: h.id, data: payload })
      });
      console.log(`Saved holiday ${h.id}: status ${res.status}`);
    } catch (e: any) {
      console.error(`Failed to save holiday ${h.id}:`, e.message);
    }
  }

  console.log('--- SYNC COMPLETED SUCCESSFULLY ---');
}

run().catch(console.error);
