export interface HolidayRecord {
  id: string;
  title: string;
  name: string;
  date: string;
  toDate?: string;
  type: 'holiday' | 'working_day' | 'event';
  description: string;
}

export const OFFICIAL_HOLIDAYS_2026_27: HolidayRecord[] = [
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
