import { FeeStructure, FeeConcession, UserProfile } from '../types';

// Normalization cache to speed up searches
const normalizationCache = new Map<string, string>();

// Generate consistent custom document IDs in Firestore matching user requested formats
export const getFeeStructureCustomId = (type: 'school' | 'hostel' | 'transport', name: string) => {
  if (!name) return '';
  // Trim and replace all special chars, spaces, hyphens with single underscores, lowercase
  let cleanName = name.trim().toLowerCase()
    .replace(/[\s\-/]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  
  if (type === 'school') {
    // [class_name]_class
    if (cleanName.endsWith('_class')) return cleanName;
    return `${cleanName}_class`;
  }
  if (type === 'transport') {
    // Extract village name from parenthesized route details if present
    // E.g., "Transport Route 1 (Yarrampalli)" -> "yarrampalli"
    let village = cleanName;
    const parenMatch = name.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1]) {
      village = parenMatch[1].trim().toLowerCase()
        .replace(/[\s\-/]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    } else {
      // Clean leading and trailing non-alphanumeric patterns
      village = cleanName
        .replace(/^transport_route_\d+_*/i, '')
        .replace(/^route_\d+_*/i, '')
        .replace(/^transport_*/i, '');
    }
    if (!village) village = cleanName;
    
    if (village.endsWith('_total_fee') || village.endsWith('_total_fee_')) {
      return village.replace(/_$/, '');
    }
    // {village_name]_total fee (with space or underscore, underscore is preferred database safety standard)
    return `${village}_total_fee`;
  }
  if (type === 'hostel') {
    // [hostel_class_name]_total amount of hostel fees (using underscores for database naming safety)
    const suffix = '_total_amount_of_hostel_fees';
    if (cleanName.endsWith(suffix)) return cleanName;
    return `${cleanName}${suffix}`;
  }
  return cleanName;
};

// Normalize string for better matching (lowercase, no non-alphanumeric)
export const normalize = (n: string) => {
  if (!n) return '';
  if (normalizationCache.has(n)) return normalizationCache.get(n)!;
  
  const romanMap: Record<string, string> = {
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
  };
  
  let processed = n.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, (match: string) => romanMap[match] || match)
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
  
  const result = processed
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join('');
  
  normalizationCache.set(n, result);
  return result;
};

// Lenient academic year matching
export const normalizeYear = (y: string) => {
  if (!y) return '';
  return y.replace(/\s+/g, '').replace(/-20(\d{2})$/, '-$1');
};

export const calculateStudentFee = (
  student: any,
  academicYear: string,
  feeStructures: FeeStructure[],
  concessions: FeeConcession[],
  classes: any[],
  batches: any[],
  isAdminOrAccountant: boolean = false
) => {
  if (!student) {
    return {
      total: 0,
      originalTotal: 0,
      concessionAmount: 0,
      schoolFee: 0,
      transportFee: 0,
      hostelFee: 0,
      schoolFeeTerms: { term1: 0, term2: 0, term3: 0 },
      transportFeeTerms: { term1: 0, term2: 0, term3: 0 },
      hostelFeeTerms: { term1: 0, term2: 0, term3: 0 },
      originalSchoolTerms: { term1: 0, term2: 0, term3: 0 },
      originalTransportTerms: { term1: 0, term2: 0, term3: 0 },
      originalHostelTerms: { term1: 0, term2: 0, term3: 0 },
      breakdown: []
    };
  }

  const studentClass = classes?.find(c => c && (c.id === student?.classId || c.name === student?.classId || c.name === student?.class));
  const studentBatch = batches?.find(b => b && (b.id === student?.batchId || b.name === student?.batchId || b.name === student?.batch));
  
  const targetYearNorm = normalizeYear(academicYear);

  // 1. Resolve and sanitize class & batch names
  let classNameStr = studentClass?.name || student?.class || student?.classId || '';
  let batchNameStr = studentBatch?.name || student?.batch || student?.batchId || '';
  if (batchNameStr) {
    batchNameStr = batchNameStr.replace(/[-_ ]*batch$/i, '').trim();
  }

  // Robust Fallback: If classNameStr is exactly the ID "10_Class_Class" or similar, clean it up
  if (classNameStr && classNameStr.toLowerCase().endsWith('_class_class')) {
    classNameStr = classNameStr.replace(/_class_class$/i, ' Class');
  } else if (classNameStr && classNameStr.toLowerCase().endsWith('_class')) {
    classNameStr = classNameStr.replace(/_class$/i, ' Class');
  }
  classNameStr = classNameStr.replace(/_/g, ' ');

  if (batchNameStr && batchNameStr.includes('_')) {
    // If it contains class prefix like "10 Class_IPL" or "10_Class_IPL" -> "IPL"
    if (batchNameStr.includes('Class_')) {
      batchNameStr = batchNameStr.split('Class_')[1];
    } else if (batchNameStr.toLowerCase().includes('class_')) {
      batchNameStr = batchNameStr.split(/class_/i)[1];
    }
    batchNameStr = batchNameStr.replace(/_/g, ' ');
  }

  const matchStructure = (s: any, type: string, strictYear: boolean = true) => {
    if (s.type !== type) return false;
    if (strictYear && normalizeYear(s.academicYear) !== targetYearNorm) return false;
    
    const sNorm = normalize(s.name);
    const targetClassName = classNameStr;
    const cNorm = normalize(targetClassName);
    
    // Ensure we don't match empty strings unless they match exactly and are non-empty
    if (!sNorm || !cNorm) return sNorm === cNorm && sNorm !== '';
    
    return sNorm === cNorm || sNorm.includes(cNorm) || cNorm.includes(sNorm);
  };

  if (classNameStr.includes(' - ')) {
    const parts = classNameStr.split(' - ');
    classNameStr = parts[0];
    if (!batchNameStr) {
      batchNameStr = parts[1];
    }
  }

  const cleanClass = classNameStr.toLowerCase().replace(/[\s\-/]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const cleanBatch = batchNameStr.toLowerCase().replace(/[\s\-/]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

  const candidates: string[] = [];
  if (cleanClass) {
    if (cleanBatch) {
      candidates.push(`${cleanClass}_${cleanBatch}`);
    }
    candidates.push(`${cleanClass}_class`);
    if (cleanClass && cleanBatch) {
      candidates.push(`${cleanClass}_${cleanClass}_-_${cleanBatch}`);
    }
    candidates.push(cleanClass);
    
    // Also include custom ID format
    if (batchNameStr) {
      candidates.push(getFeeStructureCustomId('school', `${classNameStr} - ${batchNameStr}`));
    }
    candidates.push(getFeeStructureCustomId('school', classNameStr));
  }

  let schoolStructure: FeeStructure | undefined;

  if (student.status === 'non_attending' || (student.status && student.status.toLowerCase().replace(/_/g, ' ') === 'non attending')) {
    schoolStructure = feeStructures.find(s => {
      if (s.type !== 'school') return false;
      const sName = (s.name || '').toLowerCase().trim();
      return sName === 'non-attending student' || sName === 'non attending student' || sName === 'non_attending_student';
    });

    if (!schoolStructure) {
      schoolStructure = {
        name: 'Non-Attending Student',
        type: 'school',
        academicYear: academicYear,
        term1: 10000,
        term2: 0,
        term3: 0,
        total: 10000,
        createdAt: new Date().toISOString()
      };
    }
  } else if (candidates.length > 0) {
    const normalizedCandidates = candidates.map(c => normalize(c));
    // Priority A: Match candidates exactly or via normalized representation in the TARGET year
    schoolStructure = feeStructures.find(s => {
      if (s.type !== 'school') return false;
      if (normalizeYear(s.academicYear) !== targetYearNorm) return false;
      const sid = (s.id || '').toLowerCase();
      const sName = (s.name || '').toLowerCase();
      const sNormId = normalize(s.id || '');
      const sNormName = normalize(s.name || '');
      return candidates.some(c => sid === c || sid === `fs_${c}` || sName === c.replace(/_/g, ' ') || sName === c) ||
             normalizedCandidates.some(nc => sNormId === nc || sNormName === nc);
    });

    // Priority B: Match candidates exactly or via normalized representation in OTHER years (as estimate fallback)
    if (!schoolStructure) {
      schoolStructure = feeStructures.find(s => {
        if (s.type !== 'school') return false;
        const sid = (s.id || '').toLowerCase();
        const sName = (s.name || '').toLowerCase();
        const sNormId = normalize(s.id || '');
        const sNormName = normalize(s.name || '');
        return candidates.some(c => sid === c || sid === `fs_${c}` || sName === c.replace(/_/g, ' ') || sName === c) ||
               normalizedCandidates.some(nc => sNormId === nc || sNormName === nc);
      });
    }
  }

  // Fallback 1: Try matching BOTH class and batch name in target year
  if (!schoolStructure) {
    schoolStructure = feeStructures.find(s => {
      if (s.type !== 'school') return false;
      if (normalizeYear(s.academicYear) !== targetYearNorm) return false;
      const sNorm = normalize(s.name);
      const targetClassName = classNameStr;
      const cNorm = normalize(targetClassName);
      
      const rawBatch = studentBatch?.name || student?.batch || student?.batchId || '';
      const cleanBatchName = rawBatch.replace(/[-_ ]*batch$/i, '').trim();
      const bNorm = normalize(cleanBatchName);
      
      if (bNorm) {
        return sNorm.includes(cNorm) && sNorm.includes(bNorm);
      }
      return false;
    });
  }

  // Fallback 2: Standard matchStructure in target year
  if (!schoolStructure) {
    schoolStructure = feeStructures.find(s => matchStructure(s, 'school', true));
  }

  // Fallback 3: Standard matchStructure regardless of year
  if (!schoolStructure && feeStructures.length > 0) {
    schoolStructure = feeStructures.find(s => matchStructure(s, 'school', false));
  }

  // Try finding hostel structure by custom ID in target year first
  let hostelStructure = feeStructures.find(s => {
    if (s.type !== 'hostel') return false;
    if (normalizeYear(s.academicYear) !== targetYearNorm) return false;
    const targetClassName = studentClass?.name || student.class || student.classId || '';
    if (!targetClassName) return false;
    const expectedId = getFeeStructureCustomId('hostel', targetClassName);
    const sid = (s.id || '').toLowerCase();
    return sid === expectedId || sid === `fs_${expectedId}`;
  });

  if (!hostelStructure) {
    hostelStructure = feeStructures.find(s => {
      if (s.type !== 'hostel') return false;
      const targetClassName = studentClass?.name || student.class || student.classId || '';
      if (!targetClassName) return false;
      const expectedId = getFeeStructureCustomId('hostel', targetClassName);
      const sid = (s.id || '').toLowerCase();
      return sid === expectedId || sid === `fs_${expectedId}`;
    });
  }

  if (!hostelStructure) {
    hostelStructure = feeStructures.find(s => matchStructure(s, 'hostel', true));
  }
  if (!hostelStructure && feeStructures.length > 0) {
    hostelStructure = feeStructures.find(s => matchStructure(s, 'hostel', false));
  }

  const concession = concessions.find(c => c.id === student.feeConcessionType);
  const isCustomConcession = student.feeConcessionType === 'custom';
  const customConcessionAmount = Number(student.feeConcessionAmount || 0);

  const calculateStructureTotal = (s: any) => {
    if (!s) return 0;
    return Number(s.term1 || 0) + Number(s.term2 || 0) + Number(s.term3 || 0);
  };

  let schoolFee = Number(calculateStructureTotal(schoolStructure));
  let hostelFee = (student.feeType?.toLowerCase() === 'hostel') ? Number(calculateStructureTotal(hostelStructure)) : 0;
  let transportFee = 0;
  let iplFee = 0;
  let admissionFee = 0;
  let healthCardFee = (student.feeType?.toLowerCase() === 'hostel') ? Number(hostelStructure?.healthCardFee || 2000) : 0;
  let transportStructure: FeeStructure | undefined;

  // Transport - Robust matching
  if (student.feeType?.toLowerCase() !== 'hostel' && (student.transportType === 'school' || student.transportBusId)) {
    const cityName = (student.city || '').trim().toLowerCase();
    const villageName = (student.village || student.villageName || '').trim().toLowerCase();
    const addressStr = (student.address || '').trim().toLowerCase();
    const busRouteStr = (student.busRoute || '').trim().toLowerCase();

    // Special matching for Porumamilla village transport fees:
    // 1. Porumamilla Primary should apply for 1 class to 5 class students using school transport from village Porumamilla
    // 2. Porumamilla High School should apply for 6 class to 10 class students using school transport only.
    const isPorumamilla = 
      villageName.includes('porumamilla') || 
      cityName.includes('porumamilla') || 
      addressStr.includes('porumamilla') ||
      busRouteStr.includes('porumamilla');

    if (isPorumamilla) {
      const classNumMatch = classNameStr.match(/\d+/);
      const classNum = classNumMatch ? parseInt(classNumMatch[0], 10) : null;
      
      let isPrimary = false;
      let isHighSchool = false;
      
      if (classNum !== null) {
        if (classNum >= 1 && classNum <= 5) {
          isPrimary = true;
        } else if (classNum >= 6 && classNum <= 10) {
          isHighSchool = true;
        }
      } else {
        // Fallback or pre-primary classes (LKG, UKG, Nursery) can map to Porumamilla Primary
        const lowerName = classNameStr.toLowerCase();
        if (lowerName.includes('lkg') || lowerName.includes('ukg') || lowerName.includes('nursery') || lowerName.includes('kindergarten') || lowerName.includes('pre-primary')) {
          isPrimary = true;
        }
      }

      if (isPrimary) {
        transportStructure = feeStructures.find(s => 
          s.type === 'transport' && 
          (s.id === 'porumamilla_town_total_fee' || 
           s.name?.toLowerCase().includes('porumamilla primary') ||
           ((s.name || '').toLowerCase().includes('porumamilla') && (s.name || '').toLowerCase().includes('primary')))
        );
      } else if (isHighSchool) {
        transportStructure = feeStructures.find(s => 
          s.type === 'transport' && 
          (s.id === 'porumamilla_high_school_total_fee' || 
           s.name?.toLowerCase().includes('porumamilla high school') ||
           ((s.name || '').toLowerCase().includes('porumamilla') && ((s.name || '').toLowerCase().includes('high') || (s.name || '').toLowerCase().includes('school'))))
        );
      }

      // If we could not match the exact subdivided structure, fallback to any transport structure having porumamilla in the name/id
      if (!transportStructure) {
        transportStructure = feeStructures.find(s => 
          s.type === 'transport' && 
          ((s.id || '').toLowerCase().includes('porumamilla') || (s.name || '').toLowerCase().includes('porumamilla'))
        );
      }
    }

    if (!transportStructure) {
      // Priority 1: Match by expecting ID or exact name
      transportStructure = feeStructures.find(s => {
        if (s.type !== 'transport') return false;
        const sid = (s.id || '').toLowerCase();
        const sName = (s.name || '').toLowerCase();

        if (villageName) {
          const expectedId = getFeeStructureCustomId('transport', villageName);
          if (sid === expectedId || sid === `fs_${expectedId}` || sName === villageName || sName.includes(villageName)) return true;
        }
        if (cityName) {
          const expectedId = getFeeStructureCustomId('transport', cityName);
          if (sid === expectedId || sid === `fs_${expectedId}` || sName === cityName || sName.includes(cityName)) return true;
        }
        return false;
      });
    }

    // Priority 2: Substring matching in target year
    if (!transportStructure) {
      transportStructure = feeStructures.find(s => {
        if (s.type !== 'transport') return false;
        if (normalizeYear(s.academicYear) !== targetYearNorm) return false;
        const structName = (s.name || '').toLowerCase();
        const structNorm = normalize(s.name);
        
        return (cityName && (structName.includes(cityName) || structNorm.includes(normalize(cityName)))) || 
               (villageName && (structName.includes(villageName) || structNorm.includes(normalize(villageName)))) ||
               (busRouteStr && (structName.includes(busRouteStr) || structNorm.includes(normalize(busRouteStr)))) ||
               (addressStr && (addressStr.includes(structName) || addressStr.includes(structNorm)));
      });
    }

    // Priority 3: Substring matching regardless of academic year
    if (!transportStructure) {
      transportStructure = feeStructures.find(s => {
        if (s.type !== 'transport') return false;
        const structName = (s.name || '').toLowerCase();
        const structNorm = normalize(s.name);
        
        return (cityName && (structName.includes(cityName) || structNorm.includes(normalize(cityName)))) || 
               (villageName && (structName.includes(villageName) || structNorm.includes(normalize(villageName)))) ||
               (busRouteStr && (structName.includes(busRouteStr) || structNorm.includes(normalize(busRouteStr)))) ||
               (addressStr && (addressStr.includes(structName) || addressStr.includes(structNorm)));
      });
    }

    // Priority 4: Fallback to any transport structure if not found
    if (!transportStructure) {
      transportStructure = feeStructures.find(s => s.type === 'transport');
    }

    if (transportStructure) {
      transportFee = Number(transportStructure.total || ((transportStructure.term1 || 0) + (transportStructure.term2 || 0) + (transportStructure.term3 || 0)));
    }
  }

  // IPL (Removed from ERP)
  if (studentBatch?.name?.toUpperCase() === 'IPL') {
    iplFee = 0;
  }

  // Admission fee should apply to new students when added from student module "add student" button.
  // Display in fees collection module in accountant and admin profiles only, not apply for other students.
  admissionFee = 0;

  const getMonthsActive = (dropDate?: string) => {
    if (!dropDate) return 10;
    try {
      const date = new Date(dropDate);
      if (isNaN(date.getTime())) return 10;
      const year = date.getFullYear();
      const month = date.getMonth(); 
      
      const academicYearStart = parseInt(academicYear.split('-')[0]) || new Date().getFullYear();
      const startMonth = 5; // June 
      
      let months = (year - academicYearStart) * 12 + (month - startMonth) + 1;
      return Math.max(0, Math.min(10, months));
    } catch (e) {
      return 10;
    }
  };

  const schoolMonths = getMonthsActive(student.dropDate);
  const transportDropDate = student.transportDropDate || (student.transportStatus === 'inactive' ? (student.dropDate || new Date().toISOString()) : undefined);
  const transportMonths = getMonthsActive(transportDropDate);
  const hostelDropDate = student.feeType?.toLowerCase() !== 'hostel' && student.hostelDropDate ? student.hostelDropDate : undefined;
  const hostelMonths = getMonthsActive(hostelDropDate);

  // 1. Calculate base concession amounts (percentage or flat)
  let schoolConcessionAmount = 0;
  if (isCustomConcession) {
    schoolConcessionAmount = customConcessionAmount;
  } else if (concession && (concession.appliedTo === 'school' || !concession.appliedTo)) {
    const concessionValue = Number(concession.value || 0);
    if (concession.type === 'percentage') {
      schoolConcessionAmount = Math.round(schoolFee * (concessionValue / 100));
    } else {
      schoolConcessionAmount = concessionValue;
    }
  }

  let hostelConcessionAmount = 0;
  if (concession && concession.appliedTo === 'hostel') {
    const concessionValue = Number(concession.value || 0);
    if (concession.type === 'percentage') {
      hostelConcessionAmount = Math.round(hostelFee * (concessionValue / 100));
    } else {
      hostelConcessionAmount = concessionValue;
    }
  }

  let transportConcessionAmount = 0;
  if (concession && concession.appliedTo === 'transport') {
    const concessionValue = Number(concession.value || 0);
    if (concession.type === 'percentage') {
      transportConcessionAmount = Math.round(transportFee * (concessionValue / 100));
    } else {
      transportConcessionAmount = concessionValue;
    }
  }

  // 2. Original term splits (before concession)
  let origST1 = 0;
  let origST2 = 0;
  let origST3 = 0;
  if (schoolFee > 0) {
    if (schoolStructure) {
      const originalSchoolTotal = (Number(schoolStructure.term1) || 0) + (Number(schoolStructure.term2) || 0) + (Number(schoolStructure.term3) || 0);
      const ratio = originalSchoolTotal > 0 ? (schoolFee / originalSchoolTotal) : 1;
      origST1 = Math.round((Number(schoolStructure.term1) || 0) * ratio);
      origST2 = Math.round((Number(schoolStructure.term2) || 0) * ratio);
      origST3 = Math.max(0, schoolFee - origST1 - origST2);
    } else {
      origST1 = schoolFee;
    }
  }

  let origHT1 = 0;
  let origHT2 = 0;
  let origHT3 = 0;
  if (hostelFee > 0) {
    if (hostelStructure) {
      const originalHostelTotal = (Number(hostelStructure.term1) || 0) + (Number(hostelStructure.term2) || 0) + (Number(hostelStructure.term3) || 0);
      const ratio = originalHostelTotal > 0 ? (hostelFee / originalHostelTotal) : 1;
      origHT1 = Math.round((Number(hostelStructure.term1) || 0) * ratio);
      origHT2 = Math.round((Number(hostelStructure.term2) || 0) * ratio);
      origHT3 = Math.max(0, hostelFee - origHT1 - origHT2);
    } else {
      origHT1 = Math.round(hostelFee * 0.5);
      origHT2 = Math.round(hostelFee * 0.25);
      origHT3 = Math.max(0, hostelFee - origHT1 - origHT2);
    }
  }

  let origTT1 = 0;
  let origTT2 = 0;
  let origTT3 = 0;
  if (transportFee > 0) {
    if (transportStructure) {
      const originalTransportTotal = (Number(transportStructure.term1) || 0) + (Number(transportStructure.term2) || 0) + (Number(transportStructure.term3) || 0);
      const ratio = originalTransportTotal > 0 ? (transportFee / originalTransportTotal) : 1;
      origTT1 = Math.round((Number(transportStructure.term1) || 0) * ratio);
      origTT2 = Math.round((Number(transportStructure.term2) || 0) * ratio);
      origTT3 = Math.max(0, transportFee - origTT1 - origTT2);
    } else {
      const termValue = Math.round(transportFee / 3);
      origTT1 = termValue;
      origTT2 = termValue;
      origTT3 = Math.max(0, transportFee - origTT1 - origTT2);
    }
  }

  // 3. Concession deduction rule application
  let sT1 = origST1;
  let sT2 = origST2;
  let sT3 = origST3;

  // Last Term School Fee Concession specifically applied to Term 3 (sT3)
  if (student.lastTermConcessionType && student.lastTermConcessionType !== 'none') {
    let lastTermConcessionAmount = 0;
    if (student.lastTermConcessionType === 'percentage') {
      lastTermConcessionAmount = Math.round(sT3 * (Number(student.lastTermConcessionValue || 0) / 100));
    } else if (student.lastTermConcessionType === 'fixed') {
      lastTermConcessionAmount = Number(student.lastTermConcessionValue || 0);
    }
    sT3 = Math.max(0, sT3 - lastTermConcessionAmount);
  }

  let hT1 = origHT1;
  let hT2 = origHT2;
  let hT3 = origHT3;

  const isHostelResident = student.feeType?.toLowerCase() === 'hostel';

  if (isHostelResident) {
    let poolConcession = schoolConcessionAmount + hostelConcessionAmount;

    // Term 3 first
    const s3Deduct = Math.min(sT3, poolConcession);
    sT3 -= s3Deduct;
    poolConcession -= s3Deduct;

    const h3Deduct = Math.min(hT3, poolConcession);
    hT3 -= h3Deduct;
    poolConcession -= h3Deduct;

    // Term 2 next
    const s2Deduct = Math.min(sT2, poolConcession);
    sT2 -= s2Deduct;
    poolConcession -= s2Deduct;

    const h2Deduct = Math.min(hT2, poolConcession);
    hT2 -= h2Deduct;
    poolConcession -= h2Deduct;

    // Term 1 next
    const s1Deduct = Math.min(sT1, poolConcession);
    sT1 -= s1Deduct;
    poolConcession -= s1Deduct;

    const h1Deduct = Math.min(hT1, poolConcession);
    hT1 -= h1Deduct;
    poolConcession -= h1Deduct;
  } else {
    // School Concession
    let remainingSchoolConcession = schoolConcessionAmount;
    
    // Term 3 first
    const s3Deduct = Math.min(sT3, remainingSchoolConcession);
    sT3 -= s3Deduct;
    remainingSchoolConcession -= s3Deduct;

    // Term 2 next
    const s2Deduct = Math.min(sT2, remainingSchoolConcession);
    sT2 -= s2Deduct;
    remainingSchoolConcession -= s2Deduct;

    // Term 1 next
    const s1Deduct = Math.min(sT1, remainingSchoolConcession);
    sT1 -= s1Deduct;
    remainingSchoolConcession -= s1Deduct;

    // Hostel Concession (fallback)
    let remainingHostelConcession = hostelConcessionAmount;

    // Term 3 first
    const h3Deduct = Math.min(hT3, remainingHostelConcession);
    hT3 -= h3Deduct;
    remainingHostelConcession -= h3Deduct;

    // Term 2 next
    const h2Deduct = Math.min(hT2, remainingHostelConcession);
    hT2 -= h2Deduct;
    remainingHostelConcession -= h2Deduct;

    // Term 1 next
    const h1Deduct = Math.min(hT1, remainingHostelConcession);
    hT1 -= h1Deduct;
    remainingHostelConcession -= h1Deduct;
  }

  // Transport Concession
  let sTT1 = origTT1;
  let sTT2 = origTT2;
  let sTT3 = origTT3;
  let remainingTransportConcession = transportConcessionAmount;

  // Term 3 first
  const t3Deduct = Math.min(sTT3, remainingTransportConcession);
  sTT3 -= t3Deduct;
  remainingTransportConcession -= t3Deduct;

  // Term 2 next
  const t2Deduct = Math.min(sTT2, remainingTransportConcession);
  sTT2 -= t2Deduct;
  remainingTransportConcession -= t2Deduct;

  // Term 1 next
  const t1Deduct = Math.min(sTT1, remainingTransportConcession);
  sTT1 -= t1Deduct;
  remainingTransportConcession -= t1Deduct;

  // Pro-rate remaining post-concession fees if student is inactive or dropped out
  if (student.status === 'inactive') {
    const ratio = schoolMonths / 10;
    sT1 = Math.round(sT1 * ratio);
    sT2 = Math.round(sT2 * ratio);
    sT3 = Math.round(sT3 * ratio);
  }

  if (hostelDropDate || (student.status === 'inactive')) {
    const ratio = (hostelDropDate ? hostelMonths : schoolMonths) / 10;
    hT1 = Math.round(hT1 * ratio);
    hT2 = Math.round(hT2 * ratio);
    hT3 = Math.round(hT3 * ratio);
  }

  if (student.transportStatus === 'inactive' || student.status === 'inactive') {
    const ratio = transportMonths / 10;
    sTT1 = Math.round(sTT1 * ratio);
    sTT2 = Math.round(sTT2 * ratio);
    sTT3 = Math.round(sTT3 * ratio);
  }

  let proRataOrigST1 = origST1;
  let proRataOrigST2 = origST2;
  let proRataOrigST3 = origST3;
  if (student.status === 'inactive') {
    const ratio = schoolMonths / 10;
    proRataOrigST1 = Math.round(origST1 * ratio);
    proRataOrigST2 = Math.round(origST2 * ratio);
    proRataOrigST3 = Math.round(origST3 * ratio);
  }

  let proRataOrigHT1 = origHT1;
  let proRataOrigHT2 = origHT2;
  let proRataOrigHT3 = origHT3;
  if (hostelDropDate || (student.status === 'inactive')) {
    const ratio = (hostelDropDate ? hostelMonths : schoolMonths) / 10;
    proRataOrigHT1 = Math.round(origHT1 * ratio);
    proRataOrigHT2 = Math.round(origHT2 * ratio);
    proRataOrigHT3 = Math.round(origHT3 * ratio);
  }

  let proRataOrigTT1 = origTT1;
  let proRataOrigTT2 = origTT2;
  let proRataOrigTT3 = origTT3;
  if (student.transportStatus === 'inactive' || student.status === 'inactive') {
    const ratio = transportMonths / 10;
    proRataOrigTT1 = Math.round(origTT1 * ratio);
    proRataOrigTT2 = Math.round(origTT2 * ratio);
    proRataOrigTT3 = Math.round(origTT3 * ratio);
  }

  const proRataSchool = sT1 + sT2 + sT3;
  const proRataHostel = hT1 + hT2 + hT3;
  const proRataTransport = sTT1 + sTT2 + sTT3;

  const finalIplFee = Number(iplFee || 0);
  const finalAdmissionFee = Number(admissionFee || 0);
  const finalHealthCardFee = Number(healthCardFee || 0);

  const originalTotalVal = Number(schoolFee) + Number(hostelFee) + Number(transportFee);
  const totalVal = Number(proRataSchool) + Number(proRataHostel) + Number(proRataTransport) + finalIplFee + finalAdmissionFee + finalHealthCardFee;

  return {
    schoolFee: proRataSchool,
    hostelFee: proRataHostel,
    transportFee: proRataTransport,
    schoolFeeTerms: { term1: sT1, term2: sT2, term3: sT3 },
    hostelFeeTerms: { term1: hT1, term2: hT2, term3: hT3 },
    transportFeeTerms: { term1: sTT1, term2: sTT2, term3: sTT3 },
    originalSchoolTerms: { term1: proRataOrigST1, term2: proRataOrigST2, term3: proRataOrigST3 },
    originalHostelTerms: { term1: proRataOrigHT1, term2: proRataOrigHT2, term3: proRataOrigHT3 },
    originalTransportTerms: { term1: proRataOrigTT1, term2: proRataOrigTT2, term3: proRataOrigTT3 },
    iplFee: finalIplFee,
    admissionFee: finalAdmissionFee,
    healthCardFee: finalHealthCardFee,
    isProRata: student.status === 'inactive' || student.transportStatus === 'inactive',
    originalTotal: originalTotalVal,
    total: totalVal,
    schoolStructure,
    hostelStructure,
    transportStructure
  };
};

export interface StudentFeeMetric {
  student: any;
  total: number;
  originalTotal: number;
  concessionAmount: number;
  paid: number;
  pending: number;
  status: 'paid' | 'partial' | 'unpaid' | 'no_fees';
  paidComponents: Record<string, number>;
  normalizedPaid: Record<string, number>;
  calculation: any;
  payments: any[];
  isOverdue: boolean;
  overdueAmount: number;
  overdueDetails: {
    term1: { isOverdue: boolean; amount: number };
    term2: { isOverdue: boolean; amount: number };
    term3: { isOverdue: boolean; amount: number };
  };
  term1Due: number;
  term1Paid: number;
  term1Pending: number;
  term2Due: number;
  term2Paid: number;
  term2Pending: number;
  term3Due: number;
  term3Paid: number;
  term3Pending: number;
}

export interface FinancialOverviewStats {
  totalPayable: number;
  totalCollected: number;
  totalPending: number;
  totalConcessions: number;
  completionRate: number;
  term1Collected: number;
  term1Pending: number;
  term2Collected: number;
  term2Pending: number;
  term3Collected: number;
  term3Pending: number;
}

export const computeStudentFeeMetrics = ({
  students = [],
  academicYear,
  feeStructures = [],
  concessions = [],
  classes = [],
  batches = [],
  payments = [],
  fees = [],
  extendedDueDates = []
}: {
  students: any[];
  academicYear: string;
  feeStructures: FeeStructure[];
  concessions: FeeConcession[];
  classes: any[];
  batches: any[];
  payments: any[];
  fees?: any[];
  extendedDueDates?: any[];
}): StudentFeeMetric[] => {
  const targetYearNorm = normalizeYear(academicYear);
  const paymentsByStudent = new Map<string, any[]>();

  if (payments && payments.length > 0) {
    payments.forEach(p => {
      if (p.reference && typeof p.reference === 'string' && p.reference.startsWith('EXP')) return;
      if (p.academicYear && normalizeYear(p.academicYear) !== targetYearNorm) return;
      const ids = new Set([p.studentId, (p as any).studentUid].filter(Boolean));
      ids.forEach(sId => {
        if (!paymentsByStudent.has(sId)) {
          paymentsByStudent.set(sId, []);
        }
        paymentsByStudent.get(sId)!.push(p);
      });
    });
  }

  // Filter to active and non-attending students belonging to target academic year
  const targetYearStudentsFiltered = (students || []).filter(stud => {
    if (stud.status && stud.status !== 'active' && stud.status !== 'non_attending') return false;
    const sYearNorm = normalizeYear(stud.academicYear);
    return !stud.academicYear || sYearNorm === targetYearNorm;
  });

  const effectiveStudentsList = targetYearStudentsFiltered.length > 0
    ? targetYearStudentsFiltered
    : (students || []).filter(stud => stud.status !== 'inactive');

  // Group active and non-attending target year students by normalized name to safely deduplicate stubs
  const nameGroups = new Map<string, any[]>();
  effectiveStudentsList.forEach(s => {
    const normName = (s.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!normName) return;
    if (!nameGroups.has(normName)) {
      nameGroups.set(normName, []);
    }
    nameGroups.get(normName)!.push(s);
  });

  const targetYearStudents: any[] = [];
  nameGroups.forEach((group) => {
    if (group.length === 1) {
      targetYearStudents.push(group[0]);
      return;
    }

    const valids: any[] = [];
    const stubs: any[] = [];
    group.forEach(s => {
      const hasClass = s.classId && s.classId !== 'N/A' && s.classId !== '';
      if (hasClass) {
        valids.push(s);
      } else {
        stubs.push(s);
      }
    });

    if (valids.length === 0) {
      const seenStubKeys = new Set<string>();
      stubs.forEach(s => {
        const father = (s.fatherName || s.parentName || '').toLowerCase().trim();
        const email = (s.email || '').toLowerCase().trim();
        const key = `${father}_${email || (s.id || s.uid)}`;
        if (!seenStubKeys.has(key)) {
          seenStubKeys.add(key);
          targetYearStudents.push(s);
        }
      });
      return;
    }

    const unmatchedStubs: any[] = [];
    stubs.forEach(stub => {
      const stubFather = (stub.fatherName || stub.parentName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const stubEmail = (stub.email || '').toLowerCase().trim();
      const stubPhone = (stub.phone || stub.parentPhone || '').toLowerCase().trim().replace(/[^0-9]/g, '');

      const isStubFatherValid = stubFather && stubFather !== 'na' && stubFather !== 'nan' && stubFather !== 'nil';

      const hasMatch = valids.some(v => {
        const vFather = (v.fatherName || v.parentName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const vEmail = (v.email || '').toLowerCase().trim();
        const vPhone = (v.phone || v.parentPhone || '').toLowerCase().trim().replace(/[^0-9]/g, '');
        const isVFatherValid = vFather && vFather !== 'na' && vFather !== 'nan' && vFather !== 'nil';

        if (stubEmail && vEmail && stubEmail === vEmail && stubEmail !== 'n/a') return true;
        if (stubPhone && vPhone && stubPhone === vPhone && stubPhone.length >= 10) return true;
        if (isStubFatherValid && isVFatherValid && stubFather === vFather) return true;

        if (valids.length === 1) {
          const fatherConflict = isStubFatherValid && isVFatherValid && stubFather !== vFather;
          const phoneConflict = stubPhone && vPhone && stubPhone.length >= 10 && vPhone.length >= 10 && stubPhone !== vPhone;
          const emailConflict = stubEmail && vEmail && stubEmail !== 'n/a' && vEmail !== 'n/a' && stubEmail !== vEmail;
          if (!fatherConflict && !phoneConflict && !emailConflict) return true;
        }

        return false;
      });

      if (!hasMatch) {
        unmatchedStubs.push(stub);
      }
    });

    targetYearStudents.push(...valids, ...unmatchedStubs);
  });

  return targetYearStudents.map(stud => {
    const calc = calculateStudentFee(stud, academicYear, feeStructures, concessions, classes, batches, true);
    const candidateIds = [stud.id, stud.uid, stud.studentId].filter(Boolean);

    const rawStudPayments = candidateIds.flatMap(id => paymentsByStudent.get(id) || []);
    const seenPaymentKeys = new Set<string>();
    const studPayments = rawStudPayments.filter(p => {
      const pKey = p.id || `${p.reference || ''}_${p.component || ''}_${p.amount}_${p.date || ''}`;
      if (seenPaymentKeys.has(pKey)) return false;
      seenPaymentKeys.add(pKey);
      return true;
    });

    // Find existing fee record in fees collection as secondary truth source
    const feeRec = (fees || []).find(f =>
      candidateIds.includes(f.studentId) || candidateIds.includes((f as any).studentUid)
    );

    // Breakdown of paid per component
    const sumPaymentsByComp: Record<string, number> = {};
    studPayments.forEach(p => {
      const comp = p.component || 'other';
      const pAmt = Number(p.amount) || 0;
      sumPaymentsByComp[comp] = (sumPaymentsByComp[comp] || 0) + pAmt;
    });

    const paidComponents: Record<string, number> = {};
    const allCompKeys = new Set([
      ...Object.keys(sumPaymentsByComp),
      ...Object.keys(feeRec?.paidComponents || {})
    ]);

    allCompKeys.forEach(compKey => {
      paidComponents[compKey] = Math.max(
        sumPaymentsByComp[compKey] || 0,
        Number(feeRec?.paidComponents?.[compKey as keyof typeof feeRec.paidComponents] || 0)
      );
    });

    const oldFeeConcession = Number(stud.oldFeeConcession || 0);
    const oldDues = Math.max(0, Number(stud.lastClassFeeDue || 0) - oldFeeConcession);

    // Component fee caps to ensure paid amount does not exceed applied fees
    const compFeeCap: Record<string, number> = {
      term1: (calc as any).academicFeeTerms?.term1 || calc.schoolFeeTerms?.term1 || (calc.schoolFeeTerms ? 0 : calc.schoolFee) || 0,
      term2: (calc as any).academicFeeTerms?.term2 || calc.schoolFeeTerms?.term2 || 0,
      term3: (calc as any).academicFeeTerms?.term3 || calc.schoolFeeTerms?.term3 || 0,
      transport_term1: calc.transportFeeTerms?.term1 || (calc.transportFeeTerms ? 0 : calc.transportFee) || 0,
      transport_term2: calc.transportFeeTerms?.term2 || 0,
      transport_term3: calc.transportFeeTerms?.term3 || 0,
      hostel_term1: calc.hostelFeeTerms?.term1 || (calc.hostelFeeTerms ? 0 : calc.hostelFee) || 0,
      hostel_term2: calc.hostelFeeTerms?.term2 || 0,
      hostel_term3: calc.hostelFeeTerms?.term3 || 0,
      admission: calc.admissionFee || 0,
      ipl: calc.iplFee || 0,
      healthCard: calc.healthCardFee || 0,
      lastClassFeeDue: oldDues
    };

    Object.keys(paidComponents).forEach(cKey => {
      if (compFeeCap[cKey] !== undefined && compFeeCap[cKey] > 0) {
        paidComponents[cKey] = Math.min(paidComponents[cKey], compFeeCap[cKey]);
      }
    });

    const rawPaidSum = Math.max(
      studPayments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
      Number(feeRec?.paidAmount || 0),
      Object.values(paidComponents).reduce((sum, v) => sum + Number(v || 0), 0)
    );
    const total = calc.total + oldDues;
    const originalTotal = calc.originalTotal + Number(stud.lastClassFeeDue || 0);
    const concessionAmount = Math.max(0, originalTotal - total);
    const paid = Math.min(total, rawPaidSum);
    const pending = Math.max(0, total - paid);

    const normalizedPaid = { ...paidComponents };

    // Distribute general 'transport' payments first to term-wise transport components if applicable
    if (normalizedPaid['transport'] > 0) {
      let transportPool = normalizedPaid['transport'];
      const t1Due = calc.transportFeeTerms?.term1 || 0;
      const t2Due = calc.transportFeeTerms?.term2 || 0;
      const t3Due = calc.transportFeeTerms?.term3 || 0;

      const t1Need = Math.max(0, t1Due - (normalizedPaid['transport_term1'] || 0));
      const t1Add = Math.min(t1Need, transportPool);
      normalizedPaid['transport_term1'] = (normalizedPaid['transport_term1'] || 0) + t1Add;
      transportPool -= t1Add;

      const t2Need = Math.max(0, t2Due - (normalizedPaid['transport_term2'] || 0));
      const t2Add = Math.min(t2Need, transportPool);
      normalizedPaid['transport_term2'] = (normalizedPaid['transport_term2'] || 0) + t2Add;
      transportPool -= t2Add;

      const t3Need = Math.max(0, t3Due - (normalizedPaid['transport_term3'] || 0));
      const t3Add = Math.min(t3Need, transportPool);
      normalizedPaid['transport_term3'] = (normalizedPaid['transport_term3'] || 0) + t3Add;
      transportPool -= t3Add;
    }

    // Distribute general 'hostel' payments first to term-wise hostel components if applicable
    if (normalizedPaid['hostel'] > 0) {
      let hostelPool = normalizedPaid['hostel'];
      const h1Due = calc.hostelFeeTerms?.term1 || 0;
      const h2Due = calc.hostelFeeTerms?.term2 || 0;
      const h3Due = calc.hostelFeeTerms?.term3 || 0;

      const h1Need = Math.max(0, h1Due - (normalizedPaid['hostel_term1'] || 0));
      const h1Add = Math.min(h1Need, hostelPool);
      normalizedPaid['hostel_term1'] = (normalizedPaid['hostel_term1'] || 0) + h1Add;
      hostelPool -= h1Add;

      const h2Need = Math.max(0, h2Due - (normalizedPaid['hostel_term2'] || 0));
      const h2Add = Math.min(h2Need, hostelPool);
      normalizedPaid['hostel_term2'] = (normalizedPaid['hostel_term2'] || 0) + h2Add;
      hostelPool -= h2Add;

      const h3Need = Math.max(0, h3Due - (normalizedPaid['hostel_term3'] || 0));
      const h3Add = Math.min(h3Need, hostelPool);
      normalizedPaid['hostel_term3'] = (normalizedPaid['hostel_term3'] || 0) + h3Add;
      hostelPool -= h3Add;
    }

    const term1StructureDueDateStr = calc.schoolStructure?.term1DueDate || '2026-07-05';
    const term1TransportDueDateStr = calc.transportStructure?.term1DueDate || '2026-07-05';
    const term1HostelDueDateStr = calc.hostelStructure?.term1DueDate || '2026-07-05';

    const t1SchoolDue = calc.schoolFeeTerms?.term1 || 0;
    const t1TransportDue = calc.transportFeeTerms?.term1 || 0;
    const t1HostelDue = calc.hostelFeeTerms?.term1 || 0;
    const t1AdmissionDue = calc.admissionFee || 0;
    const t1HealthCardDue = calc.healthCardFee || 0;
    const t1IplDue = calc.iplFee || 0;
    const t1LastClassFeeDue = oldDues;

    const t1Items = [
      { id: 'term1', due: t1SchoolDue, dateStr: term1StructureDueDateStr },
      { id: 'transport_term1', due: t1TransportDue, dateStr: term1TransportDueDateStr },
      { id: 'hostel_term1', due: t1HostelDue, dateStr: term1HostelDueDateStr },
      { id: 'admission', due: t1AdmissionDue, dateStr: term1StructureDueDateStr },
      { id: 'healthCard', due: t1HealthCardDue, dateStr: term1HostelDueDateStr },
      { id: 'ipl', due: t1IplDue, dateStr: term1StructureDueDateStr },
      { id: 'lastClassFeeDue', due: t1LastClassFeeDue, dateStr: term1StructureDueDateStr }
    ];

    const term2StructureDueDateStr = calc.schoolStructure?.term2DueDate || '2026-10-05';
    const term2TransportDueDateStr = calc.transportStructure?.term2DueDate || '2026-10-05';
    const term2HostelDueDateStr = calc.hostelStructure?.term2DueDate || '2026-10-05';

    const t2SchoolDue = calc.schoolFeeTerms?.term2 || 0;
    const t2TransportDue = calc.transportFeeTerms?.term2 || 0;
    const t2HostelDue = calc.hostelFeeTerms?.term2 || 0;

    const t2Items = [
      { id: 'term2', due: t2SchoolDue, dateStr: term2StructureDueDateStr },
      { id: 'transport_term2', due: t2TransportDue, dateStr: term2TransportDueDateStr },
      { id: 'hostel_term2', due: t2HostelDue, dateStr: term2HostelDueDateStr }
    ];

    const term3StructureDueDateStr = calc.schoolStructure?.term3DueDate || '2027-01-05';
    const term3TransportDueDateStr = calc.transportStructure?.term3DueDate || '2027-01-05';
    const term3HostelDueDateStr = calc.hostelStructure?.term3DueDate || '2027-01-05';

    const t3SchoolDue = calc.schoolFeeTerms?.term3 || 0;
    const t3TransportDue = calc.transportFeeTerms?.term3 || 0;
    const t3HostelDue = calc.hostelFeeTerms?.term3 || 0;

    const t3Items = [
      { id: 'term3', due: t3SchoolDue, dateStr: term3StructureDueDateStr },
      { id: 'transport_term3', due: t3TransportDue, dateStr: term3TransportDueDateStr },
      { id: 'hostel_term3', due: t3HostelDue, dateStr: term3HostelDueDateStr }
    ];

    // Sum unallocated / general payments to distribute chronologically
    let generalPaymentsPool = 0;
    const activeComponentKeys = [
      'term1', 'term2', 'term3',
      'transport_term1', 'transport_term2', 'transport_term3',
      'hostel_term1', 'hostel_term2', 'hostel_term3',
      'admission', 'healthCard', 'ipl', 'lastClassFeeDue',
      'transport', 'hostel'
    ];

    Object.entries(paidComponents).forEach(([comp, amt]) => {
      if (!activeComponentKeys.includes(comp)) {
        generalPaymentsPool += amt;
      }
    });

    t1Items.forEach(item => {
      if (item.due > 0 && generalPaymentsPool > 0) {
        const currentPaid = normalizedPaid[item.id] || 0;
        const outstandingForThis = Math.max(0, item.due - currentPaid);
        const allocated = Math.min(outstandingForThis, generalPaymentsPool);
        normalizedPaid[item.id] = currentPaid + allocated;
        generalPaymentsPool -= allocated;
      }
    });

    t2Items.forEach(item => {
      if (item.due > 0 && generalPaymentsPool > 0) {
        const currentPaid = normalizedPaid[item.id] || 0;
        const outstandingForThis = Math.max(0, item.due - currentPaid);
        const allocated = Math.min(outstandingForThis, generalPaymentsPool);
        normalizedPaid[item.id] = currentPaid + allocated;
        generalPaymentsPool -= allocated;
      }
    });

    t3Items.forEach(item => {
      if (item.due > 0 && generalPaymentsPool > 0) {
        const currentPaid = normalizedPaid[item.id] || 0;
        const outstandingForThis = Math.max(0, item.due - currentPaid);
        const allocated = Math.min(outstandingForThis, generalPaymentsPool);
        normalizedPaid[item.id] = currentPaid + allocated;
        generalPaymentsPool -= allocated;
      }
    });

    // Overdue calculation
    const today = new Date();
    const todayNoTime = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const getEffectiveDueDate = (compId: string, defaultDateStr: string) => {
      const studentId = stud.id || stud.uid;
      const ext = extendedDueDates.find(e =>
        (e.studentId === studentId) &&
        (e.componentId === compId) &&
        e.extendedDate
      );
      if (ext && ext.extendedDate) {
        return new Date(ext.extendedDate);
      }
      return defaultDateStr ? new Date(defaultDateStr) : null;
    };

    const isOverdueItem = (item: { id: string, due: number, dateStr: string }) => {
      if (item.due <= 0) return false;
      const isPaidComponent = (normalizedPaid[item.id] || 0) >= item.due;
      if (isPaidComponent) return false;

      const effDate = getEffectiveDueDate(item.id, item.dateStr);
      if (!effDate) return false;
      const effDateNoTime = new Date(effDate.getFullYear(), effDate.getMonth(), effDate.getDate());

      return todayNoTime > effDateNoTime;
    };

    let term1IsOverdue = false;
    let term1OverdueAmount = 0;
    t1Items.forEach(item => {
      if (isOverdueItem(item)) {
        term1IsOverdue = true;
        term1OverdueAmount += Math.max(0, item.due - (normalizedPaid[item.id] || 0));
      }
    });

    let term2IsOverdue = false;
    let term2OverdueAmount = 0;
    t2Items.forEach(item => {
      if (isOverdueItem(item)) {
        term2IsOverdue = true;
        term2OverdueAmount += Math.max(0, item.due - (normalizedPaid[item.id] || 0));
      }
    });

    let term3IsOverdue = false;
    let term3OverdueAmount = 0;
    t3Items.forEach(item => {
      if (isOverdueItem(item)) {
        term3IsOverdue = true;
        term3OverdueAmount += Math.max(0, item.due - (normalizedPaid[item.id] || 0));
      }
    });

    const isOverdue = term1IsOverdue || term2IsOverdue || term3IsOverdue;
    const overdueAmount = term1OverdueAmount + term2OverdueAmount + term3OverdueAmount;

    let status: 'paid' | 'partial' | 'unpaid' | 'no_fees' = 'unpaid';
    if (calc.total === 0 && paid === 0) {
      status = 'no_fees';
    } else if (pending <= 0) {
      status = 'paid';
    } else if (paid > 0) {
      status = 'partial';
    }

    const t1DueTotal = t1SchoolDue + t1TransportDue + t1HostelDue + t1AdmissionDue + t1HealthCardDue + t1IplDue + t1LastClassFeeDue;
    const t1PaidTotal = (normalizedPaid['term1'] || 0) + (normalizedPaid['transport_term1'] || 0) + (normalizedPaid['hostel_term1'] || 0) + (normalizedPaid['admission'] || 0) + (normalizedPaid['healthCard'] || 0) + (normalizedPaid['ipl'] || 0) + (normalizedPaid['lastClassFeeDue'] || 0);
    const t1PendingTotal = Math.max(0, t1DueTotal - t1PaidTotal);

    const t2DueTotal = t2SchoolDue + t2TransportDue + t2HostelDue;
    const t2PaidTotal = (normalizedPaid['term2'] || 0) + (normalizedPaid['transport_term2'] || 0) + (normalizedPaid['hostel_term2'] || 0);
    const t2PendingTotal = Math.max(0, t2DueTotal - t2PaidTotal);

    const t3DueTotal = t3SchoolDue + t3TransportDue + t3HostelDue;
    const t3PaidTotal = (normalizedPaid['term3'] || 0) + (normalizedPaid['transport_term3'] || 0) + (normalizedPaid['hostel_term3'] || 0);
    const t3PendingTotal = Math.max(0, t3DueTotal - t3PaidTotal);

    return {
      student: stud,
      total,
      originalTotal,
      concessionAmount,
      paid,
      pending,
      status,
      paidComponents,
      normalizedPaid,
      calculation: calc,
      payments: studPayments,
      isOverdue,
      overdueAmount,
      overdueDetails: {
        term1: { isOverdue: term1IsOverdue, amount: term1OverdueAmount },
        term2: { isOverdue: term2IsOverdue, amount: term2OverdueAmount },
        term3: { isOverdue: term3IsOverdue, amount: term3OverdueAmount }
      },
      term1Due: t1DueTotal,
      term1Paid: t1PaidTotal,
      term1Pending: t1PendingTotal,
      term2Due: t2DueTotal,
      term2Paid: t2PaidTotal,
      term2Pending: t2PendingTotal,
      term3Due: t3DueTotal,
      term3Paid: t3PaidTotal,
      term3Pending: t3PendingTotal
    };
  });
};

export const calculateFinancialOverview = (studentMetrics: StudentFeeMetric[] = []): FinancialOverviewStats => {
  let totalPayable = 0;
  let totalCollected = 0;
  let totalPending = 0;
  let totalConcessions = 0;

  let term1Collected = 0;
  let term1Pending = 0;
  let term2Collected = 0;
  let term2Pending = 0;
  let term3Collected = 0;
  let term3Pending = 0;

  studentMetrics.forEach(m => {
    totalPayable += m.total;
    totalCollected += m.paid;
    totalPending += m.pending;
    totalConcessions += m.concessionAmount;

    term1Collected += m.term1Paid;
    term1Pending += m.term1Pending;
    term2Collected += m.term2Paid;
    term2Pending += m.term2Pending;
    term3Collected += m.term3Paid;
    term3Pending += m.term3Pending;
  });

  const completionRate = totalPayable > 0 ? (totalCollected / totalPayable) * 100 : 0;

  return {
    totalPayable,
    totalCollected,
    totalPending,
    totalConcessions,
    completionRate,
    term1Collected,
    term1Pending,
    term2Collected,
    term2Pending,
    term3Collected,
    term3Pending
  };
};
