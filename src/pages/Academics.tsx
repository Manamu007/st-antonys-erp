import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Users, 
  Layers,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  Save,
  Calendar,
  RefreshCw,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Lock
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { ClassRecord, BatchRecord, SubjectRecord, UserProfile, FeeRecord, StudentDetails } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { PERMISSIONS } from '../constants/permissions';
import { toast } from 'sonner';
import { getTeacherAssignments, filterClassesForTeacher, filterBatchesForTeacher, filterSubjectsForTeacher, checkIsTeacherAccount, TeacherAssignments } from '../utils/teacherFilter';
import { where, orderBy, limit } from 'firebase/firestore';
import { sortAlphabetically, getStaffDisplayName, getPersonDisplayName, formatNameFromEmail } from '../lib/utils';

import { motion } from 'motion/react';
import { Mail, GraduationCap, Sparkles, CalendarCheck } from 'lucide-react';

const normalizeRole = (role: string = '') => {
  return role.toLowerCase().trim().replace(/[-_]/g, '_');
};

export function isRawIdString(str: any): boolean {
  if (!str) return false;
  const s = String(str).trim();
  if (!s) return false;
  if (s.includes(' ')) return false;
  if (s.length >= 15 && /^[a-zA-Z0-9_-]+$/.test(s)) {
    return true;
  }
  return false;
}

export const isSyntheticOrMailName = (name?: string | null): boolean => {
  if (!name) return true;
  const s = String(name).trim();
  if (!s) return true;
  if (s.includes('@')) return true;
  if (isRawIdString(s)) return true;
  const lower = s.toLowerCase();
  const genericWords = [
    'not assigned', 'none', 'n/a', 'undefined', 'null', 
    'select teacher', 'unknown teacher', 'unknown', 'teacher', 'staff member'
  ];
  if (genericWords.includes(lower)) return true;
  // Match synthetic patterns generated from email handles, e.g. "Class 2 Ipl Teacher", "Class 3 M Teacher", "Class 4 Teacher"
  if (/^class\s+\w+(\s+\w+)?\s+teacher$/i.test(s)) return true;
  if (/^(?:st)?antonys[a-z0-9]+/i.test(s)) return true;
  return false;
};

export function findTeacherForBatch(batch: any, teacherList: any[]): any {
  if (!batch || !teacherList || !teacherList.length) return null;

  const targetId = String(batch.classTeacherId || '').toLowerCase().trim();
  const targetName = String(batch.classTeacherName || batch.classTeacher || '').toLowerCase().trim();
  const targetEmail = String(batch.classTeacherEmail || '').toLowerCase().trim();
  const batchId = String(batch.id || '').toLowerCase().trim();

  const genericWords = ['', 'not assigned', 'none', 'n/a', 'undefined', 'null', 'select teacher', 'staff member'];

  // 1. Match by classTeacherId
  if (targetId && !genericWords.includes(targetId)) {
    const matched = teacherList.find(t => {
      const uUid = String(t.uid || '').toLowerCase().trim();
      const uId = String(t.id || '').toLowerCase().trim();
      const uCanon = String(t.canonicalId || '').toLowerCase().trim();
      const uCustom = String(t.customId || t.staffId || '').toLowerCase().trim();
      const uEmail = String(t.email || '').toLowerCase().trim();
      if (t.allIds && t.allIds.has(targetId)) return true;
      return (uCanon && uCanon === targetId) ||
             (uUid && uUid === targetId) ||
             (uId && uId === targetId) ||
             (uCustom && uCustom === targetId) ||
             (uEmail && uEmail === targetId);
    });
    if (matched) return matched;
  }

  // 2. Match by email
  if (targetEmail && !genericWords.includes(targetEmail)) {
    const matched = teacherList.find(t => {
      const uEmail = String(t.email || '').toLowerCase().trim();
      if (uEmail && uEmail === targetEmail) return true;
      if (t.allIds && t.allIds.has(targetEmail)) return true;
      return false;
    });
    if (matched) return matched;
  }

  // 3. Match by real non-synthetic teacher name
  if (targetName && !genericWords.includes(targetName) && !isRawIdString(targetName) && !isSyntheticOrMailName(targetName)) {
    const matched = teacherList.find(t => {
      const tName = String(t.name || t.displayName || '').toLowerCase().trim();
      return tName && !isSyntheticOrMailName(tName) && (tName === targetName || tName.replace(/\s+/g, '') === targetName.replace(/\s+/g, ''));
    });
    if (matched) return matched;
  }

  // 4. Match by batch ID in teacher assigned batch records (if batch is not claimed by another teacher)
  if (batchId && !genericWords.includes(batchId)) {
    const matchedByBatch = teacherList.find(t => {
      const ctBatchId = String(t.classTeacherBatchId || t.batchId || '').toLowerCase().trim();
      if (ctBatchId && ctBatchId === batchId) {
        // Verify batch doesn't belong to another teacher
        const bCtId = String(batch.classTeacherId || '').toLowerCase().trim();
        const bCtEmail = String(batch.classTeacherEmail || '').toLowerCase().trim();
        const tUid = String(t.uid || '').toLowerCase().trim();
        const tId = String(t.id || '').toLowerCase().trim();
        const tEmail = String(t.email || '').toLowerCase().trim();
        const isOtherId = bCtId && !genericWords.includes(bCtId) && bCtId !== tUid && bCtId !== tId && (!t.allIds || !t.allIds.has(bCtId));
        const isOtherEmail = bCtEmail && !genericWords.includes(bCtEmail) && tEmail && bCtEmail !== tEmail;
        if (!isOtherId && !isOtherEmail) return true;
      }
      return false;
    });
    if (matchedByBatch) return matchedByBatch;
  }

  return null;
}

export const getBatchClassTeacherDisplayName = (batch: any, teacherList: any[]): string => {
  if (!batch) return 'Not Assigned';
  
  const matchedTeacher = findTeacherForBatch(batch, teacherList);
  if (matchedTeacher) {
    const cleanName = getStaffDisplayName(matchedTeacher);
    if (cleanName && cleanName !== 'Staff Member' && !isSyntheticOrMailName(cleanName)) {
      return cleanName;
    }
  }

  const rawBatchTeacherName = (batch.classTeacherName || batch.classTeacher || '').trim();
  if (rawBatchTeacherName) {
    const cleanRaw = getPersonDisplayName(rawBatchTeacherName, '');
    if (cleanRaw && !isSyntheticOrMailName(cleanRaw)) {
      return cleanRaw;
    }
  }

  return 'Not Assigned';
};

const getSyllabusUnits = (subjectName: string = '') => {
  const name = subjectName.toLowerCase();
  if (name.includes('math') || name.includes('algebra') || name.includes('calculus') || name.includes('geometry')) {
    return [
      { unit: 'Unit 1: Linear Equations & Polynomials', topics: ['Systems of Equations', 'Factoring Polynomials', 'Complex Numbers', 'Graphing Functions'] },
      { unit: 'Unit 2: Trigonometric Functions & Identities', topics: ['Unit Circle', 'Trigonometric Ratios', 'Sine & Cosine Laws', 'Phases & Amplitudes'] },
      { unit: 'Unit 3: Limits & Continuity', topics: ['Anatomy of a Limit', 'One-Sided Limits', 'Asymptotes', 'Continuity proofs'] },
      { unit: 'Unit 4: Advanced Statistics', topics: ['Standard Deviation', 'Normal Distribution', 'Z-scores', 'Probability Trees'] },
      { unit: 'Unit 5: Matrices & Analytical Vectors', topics: ['Determinants', 'Matrix Multiplication', 'Vector Dot Product', '3D Coordinate Systems'] }
    ];
  }
  if (name.includes('science') || name.includes('physics') || name.includes('chemistry') || name.includes('biology')) {
    return [
      { unit: 'Unit 1: Kinematics & Laws of Motion', topics: ['Velocity & Acceleration', 'Newtonian Attraction', 'Projectile Motion', 'Friction Coefficients'] },
      { unit: 'Unit 2: Thermodynamics & Fluid Balance', topics: ['Heat Energy Transfers', 'Gas Laws', 'Bernoulli\'s Equation', 'Specific Heat Capacity'] },
      { unit: 'Unit 3: Atomic Bonding & Reactions', topics: ['Electron Configurations', 'Covalent & Ionic Bonds', 'Stoichiometry', 'Enthalpy Changes'] },
      { unit: 'Unit 4: Genetics & Cell Physiology', topics: ['DNA replication', 'Mitosis vs Meiosis', 'Mendelian Genetics', 'Protein Synthesis'] },
      { unit: 'Unit 5: Waves, Optics & Quantum Theory', topics: ['Wave Interference', 'Lenses & Refraction', 'Photoelectric Effect', 'Line Spectra'] }
    ];
  }
  if (name.includes('english') || name.includes('language') || name.includes('literature') || name.includes('grammar')) {
    return [
      { unit: 'Unit 1: Rhetoric, Syntax & Prose Analysis', topics: ['Persuasive Devices', 'Sentence Architecture', 'Tone & Mood Synthesis', 'Critical Commentaries'] },
      { unit: 'Unit 2: Classical Shakespearean Drama', topics: ['Dramatic Irony', 'Iambic Pentameter', 'Tragic Flaw Characterization', 'Historical Contexts'] },
      { unit: 'Unit 3: Poetry Exegesis & Meter analysis', topics: ['Rhyme Schemes', 'Metaphors & Allusions', 'Blank Verse Analysis', 'Modernist Poetry'] },
      { unit: 'Unit 4: Contemporary Short Fiction', topics: ['Plot Arcs', 'Theme Deconstructions', 'Symbolism Tracking', 'Character Archetypes'] },
      { unit: 'Unit 5: Academic Research & Citations', topics: ['MLA & APA Bibliographies', 'Primary vs Secondary Sourcing', 'Thesis Foundations', 'Avoiding Plagiarism Methods'] }
    ];
  }
  return [
    { unit: 'Unit 1: Introductory Principles', topics: ['Core Definitions', 'Historical Milestone Context', 'Syllabus Map', 'Basic Terminology'] },
    { unit: 'Unit 2: Fundamental Frameworks', topics: ['Theoretical Approaches', 'Key Paradigm Shifts', 'Methodology Overview', 'Conceptual Classifications'] },
    { unit: 'Unit 3: Intermediate Logic & Application', topics: ['Solving Case Studies', 'Practical Lab/Exercise Steps', 'Correlation Tests', 'Analytical Modeling'] },
    { unit: 'Unit 4: Contemporary Topics & Research', topics: ['Modern Day Paradigms', 'Global Relevance Issues', 'Digital Transformation', 'Ethics & Guidelines'] },
    { unit: 'Unit 5: Semester Synthesis & Evaluations', topics: ['Comprehensive Project Work', 'Review Sessions', 'Final Examination Map', 'Self-Assessment Outlines'] }
  ];
};

interface StudentAcademicsPortalProps {
  profile: any;
  availableProfiles: any[];
  switchProfile: (id: string) => Promise<void>;
}

const StudentAcademicsPortal: React.FC<StudentAcademicsPortalProps> = ({ profile, availableProfiles, switchProfile }) => {
  const [activeTab, setActiveTab] = useState<'syllabus' | 'faculty' | 'calendar'>('syllabus');
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [fullStudentData, setFullStudentData] = useState<any>(null);
  const [classDetail, setClassDetail] = useState<any>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubjectIdx, setExpandedSubjectIdx] = useState<number | null>(0);

  const studentProfiles = availableProfiles.filter(p => normalizeRole(p.role) === 'student');

  useEffect(() => {
    if (studentProfiles.length > 0) {
      const currentChild = studentProfiles.find(p => (p.id || p.uid) === (profile?.id || profile?.uid)) || studentProfiles[0];
      setSelectedChild(currentChild);
    }
  }, [availableProfiles, profile?.uid, profile?.id]);

  useEffect(() => {
    if (!selectedChild) return;
    setLoading(true);
    const childId = selectedChild.id || selectedChild.uid;
    const unsub = dbService.subscribeDoc('students', childId, (data) => {
      setFullStudentData(data);
      setLoading(false);
    });
    return unsub;
  }, [selectedChild?.uid || selectedChild?.id]);

  const [allClasses, setAllClasses] = useState<any[]>([]);

  useEffect(() => {
    dbService.list('classes').then(setAllClasses).catch(e => console.error(e));
  }, []);

  const activeClassId = fullStudentData?.classId || selectedChild?.classId;

  // Smart resolver for automatically loaded class:
  const effectiveClassId = activeClassId || (allClasses.length > 0 ? (
    allClasses.find(c => {
      const studentClassStr = String(fullStudentData?.class || selectedChild?.class || '').toLowerCase().trim();
      if (!studentClassStr) return false;
      const classNameStr = String(c.name || '').toLowerCase().trim();
      return classNameStr.includes(studentClassStr) || studentClassStr.includes(classNameStr);
    })?.id || allClasses[0]?.id
  ) : '');

  useEffect(() => {
    if (!effectiveClassId) {
      setClassDetail(null);
      setTeachers([]);
      return;
    }
    dbService.get('classes', effectiveClassId).then((data) => {
      setClassDetail(data);
      if (data?.subjects) {
        const teacherIds = data.subjects.map((s: any) => s.teacherId).filter(Boolean);
        if (teacherIds.length > 0) {
          dbService.list('staff', [where('uid', 'in', teacherIds.slice(0, 30))]).then(setTeachers).catch(() => setTeachers([]));
        } else {
          setTeachers([]);
        }
      } else {
        setTeachers([]);
      }
    }).catch(e => console.error(e));
  }, [effectiveClassId]);

  useEffect(() => {
    dbService.list('holidays').then(setHolidays).catch(e => console.error(e));
  }, []);

  const handleSiblingSwitch = (child: any) => {
    setSelectedChild(child);
    switchProfile(child.uid || child.id);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-sidebar uppercase tracking-tight flex items-center gap-2.5">
            <GraduationCap className="w-8 h-8 text-primary" />
            Academics Module
          </h1>
          <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider font-mono">Curriculum Syllabus, School Faculty & Calendar</p>
        </div>

        {studentProfiles.length > 1 && (
          <div className="flex flex-col gap-1.5 align-start w-full md:w-auto">
            <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest leading-none font-mono">Select Sibling Profile</span>
            <div className="flex items-center gap-2 p-1 bg-white rounded-2xl border border-neutral-150 shadow-sm flex-wrap w-fit">
              {studentProfiles.map((child) => (
                <button
                  key={child.uid || child.id}
                  onClick={() => handleSiblingSwitch(child)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    (profile.uid || profile.id) === (child.uid || child.id)
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700'
                  }`}
                >
                  {child.name?.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-sidebar to-slate-900 p-5 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center font-black text-2xl border border-white/15 shadow-sm">
            {selectedChild?.name?.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-extrabold uppercase tracking-tight">{selectedChild?.name}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 font-semibold font-mono mt-0.5">
              <span>CLASS {fullStudentData?.class || selectedChild?.class || '---'}</span>
              <span>•</span>
              <span>BATCH {fullStudentData?.batch || selectedChild?.batch || '---'}</span>
              <span>•</span>
              <span>ROLL NO: {fullStudentData?.rollNumber || selectedChild?.rollNumber || '---'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4 relative z-10 shrink-0">
          <div className="text-center bg-white/5 px-4 py-2.5 rounded-xl border border-white/5">
            <p className="text-[10px] font-black uppercase text-slate-300 tracking-wider">Total Subjects</p>
            <p className="text-lg font-black text-primary font-mono">{classDetail?.subjects?.length || 0}</p>
          </div>
          <div className="text-center bg-white/5 px-4 py-2.5 rounded-xl border border-white/5">
            <p className="text-[10px] font-black uppercase text-slate-300 tracking-wider">Faculty Members</p>
            <p className="text-lg font-black text-emerald-400 font-mono">{teachers.length}</p>
          </div>
        </div>
      </div>



      <div className="flex p-1 bg-neutral-100 rounded-2xl w-fit border border-neutral-150">
        {[
          { id: 'syllabus', label: 'Curriculum & Subjects', icon: BookOpen },
          { id: 'faculty', label: 'Class Faculty', icon: Users },
          { id: 'calendar', label: 'Academic Calendar', icon: Calendar }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-black text-xs uppercase tracking-wider ${
                activeTab === tab.id
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-neutral-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-neutral-100 shadow-sm">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest font-mono animate-pulse">Syncing portal curriculum...</p>
        </div>
      ) : (
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {activeTab === 'syllabus' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="col-span-1 lg:col-span-5 space-y-3">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono">Active Subjects List</p>
                {classDetail?.subjects && classDetail.subjects.length > 0 ? (
                  classDetail.subjects.map((sub: any, idx: number) => {
                    const assignedTeacher = teachers.find(t => t.uid === sub.teacherId);
                    const isExpanded = expandedSubjectIdx === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setExpandedSubjectIdx(idx)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all duration-350 flex items-center justify-between group ${
                          isExpanded
                            ? 'bg-sidebar text-white border-sidebar shadow-md'
                            : 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-800'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <h4 className="text-sm font-black uppercase tracking-tight leading-tight group-hover:text-primary transition-colors">{sub.name}</h4>
                          <p className={`text-[10px] font-bold uppercase tracking-wider font-mono mt-1 ${isExpanded ? 'text-slate-300' : 'text-neutral-400'}`}>
                            {assignedTeacher ? `By ${assignedTeacher.name}` : 'Unassigned'}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-widest shrink-0 ${
                          isExpanded ? 'bg-white/10 text-white' : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          View Units
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-8 bg-white border border-neutral-150 text-center rounded-2xl">
                    <BookOpen className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                    <p className="text-[10px] text-neutral-400 font-mono font-black uppercase tracking-widest">No active classes found</p>
                  </div>
                )}
              </div>

              <div className="col-span-1 lg:col-span-7 space-y-4">
                {expandedSubjectIdx !== null && classDetail?.subjects?.[expandedSubjectIdx] ? (
                  (() => {
                    const activeSub = classDetail.subjects[expandedSubjectIdx];
                    const activeTeacher = teachers.find(t => t.uid === activeSub.teacherId);
                    const units = getSyllabusUnits(activeSub.name);
                    return (
                      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
                        <div className="border-b border-neutral-100 pb-4">
                          <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-xl text-[9px] font-black uppercase tracking-widest font-mono">Curriculum Syllabus</span>
                          <h3 className="text-xl font-black text-sidebar uppercase tracking-tight mt-2">{activeSub.name}</h3>
                          <div className="flex items-center gap-2 mt-1.5 text-neutral-400 text-[11px] font-bold uppercase font-mono tracking-wider">
                            <span>Teacher: {activeTeacher ? activeTeacher.name : 'Not Assigned'}</span>
                            {activeTeacher?.email && (
                              <>
                                <span>|</span>
                                <a href={`mailto:${activeTeacher.email}`} className="text-indigo-600 hover:underline">{activeTeacher.email}</a>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          {units.map((u, ui) => (
                            <div key={ui} className="p-4 bg-neutral-50/50 rounded-2xl border border-neutral-155 space-y-2">
                              <h4 className="text-xs sm:text-[13px] font-black text-sidebar uppercase tracking-tight">{u.unit}</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pl-1.5 border-l border-neutral-300">
                                {u.topics.map((topic, ti) => (
                                  <div key={ti} className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                                    <span className="w-1 h-1 bg-primary rounded-full shrink-0" />
                                    <span>{topic}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-white p-12 text-center rounded-3xl border border-neutral-200 flex flex-col items-center justify-center">
                    <Sparkles className="w-12 h-12 text-indigo-400 mb-3 animate-pulse" />
                    <h3 className="text-base font-black text-sidebar uppercase tracking-tight">Syllabus Guide</h3>
                    <p className="text-xs text-neutral-400 max-w-sm mt-1">Please select an active class subject on the left to review its semester syllabus unit mapping.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'faculty' && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono">Assigned Section Teachers</p>
              {teachers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {teachers.map((t, idx) => {
                    const subjectList = classDetail?.subjects?.filter((s: any) => s.teacherId === t.uid).map((s: any) => s.name).join(', ') || 'Faculty';
                    return (
                      <div key={idx} className="bg-white border border-neutral-200 rounded-3xl p-5 hover:shadow-md transition-all flex flex-col justify-between gap-4 group relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-neutral-50 rounded-full blur-xl pointer-events-none -mr-12 -mt-12" />
                        <div className="flex items-start gap-3.5 relative z-10">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-mono font-black text-lg shrink-0">
                            {t.name?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-extrabold text-sidebar uppercase truncate leading-tight group-hover:text-primary transition-colors">{t.name}</h4>
                            <p className="text-[10px] text-primary font-black uppercase tracking-wider font-mono mt-1 break-words">{subjectList}</p>
                            <p className="text-[11px] text-neutral-400 font-semibold mt-1.5 truncate flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5 inline text-neutral-400 shrink-0" />
                              {t.email || `${t.uid}@school.com`}
                            </p>
                          </div>
                        </div>
                        {t.email && (
                          <a
                            href={`mailto:${t.email}`}
                            className="w-full text-center py-2.5 bg-neutral-50 hover:bg-sidebar hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest text-sidebar transition-all border border-neutral-150 animate-duration-300"
                          >
                            Send Email
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-3xl border border-neutral-150 shadow-sm">
                  <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                  <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest font-mono">No faculty members matched yet / database syncing...</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-4">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest font-mono">School Holidays & working events</p>
              {holidays.length > 0 ? (
                <div className="bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-150">
                          <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 tracking-wider font-mono">Event Date</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 tracking-wider font-mono">Title / Occasion</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 tracking-wider font-mono">Event Type</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 tracking-wider font-mono">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {holidays.map((item) => (
                          <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors group">
                            <td className="px-6 py-4 font-mono font-bold text-primary text-sm whitespace-nowrap">
                              {item.date}
                              {item.toDate && item.toDate !== item.date && (
                                <span className="ml-2 text-neutral-400 font-medium">to {item.toDate}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-bold text-sidebar uppercase tracking-tight text-sm">{item.title}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest ${
                                item.type === 'holiday' ? 'bg-red-100 text-red-650 font-mono' :
                                item.type === 'working_day' ? 'bg-green-50 text-emerald-600 font-mono' :
                                'bg-blue-100 text-blue-600 font-mono'
                              }`}>
                                {(item.type || 'holiday').replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-neutral-500 text-xs font-semibold max-w-xs truncate">{item.description || 'No description provided'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-16 text-center border border-neutral-154 rounded-3xl shadow-sm">
                  <CalendarCheck className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                  <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest font-mono italic">No upcoming calendar holidays configured</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

const Academics: React.FC = () => {
  const { user, hasPermission, profile, isAdmin, isVicePrincipal, isStudent, isParent, availableProfiles, switchProfile } = useAuth();
  const { settings } = useSettings();

  const isStudentOrParent = isStudent || isParent || profile?.role === 'student' || profile?.role === 'parent';

  if (isStudentOrParent) {
    return (
      <StudentAcademicsPortal 
        profile={profile} 
        availableProfiles={availableProfiles} 
        switchProfile={switchProfile} 
      />
    );
  }
  
  const isFullAdmin = isAdmin || profile?.role === 'admin' || profile?.role === 'superadmin' || profile?.role === 'principal' || hasPermission('batches_manage') || hasPermission('classes_manage');
  const isTeacherRole = !isFullAdmin && (checkIsTeacherAccount(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name) || profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject' || profile?.role === 'staff');
  const isVicePrincipalRole = !isFullAdmin && (isVicePrincipal || profile?.role === 'vice_principal' || profile?.role?.toLowerCase().includes('vice_principal'));
  
  // Define available tabs based on permissions
  const availableTabs = [
    { id: 'classes', label: 'Classes', icon: Layers, perm: 'classes_view', permAll: 'classes_view_all' },
    { id: 'batches', label: 'Batches', icon: Users, perm: 'batches_view', permAll: 'batches_view_all' },
    { id: 'subjects', label: 'Subjects', icon: BookOpen, perm: 'subjects_view', permAll: 'subjects_view_all' },
    { id: 'promotion', label: 'Promotion', icon: TrendingUp, perm: PERMISSIONS.STUDENTS_PROMOTE },
    { id: 'holidays', label: 'Holidays', icon: Calendar, perms: [PERMISSIONS.HOLIDAYS_VIEW, PERMISSIONS.HOLIDAYS_MANAGE] as any[] },
  ].filter(tab => {
    // Teachers can see Classes, Batches, Subjects, Holidays in their portal
    if (isTeacherRole && (tab.id === 'classes' || tab.id === 'batches' || tab.id === 'subjects' || tab.id === 'holidays')) return true;

    // Hard hide promotion tab for teachers and vice principal
    if ((isTeacherRole || isVicePrincipalRole) && tab.id === 'promotion') return false;

    if (tab.perms) return (tab.perms as any[]).some(p => hasPermission(p));
    // Check both perm and permAll if available
    const hasPerm = tab.perm ? hasPermission(tab.perm as any) : false;
    const hasPermAll = tab.permAll ? hasPermission(tab.permAll as any) : false;
    return hasPerm || hasPermAll;
  });

  const [activeTab, setActiveTab] = useState<'classes' | 'batches' | 'subjects' | 'promotion' | 'holidays'>(
    (availableTabs[0]?.id as any) || 'classes'
  );

  const canManage = !isTeacherRole && !isVicePrincipalRole && (
    (activeTab === 'classes' && hasPermission('classes_manage')) ||
    (activeTab === 'batches' && hasPermission('batches_manage')) ||
    (activeTab === 'subjects' && hasPermission('subjects_manage')) ||
    (activeTab === 'holidays' && hasPermission('holidays_manage'))
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['classes', 'batches', 'subjects', 'promotion', 'holidays'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, []);
  const [loading, setLoading] = useState(true);

  if (availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have permission to view academic management.
        </p>
      </div>
    );
  }
  
  // Data states
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignments | null>(null);

  // Promotion state
  const [promotionSource, setPromotionSource] = useState({ classId: '', batchId: '', academicYear: settings.currentAcademicYear || '' });
  const [promotionTarget, setPromotionTarget] = useState({ classId: '', batchId: '', academicYear: '' });
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isPromoting, setIsPromoting] = useState(false);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedData = <T,>(data: T[]): T[] => {
    if (!sortConfig) return data;
    return sortAlphabetically(data, sortConfig.key as keyof T, sortConfig.direction);
  };

  const SortHeader = ({ column, label }: { column: string; label: string }) => {
    const isSorted = sortConfig?.key === column;
    const Icon = isSorted ? (sortConfig.direction === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown;
    
    return (
      <th 
        className="px-6 py-4 text-[13px] font-bold text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-100/50 transition-colors group"
        onClick={() => requestSort(column)}
      >
        <div className="flex items-center gap-2">
          {label}
          <Icon className={`w-4 h-4 transition-all ${isSorted ? 'text-primary' : 'text-neutral-300 opacity-0 group-hover:opacity-100'}`} />
        </div>
      </th>
    );
  };

  const fetchMetadata = useCallback(async () => {
    try {
      const [staffData, usersData] = await Promise.all([
        dbService.list('staff', [], true).catch(() => []),
        dbService.list('users', [], true).catch(() => [])
      ]);

      const teacherMap = new Map<string, any>();

      const nonTeachingRoles = ['student', 'parent', 'accountant', 'clerk', 'driver', 'attendant', 'helper', 'aya', 'receptionist', 'doctor', 'warden'];
      const isPotentialTeacher = (record: any) => {
        if (!record) return false;
        const role = String(record.role || '').toLowerCase().trim();
        // Exclude non-teaching roles, students, and parents
        if (nonTeachingRoles.includes(role)) return false;
        return true;
      };

      const processRecord = (s: any) => {
        if (!s || !isPotentialTeacher(s)) return;

        const id = String(s.id || '').trim();
        const uid = String(s.uid || '').trim();
        const customId = String(s.customId || s.staffId || '').trim();
        const email = String(s.email || '').trim().toLowerCase();

        const firstName = (s.firstName || '').trim();
        const lastName = (s.lastName || '').trim();
        const isUserEdited = !!(s.isEditedByUser || s.isUserModified || s.hasBeenEdited);
        const raw = (s.name || s.displayName || s.fullName || '').trim();
        
        let cleanPersonName = '';
        if (isUserEdited && raw) {
          cleanPersonName = raw;
        } else if ((firstName || lastName) && !firstName.includes('@') && !lastName.includes('@')) {
          cleanPersonName = `${firstName} ${lastName}`.trim();
        } else if (raw && !isSyntheticOrMailName(raw)) {
          cleanPersonName = raw;
        } else if (email && email.includes('@')) {
          cleanPersonName = formatNameFromEmail(email);
        } else {
          cleanPersonName = raw || 'Staff Member';
        }

        const name = cleanPersonName || 'Staff Member';

        const canonicalKey = email || uid || id || customId;
        if (!canonicalKey) return;

        const existing = teacherMap.get(canonicalKey) || 
          (email ? Array.from(teacherMap.values()).find(t => t.email === email) : null) ||
          (uid ? Array.from(teacherMap.values()).find(t => t.uid === uid || t.docIds?.has(uid)) : null) ||
          (id ? Array.from(teacherMap.values()).find(t => t.id === id || t.docIds?.has(id)) : null);

        if (existing) {
          if ((!existing.name || isSyntheticOrMailName(existing.name) || existing.name === 'Staff Member') && name && name !== 'Staff Member') {
            existing.name = name;
          }
          if (uid && (!existing.uid || isRawIdString(existing.uid))) existing.uid = uid;
          if (id) existing.docIds.add(id);
          if (uid) existing.docIds.add(uid);
          if (customId) {
            existing.customId = customId;
            existing.allIds.add(customId.toLowerCase());
          }
          if (email) {
            existing.email = email;
            existing.allIds.add(email.toLowerCase());
          }
          if (s.batchIds && Array.isArray(s.batchIds)) {
            s.batchIds.forEach((b: string) => {
              if (b && !existing.batchIds.includes(b)) existing.batchIds.push(b);
            });
          }
          if (s.batchId && !existing.batchIds.includes(s.batchId)) {
            existing.batchIds.push(s.batchId);
          }
          if (s.classTeacherBatchId) {
            existing.classTeacherBatchId = s.classTeacherBatchId;
          }
          if (s.staffBatches && Array.isArray(s.staffBatches)) {
            if (!existing.staffBatches) existing.staffBatches = [];
            s.staffBatches.forEach((b: string) => {
              if (b && !existing.staffBatches.includes(b)) existing.staffBatches.push(b);
            });
          }
        } else {
          const allIds = new Set<string>();
          const docIds = new Set<string>();
          if (id) { allIds.add(id.toLowerCase()); docIds.add(id); }
          if (uid) { allIds.add(uid.toLowerCase()); docIds.add(uid); }
          if (customId) allIds.add(customId.toLowerCase());
          if (email) allIds.add(email.toLowerCase());

          const teacherObj = {
            ...s,
            canonicalId: uid || id || customId,
            id: id || uid,
            uid: uid || id,
            customId: customId,
            name: name,
            email: email,
            role: s.role || 'teacher',
            classTeacherBatchId: s.classTeacherBatchId || '',
            batchIds: Array.isArray(s.batchIds) ? [...s.batchIds] : (s.batchId ? [s.batchId] : []),
            staffBatches: Array.isArray(s.staffBatches) ? [...s.staffBatches] : [],
            allIds: allIds,
            docIds: docIds
          };
          teacherMap.set(canonicalKey, teacherObj);
        }
      };

      (staffData || []).forEach(processRecord);
      (usersData || []).forEach(processRecord);

      const uniqueTeachers = Array.from(teacherMap.values()).sort((a, b) => 
        (a.name || '').localeCompare(b.name || '')
      );
      setTeachers(uniqueTeachers);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    
    async function loadAcademicData() {
      try {
        const [cData, bData, sData, hData] = await Promise.all([
          dbService.list('classes').catch(() => []),
          dbService.list('batches').catch(() => []),
          dbService.list('subjects').catch(() => []),
          dbService.list('holidays').catch(() => [])
        ]);

        let finalClasses = cData as ClassRecord[] || [];
        let finalBatches = bData as BatchRecord[] || [];
        let finalSubjects = sData as SubjectRecord[] || [];

        const isTeacherAcc = !isFullAdmin && (checkIsTeacherAccount(profile?.role || '', user?.email || profile?.email, user?.displayName || profile?.name) || profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject' || profile?.role === 'staff');
        if (isTeacherAcc) {
          const assignments = await getTeacherAssignments(user, profile, profile?.role || '');
          setTeacherAssignments(assignments);
          finalClasses = filterClassesForTeacher(finalClasses, assignments);
          finalBatches = filterBatchesForTeacher(finalBatches, assignments);
          finalSubjects = filterSubjectsForTeacher(finalSubjects, assignments);
        } else {
          setTeacherAssignments(null);
        }

        setClasses(sortAlphabetically(finalClasses, 'name', 'asc'));
        setBatches(sortAlphabetically(finalBatches, 'name', 'asc'));
        setSubjects(sortAlphabetically(finalSubjects, 'name', 'asc'));
        setHolidays(hData.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')));
      } catch (e) {
        console.error("Error loading academic data:", e);
      } finally {
        setLoading(false);
      }
    }

    loadAcademicData();

    const unsubStudents = dbService.subscribe('students', [], (data) => {
      setAllStudents(data || []);
    }, (error) => {
      console.error("Error subscribing to students in Academics:", error);
    });

    const unsubBatches = dbService.subscribe('batches', [], (data) => {
      if (data && Array.isArray(data)) {
        setBatches(sortAlphabetically(data.filter(Boolean), 'name', 'asc'));
      }
    }, (error) => {
      console.error("Error subscribing to batches in Academics:", error);
    });

    const unsubStaff = dbService.subscribe('staff', [], () => {
      fetchMetadata().catch(() => {});
    }, (error) => {
      console.error("Error subscribing to staff in Academics:", error);
    });

    fetchMetadata();

    return () => {
      unsubStudents();
      unsubBatches();
      unsubStaff();
    };
  }, [user, profile, fetchMetadata]);

  // Fetch students for promotion when source changes
  useEffect(() => {
    if (activeTab === 'promotion' && promotionSource.classId && promotionSource.batchId) {
      const fetchPromotionStudents = async () => {
        try {
          const studentsData = await dbService.list('students', [
            where('classId', '==', promotionSource.classId),
            where('batchId', '==', promotionSource.batchId)
          ]);
          
          // Filter by status client-side to support legacy data
          const activeStudents = studentsData.filter(s => (s.status || 'active') === 'active');
          setStudents(activeStudents);
          
          // Fetch fees for these students only
          const studentIds = activeStudents.map(s => s.uid || (s as any).id).filter(Boolean);
          if (studentIds.length > 0) {
            // Split into chunks of 10 for 'in' query if needed, or if many students, use multiple queries
            const feePromises = [];
            for (let i = 0; i < studentIds.length; i += 10) {
              const chunk = studentIds.slice(i, i + 10);
              feePromises.push(dbService.list('fees', [where('studentId', 'in', chunk)]));
            }
            const feeChunks = await Promise.all(feePromises);
            setFees(feeChunks.flat() as FeeRecord[]);
          } else {
            setFees([]);
          }
        } catch (error) {
          console.error("Error fetching promotion students:", error);
          toast.error("Failed to load students for promotion");
        }
      };
      fetchPromotionStudents();
    }
  }, [activeTab, promotionSource.classId, promotionSource.batchId]);

  const handlePromote = async () => {
    if (!hasPermission('students_promote')) {
      toast.error("You don't have permission to promote students");
      return;
    }
    if (!promotionTarget.classId || !promotionTarget.batchId || !promotionTarget.academicYear) {
      toast.error("Please select target class, batch and academic year");
      return;
    }
    if (selectedStudents.length === 0) {
      toast.error("Please select students to promote");
      return;
    }

    setIsPromoting(true);
    try {
      const promotionPromises = selectedStudents.map(async (studentId) => {
        const student = students.find(s => s.uid === studentId);
        if (!student) return;

        // 1. Update student details for new year across both 'users' and 'students' collections
        const targetClassObj = classes.find(c => c.id === promotionTarget.classId);
        const targetBatchObj = batches.find(b => b.id === promotionTarget.batchId);
        const targetClassName = targetClassObj?.name || promotionTarget.classId || '';
        const targetBatchName = targetBatchObj?.name || promotionTarget.batchId || '';

        const updatePayload = {
          classId: promotionTarget.classId,
          batchId: promotionTarget.batchId,
          academicYear: promotionTarget.academicYear,
          class: targetClassName,
          className: targetClassName,
          batch: targetBatchName,
          batchName: targetBatchName,
          section: targetBatchName,
          updatedAt: new Date().toISOString()
        };

        await Promise.all([
          dbService.update('users', studentId, updatePayload).catch(() => {}),
          dbService.update('students', studentId, updatePayload).catch(() => {})
        ]);

        // Sync existing examMarks records for this student to the new class & batch
        try {
          const studentMarks = await dbService.list('examMarks', [where('studentId', '==', studentId)]);
          if (Array.isArray(studentMarks) && studentMarks.length > 0) {
            const markUpdates = studentMarks.map((m: any) => ({
              id: m.id,
              data: {
                classId: promotionTarget.classId,
                batchId: promotionTarget.batchId,
                className: targetClassName,
                batchName: targetBatchName,
                section: targetBatchName,
                updatedAt: new Date().toISOString()
              }
            }));
            await dbService.updateBatch('examMarks', markUpdates);
          }
        } catch (mErr) {
          console.error("Error updating examMarks on promotion:", mErr);
        }

        // 2. Calculate pending fee from current year
        const currentFee = fees.find(f => f.studentId === studentId && f.academicYear === promotionSource.academicYear);
        const pendingAmount = currentFee ? (currentFee.totalAmount - currentFee.paidAmount) : 0;

        // 3. Create/Update fee record for new year with old fee carry forward
        const nextYearFee = fees.find(f => f.studentId === studentId && f.academicYear === promotionTarget.academicYear);
        
        if (nextYearFee) {
          await dbService.update('fees', nextYearFee.id!, {
            oldFee: (nextYearFee.oldFee || 0) + pendingAmount
          });
        } else {
          await dbService.add('fees', {
            studentId,
            academicYear: promotionTarget.academicYear,
            totalAmount: 0, // Will be updated when fee structure is applied
            paidAmount: 0,
            oldFee: pendingAmount,
            status: 'pending',
            dueDate: new Date(new Date().getFullYear() + 1, 3, 1).toISOString() // Default to next April
          });
        }
      });

      await Promise.all(promotionPromises);
      toast.success(`Successfully promoted ${selectedStudents.length} students`);
      setSelectedStudents([]);
    } catch (error) {
      console.error("Promotion error:", error);
      toast.error("Failed to promote students");
    } finally {
      setIsPromoting(false);
    }
  };


  const handleOpenModal = (item: any = null) => {
    if (!canManage) {
      toast.error("Teachers are not permitted to add or edit academic records.");
      return;
    }
    if (item) {
      setEditingItem(item);
      if (activeTab === 'batches') {
        const matchedTeacher = findTeacherForBatch(item, teachers);
        const tId = matchedTeacher ? (matchedTeacher.canonicalId || matchedTeacher.uid || matchedTeacher.id) : (item.classTeacherId || '');
        const tName = matchedTeacher ? (matchedTeacher.name || getStaffDisplayName(matchedTeacher)) : (item.classTeacherName || item.classTeacher || '');
        const tEmail = matchedTeacher ? (matchedTeacher.email || '') : (item.classTeacherEmail || '');
        setFormData({
          ...item,
          classTeacherId: tId,
          classTeacher: tName,
          classTeacherName: tName,
          classTeacherEmail: tEmail
        });
      } else {
        setFormData(item);
      }
    } else {
      setEditingItem(null);
      setFormData(activeTab === 'batches' ? { classId: classes[0]?.id || '', classTeacherId: '', classTeacher: '', classTeacherName: '', classTeacherEmail: '' } : 
                  activeTab === 'subjects' ? { type: 'theory' } : {});
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Permission check based on tab
    const canManageClasses = hasPermission('classes_manage');
    const canManageBatches = hasPermission('batches_manage');
    const canManageSubjects = hasPermission('subjects_manage');
    const canManageHolidays = hasPermission('holidays_manage');

    if (activeTab === 'classes' && !canManageClasses) return toast.error("No permission to manage classes");
    if (activeTab === 'batches' && !canManageBatches) return toast.error("No permission to manage batches");
    if (activeTab === 'subjects' && !canManageSubjects) return toast.error("No permission to manage subjects");
    if (activeTab === 'holidays' && !canManageHolidays) return toast.error("No permission to manage holidays");

    try {
      const collection = activeTab;
      
      // Duplicate checks
      if (activeTab === 'classes') {
        const isDuplicate = classes.some(c => 
          c.id !== editingItem?.id && 
          ((String(c.name || "")).toLowerCase() === formData.name?.trim().toLowerCase() || 
           (String(c.code || "")).toLowerCase() === formData.code?.trim().toLowerCase())
        );
        if (isDuplicate) {
          toast.error("A class with this name or code already exists");
          return;
        }
      }

      if (activeTab === 'batches') {
        const isDuplicate = batches.some(b => 
          b.id !== editingItem?.id && 
          b.classId === formData.classId &&
          (String(b.name || "")).toLowerCase() === formData.name?.trim().toLowerCase()
        );
        if (isDuplicate) {
          toast.error("A batch with this name already exists in the selected class");
          return;
        }

        const selectedClass = classes.find(c => c.id === formData.classId);
        const className = selectedClass?.name || formData.className || formData.classId || '';
        const sanitizedBatchName = (formData.name || '').trim().replace(/\s+/g, '');
        const batchName = (formData.name || '').trim();
        const customId = `${className}_${sanitizedBatchName}`;
        const batchId = editingItem?.id || customId;

        // Resolve assigned teacher object
        let newTeacher: any = null;
        if (formData.classTeacherId || formData.classTeacherEmail || formData.classTeacherName) {
          newTeacher = teachers.find(t => 
            (formData.classTeacherId && (
              t.canonicalId === formData.classTeacherId || 
              t.uid === formData.classTeacherId || 
              t.id === formData.classTeacherId || 
              (t.allIds && t.allIds.has(String(formData.classTeacherId).toLowerCase()))
            )) ||
            (formData.classTeacherEmail && t.email && t.email.toLowerCase() === String(formData.classTeacherEmail).toLowerCase()) ||
            (formData.classTeacherName && t.name && t.name.toLowerCase() === String(formData.classTeacherName).toLowerCase())
          ) || null;
        }

        const assignedTeacherName = newTeacher ? (getStaffDisplayName(newTeacher) || newTeacher.name) : (formData.classTeacherName || formData.classTeacher || '');
        const assignedTeacherEmail = newTeacher ? (newTeacher.email || '') : (formData.classTeacherEmail || '');
        const assignedTeacherUid = newTeacher ? (newTeacher.canonicalId || newTeacher.uid || newTeacher.id) : (formData.classTeacherId || '');

        const batchDataToSave = {
          ...formData,
          id: batchId,
          name: batchName,
          className: className,
          classId: formData.classId,
          classTeacher: assignedTeacherName || 'Not Assigned',
          classTeacherName: assignedTeacherName || 'Not Assigned',
          classTeacherEmail: assignedTeacherEmail || '',
          classTeacherId: assignedTeacherUid || '',
          isUserModified: true,
          isEditedByUser: true,
          updatedAt: new Date().toISOString()
        };

        if (editingItem?.id) {
          // If already assigned by admin, ensure permissions
          if (editingItem.classTeacherId && formData.classTeacherId !== editingItem.classTeacherId && !isFullAdmin) {
            toast.error("Class teacher assigned by Admin cannot be changed without Admin permission.");
            return;
          }

          // 1. Save directly to batches
          await dbService.set('batches', editingItem.id, batchDataToSave);
          await dbService.update('batches', editingItem.id, batchDataToSave).catch(() => {});

          // 2. Identify old teacher
          const oldTeacher = findTeacherForBatch(editingItem, teachers) || 
            (editingItem.classTeacherId ? teachers.find(t => t.canonicalId === editingItem.classTeacherId || t.uid === editingItem.classTeacherId || t.id === editingItem.classTeacherId || (t.allIds && t.allIds.has(String(editingItem.classTeacherId).toLowerCase()))) : null);

          const teacherChanged = assignedTeacherUid !== (editingItem.classTeacherId || '') || 
                                 assignedTeacherEmail !== (editingItem.classTeacherEmail || '') || 
                                 assignedTeacherName !== (editingItem.classTeacherName || editingItem.classTeacher || '');

          if (teacherChanged) {
            // A. Update old teacher (if existed)
            if (oldTeacher || editingItem.classTeacherId || editingItem.classTeacherEmail) {
              const oldTeacherIdentifiers = new Set<string>([
                editingItem.classTeacherId,
                editingItem.classTeacherEmail?.toLowerCase(),
                oldTeacher?.uid,
                oldTeacher?.id,
                oldTeacher?.canonicalId,
                oldTeacher?.email?.toLowerCase()
              ].filter(Boolean));

              const isStillClassTeacherOfOtherBatch = batches.some(b => 
                b.id !== editingItem.id && (
                  (b.classTeacherId && oldTeacherIdentifiers.has(b.classTeacherId)) ||
                  (b.classTeacherEmail && oldTeacherIdentifiers.has(b.classTeacherEmail.toLowerCase()))
                )
              );

              const oldDocIds: string[] = Array.from(oldTeacher?.docIds || [oldTeacher?.id, oldTeacher?.uid, editingItem.classTeacherId].filter(Boolean));
              if (oldTeacher?.email || editingItem.classTeacherEmail) {
                const oldEmail = (oldTeacher?.email || editingItem.classTeacherEmail).toLowerCase();
                const [uList, sList] = await Promise.all([
                  dbService.list('users', [where('email', '==', oldEmail)], true).catch(() => []),
                  dbService.list('staff', [where('email', '==', oldEmail)], true).catch(() => [])
                ]);
                (uList || []).forEach((u: any) => u?.id && oldDocIds.push(u.id));
                (sList || []).forEach((s: any) => s?.id && oldDocIds.push(s.id));
              }

              const uniqueOldDocIds = Array.from(new Set(oldDocIds));
              const currentBatchIds = Array.isArray(oldTeacher?.batchIds) ? oldTeacher.batchIds : [];
              const updatedBatchIds = currentBatchIds.filter((bId: string) => bId !== editingItem.id);

              for (const docId of uniqueOldDocIds) {
                const oldTeacherPayload: any = {
                  batchIds: updatedBatchIds,
                  batchId: isStillClassTeacherOfOtherBatch ? (updatedBatchIds[0] || '') : '',
                  updatedAt: new Date().toISOString()
                };
                if (!isStillClassTeacherOfOtherBatch) {
                  oldTeacherPayload.classTeacherBatchId = '';
                  oldTeacherPayload.classTeacherBatchName = '';
                  oldTeacherPayload.classTeacherClassId = '';
                  oldTeacherPayload.classTeacherClassName = '';
                  if (oldTeacher?.role === 'teacher_class' || oldTeacher?.role === 'teacher') {
                    oldTeacherPayload.role = 'teacher_subject';
                    oldTeacherPayload.designation = 'Subject Teacher';
                  }
                }
                await dbService.update('users', docId, oldTeacherPayload).catch(() => {});
                await dbService.update('staff', docId, oldTeacherPayload).catch(() => {});
              }
            }

            // B. Update new teacher (if assigned)
            if (assignedTeacherUid || assignedTeacherEmail) {
              const newDocIds: string[] = Array.from(newTeacher?.docIds || [newTeacher?.id, newTeacher?.uid, assignedTeacherUid].filter(Boolean));
              if (assignedTeacherEmail) {
                const newEmail = assignedTeacherEmail.toLowerCase();
                const [uList, sList] = await Promise.all([
                  dbService.list('users', [where('email', '==', newEmail)], true).catch(() => []),
                  dbService.list('staff', [where('email', '==', newEmail)], true).catch(() => [])
                ]);
                (uList || []).forEach((u: any) => u?.id && newDocIds.push(u.id));
                (sList || []).forEach((s: any) => s?.id && newDocIds.push(s.id));
              }
              const uniqueNewDocIds = Array.from(new Set(newDocIds));
              const currentBatchIds = Array.isArray(newTeacher?.batchIds) ? newTeacher.batchIds : [];
              const updatedBatchIds = Array.from(new Set([...currentBatchIds, editingItem.id]));

              const existingTeacherRole = (newTeacher?.role || '').toLowerCase().trim();
              const isNonTeachingRole = ['accountant', 'clerk', 'driver', 'attendant', 'helper', 'aya', 'receptionist', 'doctor', 'warden', 'admin', 'superadmin', 'principal', 'vice_principal'].includes(existingTeacherRole);

              for (const docId of uniqueNewDocIds) {
                const newTeacherPayload: any = {
                  batchIds: updatedBatchIds,
                  batchId: editingItem.id,
                  batchName: batchName,
                  classTeacherBatchId: editingItem.id,
                  classTeacherBatchName: batchName,
                  classTeacherClassId: formData.classId,
                  classTeacherClassName: className,
                  classId: formData.classId,
                  className: className,
                  role: isNonTeachingRole ? (newTeacher?.role || 'staff') : 'teacher_class',
                  designation: isNonTeachingRole ? (newTeacher?.designation || 'Staff') : 'Class Teacher',
                  isEditedByUser: true,
                  isUserModified: true,
                  updatedAt: new Date().toISOString()
                };
                await dbService.update('users', docId, newTeacherPayload).catch(() => {});
                await dbService.update('staff', docId, newTeacherPayload).catch(() => {});
              }
            }
          }

          // 3. Sync to students belonging to this batch
          try {
            const studentsInBatch = await dbService.list('students', [where('batchId', '==', editingItem.id)], true).catch(() => []);
            for (const st of (studentsInBatch || [])) {
              if (st?.id || st?.uid) {
                await dbService.update('students', st.id || st.uid, {
                  classTeacher: assignedTeacherName || 'Not Assigned',
                  classTeacherName: assignedTeacherName || 'Not Assigned',
                  classTeacherEmail: assignedTeacherEmail,
                  classTeacherId: assignedTeacherUid,
                  updatedAt: new Date().toISOString()
                }).catch(() => {});
              }
            }
          } catch (stErr) {
            console.error("Failed to sync students class teacher:", stErr);
          }

          // 4. Sync to timetables for this batch
          try {
            const timetablesList = await dbService.list('timetables', [where('batchId', '==', editingItem.id)], true).catch(() => []);
            for (const tt of (timetablesList || [])) {
              if (tt?.id) {
                await dbService.update('timetables', tt.id, {
                  classTeacher: assignedTeacherName || 'Not Assigned',
                  classTeacherName: assignedTeacherName || 'Not Assigned',
                  classTeacherId: assignedTeacherUid,
                  updatedAt: new Date().toISOString()
                }).catch(() => {});
              }
            }
          } catch (ttErr) {
            console.error("Failed to sync timetable class teacher:", ttErr);
          }

          // 5. Update local React state
          setBatches(prev => prev.map(b => b.id === editingItem.id ? { ...b, ...batchDataToSave } : b));
          fetchMetadata().catch(() => {});
          toast.success("Batch and Class Teacher assignment updated successfully");
        } else {
          // Creating a new batch
          const existing = await dbService.get('batches', customId);
          if (existing) {
            toast.error("This batch already exists for the selected class!");
            return;
          }

          await dbService.set('batches', customId, {
            ...batchDataToSave,
            createdAt: new Date().toISOString()
          });

          // If teacher is assigned, update teacher's profiles
          if (assignedTeacherUid || assignedTeacherEmail) {
            const newDocIds: string[] = Array.from(newTeacher?.docIds || [newTeacher?.id, newTeacher?.uid, assignedTeacherUid].filter(Boolean));
            if (assignedTeacherEmail) {
              const newEmail = assignedTeacherEmail.toLowerCase();
              const [uList, sList] = await Promise.all([
                dbService.list('users', [where('email', '==', newEmail)], true).catch(() => []),
                dbService.list('staff', [where('email', '==', newEmail)], true).catch(() => [])
              ]);
              (uList || []).forEach((u: any) => u?.id && newDocIds.push(u.id));
              (sList || []).forEach((s: any) => s?.id && newDocIds.push(s.id));
            }
            const uniqueNewDocIds = Array.from(new Set(newDocIds));
            const currentBatchIds = Array.isArray(newTeacher?.batchIds) ? newTeacher.batchIds : [];
            const updatedBatchIds = Array.from(new Set([...currentBatchIds, customId]));

            const existingTeacherRole = (newTeacher?.role || '').toLowerCase().trim();
            const isNonTeachingRole = ['accountant', 'clerk', 'driver', 'attendant', 'helper', 'aya', 'receptionist', 'doctor', 'warden', 'admin', 'superadmin', 'principal', 'vice_principal'].includes(existingTeacherRole);

            for (const docId of uniqueNewDocIds) {
              const newTeacherPayload: any = {
                batchIds: updatedBatchIds,
                batchId: customId,
                batchName: batchName,
                classTeacherBatchId: customId,
                classTeacherBatchName: batchName,
                classTeacherClassId: formData.classId,
                classTeacherClassName: className,
                classId: formData.classId,
                className: className,
                role: isNonTeachingRole ? (newTeacher?.role || 'staff') : 'teacher_class',
                designation: isNonTeachingRole ? (newTeacher?.designation || 'Staff') : 'Class Teacher',
                isEditedByUser: true,
                isUserModified: true,
                updatedAt: new Date().toISOString()
              };
              await dbService.update('users', docId, newTeacherPayload).catch(() => {});
              await dbService.update('staff', docId, newTeacherPayload).catch(() => {});
            }
          }

          setBatches(prev => [...prev, { ...batchDataToSave, createdAt: new Date().toISOString() }]);
          fetchMetadata().catch(() => {});
          toast.success("Batch created successfully");
        }
      } else if (activeTab === 'classes') {
        const sanitizedClassName = (formData.name || '').trim().replace(/\s+/g, '_');
        const customId = `${sanitizedClassName}_Class`;
        const classData = {
          ...formData,
          name: formData.name?.trim(),
          updatedAt: new Date().toISOString()
        };

        if (editingItem?.id) {
          await dbService.update('classes', editingItem.id, classData);
          setClasses(prev => prev.map(c => c.id === editingItem.id ? { ...c, ...classData } : c));
          toast.success("Class updated successfully");
        } else {
          await dbService.set('classes', customId, {
            ...classData,
            id: customId,
            createdAt: new Date().toISOString()
          });
          setClasses(prev => [...prev, { ...classData, id: customId, createdAt: new Date().toISOString() }]);
          toast.success("Class created successfully");
        }
      } else if (activeTab === 'subjects') {
        const sanitizedName = (formData.name || '').trim().replace(/\s+/g, '_');
        const uniqueCode = formData.code ? formData.code.trim() : Math.random().toString(36).substring(7).toUpperCase();
        const customId = `${sanitizedName}_${uniqueCode}`;
        const subjectData = {
          ...formData,
          name: formData.name?.trim(),
          code: formData.code?.trim(),
          updatedAt: new Date().toISOString()
        };

        if (editingItem?.id) {
          await dbService.update('subjects', editingItem.id, subjectData);
          setSubjects(prev => prev.map(s => s.id === editingItem.id ? { ...s, ...subjectData } : s));
          toast.success("Subject updated successfully");
        } else {
          const existing = await dbService.get('subjects', customId);
          if (existing) {
            toast.error("This subject already exists in the system!");
            return;
          }
          await dbService.set('subjects', customId, {
            ...subjectData,
            id: customId,
            createdAt: new Date().toISOString()
          });
          setSubjects(prev => [...prev, { ...subjectData, id: customId, createdAt: new Date().toISOString() }]);
          toast.success("Subject created successfully");
        }
      } else if (activeTab === 'holidays') {
        const holidayData = { ...formData };
        if (!holidayData.toDate) holidayData.toDate = holidayData.date;
        
        if (new Date(holidayData.toDate) < new Date(holidayData.date)) {
          toast.error("To Date cannot be before From Date");
          return;
        }
        
        if (editingItem?.id) {
          await dbService.update('holidays', editingItem.id, holidayData);
          setHolidays(prev => prev.map(h => h.id === editingItem.id ? { ...h, ...holidayData } : h));
          toast.success("Holiday updated successfully");
        } else {
          const newId = await dbService.add('holidays', holidayData);
          setHolidays(prev => [...prev, { ...holidayData, id: newId }]);
          toast.success("Holiday created successfully");
        }
      }

      setShowModal(false);
    } catch (error) {
      console.error("Submit Error:", error);
      toast.error("Failed to save data");
    }
  };

  const handleDelete = (id: string) => {
    // Permission check based on tab
    const canManageClasses = hasPermission('classes_manage');
    const canManageBatches = hasPermission('batches_manage');
    const canManageSubjects = hasPermission('subjects_manage');
    const canManageHolidays = hasPermission('holidays_manage');

    if (activeTab === 'classes' && !canManageClasses) return toast.error("No permission to delete classes");
    if (activeTab === 'batches' && !canManageBatches) return toast.error("No permission to delete batches");
    if (activeTab === 'subjects' && !canManageSubjects) return toast.error("No permission to delete subjects");
    if (activeTab === 'holidays' && !canManageHolidays) return toast.error("No permission to delete holidays");
    
    setConfirmConfig({
      title: `Delete ${activeTab.slice(0, -1)}`,
      message: `Are you sure you want to delete this ${activeTab.slice(0, -1)}? This action cannot be undone and may affect associated records.`,
      onConfirm: async () => {
        try {
          if (activeTab === 'batches') {
            const batchToDelete = batches.find(b => b.id === id);
            if (batchToDelete && batchToDelete.classTeacherId && !isFullAdmin) {
              toast.error("Cannot delete a batch with an assigned Class Teacher without Admin permission.");
              return;
            }
            if (batchToDelete && batchToDelete.classTeacherId) {
              const teacherId = batchToDelete.classTeacherId;
              const isStillClassTeacher = batches.some(b => b.id !== id && b.classTeacherId === teacherId);
              if (!isStillClassTeacher) {
                try {
                  await dbService.update('users', teacherId, { role: 'teacher', classTeacherBatchId: '' });
                  await dbService.update('staff', teacherId, { role: 'teacher', classTeacherBatchId: '' });
                } catch (roleErr) {
                  console.error("Failed to revert teacher role on batch deletion:", roleErr);
                }
              }
            }
            setBatches(prev => prev.filter(b => b.id !== id));
          } else if (activeTab === 'classes') {
            setClasses(prev => prev.filter(c => c.id !== id));
          } else if (activeTab === 'subjects') {
            setSubjects(prev => prev.filter(s => s.id !== id));
          } else if (activeTab === 'holidays') {
            setHolidays(prev => prev.filter(h => h.id !== id));
          }
          await dbService.delete(activeTab, id);
          toast.success(`${activeTab.slice(0, -1)} deleted successfully`);
        } catch (error) {
          console.error("Delete error:", error);
          toast.error("Failed to delete");
        }
        setShowConfirmModal(false);
      }
    });
    setShowConfirmModal(true);
  };

  const canViewAllClasses = isAdmin || hasPermission('classes_view_all');
  const canViewAllBatches = isAdmin || hasPermission('batches_view_all');
  const canViewAllSubjects = isAdmin || hasPermission('subjects_view_all');

  const currentTeacherObj = useMemo(() => {
    if (!profile) return null;
    const pUid = profile.uid || profile.id;
    const pEmail = profile.email?.toLowerCase().trim();
    const pName = profile.name ? String(profile.name).toLowerCase().trim() : '';
    const pStaffId = (profile as any)?.staffId;

    return (teachers || []).find((t: any) => {
      if (!t) return false;
      if (pUid && (t.uid === pUid || t.id === pUid)) return true;
      if (pStaffId && (t.staffId === pStaffId || t.uid === pStaffId || t.id === pStaffId)) return true;
      if (pEmail && t.email && String(t.email).toLowerCase().trim() === pEmail) return true;
      if (pName && t.name && String(t.name).toLowerCase().trim() === pName) return true;
      return false;
    }) || null;
  }, [profile, teachers]);

  const teacherIdentifiers = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();

    if (profile) {
      if (profile.uid) ids.add(profile.uid);
      if (profile.id) ids.add(profile.id);
      if ((profile as any)?.staffId) ids.add((profile as any).staffId);
      if (profile.email) ids.add(profile.email);
      if (profile.name) names.add(String(profile.name).toLowerCase().trim());
    }

    if (currentTeacherObj) {
      if (currentTeacherObj.uid) ids.add(currentTeacherObj.uid);
      if (currentTeacherObj.id) ids.add(currentTeacherObj.id);
      if ((currentTeacherObj as any)?.staffId) ids.add((currentTeacherObj as any).staffId);
      if (currentTeacherObj.email) ids.add(currentTeacherObj.email);
      if (currentTeacherObj.name) names.add(String(currentTeacherObj.name).toLowerCase().trim());
    }

    return { ids, names };
  }, [profile, currentTeacherObj]);

  const isClassTeacherForBatch = useCallback((b: any) => {
    if (!b) return false;
    if (b.classTeacherId && teacherIdentifiers.ids.has(b.classTeacherId)) return true;
    if (b.classTeacher && teacherIdentifiers.names.has(String(b.classTeacher).toLowerCase().trim())) return true;
    if (b.classTeacherName && teacherIdentifiers.names.has(String(b.classTeacherName).toLowerCase().trim())) return true;
    if ((profile as any)?.classTeacherBatchId && b.id === (profile as any).classTeacherBatchId) return true;
    return false;
  }, [profile, teacherIdentifiers]);

  const teacherAssignedBatchIds = useMemo(() => {
    const set = new Set<string>();
    if (teacherAssignments) {
      teacherAssignments.assignedBatchIds.forEach(id => set.add(id));
    }
    if (profile?.batchId) set.add(profile.batchId);
    if (Array.isArray((profile as any)?.batchIds)) {
      (profile as any).batchIds.forEach((id: string) => set.add(id));
    }
    batches.filter(b => isClassTeacherForBatch(b)).forEach(b => {
      if (b.id) set.add(b.id);
    });
    return set;
  }, [teacherAssignments, profile, batches, isClassTeacherForBatch]);

  const teacherAssignedClassIds = useMemo(() => {
    const set = new Set<string>();
    if (teacherAssignments) {
      teacherAssignments.assignedClassIds.forEach(id => set.add(id));
    }
    if (profile?.classId) set.add(profile.classId);
    if (Array.isArray((profile as any)?.classIds)) {
      (profile as any).classIds.forEach((id: string) => set.add(id));
    }
    batches.forEach(b => {
      if (b.id && teacherAssignedBatchIds.has(b.id) && b.classId) {
        set.add(b.classId);
      }
    });
    return set;
  }, [teacherAssignments, profile, batches, teacherAssignedBatchIds]);

  const teacherAssignedSubjects = useMemo(() => {
    const set = new Set<string>();
    if (teacherAssignments) {
      teacherAssignments.assignedSubjects.forEach(s => set.add(s.toLowerCase().trim()));
    }
    if (Array.isArray(profile?.subjects)) {
      profile.subjects.forEach((s: string) => set.add(s.toLowerCase().trim()));
    }
    batches.forEach(b => {
      if (b.id && teacherAssignedBatchIds.has(b.id) && Array.isArray(b.subjectIds)) {
        b.subjectIds.forEach((sId: string) => set.add(sId.toLowerCase().trim()));
      }
    });
    classes.forEach(c => {
      if (c.id && teacherAssignedClassIds.has(c.id) && Array.isArray(c.subjectIds)) {
        c.subjectIds.forEach((sId: string) => set.add(sId.toLowerCase().trim()));
      }
    });
    return set;
  }, [teacherAssignments, profile, batches, classes, teacherAssignedBatchIds, teacherAssignedClassIds]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar">Academics</h1>
          <p className="text-neutral-500">Manage classes, batches, and subjects</p>
        </div>
        <div className="flex gap-2">
          {(() => {
            const canManage = !isTeacherRole && !isVicePrincipalRole && (
                            (activeTab === 'classes' && hasPermission('classes_manage')) ||
                            (activeTab === 'batches' && hasPermission('batches_manage')) ||
                            (activeTab === 'subjects' && hasPermission('subjects_manage')) ||
                            (activeTab === 'holidays' && hasPermission('holidays_manage'))
                          );
            
            return canManage && (activeTab as any) !== 'promotion' && (
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl hover:bg-sidebar transition-all shadow-lg shadow-primary/20 font-bold"
              >
                <Plus className="w-5 h-5" />
                Add New {activeTab.slice(0, -1)}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-neutral-100 rounded-2xl w-fit">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold ${
              activeTab === tab.id 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-neutral-500 hover:text-sidebar'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {isTeacherRole && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
              batches.some(b => isClassTeacherForBatch(b))
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
            }`}>
              {batches.some(b => isClassTeacherForBatch(b)) ? 'Class Teacher' : 'Subject Teacher'}
            </span>
            <p className="text-sm font-semibold text-neutral-600">
              {batches.some(b => isClassTeacherForBatch(b))
                ? `You are assigned as the Class Teacher for: ${batches.filter(b => isClassTeacherForBatch(b)).map(b => b.name).join(', ')}`
                : 'You are currently a Subject Teacher (Not assigned as Class Teacher for any class/batch).'}
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 overflow-hidden">
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-neutral-400 font-medium">Loading academic data...</p>
          </div>
        ) : activeTab === 'promotion' ? (
          <div className="p-8 space-y-8">
            {/* Upgrade Guide Box */}
            <div className="p-6 bg-blue-50/50 rounded-3xl border border-blue-100/50 flex flex-col md:flex-row gap-6 relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-50 rounded-full blur-3xl opacity-50" />
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-500 shadow-sm shrink-0 border border-blue-100">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-blue-900">Step-by-Step Upgrade Guide</h3>
                  <p className="text-sm text-blue-700/80">Follow these steps to promote students to the next academic year accurately.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { step: 1, title: "Select Source", desc: "Choose the current Class, Batch, and Academic Year of the students." },
                    { step: 2, title: "Set Target", desc: "Define where they are going (Next Class, Batch, and New Academic Year)." },
                    { step: 3, title: "Confirm & Promote", desc: "Select individual students or 'Select All' and click the Promote button." }
                  ].map((item) => (
                    <div key={item.step} className="p-3 bg-white/60 rounded-xl border border-blue-100/50 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-[12px] flex items-center justify-center font-bold">
                          {item.step}
                        </span>
                        <span className="text-sm font-bold text-blue-900">{item.title}</span>
                      </div>
                      <p className="text-[12px] text-blue-800/70 leading-relaxed font-medium">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-blue-100/30 rounded-xl flex items-start gap-3">
                  <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-blue-800/80 font-medium leading-relaxed">
                    <span className="font-bold text-blue-900 uppercase tracking-wider">Note:</span> Promoting students will automatically carry forward any pending fee balances to the new academic year's fee record.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Source Selection */}
              <div className="space-y-4 p-6 bg-neutral-50 rounded-3xl border border-neutral-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sidebar">Source (Current)</h3>
                </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[12px] font-bold text-neutral-400 uppercase tracking-widest">Academic Year</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all text-sm font-bold"
                      value={promotionSource.academicYear}
                      onChange={(e) => setPromotionSource({...promotionSource, academicYear: e.target.value})}
                    >
                      {settings.academicYears?.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-bold text-neutral-400 uppercase tracking-widest">Class</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all text-sm font-bold"
                      value={promotionSource.classId}
                      onChange={(e) => setPromotionSource({...promotionSource, classId: e.target.value, batchId: ''})}
                    >
                      <option value="">Select Class</option>
                      {classes.filter(c => canViewAllClasses || c.id === profile?.classId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[12px] font-bold text-neutral-400 uppercase tracking-widest">Batch</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all text-sm font-bold"
                      value={promotionSource.batchId}
                      onChange={(e) => setPromotionSource({...promotionSource, batchId: e.target.value})}
                      disabled={!promotionSource.classId}
                    >
                      <option value="">Select Batch</option>
                      {batches.filter(b => b.classId === promotionSource.classId && (canViewAllBatches || b.id === profile?.batchId)).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} (Strength: {allStudents.filter(s => s && s.batchId === b.id && (s.status || 'active') === 'active').length})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Target Selection */}
              <div className="space-y-4 p-6 bg-primary/5 rounded-3xl border border-primary/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sidebar">Target (Next)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Academic Year</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all text-sm font-bold"
                      value={promotionTarget.academicYear}
                      onChange={(e) => setPromotionTarget({...promotionTarget, academicYear: e.target.value})}
                    >
                      <option value="">Select Year</option>
                      {settings.academicYears?.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Class</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all text-sm font-bold"
                      value={promotionTarget.classId}
                      onChange={(e) => setPromotionTarget({...promotionTarget, classId: e.target.value, batchId: ''})}
                    >
                      <option value="">Select Class</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Batch</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all text-sm font-bold"
                      value={promotionTarget.batchId}
                      onChange={(e) => setPromotionTarget({...promotionTarget, batchId: e.target.value})}
                      disabled={!promotionTarget.classId}
                    >
                      <option value="">Select Batch</option>
                      {batches.filter(b => b.classId === promotionTarget.classId).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} (Strength: {allStudents.filter(s => s && s.batchId === b.id && (s.status || 'active') === 'active').length})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Student List */}
            {promotionSource.classId && promotionSource.batchId && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sidebar flex items-center gap-2">
                    Students in {classes.find(c => c && c.id === promotionSource.classId)?.name} - {batches.find(b => b && b.id === promotionSource.batchId)?.name}
                    <span className="px-2 py-0.5 bg-neutral-100 text-neutral-500 text-[10px] rounded-full">{students.filter(s => s && s.classId === promotionSource.classId && s.batchId === promotionSource.batchId).length} Total</span>
                  </h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedStudents(students.filter(s => s && s.classId === promotionSource.classId && s.batchId === promotionSource.batchId).map(s => s.uid))}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button 
                      onClick={() => setSelectedStudents([])}
                      className="text-xs font-bold text-neutral-400 hover:underline"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {students
                    .filter(s => s && s.classId === promotionSource.classId && s.batchId === promotionSource.batchId)
                    .map(student => {
                      const isSelected = selectedStudents.includes(student.uid);
                      const fee = fees.find(f => f.studentId === student.uid && f.academicYear === promotionSource.academicYear);
                      const pending = fee ? (fee.totalAmount - fee.paidAmount) : 0;

                      return (
                        <button
                          key={student.uid}
                          onClick={() => {
                            if (isSelected) setSelectedStudents(selectedStudents.filter(id => id !== student.uid));
                            else setSelectedStudents([...selectedStudents, student.uid]);
                          }}
                          className={`p-4 rounded-2xl border text-left transition-all relative group ${
                            isSelected 
                              ? 'bg-primary/5 border-primary shadow-sm' 
                              : 'bg-white border-neutral-100 hover:border-neutral-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                              isSelected ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-400'
                            }`}>
                              {(String(student.name || "")).charAt(0)}
                            </div>
                            <div className="overflow-hidden">
                              <p className={`font-bold text-sm truncate ${(String(student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{student.name}</p>
                              <p className="text-[10px] text-neutral-400 font-mono">Roll: {student.rollNumber}</p>
                            </div>
                          </div>
                          {pending > 0 && (
                            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Pending Fee</span>
                              <span className="text-xs font-bold text-red-500">₹{pending.toLocaleString()}</span>
                            </div>
                          )}
                          <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-primary border-primary text-white' : 'bg-white border-neutral-100'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3" />}
                          </div>
                        </button>
                      );
                    })}
                </div>

                <div className="pt-8 border-t border-neutral-100 flex items-center justify-between">
                  <div className="text-sm text-neutral-500">
                    <span className="font-bold text-sidebar">{selectedStudents.length}</span> students selected for promotion
                  </div>
                  <button
                    onClick={handlePromote}
                    disabled={isPromoting || selectedStudents.length === 0}
                    className="flex items-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl hover:bg-sidebar transition-all shadow-xl shadow-primary/20 font-bold disabled:opacity-50"
                  >
                    {isPromoting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <ArrowRight className="w-5 h-5" />
                        Promote Students
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {!promotionSource.classId && (
              <div className="py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto">
                  <Users className="w-10 h-10 text-neutral-200" />
                </div>
                <div className="max-w-xs mx-auto">
                  <h4 className="font-bold text-sidebar">Select Source Class</h4>
                  <p className="text-sm text-neutral-400">Choose a class and batch to start promoting students to the next academic year.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/50 border-b border-neutral-100">
                  {activeTab === 'classes' && (
                    <>
                      <SortHeader column="name" label="Class Name" />
                      <SortHeader column="code" label="Code" />
                      <th className="px-6 py-4 text-[13px] font-bold text-neutral-400 uppercase tracking-wider">Batches</th>
                      <th className="px-6 py-4 text-[13px] font-bold text-neutral-400 uppercase tracking-wider">Subjects</th>
                      <SortHeader column="description" label="Description" />
                    </>
                  )}
                  {activeTab === 'batches' && (
                    <>
                      <SortHeader column="name" label="Batch Name" />
                      <SortHeader column="classId" label="Class" />
                      <SortHeader column="classTeacherId" label="Class Teacher" />
                      <th className="px-6 py-4 text-[13px] font-bold text-neutral-400 uppercase tracking-wider">Subjects</th>
                    </>
                  )}
                  {activeTab === 'subjects' && (
                    <>
                      <SortHeader column="name" label="Subject Name" />
                      <SortHeader column="code" label="Code" />
                      <SortHeader column="type" label="Type" />
                    </>
                  )}
                  {activeTab === 'holidays' && (
                    <>
                      <SortHeader column="date" label="Date" />
                      <SortHeader column="title" label="Title" />
                      <SortHeader column="type" label="Type" />
                      <SortHeader column="description" label="Description" />
                    </>
                  )}
                  {!isTeacherRole && !isVicePrincipalRole && (
                    <th className="px-6 py-4 text-[13px] font-bold text-neutral-400 uppercase tracking-wider text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {activeTab === 'classes' && getSortedData<ClassRecord>(classes).filter(c => {
                  if (isTeacherRole) {
                    const cName = (c.name || '').toLowerCase().trim();
                    return teacherAssignedClassIds.has(c.id) || 
                      (teacherAssignments?.assignedClassNames ? Array.from(teacherAssignments.assignedClassNames).some(cn => cn && (cName === cn || cName.includes(cn) || cn.includes(cName))) : false);
                  }
                  return canViewAllClasses || c.id === profile?.classId;
                }).map((item) => {
                  const classBatches = batches.filter(b => 
                    (b.classId === item.id || (b && b.classId && classes.find(c => c && c.id === b.classId)?.name === item.name)) &&
                    (isTeacherRole ? (teacherAssignedBatchIds.has(b.id) || (teacherAssignments?.assignedBatchNames ? Array.from(teacherAssignments.assignedBatchNames).some(bn => bn && (b.name || '').toLowerCase().trim().includes(bn)) : false)) : true)
                  );
                  
                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors group">
                      <td className="px-6 py-4 font-bold text-sidebar">{item.name}</td>
                      <td className="px-6 py-4 text-neutral-600 font-mono text-sm">{item.code}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {classBatches.length > 0 ? (
                            classBatches.map(b => (
                              <span key={b.id} className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-[10px] font-bold rounded-md border border-neutral-200">
                                {b.name} ({allStudents.filter(s => s && s.batchId === b.id && (s.status || 'active') === 'active').length})
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-neutral-400 italic">No batches</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {item.subjectIds && item.subjectIds.length > 0 ? (
                            item.subjectIds.map((sid: string) => {
                              const s = subjects.find(sub => sub && sub.id === sid);
                              return s ? (
                                <span key={sid} className="px-2 py-0.5 bg-primary/5 text-primary text-[10px] font-bold rounded-md border border-primary/10">
                                  {s.name}
                                </span>
                              ) : null;
                            })
                          ) : (
                            <span className="text-[10px] text-neutral-400">None assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-neutral-500 text-sm">{item.description || '-'}</td>
                      {!isTeacherRole && !isVicePrincipalRole && (
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => handleOpenModal(item)} className="p-2 text-neutral-400 hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
                          {hasPermission('classes_manage') && (
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDelete(item.id!);
                              }}
                              className="p-2 text-neutral-400 hover:text-red-500 transition-colors relative z-10"
                            >
                              <Trash2 className="w-4 h-4 pointer-events-none" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {activeTab === 'batches' && getSortedData<BatchRecord>(batches).filter(b => {
                  if (isTeacherRole) {
                    const bName = (b.name || '').toLowerCase().trim();
                    return teacherAssignedBatchIds.has(b.id) ||
                      (teacherAssignments?.assignedBatchNames ? Array.from(teacherAssignments.assignedBatchNames).some(bn => bn && (bName === bn || bName.includes(bn) || bn.includes(bName))) : false);
                  }
                  return canViewAllBatches || b.id === profile?.batchId || b.classId === profile?.classId;
                }).map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-sidebar">
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-[11px] font-bold rounded-full">
                          {allStudents.filter(s => s && s.batchId === item.id && (s.status || 'active') === 'active').length} Students
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-neutral-600">
                      {classes.find(c => c && c.id === item.classId)?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-neutral-500">
                      {(() => {
                        const matchedTeacher = findTeacherForBatch(item, teachers);
                        const teacherName = getBatchClassTeacherDisplayName(item, teachers);
                        const isAssigned = teacherName !== 'Not Assigned';

                        return (
                          <div className="flex items-center gap-2">
                            {isAssigned ? (
                              <span className="font-bold text-neutral-800">{teacherName}</span>
                            ) : (
                              <span className="text-neutral-400 font-medium italic">Not Assigned</span>
                            )}
                            {isAssigned && (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase rounded tracking-wider flex items-center gap-0.5" title="Class Teacher assigned by Admin">
                                <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" /> Assigned
                              </span>
                            )}
                            {isAssigned && (matchedTeacher?.uid === profile?.uid || item.classTeacherId === profile?.uid) && (
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded tracking-wider">
                                You
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {item.subjectIds && item.subjectIds.length > 0 ? (
                          item.subjectIds.map((sid: string) => {
                            const s = (subjects || []).find(sub => sub && sub.id === sid);
                            return s ? (
                              <span key={sid} className="px-2 py-0.5 bg-primary/5 text-primary text-[10px] font-bold rounded-md border border-primary/10">
                                {s.name}
                              </span>
                            ) : null;
                          })
                        ) : (
                          <span className="text-[10px] text-neutral-400">None assigned</span>
                        )}
                      </div>
                    </td>
                    {!isTeacherRole && !isVicePrincipalRole && (
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => handleOpenModal(item)} className="p-2 text-neutral-400 hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
                        {hasPermission('batches_manage') && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(item.id!);
                            }}
                            className="p-2 text-neutral-400 hover:text-red-500 transition-colors relative z-10"
                          >
                            <Trash2 className="w-4 h-4 pointer-events-none" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {activeTab === 'subjects' && getSortedData<SubjectRecord>(subjects).filter(s => {
                  if (isTeacherRole) {
                    const sId = String(s.id || '').toLowerCase().trim();
                    const sName = (s.name || '').toLowerCase().trim();
                    const sCode = (s.code || '').toLowerCase().trim();

                    return (
                      (sId && teacherAssignedSubjects.has(sId)) ||
                      (sName && teacherAssignedSubjects.has(sName)) ||
                      (sCode && teacherAssignedSubjects.has(sCode)) ||
                      Array.from(teacherAssignedSubjects).some(as => 
                        as && (sName.includes(as) || as.includes(sName) || sCode === as || sId === as)
                      )
                    );
                  }
                  return canViewAllSubjects || profile?.subjects?.includes(s.name) || profile?.subjects?.includes(s.id);
                }).map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-sidebar">{item.name}</td>
                    <td className="px-6 py-4 text-neutral-600 font-mono text-sm">{item.code}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.type === 'theory' ? 'bg-blue-100 text-blue-600' :
                        item.type === 'practical' ? 'bg-purple-100 text-purple-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        {item.type}
                      </span>
                    </td>
                    {!isTeacherRole && !isVicePrincipalRole && (
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => handleOpenModal(item)} className="p-2 text-neutral-400 hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
                        {hasPermission('subjects_manage') && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(item.id!);
                            }}
                            className="p-2 text-neutral-400 hover:text-red-500 transition-colors relative z-10"
                          >
                            <Trash2 className="w-4 h-4 pointer-events-none" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {activeTab === 'holidays' && getSortedData<any>(holidays).map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50/50 transition-colors group">
                    <td className="px-6 py-4 font-mono font-bold text-primary text-sm whitespace-nowrap">
                      {item.date}
                      {item.toDate && item.toDate !== item.date && (
                        <span className="ml-2 text-neutral-400 font-medium">to {item.toDate}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-sidebar">{item.title}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        item.type === 'holiday' ? 'bg-red-100 text-red-600' :
                        item.type === 'working_day' ? 'bg-green-100 text-green-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {(item.type || 'holiday').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-neutral-500 text-sm max-w-xs truncate">{item.description}</td>
                    {!isTeacherRole && !isVicePrincipalRole && (
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => handleOpenModal(item)} className="p-2 text-neutral-400 hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
                        {hasPermission('holidays_manage') && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(item.id!);
                            }}
                            className="p-2 text-neutral-400 hover:text-red-500 transition-colors relative z-10"
                          >
                            <Trash2 className="w-4 h-4 pointer-events-none" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {((activeTab === 'classes' && classes.length === 0) || 
                  (activeTab === 'batches' && batches.length === 0) || 
                  (activeTab === 'subjects' && subjects.length === 0) ||
                  (activeTab === 'holidays' && holidays.length === 0)) && (
                  <tr>
                    <td colSpan={10} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
                      <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center text-neutral-300">
                        <Layers className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sidebar uppercase tracking-tight">No {activeTab} Records</h3>
                        <p className="text-xs text-neutral-400 mt-1">Add your first {activeTab.slice(0, -1)} or refresh if records should exist.</p>
                      </div>
                      <button 
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-xl font-bold transition-all text-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Refresh Database
                      </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <h3 className="text-xl font-bold text-sidebar">
                {editingItem ? 'Edit' : 'Add'} {activeTab.slice(0, -1)}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-neutral-200 rounded-full transition-colors">
                <XCircle className="w-6 h-6 text-neutral-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {activeTab === 'classes' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Class Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Grade 10"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. G10"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none"
                      value={formData.code || ''}
                      onChange={(e) => setFormData({...formData, code: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Description</label>
                    <textarea
                      placeholder="Optional details"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none resize-none"
                      rows={3}
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Assign Subjects</label>
                    <p className="text-[10px] text-neutral-400 mb-2">Select subjects taught in this class</p>
                    <div className="grid grid-cols-2 gap-2 p-4 bg-neutral-50 rounded-2xl border border-neutral-100 max-h-48 overflow-y-auto">
                      {subjects.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            const current = formData.subjectIds || [];
                            if (current.includes(s.id)) {
                              setFormData({...formData, subjectIds: current.filter((id: string) => id !== s.id)});
                            } else {
                              setFormData({...formData, subjectIds: [...current, s.id]});
                            }
                          }}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                            (formData.subjectIds || []).includes(s.id)
                              ? 'bg-primary/10 border-primary text-primary shadow-sm'
                              : 'bg-white border-neutral-100 text-neutral-500 hover:border-primary'
                          }`}
                        >
                          <span className="truncate">{s.name}</span>
                          {(formData.subjectIds || []).includes(s.id) && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {editingItem && (
                    <div className="pt-4 border-t border-neutral-100">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 block">Associated Batches</label>
                      <div className="space-y-2">
                        {(() => {
                          const classBatches = batches.filter(b => 
                            b.classId === editingItem.id || 
                            (b && b.classId && classes.find(c => c && c.id === b.classId)?.name === editingItem.name)
                          );
                          
                          return classBatches.length > 0 ? (
                            classBatches.map(batch => (
                              <div key={batch.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                                <div>
                                  <p className="font-bold text-sm text-sidebar">
                                    {batch.name} (Strength: {allStudents.filter(s => s && s.batchId === batch.id && (s.status || 'active') === 'active').length})
                                  </p>
                                  <p className="text-[10px] text-neutral-400 uppercase tracking-wider">
                                    Teacher: {getBatchClassTeacherDisplayName(batch, teachers)}
                                  </p>
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('batches');
                                    handleOpenModal(batch);
                                  }}
                                  className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-4 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                              <p className="text-xs text-neutral-400 italic">No batches assigned to this class</p>
                              <button 
                                type="button"
                                onClick={() => {
                                  setActiveTab('batches');
                                  handleOpenModal({ classId: editingItem.id });
                                }}
                                className="mt-2 text-xs font-bold text-primary hover:underline"
                              >
                                + Add First Batch
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'batches' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Class</label>
                    <select
                      required
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none bg-white"
                      value={formData.classId || ''}
                      onChange={(e) => setFormData({...formData, classId: e.target.value})}
                    >
                      <option value="">Select Class</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Batch Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Section A"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Class Teacher</label>
                      {Boolean(editingItem?.classTeacherId) && !isFullAdmin && (
                        <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-amber-600" /> Admin Locked
                        </span>
                      )}
                    </div>
                    <select
                      className={`w-full px-4 py-3 rounded-xl border outline-none font-bold ${
                        !isFullAdmin && Boolean(editingItem?.classTeacherId) 
                          ? 'bg-neutral-100/80 text-neutral-500 border-neutral-200 cursor-not-allowed' 
                          : 'bg-white border-neutral-100 focus:border-primary'
                      }`}
                      disabled={!isFullAdmin && Boolean(editingItem?.classTeacherId)}
                      value={(() => {
                        const matched = findTeacherForBatch({ 
                          classTeacherId: formData.classTeacherId, 
                          classTeacher: formData.classTeacher, 
                          classTeacherName: formData.classTeacherName, 
                          classTeacherEmail: formData.classTeacherEmail 
                        }, teachers);
                        return matched?.canonicalId || matched?.uid || matched?.id || formData.classTeacherId || '';
                      })()}
                      onChange={(e) => {
                        const selVal = e.target.value;
                        if (!selVal) {
                          setFormData({
                            ...formData,
                            classTeacherId: '',
                            classTeacher: '',
                            classTeacherName: '',
                            classTeacherEmail: ''
                          });
                          return;
                        }
                        const selTeacher = teachers.find(t => 
                          t.canonicalId === selVal || 
                          t.uid === selVal || 
                          t.id === selVal || 
                          (t.allIds && t.allIds.has(selVal.toLowerCase())) ||
                          (t.email && t.email.toLowerCase() === selVal.toLowerCase())
                        );
                        const tName = selTeacher ? (selTeacher.name || getStaffDisplayName(selTeacher)) : '';
                        const tEmail = selTeacher ? (selTeacher.email || '') : '';
                        const tKey = selTeacher ? (selTeacher.canonicalId || selTeacher.uid || selTeacher.id) : selVal;
                        setFormData({
                          ...formData,
                          classTeacherId: tKey,
                          classTeacher: tName,
                          classTeacherName: tName,
                          classTeacherEmail: tEmail
                        });
                      }}
                    >
                      <option value="">Select Teacher (Optional)</option>
                      {teachers
                        .filter(t => t && (t.name || t.displayName || t.email))
                        .map(t => {
                          const tKey = t.canonicalId || t.uid || t.id;
                          const tName = getStaffDisplayName(t) || t.name || t.displayName || t.email || 'Teacher';
                          return (
                            <option key={tKey} value={tKey}>
                              {tName} {t.customId ? `(${t.customId})` : t.email ? `(${t.email})` : ''}
                            </option>
                          );
                        })}
                    </select>
                    {Boolean(editingItem?.classTeacherId) && !isFullAdmin && (
                      <p className="text-[11px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        Once assigned by Admin, Class Teacher cannot be changed without Admin permission.
                      </p>
                    )}
                  </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Assign Subjects</label>
                      <p className="text-[10px] text-neutral-400 mb-2">Select subjects specifically for this batch (optional override)</p>
                      <div className="grid grid-cols-2 gap-2 p-4 bg-neutral-50 rounded-2xl border border-neutral-100 max-h-48 overflow-y-auto">
                        {subjects.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              const current = formData.subjectIds || [];
                              if (current.includes(s.id)) {
                                setFormData({...formData, subjectIds: current.filter((id: string) => id !== s.id)});
                              } else {
                                setFormData({...formData, subjectIds: [...current, s.id]});
                              }
                            }}
                            className={`p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between ${
                              (formData.subjectIds || []).includes(s.id)
                                ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                : 'bg-white border-neutral-100 text-neutral-500 hover:border-primary'
                            }`}
                          >
                            <span className="truncate">{s.name}</span>
                            {(formData.subjectIds || []).includes(s.id) && <CheckCircle2 className="w-3 h-3" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

              {activeTab === 'subjects' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Subject Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mathematics"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MATH101"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none"
                      value={formData.code || ''}
                      onChange={(e) => setFormData({...formData, code: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Type</label>
                    <div className="flex gap-2">
                      {['theory', 'practical', 'both'].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData({...formData, type})}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                            formData.type === type 
                              ? 'bg-primary border-primary text-white shadow-md' 
                              : 'bg-white border-neutral-100 text-neutral-400 hover:border-primary'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'holidays' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">From Date</label>
                      <input
                        type="date"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none font-bold"
                        value={formData.date || ''}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">To Date (Optional)</label>
                      <input
                        type="date"
                        className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none font-bold"
                        value={formData.toDate || ''}
                        onChange={(e) => setFormData({...formData, toDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Independence Day"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Type</label>
                    <select
                      required
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none bg-white font-bold"
                      value={formData.type || 'holiday'}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                    >
                      <option value="holiday">Holiday</option>
                      <option value="working_day">Special Working Day</option>
                      <option value="event">School Event</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Description</label>
                    <textarea
                      placeholder="Optional details"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none resize-none"
                      rows={3}
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                </>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-sidebar text-white py-4 rounded-2xl font-bold hover:bg-primary transition-all shadow-xl shadow-sidebar/10 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {editingItem ? 'Update' : 'Save'} {activeTab.slice(0, -1)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {showConfirmModal && confirmConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-sidebar">{confirmConfig.title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  {confirmConfig.message}
                </p>
              </div>
            </div>
            <div className="p-6 bg-neutral-50 flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmConfig.onConfirm}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Academics;
