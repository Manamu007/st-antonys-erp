import * as XLSX from 'xlsx';

/**
 * Helper utilities for exam subjects, ranks, and performance categories.
 * Safe for both frontend React client and Node.js backend.
 */

export const PRESET_SUBJECT_SETS = {
  highSchool: [
    'Telugu',
    'Hindi',
    'English',
    'Mathematics',
    'Physical Science',
    'Biological Science',
    'Social Studies'
  ],
  standard6: [
    'Telugu',
    'Hindi',
    'English',
    'Mathematics',
    'Science',
    'Social Studies'
  ],
  primary: [
    'Telugu',
    'English',
    'Mathematics',
    'EVS / Science'
  ],
  prePrimary: [
    'English (Oral & Written)',
    'Mathematics / Numbers',
    'Rhymes & Story',
    'General Knowledge'
  ],
  intermediateMPC: [
    'English',
    'Sanskrit / Telugu',
    'Mathematics - A',
    'Mathematics - B',
    'Physics',
    'Chemistry'
  ],
  intermediateBiPC: [
    'English',
    'Sanskrit / Telugu',
    'Botany',
    'Zoology',
    'Physics',
    'Chemistry'
  ]
};

export function getStandardSubjectRank(subjectName: string): number {
  const raw = (subjectName || '').trim();
  const lower = raw.toLowerCase();
  const clean = lower.replace(/[^a-z0-9]/g, '');

  // 1. TELUGU
  if (clean.includes('telugu') || clean === 'tel' || lower.includes('1st lang') || lower.includes('first lang')) {
    return 1;
  }

  // 2. HINDI
  if (clean.includes('hindi') || clean.includes('hindhi') || clean === 'hin' || lower.includes('2nd lang') || lower.includes('second lang')) {
    return 2;
  }

  // 3. ENGLISH
  if (clean.includes('english') || clean === 'eng' || clean.includes('engreading') || lower.includes('3rd lang') || lower.includes('third lang')) {
    return 3;
  }

  // 4. MATHEMATICS / MATHS / MATH
  if (clean.includes('math') || clean.includes('mathematics') || clean.includes('maths') || clean === 'numbers' || clean === 'tables' || clean.includes('mathbasics')) {
    return 4;
  }

  // 5. PHYSICS / Physical Science / PS
  if (clean.includes('physics') || clean.includes('physicalscience') || clean === 'ps' || clean === 'phy' || clean === 'phys') {
    return 5;
  }
  if ((clean.includes('science') || clean === 'sci' || clean.includes('genscience') || clean.includes('generalscience')) && 
      !clean.includes('bio') && !clean.includes('computer') && !clean.includes('social')) {
    return 5;
  }

  // 6. BIOLOGY / Biological Science / Natural Science / NS / BS
  if (clean.includes('bio') || clean.includes('biology') || clean.includes('biological') || clean.includes('naturalscience') || clean === 'ns' || clean === 'bs') {
    return 6;
  }

  // 7. SOCIAL / Social Studies / Social Science / SST / EVS
  if (clean.includes('social') || clean.includes('sst') || clean.includes('soc') || clean.includes('socialstudies') || clean.includes('socialscience') || clean.includes('evs') || clean.includes('environment')) {
    return 7;
  }

  // 8. CHEMISTRY
  if (clean.includes('chem') || clean.includes('chemistry')) {
    return 8;
  }

  // 9. COMPUTERS / IT
  if (clean.includes('computer') || clean.includes('computers') || clean === 'cs' || clean.includes('it') || clean.includes('infotech') || clean.includes('informationtechnology')) {
    return 9;
  }

  // 10+. Auxiliary subjects
  if (clean.includes('cdf') || clean.includes('foundation') || clean.includes('iit')) return 10;
  if (clean.includes('gk') || clean.includes('generalknowledge')) return 11;
  if (clean.includes('rhymes') || clean.includes('story')) return 12;
  if (clean.includes('sanskrit')) return 13;
  if (clean.includes('moral') || clean.includes('value')) return 14;
  if (clean.includes('drawing') || clean.includes('art') || clean.includes('craft')) return 15;

  return 100;
}

export function compareSubjectsStandard(a: any, b: any): number {
  const nameA = typeof a === 'string' ? a : (a?.name || a?.subjectName || '');
  const nameB = typeof b === 'string' ? b : (b?.name || b?.subjectName || '');
  const rankA = getStandardSubjectRank(nameA);
  const rankB = getStandardSubjectRank(nameB);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return nameA.localeCompare(nameB);
}

/**
 * Helper to get performance category from percentage
 * 90-100%: 🌟 Outstanding
 * 80-89%: ⭐ Excellent
 * 70-79%: Very Good
 * 60-69%: Good
 * 50-59%: Average
 * 40-49%: Needs Improvement
 * Below 40%: Poor / Fail
 */
export function getPerformanceCategory(percentage: number): string {
  if (percentage >= 90) return '🌟 Outstanding';
  if (percentage >= 80) return '⭐ Excellent';
  if (percentage >= 70) return 'Very Good';
  if (percentage >= 60) return 'Good';
  if (percentage >= 50) return 'Average';
  if (percentage >= 40) return 'Needs Improvement';
  return 'Poor / Fail';
}

export interface ExcelTemplateOptions {
  fileName?: string;
  examName?: string;
  className?: string;
  subjects: string[];
  maxMarksPerSubject?: number;
  students?: Array<{
    candidateId?: string;
    studentName?: string;
    fatherName?: string;
    phone?: string;
    group?: string;
    batch?: string;
  }>;
  includeSampleRows?: boolean;
}

/**
 * Generates and triggers download of a standardized Excel Template (.xlsx)
 * with dynamic subject columns, auto Total/Percentage/Rank columns, and phone number header.
 */
export function downloadMarksExcelTemplate(options: ExcelTemplateOptions): void {
  const {
    fileName = 'Exam_Marks_Upload_Template',
    examName = 'FA-1 / Unit Test 1',
    className = 'Class 10',
    subjects,
    maxMarksPerSubject = 25,
    students = [],
    includeSampleRows = true
  } = options;

  const subjectList = (subjects && subjects.length > 0) ? subjects : PRESET_SUBJECT_SETS.highSchool;

  // Build header row:
  // Candidate ID | Student Name | Father Name | Class | Section | Exam Name | [Subject 1] | [Subject 2] ... | Total | Percentage | Rank | Parent Phone
  const headers = [
    'Candidate ID',
    'Student Name',
    'Father Name',
    'Class',
    'Section',
    'Exam Name',
    ...subjectList,
    'Total',
    'Percentage',
    'Rank',
    'Parent Phone'
  ];

  const dataRows: any[] = [];

  if (students && students.length > 0) {
    // Populate with real student metadata from school DB
    students.forEach((st, idx) => {
      const row: Record<string, any> = {
        'Candidate ID': st.candidateId || (idx + 1),
        'Student Name': st.studentName || '',
        'Father Name': st.fatherName || '',
        'Class': st.group || className || '',
        'Section': st.batch || 'A',
        'Exam Name': examName
      };

      // Leave subjects empty for teacher entry, or fill sample scores if requested
      subjectList.forEach(subj => {
        row[subj] = '';
      });

      row['Total'] = '';
      row['Percentage'] = '';
      row['Rank'] = '';
      row['Parent Phone'] = st.phone || '';

      dataRows.push(row);
    });
  } else if (includeSampleRows) {
    // 3 Realistic Sample Records
    const sampleStudents = [
      { id: '101', name: 'Nagaraju M', father: 'Venkateswarlu M', phone: '916309834318', factor: 0.96 },
      { id: '102', name: 'Divya Sri K', father: 'Ramesh K', phone: '919876543210', factor: 0.88 },
      { id: '103', name: 'Sai Krishna P', father: 'Srinivasa Rao P', phone: '919123456789', factor: 0.76 }
    ];

    sampleStudents.forEach((st, idx) => {
      const row: Record<string, any> = {
        'Candidate ID': st.id,
        'Student Name': st.name,
        'Father Name': st.father,
        'Class': className,
        'Section': 'A',
        'Exam Name': examName
      };

      let sum = 0;
      subjectList.forEach(subj => {
        const mark = Math.round(maxMarksPerSubject * st.factor - Math.floor(Math.random() * 3));
        const finalMark = Math.max(0, Math.min(maxMarksPerSubject, mark));
        row[subj] = finalMark;
        sum += finalMark;
      });

      const maxTotal = subjectList.length * maxMarksPerSubject;
      const perc = Math.round((sum / maxTotal) * 100);

      row['Total'] = sum;
      row['Percentage'] = `${perc}%`;
      row['Rank'] = idx + 1;
      row['Parent Phone'] = st.phone;

      dataRows.push(row);
    });
  }

  // Create workbook and worksheet
  const ws = XLSX.utils.json_to_sheet(dataRows, { header: headers });

  // Auto-fit column widths
  const colWidths = headers.map(h => {
    let maxLen = h.length;
    dataRows.forEach(r => {
      const val = String(r[h] ?? '');
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.max(maxLen + 3, 12) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marks_Sheet');

  // Trigger browser download
  const cleanFileName = (fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`).replace(/[^a-zA-Z0-9_.-]/g, '_');
  XLSX.writeFile(wb, cleanFileName);
}

