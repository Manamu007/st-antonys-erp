import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, setPersistence, inMemoryPersistence, triggerAuthStateChanged } from '../firebase';
import { dbService, where } from '../services/dbService';

type User = any;
import { normalizeRole, fetchAndMergeProfile, isStaffRole, isStaffAccountOrEmail } from '../lib/profileUtils';
import { UserProfile } from '../types';
import { isSystemAccount, isDeveloperAccount, getSystemAccountRole, SYSTEM_TEACHER_PROFILES, isTeacherAccountOrEmail, getSystemTeacherProfile, isKnownDemoName } from '../constants/systemAccounts';
import { isTeacherRole } from '../utils/teacherFilter';
import { hasPermission as checkPermission, canEditField } from '../lib/authUtils';
import { Permission, Role, ROLE_PERMISSIONS } from '../constants/permissions';
import { safeStorage as localStorage, safeSessionStorage as sessionStorage } from '../lib/safeStorage';

export const getInitialStoredUser = (): any => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('auth_user') || localStorage.getItem('bypass_user_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.id || parsed.uid || parsed.email || parsed.role || parsed._id)) {
        const id = parsed.id || parsed.uid || parsed._id || 'user_default';
        const role = (parsed.role || localStorage.getItem('bypass_user_role') || 'admin').toLowerCase().trim();
        const name = parsed.name || parsed.displayName || localStorage.getItem('bypass_user_name') || 'User';
        const email = parsed.email || localStorage.getItem('bypass_user_email') || `${id}@stantonys.edu`;
        return {
          ...parsed,
          uid: id,
          id: id,
          _id: parsed._id || id,
          role,
          name,
          displayName: name,
          email,
          token: parsed.token || localStorage.getItem('auth_jwt_token') || '',
          photoURL: parsed.photoURL || localStorage.getItem('bypass_user_photo') || '',
          emailVerified: true,
          status: parsed.status || 'active'
        };
      }
    }
  } catch (e) {}
  return null;
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isAccountant: boolean;
  isClerk: boolean;
  isReceptionist: boolean;
  isParent: boolean;
  isVicePrincipal: boolean;
  isPrincipal: boolean;
  hasPermission: (permission: Permission) => boolean;
  teacherAssignments: {
    classId?: string;
    batchId?: string;
    subjects: string[];
  } | null;
  availableProfiles: UserProfile[];
  switchProfile: (profileId: string) => Promise<void>;
  login: (userData: any, token?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getInitialStoredUser() as any);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const u = getInitialStoredUser();
    return u ? (u as unknown as UserProfile) : null;
  });
  const [availableProfiles, setAvailableProfiles] = useState<UserProfile[]>(() => {
    const u = getInitialStoredUser();
    return u ? [u as unknown as UserProfile] : [];
  });
  const availableProfilesRef = React.useRef(availableProfiles);
  useEffect(() => {
    availableProfilesRef.current = availableProfiles;
  }, [availableProfiles]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Permission[]>(() => {
    const u = getInitialStoredUser();
    if (!u) return [];
    const roleKey = normalizeRole(u.role);
    return ROLE_PERMISSIONS[roleKey as Role] || ROLE_PERMISSIONS.student || [];
  });
  const [loading, setLoading] = useState<boolean>(() => !getInitialStoredUser());

  // Stabilize permissions state
  const setStablePermissions = React.useCallback((newPerms: Permission[]) => {
    setRolePermissions(prev => {
      if (JSON.stringify(prev) === JSON.stringify(newPerms)) return prev;
      return newPerms;
    });
  }, []);

  // Stabilize profile state
  const setStableProfile = React.useCallback((newProfile: UserProfile | null) => {
    if (newProfile) {
      sessionStorage.setItem('auth_current_user_role', newProfile.role || '');
      sessionStorage.setItem('auth_user_email', newProfile.email || '');
    } else {
      sessionStorage.removeItem('auth_current_user_role');
      sessionStorage.removeItem('auth_user_email');
    }
    setProfile(prev => {
      if (!prev && !newProfile) return null;
      if (prev && newProfile && JSON.stringify(prev) === JSON.stringify(newProfile)) return prev;
      return newProfile;
    });
  }, []);

  // Stabilize profiles state
  const setStableAvailableProfiles = React.useCallback((profiles: UserProfile[]) => {
    if (profiles && profiles.length > 0) {
      const ids = profiles.map(p => p.id || p.uid || (p as any).studentId).filter(Boolean);
      sessionStorage.setItem('auth_allowed_profile_ids', JSON.stringify(ids));
    } else {
      sessionStorage.removeItem('auth_allowed_profile_ids');
    }
    setAvailableProfiles(prev => {
      if (JSON.stringify(prev) === JSON.stringify(profiles)) return prev;
      return profiles;
    });
  }, []);

  // Login method to instantly store user and navigate to dashboard without Firebase auth dependence
  const login = React.useCallback((userData: any, explicitToken?: string) => {
    if (!userData) return;
    const token = explicitToken || userData.token || localStorage.getItem('auth_jwt_token') || '';
    const id = userData.id || userData.uid || userData._id || 'user_' + Date.now();
    const role = (userData.role || 'admin').toLowerCase().trim();
    const name = userData.name || userData.displayName || 'School Member';
    const email = userData.email || `${id}@stantonys.edu`;
    const photoURL = userData.photoURL || '';

    const sanitizedObj = {
      ...userData,
      id,
      uid: id,
      _id: userData._id || id,
      role,
      name,
      displayName: name,
      email,
      token,
      photoURL,
      status: userData.status || 'active'
    };

    try {
      localStorage.setItem('auth_user', JSON.stringify(sanitizedObj));
      localStorage.setItem('bypass_user_profile', JSON.stringify(sanitizedObj));
      localStorage.setItem('bypass_user_uid', id);
      localStorage.setItem('bypass_user_name', name);
      localStorage.setItem('bypass_user_email', email);
      localStorage.setItem('bypass_user_role', role);
      localStorage.setItem('bypass_user_photo', photoURL);
      localStorage.setItem('auth_current_user_role', role);
      if (token) {
        localStorage.setItem('auth_jwt_token', token);
      }
      localStorage.setItem('last_app_activity', Date.now().toString());
    } catch (e) {
      console.warn('[AuthContext] storage error:', e);
    }

    const roleKey = normalizeRole(role);
    const perms = ROLE_PERMISSIONS[roleKey as Role] || ROLE_PERMISSIONS.student || [];

    setUser(sanitizedObj as any);
    setStableProfile(sanitizedObj as any);
    setStableAvailableProfiles([sanitizedObj as any]);
    setStablePermissions(perms);
    setLoading(false);

    try {
      if (typeof triggerAuthStateChanged === 'function') {
        triggerAuthStateChanged();
      }
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  }, [setStableProfile, setStableAvailableProfiles, setStablePermissions]);

  useEffect(() => {
    // Strictly use in-memory persistence to avoid browser disk/cookies
    setPersistence(auth, inMemoryPersistence).catch(err => {
      console.warn("Auth persistence error:", err);
    });

    let hasFired = false;
    const checkBypassAndSetUser = (firebaseUser: User | null, fromSubscription = false) => {
      const stored = getInitialStoredUser();
      if (stored) {
        setUser(stored as any);
        setStableProfile(stored as any);
        setStableAvailableProfiles([stored as any]);
        const roleKey = normalizeRole(stored.role);
        setStablePermissions(ROLE_PERMISSIONS[roleKey as Role] || ROLE_PERMISSIONS.student || []);
        setLoading(false);
        return;
      }

      if (firebaseUser) {
        const fUser = {
          ...firebaseUser,
          id: firebaseUser.uid || 'user',
          uid: firebaseUser.uid || 'user'
        };
        setUser(fUser as any);
        const lastUid = localStorage.getItem('last_auth_uid');
        if (lastUid && lastUid !== firebaseUser.uid) {
          localStorage.removeItem('preferred_profile_id');
          setActiveProfileId(null);
        }
        localStorage.setItem('last_auth_uid', firebaseUser.uid);
      } else {
        setUser(null);
        setStableProfile(null);
        setStableAvailableProfiles([]);
        setStablePermissions([]);
        setActiveProfileId(null);
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      hasFired = true;
      checkBypassAndSetUser(firebaseUser, true);
    });

    // Also call immediately to support synchronous init of bypass session
    checkBypassAndSetUser(auth.currentUser, false);

    return unsubscribe;
  }, [setStableProfile, setStableAvailableProfiles]);

  useEffect(() => {
    if (!user) {
      setStableProfile(null);
      setStableAvailableProfiles([]);
      setStablePermissions([]);
      setLoading(false);
      return;
    }

    // If active stored user or bypass profile exists, hydrate immediately without waiting for remote timeouts
    const stored = getInitialStoredUser();
    if (stored) {
      setStableProfile(stored as any);
      setStableAvailableProfiles([stored as any]);
      const roleKey = normalizeRole(stored.role);
      setStablePermissions(ROLE_PERMISSIONS[roleKey as Role] || ROLE_PERMISSIONS.student || []);
      setLoading(false);
      return;
    }

    const email = user.email ? user.email.toLowerCase().trim() : '';
    if (email) {
      // 1. Fetch user records matching email or parentEmail
      const q1 = dbService.list('users', [where('email', '==', email)]);
      const q2 = dbService.list('users', [where('parentEmail', '==', email)]);
      
      // 2. Fetch raw student & staff records matching email or parentEmail
      const q3 = dbService.list('students', [where('parentEmail', '==', email)]);
      const q4 = dbService.list('students', [where('email', '==', email)]);
      const q5 = dbService.list('staff', [where('email', '==', email)]);

      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('firestore_timeout')), 2500));
      Promise.race([Promise.all([q1, q2, q3, q4, q5]), timeoutPromise]).then(async (results: any) => {
        const usersAll = [...results[0], ...results[1]] as any[];
        const studentsAll = [...results[2], ...results[3]] as any[];
        const staffAll = (results[4] || []) as any[];

        // Combine unique user accounts by id/uid and prevent duplicate accounts of the same student
        const usersMap = new Map<string, any>();
        usersAll.forEach(u => {
          const key = u.uid || u.id;
          if (!key) return;

          // Check if there is an existing student profile for the same student
          const uRole = normalizeRole(u.role);
          if (uRole === 'student') {
            const uEmail = String(u.email || '').toLowerCase().trim();
            const uName = String(u.name || u.displayName || '').toLowerCase().trim();
            const existing = Array.from(usersMap.values()).find(ex => {
              if (normalizeRole(ex.role) !== 'student') return false;
              const exEmail = String(ex.email || '').toLowerCase().trim();
              const exName = String(ex.name || ex.displayName || '').toLowerCase().trim();
              
              if (uEmail && exEmail && uEmail === exEmail) {
                if (uName === exName || !uName || !exName) return true;
              }
              if (u.admissionNumber && ex.admissionNumber && u.admissionNumber === ex.admissionNumber) return true;
              if (u.rollNumber && ex.rollNumber && u.rollNumber === ex.rollNumber) return true;
              return false;
            });

            if (existing) {
              Object.assign(existing, u);
              return;
            }
          }

          usersMap.set(key, u);
        });

        // Add matching staff profiles to usersMap if not already present
        staffAll.forEach(st => {
          const staffKey = st.id || st.uid;
          if (staffKey) {
            const existing = usersMap.get(staffKey);
            if (existing) {
              Object.assign(existing, { role: st.role || existing.role || 'teacher', ...st });
            } else {
              usersMap.set(staffKey, {
                uid: staffKey,
                id: staffKey,
                name: st.name || user.displayName || 'Teacher',
                email: st.email || email,
                role: st.role || 'teacher',
                ...st
              });
            }
          }
        });

        // For each student record, if they don't have a user record, synthesize one as a child profile
        studentsAll.forEach(s => {
          const studentKey = s.id || s.uid;
          if (studentKey && !usersMap.has(studentKey)) {
            // Check if there is an existing user account in usersMap under their email or name to avoid duplicating
            const sEmail = String(s.email || '').toLowerCase().trim();
            const sName = String(s.name || s.displayName || '').toLowerCase().trim();
            const existingUser = Array.from(usersMap.values()).find(
              u => (sEmail && u.email?.toLowerCase().trim() === sEmail) ||
                   (sName && u.name?.toLowerCase().trim() === sName && u.role === 'student')
            );
            if (!existingUser) {
              usersMap.set(studentKey, {
                uid: studentKey,
                id: studentKey,
                name: s.name,
                email: s.email || `${studentKey}@school.com`,
                role: 'student',
                classId: s.classId || '',
                batchId: s.batchId || '',
                isVirtual: true,
                ...s
              });
            }
          }
        });

        let unique = Array.from(usersMap.values()) as UserProfile[];

        const isSystem = isSystemAccount(email);
        const sysRole = isSystem ? getSystemAccountRole(email) : '';

        // Check for existing profile in local state
        let staffProf = unique.find(p => p.email?.toLowerCase().trim() === email || p.uid === user.uid || p.id === user.uid);
        
        let foundDoc: any = null;
        if (!staffProf) {
          try {
            const staffDocs = await dbService.list('staff', [where('email', '==', email)]);
            const userDocs = await dbService.list('users', [where('email', '==', email)]);
            foundDoc = staffDocs?.[0] || userDocs?.[0];
          } catch (e) {}
        }

        const existingDbRole = staffProf?.role || foundDoc?.role || '';
        const normalizedDbRole = (existingDbRole || '').toLowerCase().trim();

        const isAccountantAcc = normalizedDbRole === 'accountant' || sysRole === 'accountant' || email.includes('accountant') || (user.displayName || '').toLowerCase().includes('accountant');
        const isClerkAcc = normalizedDbRole === 'clerk' || sysRole === 'clerk' || email.includes('clerk') || (user.displayName || '').toLowerCase().includes('clerk');
        const isReceptionistAcc = normalizedDbRole === 'receptionist' || sysRole === 'receptionist' || email.includes('reception') || (user.displayName || '').toLowerCase().includes('reception');
        const isDriverAcc = normalizedDbRole === 'driver' || sysRole === 'driver' || email.includes('driver') || (user.displayName || '').toLowerCase().includes('driver');
        const isDoctorAcc = normalizedDbRole === 'doctor' || sysRole === 'doctor' || email.includes('doctor') || (user.displayName || '').toLowerCase().includes('doctor');
        
        const isExplicitNonTeacher = isAccountantAcc || isClerkAcc || isReceptionistAcc || isDriverAcc || isDoctorAcc ||
          ['accountant', 'clerk', 'receptionist', 'driver', 'doctor', 'admin', 'super_admin', 'principal', 'vice_principal', 'student', 'parent', 'warden', 'hostel_warden', 'attendant', 'helper', 'aya'].includes(normalizedDbRole);

        // Self-Healing only for designated system teacher email accounts (e.g. stantonys3m@gmail.com)
        const isTeacherAcc = !isExplicitNonTeacher && (
                             isTeacherAccountOrEmail(email) || 
                             normalizedDbRole === 'teacher_class' || 
                             normalizedDbRole === 'teacher_subject' || 
                             normalizedDbRole === 'teacher');
        const systemTeacherInfo = isTeacherAcc ? getSystemTeacherProfile(email) : null;
        
        const isStaffAcc = isTeacherAcc || isAccountantAcc || isClerkAcc || isReceptionistAcc || isDriverAcc || isDoctorAcc || 
                           isStaffRole(normalizedDbRole) || isStaffRole(sysRole) || isStaffAccountOrEmail(email, normalizedDbRole || sysRole, user.displayName);

        // CRITICAL: If user ALREADY has a role in Firestore, NEVER overwrite it!
        let targetStaffRole = (existingDbRole && existingDbRole !== 'staff') ? existingDbRole :
                              isTeacherAcc ? (normalizedDbRole === 'teacher_subject' ? 'teacher_subject' : 'teacher_class') :
                              isAccountantAcc ? 'accountant' :
                              isClerkAcc ? 'clerk' :
                              isReceptionistAcc ? 'receptionist' :
                              isDriverAcc ? 'driver' :
                              isDoctorAcc ? 'doctor' :
                              (isStaffRole(sysRole) ? sysRole : (isSystem ? sysRole : (existingDbRole || 'staff')));

        if (isStaffAcc) {
          // Purge any accidental student profile for this email or uid
          unique = unique.filter(p => {
            const pRole = normalizeRole(p.role);
            if ((pRole === 'student' || pRole === 'parent') && (p.email?.toLowerCase().trim() === email || p.uid === user.uid || p.id === user.uid || String(p.id).startsWith('student_'))) {
              if (p.id) dbService.delete('students', p.id).catch(() => {});
              if (p.uid) dbService.delete('students', p.uid).catch(() => {});
              return false;
            }
            return true;
          });

          if (!staffProf && foundDoc) {
            staffProf = {
              ...foundDoc,
              uid: user.uid,
              id: user.uid,
              email: email,
              role: (foundDoc.role && foundDoc.role !== 'staff' ? foundDoc.role : targetStaffRole) as any,
              status: 'active'
            };
          }

          if (!staffProf) {
            const staffName = systemTeacherInfo?.name || user.displayName || (email.split('@')[0] ? email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1) : (isTeacherAcc ? 'Class Teacher' : isAccountantAcc ? 'Accountant' : 'Staff'));
            const dept = systemTeacherInfo?.department || (isAccountantAcc ? 'Accounts & Finance' : isReceptionistAcc ? 'Front Office' : isClerkAcc ? 'Administration' : isDriverAcc ? 'Transport' : isDoctorAcc ? 'Health & Medical' : 'High School');
            const desig = systemTeacherInfo?.designation || (isTeacherAcc ? 'Class Teacher' : isAccountantAcc ? 'Accountant' : isReceptionistAcc ? 'Receptionist' : isClerkAcc ? 'Clerk' : isDriverAcc ? 'Driver' : isDoctorAcc ? 'Medical Officer' : 'Staff');

            staffProf = {
              uid: user.uid,
              id: user.uid,
              email: email,
              name: staffName,
              role: targetStaffRole as any,
              status: 'active',
              department: dept,
              designation: desig,
              gender: systemTeacherInfo?.gender || 'Other',
              qualification: systemTeacherInfo?.qualification || (isAccountantAcc ? 'M.Com, CA Inter' : 'B.Sc, B.Ed'),
              experience: systemTeacherInfo?.experience || '5 Years',
              ...(isTeacherAcc ? {
                subjects: systemTeacherInfo?.subjects || ['English', 'Mathematics'],
                teachingClasses: systemTeacherInfo?.teachingClasses || ['Class 3'],
                class: systemTeacherInfo?.class || 'Class 3',
                section: systemTeacherInfo?.section || 'M',
                classTeacherBatchName: systemTeacherInfo?.classTeacherBatchName || 'M-Batch'
              } : {}),
              createdAt: new Date().toISOString()
            };
            unique = [staffProf];
          } else {
            // Preserve existing role if set!
            const preservedRole = (staffProf.role && staffProf.role !== 'staff') ? staffProf.role : targetStaffRole;
            staffProf.role = preservedRole as any;
            targetStaffRole = preservedRole;

            if (isTeacherAcc && systemTeacherInfo) {
              // Only fallback to systemTeacherInfo if name is completely missing or generic placeholder
              const currentName = staffProf.name || (staffProf as any).displayName || '';
              if (!currentName || currentName === 'Staff Member' || isKnownDemoName(currentName)) {
                staffProf.name = systemTeacherInfo.name;
              }
              if (!staffProf.designation) staffProf.designation = systemTeacherInfo.designation;
              if (!staffProf.department) staffProf.department = systemTeacherInfo.department;
              if (systemTeacherInfo.gender && !staffProf.gender) staffProf.gender = systemTeacherInfo.gender;
              if (systemTeacherInfo.qualification && !staffProf.qualification) staffProf.qualification = systemTeacherInfo.qualification;
              if (systemTeacherInfo.experience && !staffProf.experience) staffProf.experience = systemTeacherInfo.experience;
              if (systemTeacherInfo.subjects && (!staffProf.subjects || staffProf.subjects.length === 0)) staffProf.subjects = systemTeacherInfo.subjects;
              if (systemTeacherInfo.teachingClasses && (!staffProf.teachingClasses || staffProf.teachingClasses.length === 0)) staffProf.teachingClasses = systemTeacherInfo.teachingClasses;
              if (systemTeacherInfo.class && !(staffProf as any).class) (staffProf as any).class = systemTeacherInfo.class;
              if (systemTeacherInfo.section && !(staffProf as any).section) (staffProf as any).section = systemTeacherInfo.section;
              if (systemTeacherInfo.classTeacherBatchName && !(staffProf as any).classTeacherBatchName) (staffProf as any).classTeacherBatchName = systemTeacherInfo.classTeacherBatchName;
            } else if (isAccountantAcc) {
              staffProf.department = staffProf.department || 'Accounts & Finance';
              staffProf.designation = staffProf.designation || 'Accountant';
            }
            unique = [staffProf];
          }

          // Update localStorage and safely sync role
          localStorage.setItem('bypass_user_role', targetStaffRole);
          try {
            const syncPayload: any = {
              role: targetStaffRole,
              name: staffProf!.name,
              designation: staffProf!.designation,
              department: staffProf!.department,
              updatedAt: new Date().toISOString()
            };
            if (systemTeacherInfo?.gender) syncPayload.gender = systemTeacherInfo.gender;
            if (systemTeacherInfo?.qualification) syncPayload.qualification = systemTeacherInfo.qualification;
            if (systemTeacherInfo?.experience) syncPayload.experience = systemTeacherInfo.experience;
            if (systemTeacherInfo?.subjects) syncPayload.subjects = systemTeacherInfo.subjects;
            if (systemTeacherInfo?.teachingClasses) syncPayload.teachingClasses = systemTeacherInfo.teachingClasses;
            if (systemTeacherInfo?.class) syncPayload.class = systemTeacherInfo.class;
            if (systemTeacherInfo?.section) syncPayload.section = systemTeacherInfo.section;
            if (systemTeacherInfo?.classTeacherBatchName) syncPayload.classTeacherBatchName = systemTeacherInfo.classTeacherBatchName;

            dbService.update('users', user.uid, syncPayload).catch(() => {
              dbService.set('users', user.uid, {
                uid: user.uid,
                id: user.uid,
                email: email,
                name: staffProf!.name || 'Staff Member',
                role: targetStaffRole,
                status: 'active',
                ...syncPayload,
                updatedAt: new Date().toISOString()
              }).catch(() => {});
            });

            dbService.update('staff', user.uid, syncPayload).catch(() => {
              dbService.set('staff', user.uid, {
                uid: user.uid,
                id: user.uid,
                email: email,
                name: staffProf!.name || 'Staff Member',
                role: targetStaffRole,
                status: 'active',
                ...syncPayload,
                updatedAt: new Date().toISOString()
              }).catch(() => {});
            });

            // If class teacher, auto-link batch to teacher's user.uid
            if (isTeacherAcc) {
              dbService.list('batches').then((batchesList: any[]) => {
                if (batchesList && batchesList.length > 0) {
                  const targetClass = systemTeacherInfo?.class || (staffProf as any)?.class;
                  const targetSection = systemTeacherInfo?.section || (staffProf as any)?.section;
                  const targetBatchName = systemTeacherInfo?.classTeacherBatchName || (staffProf as any)?.classTeacherBatchName;

                  const matchedBatch = batchesList.find((b: any) => 
                    b.classTeacherId === user.uid ||
                    (targetBatchName && (b.name === targetBatchName || b.batchName === targetBatchName)) ||
                    (targetClass && targetSection && b.className === targetClass && b.section === targetSection)
                  );

                  if (matchedBatch && matchedBatch.classTeacherId !== user.uid) {
                    dbService.update('batches', matchedBatch.id, {
                      classTeacherId: user.uid,
                      classTeacherName: staffProf!.name || 'Class Teacher'
                    }).catch(() => {});
                  }
                }
              }).catch(() => {});
            }

            dbService.delete('students', user.uid).catch(() => {});
            dbService.delete('students', `student_${email.replace(/[^a-z0-9]/g, '_')}`).catch(() => {});
            dbService.delete('users', `student_${email.replace(/[^a-z0-9]/g, '_')}`).catch(() => {});
          } catch (e) {}
        }

        if (unique.length === 0 && user && email) {
          const bypassRole = localStorage.getItem('bypass_user_role');
          const isTeacherEmail = isTeacherAccountOrEmail(email) || isTeacherAccountOrEmail(user.displayName) || (bypassRole && isTeacherRole(bypassRole));
          const isStaffAccount = isStaffAccountOrEmail(email, bypassRole, user.displayName) || (bypassRole && isStaffRole(bypassRole));
          const isSys = isSystemAccount(email);

          let autoRole = 'student';
          if (isTeacherEmail) {
            autoRole = 'teacher_class';
          } else if (isSys) {
            autoRole = getSystemAccountRole(email);
          } else if (bypassRole && isStaffRole(bypassRole)) {
            autoRole = bypassRole;
          } else if (isStaffAccount) {
            autoRole = getSystemAccountRole(email);
          }

          const sysTeacher = isTeacherEmail ? getSystemTeacherProfile(email) : null;
          const userName = user.displayName || (email.split('@')[0] ? email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1) : (sysTeacher?.name || 'User'));
          const autoProfile: UserProfile = {
            uid: user.uid,
            id: user.uid,
            ...( autoRole === 'student' ? { studentId: user.uid } : {} as any ),
            email: email,
            name: userName,
            role: autoRole as any,
            status: 'active',
            createdAt: new Date().toISOString(),
            ...(sysTeacher ? {
              department: sysTeacher.department,
              designation: sysTeacher.designation,
              gender: sysTeacher.gender,
              qualification: sysTeacher.qualification,
              experience: sysTeacher.experience,
              subjects: sysTeacher.subjects,
              teachingClasses: sysTeacher.teachingClasses,
              class: sysTeacher.class,
              section: sysTeacher.section,
              classTeacherBatchName: sysTeacher.classTeacherBatchName
            } : {})
          };
          unique = [autoProfile];

          try {
            dbService.set('users', user.uid, autoProfile);
            if (autoRole === 'student') {
              dbService.set('students', user.uid, {
                ...autoProfile,
                admissionNumber: `ADM-${Math.floor(1000 + Math.random() * 9000)}`,
                rollNumber: `STU-${Math.floor(100 + Math.random() * 900)}`,
                academicYear: '2025-2026',
                class: 'Class 1',
                section: 'A'
              });
            } else {
              dbService.set('staff', user.uid, {
                ...autoProfile,
                department: sysTeacher?.department || (autoRole === 'accountant' ? 'Accounts & Finance' : autoRole === 'receptionist' ? 'Front Office' : autoRole === 'clerk' ? 'Administration' : autoRole === 'driver' ? 'Transport' : autoRole === 'doctor' ? 'Health & Medical' : (autoRole === 'teacher_class' ? 'Teaching' : 'Staff')),
                designation: sysTeacher?.designation || (autoRole === 'teacher_class' ? 'Class Teacher' : autoRole === 'accountant' ? 'Accountant' : autoRole === 'receptionist' ? 'Receptionist' : autoRole === 'clerk' ? 'Clerk' : autoRole === 'driver' ? 'Driver' : autoRole === 'doctor' ? 'Medical Officer' : 'Staff'),
                qualification: sysTeacher?.qualification || '',
                experience: sysTeacher?.experience || ''
              });
              dbService.delete('students', user.uid).catch(() => {});
              dbService.delete('students', `student_${email.replace(/[^a-z0-9]/g, '_')}`).catch(() => {});
            }
          } catch (e) {
            console.error('[AuthContext] Auto-provisioning user error:', e);
          }
        }
        
        try {
          const resolved = await Promise.all(
            unique.map(async (p) => {
              const pRole = normalizeRole(p.role);
              const pEmail = p.email?.toLowerCase().trim();
              const pId = p.id || p.uid;
              const isStaff = isStaffRole(pRole) || isStaffAccountOrEmail(pEmail, pRole, p.name);

              if (pRole === 'student' && !isStaff) {
                // Prioritize in-memory match from studentsAll that we already fetched
                let studentDoc = studentsAll.find(s => 
                  (pId && (s.id === pId || s.uid === pId)) ||
                  (pEmail && s.email?.toLowerCase().trim() === pEmail) ||
                  (p.name && s.name === p.name)
                );

                if (!studentDoc) {
                  if (pEmail) {
                    const byEmail = await dbService.list('students', [where('email', '==', pEmail)]);
                    if (byEmail && byEmail.length > 0) {
                      studentDoc = byEmail[0];
                    }
                  }
                  if (!studentDoc && p.name) {
                    const byName = await dbService.list('students', [where('name', '==', p.name)]);
                    if (byName && byName.length > 0) {
                      studentDoc = byName[0];
                    }
                  }
                }

                if (studentDoc) {
                  return {
                    ...p,
                    ...studentDoc,
                    id: studentDoc.id || studentDoc.uid,
                    studentId: studentDoc.id || studentDoc.uid,
                    uid: p.uid || p.id
                  };
                }
              } else if (pRole !== 'parent' || isStaff) {
                // Resolve detailed staff profile for teacher/staff/accountant/clerk/etc.
                let staffDoc = staffAll.find(st =>
                  (pId && (st.id === pId || st.uid === pId)) ||
                  (pEmail && st.email?.toLowerCase().trim() === pEmail)
                );

                if (!staffDoc && pEmail) {
                  const byEmail = await dbService.list('staff', [where('email', '==', pEmail)]);
                  if (byEmail && byEmail.length > 0) {
                    staffDoc = byEmail[0];
                  }
                }

                if (staffDoc) {
                  const isTeacher = isTeacherRole(staffDoc.role || pRole, pEmail, staffDoc.name || p.name);
                  const sysTeacher = (isTeacher && pEmail) ? SYSTEM_TEACHER_PROFILES[pEmail] : null;
                  const finalName = staffDoc.name || p.name || (p as any).displayName || sysTeacher?.name || '';
                  return {
                    ...p,
                    ...staffDoc,
                    name: finalName,
                    role: staffDoc.role || p.role || (isTeacher ? 'teacher_class' : 'staff'),
                    designation: staffDoc.designation || p.designation || sysTeacher?.designation || (isTeacher ? 'Class Teacher' : 'Staff'),
                    department: staffDoc.department || p.department || sysTeacher?.department || 'Primary',
                    gender: staffDoc.gender || p.gender || sysTeacher?.gender || 'Female',
                    qualification: staffDoc.qualification || p.qualification || sysTeacher?.qualification || '',
                    experience: staffDoc.experience || p.experience || sysTeacher?.experience || '',
                    subjects: (staffDoc.subjects && staffDoc.subjects.length > 0) ? staffDoc.subjects : (p.subjects || sysTeacher?.subjects || []),
                    teachingClasses: (staffDoc.teachingClasses && staffDoc.teachingClasses.length > 0) ? staffDoc.teachingClasses : (p.teachingClasses || sysTeacher?.teachingClasses || []),
                    class: staffDoc.class || p.class || sysTeacher?.class || '',
                    section: staffDoc.section || p.section || sysTeacher?.section || '',
                    classTeacherBatchName: staffDoc.classTeacherBatchName || p.classTeacherBatchName || sysTeacher?.classTeacherBatchName || '',
                    id: staffDoc.id || staffDoc.uid,
                    uid: p.uid || p.id
                  };
                }
              }
              return p;
            })
          );

          resolved.sort((a, b) => {
            const isAUidMatch = (a.uid === user.uid || a.id === user.uid);
            const isBUidMatch = (b.uid === user.uid || b.id === user.uid);
            if (isAUidMatch && !isBUidMatch) return -1;
            if (!isAUidMatch && isBUidMatch) return 1;

            const roleA = normalizeRole(a.role);
            const roleB = normalizeRole(b.role);
            const isAStaff = isStaffRole(roleA) || isStaffAccountOrEmail(a.email, roleA, a.name);
            const isBStaff = isStaffRole(roleB) || isStaffAccountOrEmail(b.email, roleB, b.name);

            // Admin first
            const isAAdmin = roleA === 'admin' || roleA === 'super_admin';
            const isBAdmin = roleB === 'admin' || roleB === 'super_admin';
            if (isAAdmin && !isBAdmin) return -1;
            if (!isAAdmin && isBAdmin) return 1;

            // Principal / Vice Principal next
            const isAPrinc = roleA === 'principal' || roleA === 'vice_principal';
            const isBPrinc = roleB === 'principal' || roleB === 'vice_principal';
            if (isAPrinc && !isBPrinc) return -1;
            if (!isAPrinc && isBPrinc) return 1;

            // Teacher next
            const isATeacher = roleA.includes('teacher') || isTeacherAccountOrEmail(a.email) || isTeacherAccountOrEmail(a.name);
            const isBTeacher = roleB.includes('teacher') || isTeacherAccountOrEmail(b.email) || isTeacherAccountOrEmail(b.name);
            if (isATeacher && !isBTeacher) return -1;
            if (!isATeacher && isBTeacher) return 1;

            // Other staff (accountant, clerk, receptionist, driver, etc.) before students/parents
            if (isAStaff && !isBStaff) return -1;
            if (!isAStaff && isBStaff) return 1;

            return 0;
          });

          setStableAvailableProfiles(resolved);
          if (resolved.length > 0) {
            setStableProfile(resolved[0]);
          }
          setLoading(false);
        } catch (error) {
          console.error("Error matching student credentials:", error);
          setStableAvailableProfiles(unique);
          if (unique.length > 0) {
            setStableProfile(unique[0]);
          }
          setLoading(false);
        }
      }).catch((error) => {
        console.error("Fatal error loading user profiles during auth setup:", error);
        
        // Safety fallback 1: Check stored bypass profile
        const savedBypassStr = localStorage.getItem('bypass_user_profile');
        if (savedBypassStr) {
          try {
            const parsed = JSON.parse(savedBypassStr);
            if (parsed && (parsed.email || parsed.id)) {
              setStableAvailableProfiles([parsed]);
              setStableProfile(parsed);
              setLoading(false);
              return;
            }
          } catch (e) {}
        }

        // Safety fallback 2: if it's a known system account, construct a temporary profile
        if (isSystemAccount(email)) {
          const systemRole = getSystemAccountRole(email);
          const fallbackProfile: UserProfile = {
            uid: user.uid,
            id: user.uid,
            email: email,
            name: user.displayName || email.split('@')[0],
            role: systemRole as any,
            status: 'active',
            createdAt: new Date().toISOString()
          };
          setStableAvailableProfiles([fallbackProfile]);
          setStableProfile(fallbackProfile);
        } else {
          // Construct fallback user profile for normal email users so they are not rejected by PrivateRoute
          const bypassRole = localStorage.getItem('bypass_user_role');
          const isStaff = isStaffAccountOrEmail(email, bypassRole, user.displayName) || (bypassRole && isStaffRole(bypassRole));
          const finalRole = isStaff ? (bypassRole || getSystemAccountRole(email)) : (bypassRole || 'student');
          const fallbackProfile: UserProfile = {
            uid: user.uid,
            id: user.uid,
            email: email,
            name: user.displayName || localStorage.getItem('bypass_user_name') || email.split('@')[0],
            role: finalRole as any,
            status: 'active',
            createdAt: new Date().toISOString()
          };
          setStableAvailableProfiles([fallbackProfile]);
          setStableProfile(fallbackProfile);
        }
        setLoading(false);
      }).catch((err) => {
        console.warn("[AuthContext] Profile synchronization notice (using fallback):", err);
        const savedProfileStr = localStorage.getItem('bypass_user_profile');
        if (savedProfileStr) {
          try {
            const p = JSON.parse(savedProfileStr);
            if (p) {
              setStableProfile(p);
              setStableAvailableProfiles([p]);
            }
          } catch (e) {}
        }
        setLoading(false);
      });
    }
  }, [user?.email, setStableAvailableProfiles, setStableProfile, setStablePermissions]);

  useEffect(() => {
    if (!user || availableProfiles.length === 0) return;
    
    const preferredId = activeProfileId || localStorage.getItem('preferred_profile_id');
    if (!preferredId) {
      const bypassRole = (localStorage.getItem('bypass_user_role') || '').toLowerCase().trim();
      const isUserTeacher = isTeacherAccountOrEmail(user.email) || isTeacherAccountOrEmail(user.displayName) || isTeacherRole(profile?.role || '', user.email || '', user.displayName || '') || isTeacherRole(bypassRole);
      const isUserAccountant = bypassRole === 'accountant' || (user.email || '').toLowerCase().includes('accountant') || (user.displayName || '').toLowerCase().includes('accountant');
      const isUserClerk = bypassRole === 'clerk' || (user.email || '').toLowerCase().includes('clerk') || (user.displayName || '').toLowerCase().includes('clerk');
      const isUserReceptionist = bypassRole === 'receptionist' || (user.email || '').toLowerCase().includes('reception') || (user.displayName || '').toLowerCase().includes('reception');
      const isUserStaff = isStaffAccountOrEmail(user.email, profile?.role || bypassRole, user.displayName) || isStaffRole(profile?.role || bypassRole);

      const authMatched = availableProfiles.find(p => (p.uid || (p as any).id) === user.uid);
      const adminProfile = availableProfiles.find(p => normalizeRole(p.role) === 'admin' || normalizeRole(p.role) === 'super_admin');
      const teacherProfile = availableProfiles.find(p => normalizeRole(p.role).includes('teacher') || isTeacherRole(p.role, p.email, p.name) || isTeacherAccountOrEmail(p.email) || isTeacherAccountOrEmail(p.name));
      const accountantProfile = availableProfiles.find(p => normalizeRole(p.role) === 'accountant' || (p.email && p.email.toLowerCase().includes('accountant')));
      const clerkProfile = availableProfiles.find(p => normalizeRole(p.role) === 'clerk' || (p.email && p.email.toLowerCase().includes('clerk')));
      const receptionistProfile = availableProfiles.find(p => normalizeRole(p.role) === 'receptionist' || (p.email && p.email.toLowerCase().includes('reception')));
      const staffProfile = availableProfiles.find(p => isStaffRole(p.role) || isStaffAccountOrEmail(p.email, p.role, p.name));

      let targetId = '';
      if (authMatched && (isStaffRole(authMatched.role) || !staffProfile)) {
        targetId = authMatched.uid || (authMatched as any).id;
      } else if (isUserAccountant && accountantProfile) {
        targetId = accountantProfile.uid || (accountantProfile as any).id;
      } else if (isUserTeacher && teacherProfile) {
        targetId = teacherProfile.uid || (teacherProfile as any).id;
      } else if (isUserClerk && clerkProfile) {
        targetId = clerkProfile.uid || (clerkProfile as any).id;
      } else if (isUserReceptionist && receptionistProfile) {
        targetId = receptionistProfile.uid || (receptionistProfile as any).id;
      } else if (adminProfile && (isSystemAccount(user.email) || bypassRole === 'admin' || bypassRole === 'super_admin')) {
        targetId = adminProfile.uid || (adminProfile as any).id;
      } else if (accountantProfile && isUserStaff) {
        targetId = accountantProfile.uid || (accountantProfile as any).id;
      } else if (teacherProfile && isUserStaff) {
        targetId = teacherProfile.uid || (teacherProfile as any).id;
      } else if (staffProfile) {
        targetId = staffProfile.uid || (staffProfile as any).id;
      } else {
        const studentProfile = availableProfiles.find(p => normalizeRole(p.role) === 'student');
        const anyProfile = availableProfiles[0];
        targetId = studentProfile?.uid || (studentProfile as any)?.id || anyProfile?.uid || (anyProfile as any)?.id;
      }

      if (targetId && targetId !== activeProfileId) {
        setActiveProfileId(targetId);
      }
    }
  }, [user?.uid, user?.email, JSON.stringify(availableProfiles), activeProfileId]);

  // Proactive Sibling Finder & Auto-Merging for Student Portal
  useEffect(() => {
    if (!user || !profile || normalizeRole(profile.role) !== 'student') return;

    const pAsAny = profile as any;
    const currentStudentId = pAsAny.id || pAsAny.uid || pAsAny.studentId;
    if (!currentStudentId) return;

    const searchSiblings = async () => {
      try {
        const studentEmail = String(profile.email || '').toLowerCase().trim();
        const parentEmail = String((profile as any).parentEmail || '').toLowerCase().trim();
        const parentPhone = String((profile as any).parentPhone || (profile as any).phone || (profile as any).fatherPhone || '').trim();
        const fatherName = String((profile as any).fatherName || '').trim();

        const studentQueries: Promise<any[]>[] = [];

        if (parentEmail && parentEmail.includes('@')) {
          studentQueries.push(dbService.list('students', [where('parentEmail', '==', parentEmail)]));
          studentQueries.push(dbService.list('students', [where('email', '==', parentEmail)]));
        }
        if (studentEmail && studentEmail.includes('@') && studentEmail !== parentEmail) {
          studentQueries.push(dbService.list('students', [where('parentEmail', '==', studentEmail)]));
          studentQueries.push(dbService.list('students', [where('email', '==', studentEmail)]));
        }
        if (parentPhone && parentPhone.length >= 10) {
          studentQueries.push(dbService.list('students', [where('parentPhone', '==', parentPhone)]));
        }
        if (fatherName && fatherName.length >= 3) {
          studentQueries.push(dbService.list('students', [where('fatherName', '==', fatherName)]));
          
          // Add variations without dot/init suffixes for father queries if needed
          const cleanedFatherBase = fatherName.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
          const parts = cleanedFatherBase.split(' ');
          if (parts.length > 1) {
            const baseWithNoInitials = parts.filter(p => p.length > 1).join(' ');
            if (baseWithNoInitials && baseWithNoInitials !== cleanedFatherBase) {
              studentQueries.push(dbService.list('students', [where('fatherName', '==', baseWithNoInitials)]));
            }
          }
        }

        const results = await Promise.all(studentQueries);
        const resolvedStudents = results.flat();

        const cleanString = (val: string) => {
          return String(val || '')
            .toLowerCase()
            .replace(/\./g, ' ')               // Replace dots with spaces
            .replace(/\b[a-z]\b/g, ' ')         // Remove single letter initials
            .replace(/[^a-z]/g, '')            // Keep only letters
            .trim();
        };

        const currentSecondNameVal = cleanString((profile as any).secondName || (profile as any).lastName || '');
        const currentVillageVal = cleanString((profile as any).village || '');
        const pFather = cleanString(fatherName);

        const uniqueStudentsMap = new Map<string, any>();
        resolvedStudents.forEach(s => {
          const key = s.uid || s.id;
          if (!key) return;

          const sEmail = String(s.email || '').toLowerCase().trim();
          const sName = String(s.name || s.displayName || '').toLowerCase().trim();
          const currentEmail = String(profile.email || '').toLowerCase().trim();
          const currentName = String(profile.name || (profile as any).displayName || '').toLowerCase().trim();

          // Ensure student is NOT matched with themselves
          const isSameStudent =
            key === currentStudentId ||
            (sEmail && currentEmail && sEmail === currentEmail && (sName === currentName || !sName || !currentName || sName.includes('demo') || currentName.includes('demo'))) ||
            (s.admissionNumber && (profile as any).admissionNumber && s.admissionNumber === (profile as any).admissionNumber) ||
            (s.rollNumber && (profile as any).rollNumber && s.rollNumber === (profile as any).rollNumber);

          if (isSameStudent) return;

          let isRealSibling = false;
          
          // Check direct contact/email link
          const sParentEmail = String(s.parentEmail || '').toLowerCase().trim();
          const sPhone = String(s.phone || s.parentPhone || s.whatsappNumber || s.contact || '').trim();
          const matchesParentEmail = parentEmail && sParentEmail && sParentEmail === parentEmail && parentEmail.includes('@') && !parentEmail.endsWith('example.com');
          const matchesParentPhone = parentPhone && parentPhone.length >= 10 && sPhone && sPhone.includes(parentPhone.slice(-10));
          
          if (matchesParentEmail || matchesParentPhone) {
            isRealSibling = true;
          } else if (pFather && pFather.length >= 3) {
            const sFather = cleanString(s.fatherName || s.parentName || s.father_name);
            const sSecondName = cleanString(s.secondName || s.lastName || s.surname);
            const sVillage = cleanString(s.village);
            
            const fatherNameMatch = sFather === pFather || sFather.includes(pFather) || pFather.includes(sFather);
            
            // Second name/surname matches (e.g. "kadapa")
            if (fatherNameMatch && currentSecondNameVal && sSecondName && sSecondName === currentSecondNameVal) {
              isRealSibling = true;
            }
            // Village matches or is substring to allow 'krishnampalle' vs 'kristampalle'
            else if (fatherNameMatch && currentVillageVal && sVillage && (sVillage === currentVillageVal || sVillage.includes(currentVillageVal) || currentVillageVal.includes(sVillage))) {
              isRealSibling = true;
            }
          }

          if (isRealSibling) {
            uniqueStudentsMap.set(key, s);
          }
        });

        const siblingsFound = Array.from(uniqueStudentsMap.values()).map(s => {
          const sid = s.uid || s.id;
          return {
            ...s,
            uid: sid,
            id: sid,
            studentId: sid,
            role: 'student',
            isVirtual: true
          };
        });

        if (siblingsFound.length > 0) {
          setAvailableProfiles(prev => {
            const combined = [...prev];
            let changed = false;
            siblingsFound.forEach(sib => {
              const sibEmail = String(sib.email || '').toLowerCase().trim();
              const sibName = String(sib.name || '').toLowerCase().trim();

              const alreadyInPrev = combined.some(p => {
                const pId = p.uid || p.id;
                if (pId === sib.id) return true;
                const pEmail = String(p.email || '').toLowerCase().trim();
                const pName = String(p.name || '').toLowerCase().trim();
                if (sibEmail && pEmail && sibEmail === pEmail && sibName === pName) return true;
                return false;
              });

              if (!alreadyInPrev) {
                combined.push(sib);
                changed = true;
              }
            });
            return changed ? combined : prev;
          });
        }
      } catch (err) {
        console.error("Error searching for student siblings:", err);
      }
    };

    searchSiblings();
  }, [user?.uid, profile?.id, profile?.uid, (profile as any)?.fatherName, (profile as any)?.secondName, (profile as any)?.lastName, (profile as any)?.village, (profile as any)?.parentPhone, (profile as any)?.parentEmail, (profile as any)?.contact, (profile as any)?.whatsappNumber]);

  // అప్‌డేట్ చేయబడిన టూ-స్టెప్ ఈమెయిల్ లోడింగ్ లాజిక్
  useEffect(() => {
    if (!user) return;
    const userEmail = (user.email || '').toLowerCase().trim();
    const isTeacherAcc = isTeacherAccountOrEmail(userEmail) || 
                         isSystemAccount(userEmail) || 
                         isTeacherAccountOrEmail(user.displayName) ||
                         localStorage.getItem('bypass_user_role')?.includes('teacher');
    
    // For teacher accounts, ALWAYS strictly use the active profile or user.uid
    let profileIdToLoad = activeProfileId || user.uid;
    if (!isTeacherAcc) {
      const storedPref = localStorage.getItem('preferred_profile_id');
      if (storedPref && availableProfilesRef.current.some(p => (p.uid || p.id) === storedPref)) {
        profileIdToLoad = storedPref;
      } else if (activeProfileId) {
        profileIdToLoad = activeProfileId;
      }
    } else {
      // Clean any stale preferred_profile_id for teacher accounts
      localStorage.removeItem('preferred_profile_id');
    }

    let unsubscribeProfileDetail: (() => void) | null = null;
    let isCleanedUp = false;

    // Check if the target profile is a virtual student profile
    const matchingProfile = availableProfilesRef.current.find(p => (p.uid || p.id) === profileIdToLoad);
    const isVirtual = matchingProfile?.isVirtual === true;

    if (isVirtual && !isTeacherAcc) {
      setLoading(true);
      // Directly subscribe to the 'students' doc for real-time updates and bypass the restrictive 'users' collection rules entirely
      const unsubscribe = dbService.subscribeDoc('students', profileIdToLoad, (detailData) => {
        if (isCleanedUp) return;
        if (detailData) {
          setStableProfile({
            ...matchingProfile,
            ...detailData,
            id: profileIdToLoad,
            studentId: profileIdToLoad,
            role: 'student',
            uid: profileIdToLoad
          } as any);
        } else {
          setStableProfile(matchingProfile || null);
        }
        setLoading(false);
      }, (studentErr) => {
        if (isCleanedUp) return;
        console.warn("Virtual student live sync failed, using static matching profile:", studentErr);
        setStableProfile(matchingProfile || null);
        setLoading(false);
      });

      return () => {
        isCleanedUp = true;
        unsubscribe();
      };
    }

    const runFallback = async () => {
      if (isCleanedUp) return;

      const fallbackEmail = user.email?.toLowerCase().trim() || '';

      const saveUserDoc = async (profileData: any) => {
        try {
          await dbService.set('users', profileIdToLoad, {
            uid: profileIdToLoad,
            id: profileIdToLoad,
            email: profileData.email || user.email || '',
            name: profileData.name || profileData.parentName || user.displayName || '',
            role: profileData.role || (isTeacherAcc ? 'teacher_class' : 'staff'),
            status: profileData.status || 'active',
            createdAt: profileData.createdAt || new Date().toISOString()
          });
        } catch (e) {
          console.warn("[AuthContext] Failed to auto-sync user document to Firestore:", e);
        }
      };

      if (isTeacherAcc) {
        try {
          const staffDoc = await dbService.get('staff', profileIdToLoad);
          if (staffDoc) {
            if (isCleanedUp) return;
            const sysTeacher = getSystemTeacherProfile(fallbackEmail);
            const pData = {
              ...staffDoc,
              name: staffDoc.name || user.displayName || sysTeacher?.name || fallbackEmail.split('@')[0],
              id: profileIdToLoad,
              role: staffDoc.role || 'teacher_class',
              uid: profileIdToLoad,
              designation: staffDoc.designation || sysTeacher?.designation || 'Class Teacher',
              department: staffDoc.department || sysTeacher?.department || 'Primary',
              gender: staffDoc.gender || sysTeacher?.gender || 'Female',
              qualification: staffDoc.qualification || sysTeacher?.qualification || '',
              experience: staffDoc.experience || sysTeacher?.experience || '',
              subjects: (staffDoc.subjects && staffDoc.subjects.length > 0) ? staffDoc.subjects : (sysTeacher?.subjects || []),
              teachingClasses: (staffDoc.teachingClasses && staffDoc.teachingClasses.length > 0) ? staffDoc.teachingClasses : (sysTeacher?.teachingClasses || []),
              class: staffDoc.class || sysTeacher?.class || '',
              section: staffDoc.section || sysTeacher?.section || '',
              classTeacherBatchName: staffDoc.classTeacherBatchName || sysTeacher?.classTeacherBatchName || ''
            };
            setStableProfile(pData as any);
            setLoading(false);
            await saveUserDoc(pData);
            return;
          }
        } catch (err) {
          console.error("Error in fallback staff direct-ID lookup:", err);
        }

        const sysTeacher = getSystemTeacherProfile(fallbackEmail);
        const pData: UserProfile = {
          uid: profileIdToLoad,
          id: profileIdToLoad,
          email: fallbackEmail,
          name: user.displayName || (fallbackEmail ? fallbackEmail.split('@')[0] : '') || 'Staff Member',
          role: 'teacher_class',
          designation: sysTeacher?.designation || 'Class Teacher',
          department: sysTeacher?.department || 'Teaching',
          gender: sysTeacher?.gender || '',
          qualification: sysTeacher?.qualification || '',
          experience: sysTeacher?.experience || '',
          subjects: sysTeacher?.subjects || [],
          teachingClasses: sysTeacher?.teachingClasses || (sysTeacher?.class ? [sysTeacher.class] : []),
          class: sysTeacher?.class || '',
          section: sysTeacher?.section || '',
          classTeacherBatchName: sysTeacher?.classTeacherBatchName || '',
          status: 'active',
          createdAt: new Date().toISOString()
        };
        setStableProfile(pData);
        setLoading(false);
        await saveUserDoc(pData);
        return;
      }

      const isStaffUser = isStaffAccountOrEmail(fallbackEmail, localStorage.getItem('bypass_user_role'), user.displayName) || isStaffRole(localStorage.getItem('bypass_user_role'));

      if (isStaffUser) {
        try {
          // Direct ID check in staff collection first
          const staffDoc = await dbService.get('staff', profileIdToLoad);
          if (staffDoc) {
            if (isCleanedUp) return;
            const pData = {
              ...staffDoc,
              id: profileIdToLoad,
              role: staffDoc.role || localStorage.getItem('bypass_user_role') || 'staff',
              uid: profileIdToLoad
            };
            setStableProfile(pData as any);
            setLoading(false);
            await saveUserDoc(pData);
            return;
          }
        } catch (err) {
          console.error("Error in fallback staff direct-ID lookup:", err);
        }

        if (fallbackEmail) {
          try {
            const staffDocs = await dbService.list('staff', [where('email', '==', fallbackEmail)]);
            if (staffDocs.length > 0) {
              if (isCleanedUp) return;
              const pData = { 
                ...staffDocs[0], 
                role: staffDocs[0].role || localStorage.getItem('bypass_user_role') || 'staff', 
                uid: profileIdToLoad 
              };
              setStableProfile(pData as UserProfile);
              setLoading(false);
              await saveUserDoc(pData);
              return;
            }
          } catch (err) {
            console.error("Error in fallback staff lookup:", err);
          }
        }
      }

      try {
        // Direct ID check in students collection
        const studentDoc = await dbService.get('students', profileIdToLoad);
        if (studentDoc && !isStaffUser) {
          if (isCleanedUp) return;
          const pData = {
            ...studentDoc,
            id: profileIdToLoad,
            studentId: profileIdToLoad,
            role: 'student',
            uid: profileIdToLoad
          };
          setStableProfile(pData as any);
          setLoading(false);
          await saveUserDoc(pData);
          return;
        }
      } catch (err) {
        console.error("Error in fallback student direct-ID lookup:", err);
      }

      try {
        // Direct ID check in staff collection
        const staffDoc = await dbService.get('staff', profileIdToLoad);
        if (staffDoc) {
          if (isCleanedUp) return;
          const pData = {
            ...staffDoc,
            id: profileIdToLoad,
            role: staffDoc.role || 'staff',
            uid: profileIdToLoad
          };
          setStableProfile(pData as any);
          setLoading(false);
          await saveUserDoc(pData);
          return;
        }
      } catch (err) {
        console.error("Error in fallback staff direct-ID lookup:", err);
      }

      const isSystem = isSystemAccount(fallbackEmail) || isDeveloperAccount(fallbackEmail);

      if (isSystem) {
        if (isCleanedUp) return;
        const systemRole = getSystemAccountRole(fallbackEmail);
        const sysTeacher = isTeacherAccountOrEmail(fallbackEmail) ? getSystemTeacherProfile(fallbackEmail) : null;
        const pData: UserProfile = {
          uid: profileIdToLoad,
          id: profileIdToLoad,
          email: fallbackEmail,
          name: user.displayName || (fallbackEmail ? fallbackEmail.split('@')[0] : '') || 'Staff Member',
          role: systemRole as any,
          designation: sysTeacher?.designation || (systemRole === 'teacher_class' ? 'Class Teacher' : 'Staff'),
          department: sysTeacher?.department || 'Administration',
          gender: sysTeacher?.gender || '',
          qualification: sysTeacher?.qualification || '',
          experience: sysTeacher?.experience || '',
          subjects: sysTeacher?.subjects || [],
          teachingClasses: sysTeacher?.teachingClasses || [],
          class: sysTeacher?.class || '',
          section: sysTeacher?.section || '',
          classTeacherBatchName: sysTeacher?.classTeacherBatchName || '',
          status: 'active',
          createdAt: new Date().toISOString()
        };
        setStableProfile(pData);
        setLoading(false);
        await saveUserDoc(pData);
        return;
      }

      if (fallbackEmail) {
        try {
          const studentDocs = await dbService.list('students', [where('email', '==', fallbackEmail)]);
          if (studentDocs.length > 0) {
            if (isCleanedUp) return;
            const pData = { ...studentDocs[0], role: 'student', uid: profileIdToLoad };
            setStableProfile(pData as UserProfile);
            setLoading(false);
            await saveUserDoc(pData);
            return;
          }
        } catch (err) {
          console.error("Error in fallback student lookup:", err);
        }

        try {
          const staffDocs = await dbService.list('staff', [where('email', '==', fallbackEmail)]);
          if (staffDocs.length > 0) {
            if (isCleanedUp) return;
            const pData = { 
              ...staffDocs[0], 
              role: staffDocs[0].role || 'staff', 
              uid: profileIdToLoad 
            };
            setStableProfile(pData as UserProfile);
            setLoading(false);
            await saveUserDoc(pData);
            return;
          }
        } catch (err) {
          console.error("Error in fallback staff lookup:", err);
        }
      }
      
      if (activeProfileId && activeProfileId !== user.uid) {
        localStorage.removeItem('preferred_profile_id');
        setActiveProfileId(user.uid);
      } else {
        const savedBypassStr = localStorage.getItem('bypass_user_profile');
        if (savedBypassStr) {
          try {
            const parsed = JSON.parse(savedBypassStr);
            if (parsed && (parsed.email || parsed.id)) {
              setStableProfile(parsed);
              setLoading(false);
              return;
            }
          } catch (e) {}
        }

        const bypassRole = localStorage.getItem('bypass_user_role') || 'student';
        const fallbackProfile: UserProfile = {
          uid: profileIdToLoad,
          id: profileIdToLoad,
          email: userEmail || user.email || '',
          name: user.displayName || localStorage.getItem('bypass_user_name') || (userEmail ? userEmail.split('@')[0] : 'User'),
          role: bypassRole as any,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        setStableProfile(fallbackProfile);
        setLoading(false);
      }
    };

    const unsubscribeIdentity = dbService.subscribeDoc('users', profileIdToLoad, async (identityData) => {
      if (isCleanedUp) return;
      // ఫాల్‌బ్యాక్: ఒకవేళ 'users' కలెక్షన్‌లో ఈ ఐడీ లేకపోతే, నేరుగా 'students' అండ్ 'staff' కి ఫాల్‌బ్యాక్ అవుతుంది
      if (!identityData) {
        await runFallback();
        return;
      }

      const targetEmail = identityData.email?.toLowerCase().trim() || user.email?.toLowerCase().trim();
      const isTeacher = isTeacherAccountOrEmail(targetEmail) || 
                        isTeacherAccountOrEmail((identityData as any).role) ||
                        isTeacherAccountOrEmail(identityData.name);
      const isSystem = isSystemAccount(targetEmail) || isDeveloperAccount(targetEmail) || isTeacher;
      let role = normalizeRole((identityData as any).role);

      if (isTeacher) {
        role = 'teacher_class';
        (identityData as any).role = 'teacher_class';
      } else if (isSystem && (role === 'student' || role === 'parent')) {
        role = getSystemAccountRole(targetEmail);
        (identityData as any).role = role;
      }

      const targetCollection = (role === 'student' || role === 'parent') ? 'students' : (isSystem ? (isTeacher ? 'staff' : null) : 'staff');

      if (unsubscribeProfileDetail) {
        unsubscribeProfileDetail();
        unsubscribeProfileDetail = null;
      }

      if (!targetCollection) {
        const sysTeacher = isTeacher ? getSystemTeacherProfile(targetEmail) : null;
        setStableProfile({ 
          ...identityData, 
          uid: profileIdToLoad,
          name: identityData.name || identityData.displayName || sysTeacher?.name || targetEmail.split('@')[0],
          designation: identityData.designation || sysTeacher?.designation || (isTeacher ? 'Class Teacher' : 'Staff'),
          department: identityData.department || sysTeacher?.department || 'Primary',
          role: identityData.role || 'teacher_class'
        } as UserProfile);
        setLoading(false);
        return;
      }

      if (targetEmail) {
        // ఇక్కడ డాక్యుమెంట్ ఐడీ కాకుండా EMAIL ద్వారా రియల్-టైమ్ క్వరీ రన్ అవుతుంది
        const emailConstraint = [where('email', '==', targetEmail)];
        unsubscribeProfileDetail = dbService.subscribe(targetCollection, emailConstraint, (listData) => {
          if (isCleanedUp) return;
          if (listData && listData.length > 0) {
            const detailData = listData[0];
            const sysTeacher = isTeacher ? (getSystemTeacherProfile(targetEmail) || (detailData.email ? getSystemTeacherProfile(detailData.email) : null)) : null;
            const mergedProfile = { 
              ...identityData, 
              ...detailData, 
              name: detailData.name || identityData.name || identityData.displayName || sysTeacher?.name || '',
              designation: detailData.designation || identityData.designation || sysTeacher?.designation || (isTeacher ? 'Class Teacher' : 'Staff'),
              department: detailData.department || identityData.department || sysTeacher?.department || 'Primary',
              gender: detailData.gender || identityData.gender || sysTeacher?.gender || 'Female',
              qualification: detailData.qualification || identityData.qualification || sysTeacher?.qualification || '',
              experience: detailData.experience || identityData.experience || sysTeacher?.experience || '',
              subjects: (detailData.subjects && detailData.subjects.length > 0) ? detailData.subjects : (identityData.subjects || sysTeacher?.subjects || []),
              teachingClasses: (detailData.teachingClasses && detailData.teachingClasses.length > 0) ? detailData.teachingClasses : (identityData.teachingClasses || sysTeacher?.teachingClasses || []),
              class: detailData.class || identityData.class || sysTeacher?.class || '',
              section: detailData.section || identityData.section || sysTeacher?.section || '',
              classTeacherBatchName: detailData.classTeacherBatchName || identityData.classTeacherBatchName || sysTeacher?.classTeacherBatchName || '',
              role: detailData.role || identityData.role || (isTeacher ? 'teacher_class' : 'staff'),
              id: detailData.id, // బల్క్ ఇంపోర్ట్ చేసిన కస్టమ్ ఐడీని అలాగే ఉంచుతుంది
              ...(role === 'student' ? { studentId: detailData.id } : {}),
              uid: profileIdToLoad 
            } as UserProfile;
            setStableProfile(mergedProfile);
            setLoading(false);
          } else {
            // Fallback: If no student matches the login email, fallback to name-based live matcher
            if (targetCollection === 'students' && identityData.name) {
              const nameConstraint = [where('name', '==', identityData.name)];
              if (unsubscribeProfileDetail) unsubscribeProfileDetail();
              unsubscribeProfileDetail = dbService.subscribe('students', nameConstraint, (nameListData) => {
                if (isCleanedUp) return;
                if (nameListData && nameListData.length > 0) {
                  const detailData = nameListData[0];
                  const mergedProfile = {
                    ...identityData,
                    ...detailData,
                    id: detailData.id,
                    studentId: detailData.id,
                    uid: profileIdToLoad
                  } as UserProfile;
                  setStableProfile(mergedProfile);
                } else {
                  setStableProfile({ ...identityData, uid: profileIdToLoad } as UserProfile);
                }
                setLoading(false);
              }, (err) => {
                if (isCleanedUp) return;
                console.error("Name sync fallback mistake:", err);
                setStableProfile({ ...identityData, uid: profileIdToLoad } as UserProfile);
                setLoading(false);
              });
            } else {
              const sysTeacher = isTeacher ? getSystemTeacherProfile(targetEmail) : null;
              setStableProfile({ 
                ...identityData, 
                uid: profileIdToLoad,
                name: identityData.name || identityData.displayName || sysTeacher?.name || targetEmail.split('@')[0],
                designation: identityData.designation || sysTeacher?.designation || (isTeacher ? 'Class Teacher' : 'Staff'),
                department: identityData.department || sysTeacher?.department || 'Primary',
                role: identityData.role || (isTeacher ? 'teacher_class' : 'staff')
              } as UserProfile);
              setLoading(false);
            }
          }
        }, (error) => {
          if (isCleanedUp) return;
          console.error(`Error syncing details from ${targetCollection}:`, error);
          const sysTeacher = isTeacher ? getSystemTeacherProfile(targetEmail) : null;
          setStableProfile({ 
            ...identityData, 
            uid: profileIdToLoad,
            name: identityData.name || identityData.displayName || sysTeacher?.name || targetEmail.split('@')[0],
            designation: identityData.designation || sysTeacher?.designation || (isTeacher ? 'Class Teacher' : 'Staff'),
            department: identityData.department || sysTeacher?.department || 'Primary',
            role: identityData.role || (isTeacher ? 'teacher_class' : 'staff')
          } as UserProfile);
          setLoading(false);
        });
      } else {
        const sysTeacher = isTeacher ? getSystemTeacherProfile(targetEmail) : null;
        setStableProfile({ 
          ...identityData, 
          uid: profileIdToLoad,
          name: identityData.name || identityData.displayName || sysTeacher?.name || 'User',
          designation: identityData.designation || sysTeacher?.designation || (isTeacher ? 'Class Teacher' : 'Staff'),
          department: identityData.department || sysTeacher?.department || 'Primary',
          role: identityData.role || (isTeacher ? 'teacher_class' : 'staff')
        } as UserProfile);
        setLoading(false);
      }
    }, async (err) => {
      if (isCleanedUp) return;
      console.warn("[AuthContext] subscribeDoc on 'users' failed, executing fallback...", err);
      await runFallback();
    });

    return () => {
      isCleanedUp = true;
      unsubscribeIdentity();
      if (unsubscribeProfileDetail) unsubscribeProfileDetail();
    };
  }, [user?.uid, activeProfileId, setStableProfile]);

  useEffect(() => {
    if (!profile) return;

    // Track user login once per browser tab session
    const sessionKey = `logged_login_${profile.uid || (profile as any).id}`;
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, 'true');
      const logLogin = async () => {
        try {
          await dbService.add('login_logs', {
            userId: profile.uid || (profile as any).id || 'unknown',
            email: profile.email || 'unknown',
            name: profile.name || (profile as any).parentName || 'Unknown User',
            role: profile.role || 'unknown',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            type: 'login'
          });
        } catch (e) {
          console.warn('Failed tracking user login:', e);
        }
      };
      logLogin();
    }

    const roleKey = normalizeRole(profile.role);
    if (!roleKey) {
      setStablePermissions(ROLE_PERMISSIONS.student || []);
      setLoading(false);
      return;
    }

    let isSubscribed = true;
    dbService.get('roles', roleKey).then((roleData: any) => {
      if (!isSubscribed) return;
      if (roleData && !roleData.isDeleted && roleData.permissions && roleData.permissions.length > 0) {
        // Safe merge with system defaults of the role to ensure they never lose core capability
        const defaults = ROLE_PERMISSIONS[roleKey as Role] || [];
        const merged = Array.from(new Set([...defaults, ...roleData.permissions]));
        setStablePermissions(merged);
      } else {
        setStablePermissions(ROLE_PERMISSIONS[roleKey as Role] || []);
      }
      setLoading(false);
    }).catch(() => {
      if (isSubscribed) {
        setStablePermissions(ROLE_PERMISSIONS[roleKey as Role] || []);
        setLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [profile?.role, setStablePermissions]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (profile) {
        sessionStorage.setItem('auth_current_user_role', profile.role || '');
        sessionStorage.setItem('auth_user_email', profile.email || user?.email || '');
      } else {
        sessionStorage.removeItem('auth_current_user_role');
        sessionStorage.removeItem('auth_user_email');
      }
    }
  }, [profile?.role, profile?.email, user?.email]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (availableProfiles && availableProfiles.length > 0) {
        const ids = availableProfiles.map(p => p.id || p.uid || (p as any).studentId).filter(Boolean);
        sessionStorage.setItem('auth_allowed_profile_ids', JSON.stringify(ids));
      } else {
        sessionStorage.removeItem('auth_allowed_profile_ids');
      }
    }
  }, [availableProfiles?.length, profile?.uid]);

  const hasPermission = React.useCallback((permission: Permission) => {
    if (!profile) return false;

    const rKey = normalizeRole(profile.role);
    const forceTeacher = profile.isTeacherPortal === true;
    const isTeacherUser = rKey.includes('teacher') || forceTeacher || profile.role === 'teacher' || profile.role === 'teacher_class' || profile.role === 'teacher_subject';

    // Enforce database fields and teacher locks
    if (isTeacherUser) {
      if (['students_view_all', 'students_create', 'students_edit_basic', 'students_edit_academic', 'students_edit_parent', 'students_delete', 'students_manage_concessions', 'manage_students'].includes(permission)) {
        return false;
      }
    }
    if (profile.students_view_all === false && permission === 'students_view_all') {
      return false;
    }

    // Super Admins have all permissions
    const isSuper = (rKey === 'super_admin' || isDeveloperAccount(user?.email)) && !isTeacherUser;
    if (isSuper || (rKey === 'admin' && !isTeacherUser)) return true;
    
    let permissions = rolePermissions;
    if (rKey === 'student' || rKey === 'parent' || rKey === 'clerk' || rKey === 'receptionist' || rKey === 'accountant' || rKey === 'warden' || rKey === 'driver' || rKey === 'doctor' || rKey === 'play_school_incharge') {
      const defaults = ROLE_PERMISSIONS[rKey as Role] || [];
      permissions = Array.from(new Set([...defaults, ...permissions]));
    }
    return permissions.includes(permission);
  }, [profile, user?.email, rolePermissions]);

  const switchProfile = async (profileId: string) => {
    setLoading(true);
    localStorage.setItem('preferred_profile_id', profileId);
    setActiveProfileId(profileId);
  };

  const value = React.useMemo(() => {
    const rKey = normalizeRole(profile?.role);
    const forceTeacher = profile?.isTeacherPortal === true;
    const isExplicitNonTeacher = ['receptionist', 'accountant', 'clerk', 'driver', 'doctor', 'admin', 'super_admin', 'principal', 'vice_principal', 'student', 'parent', 'warden'].includes(rKey) ||
      (profile?.email || '').toLowerCase().includes('reception') || (profile?.designation || '').toLowerCase().includes('reception') ||
      (profile?.email || '').toLowerCase().includes('accountant') || (profile?.designation || '').toLowerCase().includes('accountant') ||
      (profile?.email || '').toLowerCase().includes('clerk') || (profile?.designation || '').toLowerCase().includes('clerk');
    const isTeacherAcc = !isExplicitNonTeacher && (
                         isTeacherAccountOrEmail(user?.email) || 
                         isTeacherAccountOrEmail(profile?.email) || 
                         isTeacherAccountOrEmail(profile?.name) || 
                         isTeacherAccountOrEmail(user?.displayName) || 
                         isTeacherRole(rKey, profile?.email || user?.email, profile?.name || user?.displayName));
    const isActuallyTeacher = !isExplicitNonTeacher && (rKey.includes('teacher') || forceTeacher || isTeacherAcc);
    const isStaffMember = isStaffRole(rKey) || isStaffAccountOrEmail(user?.email || profile?.email, rKey, user?.displayName || profile?.name) || isActuallyTeacher;
    const isDevOrSys = (isDeveloperAccount(user?.email) || isDeveloperAccount(profile?.email) || isSystemAccount(user?.email) || isSystemAccount(profile?.email)) && !isActuallyTeacher;
    const isSuper = (rKey === 'super_admin' || isDevOrSys) && !forceTeacher && !isActuallyTeacher;
    
    return {
      user, profile, loading, login,
      isAdmin: (rKey === 'admin' || isSuper || isDevOrSys) && !forceTeacher && !isActuallyTeacher,
      isSuperAdmin: (isSuper || isDevOrSys) && !forceTeacher && !isActuallyTeacher,
      isTeacher: isActuallyTeacher,
      isStudent: (rKey === 'student') && !isStaffMember && !isActuallyTeacher && !forceTeacher && !isSuper && !isDevOrSys,
      isAccountant: (rKey === 'accountant' || (profile?.email || '').toLowerCase().includes('accountant') || (profile?.designation || '').toLowerCase().includes('accountant')) && !forceTeacher && !isActuallyTeacher,
      isClerk: (rKey === 'clerk' || (profile?.email || '').toLowerCase().includes('clerk') || (profile?.designation || '').toLowerCase().includes('clerk')) && !forceTeacher && !isActuallyTeacher,
      isReceptionist: (rKey === 'receptionist' || (profile?.designation || '').toLowerCase().includes('receptionist') || (profile?.email || '').toLowerCase().includes('reception')) && !forceTeacher && !isActuallyTeacher,
      isParent: (rKey === 'parent') && !isStaffMember && !forceTeacher && !isActuallyTeacher && !isSuper && !isDevOrSys,
      isVicePrincipal: rKey === 'vice_principal' && !forceTeacher && !isActuallyTeacher,
      isPrincipal: rKey === 'principal' && !forceTeacher && !isActuallyTeacher,
      availableProfiles, switchProfile, hasPermission,
      teacherAssignments: isActuallyTeacher ? { classId: profile?.classId, batchId: profile?.batchId, subjects: profile?.subjects || [] } : null
    };
  }, [user, profile, loading, login, availableProfiles, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};