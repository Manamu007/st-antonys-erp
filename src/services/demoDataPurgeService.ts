import { dbService } from './dbService';
import { 
  isKnownDemoName, 
  isDemoStaffRecord, 
  isDemoStudentRecord, 
  isDemoClassOrBatchRecord,
  KNOWN_DEMO_NAMES 
} from '../constants/systemAccounts';
import { isSyntheticOrMailName, cleanPersonName } from '../lib/utils';

export interface PurgeResult {
  staffCleanedCount: number;
  staffDeletedCount: number;
  usersCleanedCount: number;
  usersDeletedCount: number;
  studentsDeletedCount: number;
  classesDeletedCount: number;
  batchesDeletedCount: number;
  batchesCleanedCount: number;
}

export interface DeduplicateResult {
  mergedGroupsCount: number;
  deletedDuplicatesCount: number;
  updatedReferencesCount: number;
}

/**
 * Automatically consolidates duplicate user/staff documents sharing the same email or phone.
 * Retains authentic user records, merges data, updates foreign keys in batches/classes/timetables,
 * and purges duplicate ghost records from Firestore.
 */
export async function deduplicateAndPurgeClashes(): Promise<DeduplicateResult> {
  const result: DeduplicateResult = {
    mergedGroupsCount: 0,
    deletedDuplicatesCount: 0,
    updatedReferencesCount: 0
  };

  try {
    const [allUsers, allStaff, allBatches, allClasses, allTimetables, allLeaves, allPayslips] = await Promise.all([
      dbService.list('users', [], true).catch(() => []),
      dbService.list('staff', [], true).catch(() => []),
      dbService.list('batches', [], true).catch(() => []),
      dbService.list('classes', [], true).catch(() => []),
      dbService.list('timetables', [], true).catch(() => []),
      dbService.list('leaves', [], true).catch(() => []),
      dbService.list('payslips', [], true).catch(() => [])
    ]);

    // 1. Group users by normalized email
    const emailGroups = new Map<string, any[]>();
    for (const u of (allUsers || [])) {
      if (!u) continue;
      const em = (u.email || '').trim().toLowerCase();
      if (!em) continue;
      if (!emailGroups.has(em)) emailGroups.set(em, []);
      emailGroups.get(em)!.push(u);
    }

    // Helper to score keeper priority
    const scoreUser = (u: any): number => {
      let score = 0;
      const name = (u.name || u.displayName || u.fullName || '').trim();
      const isEdited = !!(u.isEditedByUser || u.isUserModified || u.hasBeenEdited);
      const isSynthetic = isSyntheticOrMailName(name) || isKnownDemoName(name);

      if (isEdited) score += 1000;
      if (name && !isSynthetic) score += 500;
      if (u.role && u.role !== 'student' && u.role !== 'parent') score += 100;
      if (u.phone && u.phone.trim().length >= 10) score += 50;
      if (u.photoURL && !u.photoURL.includes('default')) score += 30;
      if (u.uid && u.uid.length > 20) score += 20; // Likely Firebase Auth UID
      if (u.staffId || u.customId) score += 15;
      if (u.subjectAssignments && u.subjectAssignments.length > 0) score += 10;
      if (u.status === 'active') score += 10;
      if (isSynthetic) score -= 400;
      return score;
    };

    for (const [email, users] of emailGroups.entries()) {
      if (users.length <= 1) continue;

      // Sort descending by score to pick primary keeper
      users.sort((a, b) => scoreUser(b) - scoreUser(a));
      const keeper = users[0];
      const keeperId = keeper.uid || keeper.id;
      const discarded = users.slice(1);
      const discardedIds = discarded.map(d => d.uid || d.id).filter(Boolean);

      // Merge data into keeper
      const mergedData = { ...keeper };
      for (const disc of discarded) {
        if (!mergedData.phone && disc.phone) mergedData.phone = disc.phone;
        if (!mergedData.photoURL && disc.photoURL) mergedData.photoURL = disc.photoURL;
        if (!mergedData.aadharNumber && disc.aadharNumber) mergedData.aadharNumber = disc.aadharNumber;
        if (!mergedData.gender && disc.gender) mergedData.gender = disc.gender;
        if (!mergedData.dateOfJoining && disc.dateOfJoining) mergedData.dateOfJoining = disc.dateOfJoining;
        if ((!mergedData.subjects || mergedData.subjects.length === 0) && disc.subjects) mergedData.subjects = disc.subjects;
        if ((!mergedData.batchIds || mergedData.batchIds.length === 0) && disc.batchIds) mergedData.batchIds = disc.batchIds;
        if ((!mergedData.classIds || mergedData.classIds.length === 0) && disc.classIds) mergedData.classIds = disc.classIds;
        if (!mergedData.batchId && disc.batchId) mergedData.batchId = disc.batchId;
        if (!mergedData.classId && disc.classId) mergedData.classId = disc.classId;
      }
      mergedData.isEditedByUser = true;
      mergedData.isUserModified = true;
      mergedData.status = keeper.status || 'active';
      mergedData.updatedAt = new Date().toISOString();

      // Ensure keeper is clean and saved
      await dbService.set('users', keeperId, mergedData).catch(() => {});
      
      // If staff member, also ensure staff collection has matching keeper doc
      const matchingStaff = (allStaff || []).find((s: any) => discardedIds.includes(s.uid || s.id) || (s.email || '').toLowerCase() === email);
      if (matchingStaff || (keeper.role && keeper.role !== 'student' && keeper.role !== 'parent')) {
        const staffData = {
          ...matchingStaff,
          ...mergedData,
          id: keeperId,
          uid: keeperId
        };
        await dbService.set('staff', keeperId, staffData).catch(() => {});
      }

      // Update foreign references across modules
      for (const b of (allBatches || [])) {
        if (b && (discardedIds.includes(b.classTeacherId) || (b.classTeacherEmail && b.classTeacherEmail.toLowerCase() === email))) {
          await dbService.update('batches', b.id, {
            classTeacherId: keeperId,
            classTeacher: keeper.name,
            classTeacherName: keeper.name,
            classTeacherEmail: email
          }).catch(() => {});
          result.updatedReferencesCount++;
        }
      }

      for (const cls of (allClasses || [])) {
        if (cls && Array.isArray(cls.subjects)) {
          let updated = false;
          const newSubs = cls.subjects.map((sub: any) => {
            if (sub && (discardedIds.includes(sub.teacherId) || (sub.teacherEmail && sub.teacherEmail.toLowerCase() === email))) {
              updated = true;
              return { ...sub, teacherId: keeperId, teacherName: keeper.name, teacherEmail: email };
            }
            return sub;
          });
          if (updated) {
            await dbService.update('classes', cls.id, { subjects: newSubs }).catch(() => {});
            result.updatedReferencesCount++;
          }
        }
      }

      for (const tt of (allTimetables || [])) {
        if (tt && Array.isArray(tt.periods)) {
          let updated = false;
          const newPeriods = tt.periods.map((p: any) => {
            if (p && (discardedIds.includes(p.teacherId) || (p.teacherEmail && p.teacherEmail.toLowerCase() === email))) {
              updated = true;
              return { ...p, teacherId: keeperId, teacherName: keeper.name };
            }
            return p;
          });
          if (updated) {
            await dbService.update('timetables', tt.id, { periods: newPeriods }).catch(() => {});
            result.updatedReferencesCount++;
          }
        }
      }

      for (const l of (allLeaves || [])) {
        if (l && (discardedIds.includes(l.applicantId) || (l.applicantEmail && l.applicantEmail.toLowerCase() === email))) {
          await dbService.update('leaves', l.id, { applicantId: keeperId, applicantName: keeper.name, applicantEmail: email }).catch(() => {});
          result.updatedReferencesCount++;
        }
      }

      for (const p of (allPayslips || [])) {
        if (p && (discardedIds.includes(p.staffId) || (p.email && p.email.toLowerCase() === email))) {
          await dbService.update('payslips', p.id, { staffId: keeperId, staffName: keeper.name, email: email }).catch(() => {});
          result.updatedReferencesCount++;
        }
      }

      // Delete discarded duplicate documents permanently
      for (const disc of discarded) {
        const discId = disc.uid || disc.id;
        if (discId && discId !== keeperId) {
          await dbService.delete('users', discId).catch(() => {});
          await dbService.delete('staff', discId).catch(() => {});
          result.deletedDuplicatesCount++;
        }
      }

      result.mergedGroupsCount++;
    }

    // 2. Also check and deduplicate staff collection standalone duplicates
    const staffEmailGroups = new Map<string, any[]>();
    for (const s of (allStaff || [])) {
      if (!s) continue;
      const em = (s.email || '').trim().toLowerCase();
      if (!em) continue;
      if (!staffEmailGroups.has(em)) staffEmailGroups.set(em, []);
      staffEmailGroups.get(em)!.push(s);
    }

    for (const [email, staffMembers] of staffEmailGroups.entries()) {
      if (staffMembers.length <= 1) continue;
      staffMembers.sort((a, b) => scoreUser(b) - scoreUser(a));
      const keeperStaff = staffMembers[0];
      const keeperStaffId = keeperStaff.uid || keeperStaff.id;
      const discardedStaff = staffMembers.slice(1);

      for (const ds of discardedStaff) {
        const dsId = ds.uid || ds.id;
        if (dsId && dsId !== keeperStaffId) {
          await dbService.delete('staff', dsId).catch(() => {});
          result.deletedDuplicatesCount++;
        }
      }
    }

  } catch (error) {
    console.error('Error during database deduplication:', error);
    throw error;
  }

  return result;
}

/**
 * Resolves a single clash group by merging into the best authentic profile and deleting the duplicate document
 */
export async function resolveSingleClash(clashType: string, clashValue: string, usersInClash: any[]): Promise<boolean> {
  if (!usersInClash || usersInClash.length <= 1) return true;

  const scoreUser = (u: any): number => {
    let score = 0;
    const name = (u.name || u.displayName || u.fullName || '').trim();
    const isEdited = !!(u.isEditedByUser || u.isUserModified || u.hasBeenEdited);
    const isSynthetic = isSyntheticOrMailName(name) || isKnownDemoName(name);

    if (isEdited) score += 1000;
    if (name && !isSynthetic) score += 500;
    if (u.role && u.role !== 'student' && u.role !== 'parent') score += 100;
    if (u.phone && u.phone.trim().length >= 10) score += 50;
    if (u.photoURL && !u.photoURL.includes('default')) score += 30;
    if (isSynthetic) score -= 400;
    return score;
  };

  const sorted = [...usersInClash].sort((a, b) => scoreUser(b) - scoreUser(a));
  const keeper = sorted[0];
  const keeperId = keeper.uid || keeper.id;
  const discarded = sorted.slice(1);
  const discardedIds = discarded.map(d => d.uid || d.id).filter(Boolean);

  const mergedData = { ...keeper };
  for (const disc of discarded) {
    if (!mergedData.phone && disc.phone) mergedData.phone = disc.phone;
    if (!mergedData.photoURL && disc.photoURL) mergedData.photoURL = disc.photoURL;
    if (!mergedData.aadharNumber && disc.aadharNumber) mergedData.aadharNumber = disc.aadharNumber;
  }
  mergedData.isEditedByUser = true;
  mergedData.isUserModified = true;
  mergedData.status = 'active';

  await dbService.set('users', keeperId, mergedData).catch(() => {});
  await dbService.set('staff', keeperId, { ...mergedData, id: keeperId, uid: keeperId }).catch(() => {});

  for (const disc of discarded) {
    const discId = disc.uid || disc.id;
    if (discId && discId !== keeperId) {
      await dbService.delete('users', discId).catch(() => {});
      await dbService.delete('staff', discId).catch(() => {});
    }
  }

  return true;
}

/**
 * Permanently purges demo records and clears demo names from Firestore database
 */
export async function purgeAllDemoDataFromDatabase(): Promise<PurgeResult> {
  const result: PurgeResult = {
    staffCleanedCount: 0,
    staffDeletedCount: 0,
    usersCleanedCount: 0,
    usersDeletedCount: 0,
    studentsDeletedCount: 0,
    classesDeletedCount: 0,
    batchesDeletedCount: 0,
    batchesCleanedCount: 0,
  };

  try {
    // 1. Process Staff Collection
    const staffList = await dbService.list('staff', [], true).catch(() => []);
    for (const staff of (staffList || [])) {
      if (!staff) continue;
      const sId = staff.id || staff.uid;
      if (!sId) continue;

      if (isDemoStaffRecord(staff)) {
        await dbService.delete('staff', sId).catch(() => {});
        result.staffDeletedCount++;
        continue;
      }

      const rawName = (staff.name || staff.displayName || staff.fullName || '').trim();
      const fName = (staff.firstName || '').trim();
      const lName = (staff.lastName || staff.secondName || '').trim();

      const hasDemoName = isKnownDemoName(rawName) || isKnownDemoName(fName) || isKnownDemoName(lName);
      if (hasDemoName) {
        // Clean out demo name from database document
        await dbService.update('staff', sId, {
          name: '',
          displayName: '',
          fullName: '',
          firstName: '',
          lastName: '',
          secondName: '',
          hasDemoNameRemoved: true,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
        result.staffCleanedCount++;
      }
    }

    // 2. Process Users Collection
    const usersList = await dbService.list('users', [], true).catch(() => []);
    for (const user of (usersList || [])) {
      if (!user) continue;
      const uId = user.id || user.uid;
      if (!uId) continue;

      if (isDemoStaffRecord(user)) {
        await dbService.delete('users', uId).catch(() => {});
        result.usersDeletedCount++;
        continue;
      }

      const rawName = (user.name || user.displayName || user.fullName || '').trim();
      const fName = (user.firstName || '').trim();
      const lName = (user.lastName || user.secondName || '').trim();

      const hasDemoName = isKnownDemoName(rawName) || isKnownDemoName(fName) || isKnownDemoName(lName);
      if (hasDemoName) {
        await dbService.update('users', uId, {
          name: '',
          displayName: '',
          fullName: '',
          firstName: '',
          lastName: '',
          secondName: '',
          hasDemoNameRemoved: true,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
        result.usersCleanedCount++;
      }
    }

    // 3. Process Students Collection
    const studentsList = await dbService.list('students', [], true).catch(() => []);
    for (const st of (studentsList || [])) {
      if (!st) continue;
      const stId = st.id || st.uid;
      if (!stId) continue;

      const rawName = (st.name || st.studentName || st.fullName || '').trim();
      if (isDemoStudentRecord(st) || isKnownDemoName(rawName)) {
        await Promise.all([
          dbService.delete('students', stId).catch(() => {}),
          dbService.delete('users', stId).catch(() => {})
        ]);
        result.studentsDeletedCount++;
      }
    }

    // 4. Process Classes Collection
    const classesList = await dbService.list('classes', [], true).catch(() => []);
    for (const cls of (classesList || [])) {
      if (!cls) continue;
      const cId = cls.id;
      if (!cId) continue;

      if (isDemoClassOrBatchRecord(cls)) {
        await dbService.delete('classes', cId).catch(() => {});
        result.classesDeletedCount++;
        continue;
      }

      // Check and clean subjects assigned to known demo teachers
      if (Array.isArray(cls.subjects)) {
        let changed = false;
        const updatedSubjects = cls.subjects.map((sub: any) => {
          if (sub && (isKnownDemoName(sub.teacherName) || isKnownDemoName(sub.teacher))) {
            changed = true;
            return { ...sub, teacherId: '', teacherName: 'Unassigned', teacherEmail: '' };
          }
          return sub;
        });
        if (changed) {
          await dbService.update('classes', cId, { subjects: updatedSubjects }).catch(() => {});
        }
      }
    }

    // 5. Process Batches Collection
    const batchesList = await dbService.list('batches', [], true).catch(() => []);
    for (const batch of (batchesList || [])) {
      if (!batch) continue;
      const bId = batch.id;
      if (!bId) continue;

      if (isDemoClassOrBatchRecord(batch)) {
        await dbService.delete('batches', bId).catch(() => {});
        result.batchesDeletedCount++;
        continue;
      }

      const teacherName = (batch.classTeacher || '').trim();
      const teacherNameField = (batch.classTeacherName || '').trim();
      if ((teacherName && isKnownDemoName(teacherName)) || (teacherNameField && isKnownDemoName(teacherNameField))) {
        await dbService.update('batches', bId, {
          classTeacher: 'Not Assigned',
          classTeacherName: 'Not Assigned',
          classTeacherId: '',
          classTeacherEmail: '',
          updatedAt: new Date().toISOString()
        }).catch(() => {});
        result.batchesCleanedCount++;
      }
    }
  } catch (error) {
    console.error('Error during database demo data purge:', error);
    throw error;
  }

  return result;
}
