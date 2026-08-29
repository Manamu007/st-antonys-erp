import React, { useEffect, useState } from 'react';
import { where, orderBy, limit } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, 
  Plus, 
  Sparkles, 
  Calendar, 
  CheckCircle, 
  Clock, 
  FileText,
  Search,
  Filter,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { isTeacherRole as checkIsTeacherRole } from '../utils/teacherFilter';
import { sortAlphabetically } from '../lib/utils';
import { SortAsc, SortDesc } from 'lucide-react';
import { IndexNoticeBanner } from '../components/IndexNoticeBanner';

const Homework: React.FC = () => {
  const { isStudent, isParent, hasPermission, profile, availableProfiles, isAdmin } = useAuth();
  
  // 'staff' మరియు 'coordinator' రోల్స్ ఉన్నా కూడా టీచర్ కిందే పరిగణించేలా పకడ్బందీ లాజిక్
  const isTeacherRole = !isAdmin && (
    checkIsTeacherRole(profile?.role || '', profile?.email, profile?.name) ||
    profile?.role === 'teacher' || 
    profile?.role === 'teacher_class' || 
    profile?.role === 'teacher_subject' || 
    profile?.role === 'coordinator' || 
    profile?.role === 'staff' ||
    (profile as any)?.staffType === 'teaching'
  );

  const isStrictTeacher = isTeacherRole || hasPermission('homework_view_my');

  if (!hasPermission('homework_view') && !hasPermission('homework_manage') && !hasPermission('portal_student_view_homework')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <BookOpen className="w-12 h-12 text-primary mb-4" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have permission to view homework. Please contact your administrator.
        </p>
      </div>
    );
  }

  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [globalSortDirection, setGlobalSortDirection] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [sendToWhatsapp, setSendToWhatsapp] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryMode, setEntryMode] = useState<'manual' | 'ocr'>('manual');
  const [newHomework, setNewHomework] = useState({
    title: '',
    subject: '',
    class: '',
    dueDate: getTodayDateString(),
    description: ''
  });
  const [subjectsHomework, setSubjectsHomework] = useState<{
    [subjectName: string]: {
      checked: boolean;
      title: string;
      description: string;
    }
  }>({});
  const [suggestionSubject, setSuggestionSubject] = useState('');
  const [suggestionTopic, setSuggestionTopic] = useState('');

  // Submissions & Student list for real-time stats & interactive details tracking
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [selectedHomework, setSelectedHomework] = useState<any | null>(null);
  const [studentNotes, setStudentNotes] = useState('');

  // Subscribe to submissions in real time and fetch students once
  useEffect(() => {
    const unsubscribeSubmissions = dbService.subscribe('homework_submissions', [], (data) => {
      setSubmissions(data);
    }, (error) => {
      console.error("Submissions subscription error:", error);
    });

    dbService.list('students', []).then(data => {
      setAllStudents(data);
    }).catch(err => {
      console.error("Error loading students list:", err);
    });

    return unsubscribeSubmissions;
  }, []);
  const [aiSuggestions, setAiSuggestions] = useState<string>("");
  const [indexError, setIndexError] = useState<any>(null);
  const [searchSubject, setSearchSubject] = useState('');
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    const constraints: any[] = [limit(100)];
    
    if (isStudent || isParent) {
      const currentClassId = profile?.classId || availableProfiles.find(p => p.role === 'student')?.classId;
      if (currentClassId) {
        constraints.push(where('class', '==', currentClassId));
      } else {
        constraints.push(where('class', '==', 'NO_CLASS_IDENTIFIED_SECURE_FALLBACK'));
      }
    }

    const unsubscribe = dbService.subscribe('homework', constraints, (data) => {
      const sortedData = [...data].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setHomeworks(sortedData);
      setLoading(false);
      setIndexError(null);
    }, (error) => {
      setIndexError(error);
      setLoading(false);
    });
    return unsubscribe;
  }, [isStudent, isParent, profile?.classId, profile?.uid, profile?.id]);

  // టీచర్లకు ఎట్టి పరిస్థితుల్లోనూ అడ్మిన్ బైపాస్ యాక్సెస్ రాకుండా అడ్డుకునే కండిషన్
  const looseAccess = (isAdmin || profile?.role === 'admin' || profile?.role === 'principal') && !isStrictTeacher;

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [classList, batchList, subjectList] = await Promise.all([
          dbService.list('classes', []),
          dbService.list('batches', []),
          dbService.list('subjects', [])
        ]);
        setClasses(sortAlphabetically(classList, 'name', globalSortDirection));
        setBatches(sortAlphabetically(batchList, 'name', globalSortDirection));
        setSubjects(sortAlphabetically(subjectList, 'name', globalSortDirection));
      } catch (error) {
        console.error("Fetch metadata error:", error);
      }
    };
    fetchMetadata();
  }, [globalSortDirection]);

  // టీచర్ ప్రొఫైల్ ఐడీల ఆధారంగా లైవ్ రియాక్టివ్ ఫిల్టరింగ్ సెటప్
  const teacherBatchIds = Array.from(new Set([profile?.batchId, ...(profile as any)?.batchIds || []].filter(Boolean)));
  batches.filter(b => b.classTeacherId === profile?.uid).forEach(b => {
    if (!teacherBatchIds.includes(b.id)) teacherBatchIds.push(b.id);
  });

  const teacherClassIds = Array.from(new Set([profile?.classId, ...(profile as any)?.classIds || []].filter(Boolean)));
  batches.filter(b => teacherBatchIds.includes(b.id)).forEach(b => {
    if (!teacherClassIds.includes(b.classId)) teacherClassIds.push(b.classId);
  });

  const availableClasses = classes;

  const isTeacher = profile?.role === 'teacher';
  // Class/Batch should show login class teacher's batch only
  const availableBatches = batches.filter(b => {
    if (isTeacher) {
      return b.classTeacherId === profile?.uid || b.classTeacherId === profile?.id;
    }
    return true; // Admin/principal can see all
  });

  // టీచర్లకు మొదటి అందుబాటులో ఉన్న క్లాస్ ఆటో-సెలెక్ట్ అయ్యేలా అప్‌డేట్
  useEffect(() => {
    if (availableBatches.length > 0 && !newHomework.class) {
      setNewHomework(prev => ({ ...prev, class: availableBatches[0].id }));
    }
  }, [availableBatches, newHomework.class]);

  const getClassRelatedSubjects = () => {
    if (!newHomework.class) return [];
    const selectedBatch = batches.find(b => b.id === newHomework.class);
    if (!selectedBatch) return [];
    const classId = selectedBatch.classId;
    const classDetail = classes.find(c => c.id === classId);
    
    const subjectsList: string[] = [];

    // Check batch subjectIds
    if (selectedBatch.subjectIds && Array.isArray(selectedBatch.subjectIds)) {
      selectedBatch.subjectIds.forEach((sid: string) => {
        const matchSub = subjects.find(s => s.id === sid);
        if (matchSub && matchSub.name) {
          subjectsList.push(matchSub.name);
        }
      });
    }

    // Check class subjectIds
    if (classDetail) {
      if (classDetail.subjectIds && Array.isArray(classDetail.subjectIds)) {
        classDetail.subjectIds.forEach((sid: string) => {
          const matchSub = subjects.find(s => s.id === sid);
          if (matchSub && matchSub.name) {
            subjectsList.push(matchSub.name);
          }
        });
      }
      // Check class subjects
      if (classDetail.subjects && Array.isArray(classDetail.subjects)) {
        classDetail.subjects.forEach((s: any) => {
          if (s && s.name) subjectsList.push(s.name);
          else if (s && typeof s === 'string') subjectsList.push(s);
        });
      }
    }

    const uniqueSubjects = Array.from(new Set(subjectsList.map(s => s.trim()).filter(Boolean)));
    if (uniqueSubjects.length > 0) {
      return uniqueSubjects;
    }
    
    // Default fallback if no mapping exists:
    // Filter subjects to only show those appropriate for the grade level instead of ALL subjects
    const classNameLower = (selectedBatch.className || classDetail?.name || '').toLowerCase();
    const allSubjectNames = subjects.map(s => s.name);
    
    if (classNameLower.includes('nursery') || classNameLower.includes('lkg') || classNameLower.includes('ukg') || classNameLower.includes('play')) {
      const preschoolSubjects = ['ENGLISH', 'MATHEMATICS', 'TELUGU', 'EVS', 'ENG-READING', 'HINDHI-READING', 'GAMES', 'Tables'];
      return allSubjectNames.filter(name => 
        preschoolSubjects.some(pSub => name.toUpperCase() === pSub.toUpperCase())
      );
    } else {
      const schoolSubjects = ['ENGLISH', 'MATHEMATICS', 'TELUGU', 'HINDI', 'Science', 'Social Studies', 'Computers', 'Physics', 'Chemistry', 'Biology', 'E.C', 'GAMES'];
      return allSubjectNames.filter(name => 
        schoolSubjects.some(sSub => name.toUpperCase() === sSub.toUpperCase())
      );
    }
  };

  // Initialize subjectsHomework state reactively when the selected class/batch changes
  useEffect(() => {
    const related = getClassRelatedSubjects();
    const initial: any = {};
    related.forEach(subName => {
      initial[subName] = {
        checked: false,
        title: `${subName} Homework`, // Automatically add topic/title
        description: ''
      };
    });
    setSubjectsHomework(initial);
  }, [newHomework.class, subjects, classes, batches, showAddModal]);

  const handleToggleSelectAll = () => {
    const allChecked = Object.values(subjectsHomework).every(item => item.checked);
    const updated = { ...subjectsHomework };
    Object.keys(updated).forEach(subName => {
      updated[subName] = {
        ...updated[subName],
        checked: !allChecked,
        title: updated[subName].title || `${subName} Homework`
      };
    });
    setSubjectsHomework(updated);
  };

  const handleAddHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newHomework.class) {
        toast.error("Please select a Class/Batch");
        return;
      }

      const selectedBatch = batches.find(b => b.id === newHomework.class);
      const classId = selectedBatch?.classId || '';
      const className = classes.find(c => c.id === classId)?.name || '';
      const batchName = selectedBatch?.name || '';

      const assignedItems = Object.entries(subjectsHomework)
        .filter(([_, data]) => data.checked && data.description.trim() !== '')
        .map(([subjectName, data]) => ({
          subject: subjectName,
          title: data.title || `${subjectName} Homework`, // Automatically add topic/title
          description: data.description,
          class: newHomework.class,
          dueDate: newHomework.dueDate
        }));

      if (assignedItems.length === 0) {
        toast.error("Please enable at least one subject and enter a description.");
        return;
      }

      toast.info("Assigning homework...");

      // Add each homework to the DB
      const addPromises = assignedItems.map(item => 
        dbService.add('homework', {
          ...item,
          createdAt: new Date().toISOString(),
          assignedBy: profile?.uid || '',
          status: 'active'
        })
      );

      await Promise.all(addPromises);
      toast.success(`Homework assigned successfully for ${assignedItems.length} subject(s)!`);

      // Automatically send to WhatsApp Community mapped to this class
      if (sendToWhatsapp && classId) {
        const formattedDate = newHomework.dueDate ? new Date(newHomework.dueDate).toLocaleDateString('te-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        
        let msgText = `📚 *నూతన హోంవర్క్ అలర్ట్ / NEW HOMEWORK ALERT* 📚\n\n` +
          `🎓 *తరగతి (Class):* ${className} - ${batchName}\n` +
          `📅 *సమర్పించవలసిన తేదీ (Due Date):* ${formattedDate || newHomework.dueDate}\n\n`;

        assignedItems.forEach(item => {
          msgText += `📖 *${item.subject}* (${item.title}):\n${item.description}\n\n`;
        });

        msgText += `👉 దయచేసి విద్యార్థులు హోంవర్క్ పూర్తి చేసి సకాలంలో సమర్పించగలరు.\n` +
          `_Please ensure your child completes and submits the homework on time._`;

        fetch('/api/whatsapp/community-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classIds: [classId],
            text: msgText
          })
        }).then(res => res.json())
          .then(data => {
            if (data.success) {
              toast.success("Homework broadcasted to WhatsApp Community successfully!");
            } else {
              toast.error("WhatsApp broadcast: " + (data.error || "no active community mapped"));
            }
          })
          .catch(err => {
            toast.error("Failed to send WhatsApp community broadcast");
          });
      }

      setShowAddModal(false);
      // Reset subjectsHomework state
      const initial: any = {};
      const defaultSubjectsList = subjects.length > 0 ? subjects.map(s => s.name) : [
        'Mathematics', 'Science', 'English', 'Telugu', 'Hindi', 'Social Studies'
      ];
      defaultSubjectsList.forEach(subName => {
        initial[subName] = {
          checked: false,
          title: `${subName} Homework`,
          description: ''
        };
      });
      setSubjectsHomework(initial);
    } catch (error) {
      console.error("Assign homework error:", error);
      toast.error("Failed to assign homework");
    }
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      toast.info("Uploading image...");
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();
      
      if (!uploadData.success) {
        throw new Error(uploadData.error || "Upload failed");
      }

      toast.info("Extracting homework with AI Scan Notebook / OCR...");
      const ocrRes = await fetch('/api/homework/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: uploadData.url })
      });
      const ocrData = await ocrRes.json();

      if (!ocrData.success) {
        throw new Error(ocrData.error || "OCR failed");
      }

      const info = ocrData.data;
      
      if (info.dueDate) {
        setNewHomework(prev => ({ ...prev, dueDate: info.dueDate }));
      }

      if (info.assignments && Array.isArray(info.assignments)) {
        setSubjectsHomework(prev => {
          const updated = { ...prev };
          
          // Uncheck all first
          Object.keys(updated).forEach(subName => {
            updated[subName] = {
              ...updated[subName],
              checked: false
            };
          });

          info.assignments.forEach((assign: any) => {
            const subName = assign.subject;
            const matchedKey = Object.keys(updated).find(k => k.toLowerCase() === subName.toLowerCase()) || subName;
            
            updated[matchedKey] = {
              checked: true,
              title: assign.title || `${matchedKey} Homework`, // Automatically add topic/title
              description: assign.description || ''
            };
          });

          return updated;
        });
        toast.success("Homework extracted successfully! Extracted multiple subjects.");
      } else {
        const singleSub = info.subject || 'Mathematics';
        setSubjectsHomework(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(k => { updated[k].checked = false; });
          
          const matchedKey = Object.keys(updated).find(k => k.toLowerCase() === singleSub.toLowerCase()) || singleSub;
          updated[matchedKey] = {
            checked: true,
            title: info.title || `${matchedKey} Homework`,
            description: info.description || ''
          };
          return updated;
        });
        toast.success("Homework extracted successfully!");
      }

    } catch (err: any) {
      console.error("OCR process error:", err);
      toast.error(err.message || "Failed to process image with OCR.");
    } finally {
      setOcrLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset input
      }
    }
  };

  const getLocalHomeworkSuggestions = (subject: string, topic: string) => {
    const t = (topic || '').toLowerCase();
    const s = (subject || '').toLowerCase();

    if (s.includes('math') || s.includes('calculus') || s.includes('algebra') || s.includes('arithmetic')) {
      if (t.includes('quadratic') || t.includes('equation')) {
        return `1. Solve questions 1 to 5 from Exercise 4.2 in your text book. Focus on factorization and completing the square methods.\n2. Write down the quadratic formula and explain the significance of the discriminant (b² - 4ac) with examples.`;
      }
      if (t.includes('fraction') || t.includes('decimal')) {
        return `1. Solve Chapter 2 Practice problems 1-10 on adding and subtracting unlike fractions.\n2. Convert the list of decimals given in your class notebook to equivalent fractions in their simplest form.`;
      }
      return `1. Practice and solve 5 numerical problems related to "${topic}" from your textbook chapter exercises.\n2. Write down all formulas and standard steps involved in solving "${topic}" in your formula notebook.`;
    }

    if (s.includes('science') || s.includes('physics') || s.includes('chemistry') || s.includes('bio') || s.includes('nature')) {
      if (t.includes('light') || t.includes('reflection') || t.includes('mirror')) {
        return `1. Draw a neat, labeled ray diagram showing image formation by a concave mirror when the object is placed between C and F.\n2. Define reflection and state its two fundamental laws with a diagram.`;
      }
      if (t.includes('cell') || t.includes('plant') || t.includes('animal')) {
        return `1. Draw a well-labeled comparative diagram of a Plant Cell and an Animal Cell in your science notebook.\n2. Write down the main functions of Mitochondria, Plastids, and Vacuoles.`;
      }
      return `1. Read the textbook chapter on "${topic}" and write definitions for any 5 key scientific terms.\n2. Summarize the core concept of "${topic}" in 100 words and draw a labeled diagram if applicable.`;
    }

    if (s.includes('english')) {
      return `1. Write an essay/paragraph of 120-150 words on the topic: "${topic || 'My Vision for Future'}" using rich vocabulary.\n2. Identify and list 5 verbs, 5 nouns, and 5 adjectives from your current textbook chapter on "${topic}".`;
    }

    if (s.includes('telugu')) {
      return `1. "${topic || 'పాఠం వెనుక అభ్యాసాలు'}" కి సంబంధించిన వ్యాకరణ అంశాలను (సంధులు మరియు సమాసాలు) గుర్తించి రాయండి.\n2. నేర్చుకున్న పాఠ్యాంశం లోని కఠిన పదాలకు అర్థాలు మరియు సొంత వాక్యాలు 5 రాయండి.`;
    }

    if (s.includes('hindi')) {
      return `1. पाठ "${topic || 'अभ्यास'}" के कठिन शब्द लिखकर उनके अर्थ याद करें और वाक्य प्रयोग कीजिए।\n2. इस विषय पर 5 वाक्य सुंदर लिखावट में अपनी गृहकार्य पुस्तिका में लिखिए।`;
    }

    if (s.includes('social') || s.includes('history') || s.includes('civics') || s.includes('geo') || s.includes('geography')) {
      return `1. Create a bulleted timeline of key historical events related to "${topic}" as taught in class.\n2. On an outline map, mark the major geographical locations/regions associated with "${topic}".`;
    }

    return `1. Read the chapter on "${topic}" thoroughly and write down 3 key takeaways.\n2. Solve the text exercises at the end of the lesson in your homework notebook.`;
  };

  const getAiSuggestions = async () => {
    if (!suggestionSubject || !suggestionTopic) {
      toast.error("Please choose a subject and enter a topic for suggestions.");
      return;
    }
    toast.info("Generating creative homework suggestions offline...");
    const suggestions = getLocalHomeworkSuggestions(suggestionSubject, suggestionTopic);
    setAiSuggestions(suggestions || "Try a research-based project on this topic.");
    toast.success("Suggestions generated!");
  };

  const filteredHomeworks = homeworks.filter(hw => {
    let matchesRole = true;
    if (!looseAccess) {
      if (!isStudent) {
        const classTeacherBatchIds = batches.filter(b => b.classTeacherId === profile?.uid).map(b => b.id);
        matchesRole = classTeacherBatchIds.includes(hw.class) || hw.assignedBy === profile?.uid;
      } else {
        const studentIds = [
          ...(profile?.classId ? [profile.classId] : []),
          ...(profile?.batchId ? [profile.batchId] : [])
        ];
        matchesRole = studentIds.includes(hw.class);
      }
    }

    if (!matchesRole) return false;

    if (searchSubject) {
      const sub = (hw.subject || '').toLowerCase();
      const title = (hw.title || '').toLowerCase();
      const query = searchSubject.toLowerCase().trim();
      if (!sub.includes(query) && !title.includes(query)) return false;
    }

    if (searchDate) {
      const hwDueDate = hw.dueDate || '';
      const hwCreatedDate = hw.createdAt ? hw.createdAt.split('T')[0] : '';
      if (hwDueDate !== searchDate && hwCreatedDate !== searchDate) return false;
    }

    return true;
  });

  // Compute stats in real-time
  const getStats = () => {
    if (isStudent || isParent) {
      const studentClassId = profile?.classId || availableProfiles.find(p => p.role === 'student')?.classId;
      const studentBatchId = profile?.batchId || availableProfiles.find(p => p.role === 'student')?.batchId;
      
      const relevantHws = homeworks.filter(hw => {
        return hw.class === studentBatchId || hw.class === studentClassId;
      });

      const totalHws = relevantHws.length;
      if (totalHws === 0) {
        return { submittedPercent: 0, pendingPercent: 0, submittedCount: 0, pendingCount: 0, total: 0 };
      }

      const studentUid = profile?.uid || '';
      const submittedCount = relevantHws.filter(hw => 
        submissions.some(sub => sub.homeworkId === hw.id && sub.studentId === studentUid && sub.status === 'submitted')
      ).length;

      const pendingCount = totalHws - submittedCount;
      const submittedPercent = Math.round((submittedCount / totalHws) * 100);
      const pendingPercent = 100 - submittedPercent;

      return { submittedPercent, pendingPercent, submittedCount, pendingCount, total: totalHws };
    } else {
      if (filteredHomeworks.length === 0) {
        return { submittedPercent: 0, pendingPercent: 0, submittedCount: 0, pendingCount: 0, total: 0 };
      }

      let totalExpected = 0;
      let totalSubmitted = 0;

      filteredHomeworks.forEach(hw => {
        const studentsInClass = allStudents.filter(s => s.batchId === hw.class || s.classId === hw.class);
        const expectedCount = studentsInClass.length || 1; 
        totalExpected += expectedCount;

        const actualSubmittedCount = submissions.filter(sub => sub.homeworkId === hw.id && sub.status === 'submitted').length;
        totalSubmitted += actualSubmittedCount;
      });

      if (totalExpected === 0) {
        return { submittedPercent: 0, pendingPercent: 0, submittedCount: 0, pendingCount: 0, total: 0 };
      }

      const submittedPercent = Math.round((Math.min(totalSubmitted, totalExpected) / totalExpected) * 100);
      const pendingPercent = 100 - submittedPercent;
      const pendingCount = Math.max(0, totalExpected - totalSubmitted);

      return { 
        submittedPercent, 
        pendingPercent, 
        submittedCount: totalSubmitted, 
        pendingCount, 
        total: totalExpected 
      };
    }
  };

  const stats = getStats();

  return (
    <div className="space-y-6">
      <IndexNoticeBanner error={indexError} />
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-sidebar">Homework & Assignments</h1>
          <p className="text-sm text-neutral-500">Assign tasks and track student progress with AI help.</p>
        </div>
        <div className="flex items-center gap-4">
          {(hasPermission('homework_manage') && (!isStrictTeacher || availableBatches.length > 0)) && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sidebar transition-colors shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              <span>Assign Homework</span>
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Homework List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input 
                type="text" 
                placeholder="Search by subject or topic name..." 
                className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none text-sm font-medium" 
                value={searchSubject}
                onChange={(e) => setSearchSubject(e.target.value)}
              />
            </div>
            <div className="relative flex-1 w-full sm:max-w-[200px]">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input 
                type="date" 
                className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none text-sm font-bold text-neutral-700" 
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
              />
            </div>
            {(searchSubject || searchDate) && (
              <button 
                onClick={() => {
                  setSearchSubject('');
                  setSearchDate('');
                }}
                className="px-3 py-2 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors w-full sm:w-auto text-center shrink-0"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-2 text-center py-12 text-neutral-400">Loading assignments...</div>
            ) : filteredHomeworks.length === 0 ? (
              <div className="col-span-2 text-center py-12 text-neutral-400 bg-white rounded-2xl border border-dashed border-neutral-200">
                No homework assigned yet.
              </div>
            ) : filteredHomeworks.map((hw) => {
              const todayStr = new Date().toISOString().split('T')[0];
              const isAssignedToday = hw.createdAt ? hw.createdAt.split('T')[0] === todayStr : false;
              const isDueToday = hw.dueDate === todayStr;
              const isPresentDay = isAssignedToday || isDueToday;

              return (
                <div 
                  key={hw.id} 
                  className={`p-5 rounded-2xl shadow-sm hover:shadow-xl transition-all group relative overflow-hidden transition-all duration-300 border-2 ${
                    isPresentDay 
                      ? 'bg-gradient-to-br from-emerald-500/[0.01] to-teal-500/[0.03] border-emerald-500/80 shadow-md shadow-emerald-500/5 hover:border-emerald-500 ring-2 ring-emerald-500/5'
                      : 'bg-white border-neutral-200 hover:border-primary/30'
                  }`}
                >
                  {isPresentDay && (
                    <div className="absolute top-0 left-0 bg-emerald-500 text-white font-black text-[8px] uppercase tracking-widest px-3 py-1 rounded-br-xl shadow-xs z-10 animate-pulse">
                      🌟 Today's Homework
                    </div>
                  )}
                  <div className="absolute top-0 right-0 p-3">
                    <span className="text-[12px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold uppercase">
                      Class {(batches.find(b => b.id === hw.class)?.name) || (classes.find(c => c.id === hw.class)?.name) || hw.class}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-4 mt-2">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sidebar leading-tight text-[15px]">{hw.title}</h4>
                      <p className="text-[13px] text-neutral-400">{hw.subject}</p>
                    </div>
                  </div>
                  <p className="text-[13px] text-neutral-600 mb-4 line-clamp-2">{hw.description}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-neutral-50">
                    <div className="flex items-center gap-1.5 text-[13px] text-neutral-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Due: {hw.dueDate}</span>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedHomework(hw);
                        setStudentNotes('');
                      }}
                      className="text-primary text-[13px] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      View Details
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-sidebar to-primary p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="w-16 h-16" />
            </div>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI Homework Lab
            </h3>
            <p className="text-[13px] text-white/70 mb-4 leading-relaxed">
              Need inspiration? Let AI suggest creative assignments based on your curriculum.
            </p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white py-2 rounded-lg text-[13px] font-bold transition-all border border-white/10"
            >
              Try AI Generator
            </button>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
            <h3 className="font-bold text-lg mb-4">Submission Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-neutral-600">Submitted</span>
                </div>
                <span className="text-sm font-bold">
                  {stats.total > 0 ? `${stats.submittedCount}/${stats.total} (${stats.submittedPercent}%)` : '0%'}
                </span>
              </div>
              <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${stats.submittedPercent}%` }} />
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-neutral-600">Pending</span>
                </div>
                <span className="text-sm font-bold">
                  {stats.total > 0 ? `${stats.pendingCount}/${stats.total} (${stats.pendingPercent}%)` : '0%'}
                </span>
              </div>
              <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${stats.pendingPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Homework Modal Pop up */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-primary text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Assign New Homework
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-white/60 hover:text-white text-2xl">
                &times;
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <form onSubmit={handleAddHomework} className="p-6 space-y-4 border-r border-neutral-100 flex flex-col max-h-[80vh] overflow-y-auto">
                {/* Entry Mode Tabs */}
                <div className="flex bg-neutral-100 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setEntryMode('manual')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      entryMode === 'manual'
                        ? 'bg-white text-primary shadow-xs border border-neutral-200/20'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    📝 Manual Entry
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryMode('ocr')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      entryMode === 'ocr'
                        ? 'bg-white text-primary shadow-xs border border-neutral-200/20'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    ✨ AI Scan Notebook / OCR
                  </button>
                </div>

                {/* OCR Scan Button (Only visible in OCR mode) */}
                {entryMode === 'ocr' && (
                  <div className="bg-gradient-to-r from-violet-50 to-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-0.5 text-left">
                      <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1">📸 Scan Notebook / OCR</h4>
                      <p className="text-[10px] text-neutral-500">Take/upload a photo of homework to auto-fill details.</p>
                    </div>
                    <div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        ref={fileInputRef} 
                        onChange={handleOcrUpload} 
                        className="hidden" 
                      />
                      <button
                        type="button"
                        disabled={ocrLoading}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {ocrLoading ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Reading...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                            Scan
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Class/Batch Selection and Due Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase">Class/Batch</label>
                    <select 
                      required
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary text-xs font-bold"
                      value={newHomework.class}
                      onChange={(e) => setNewHomework({...newHomework, class: e.target.value})}
                    >
                      <option value="">Select Class/Batch</option>
                      {availableBatches.map(b => (
                        <option key={b.id} value={b.id}>
                          {(availableClasses.find(c => c.id === b.classId)?.name) || ''} - {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase">Due Date</label>
                    <input 
                      required
                      type="date" 
                      className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary text-xs font-medium"
                      value={newHomework.dueDate}
                      onChange={(e) => setNewHomework({...newHomework, dueDate: e.target.value})}
                    />
                  </div>
                </div>

                {/* Subjects & Homework Assignments Checklist (Class-related only) */}
                <div className="space-y-2 flex-1">
                  <div className="flex justify-between items-center pb-1">
                    <label className="text-xs font-black text-neutral-500 uppercase tracking-wider">
                      Subjects Homework Checklist
                    </label>
                    {newHomework.class && (
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        {Object.values(subjectsHomework).every(item => item.checked) ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>

                  {!newHomework.class ? (
                    <div className="border border-dashed border-neutral-200 rounded-xl p-8 text-center text-neutral-400">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40 text-neutral-500" />
                      <p className="text-xs">Please select a Class/Batch first to load its subjects.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {Object.keys(subjectsHomework).length === 0 ? (
                        <p className="text-xs text-neutral-500 text-center py-4">No subjects mapped to this class.</p>
                      ) : (
                        Object.entries(subjectsHomework).map(([subName, data]) => (
                          <div 
                            key={subName} 
                            className={`border rounded-xl p-3.5 transition-all duration-200 ${
                              data.checked 
                                ? 'bg-white border-primary/30 shadow-xs ring-1 ring-primary/5' 
                                : 'bg-neutral-50/50 border-neutral-100'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-neutral-800">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                                  checked={data.checked}
                                  onChange={(e) => {
                                    setSubjectsHomework(prev => ({
                                      ...prev,
                                      [subName]: {
                                        ...prev[subName],
                                        checked: e.target.checked,
                                        title: prev[subName]?.title || `${subName} Homework`
                                      }
                                    }));
                                  }}
                                />
                                {subName}
                              </label>
                              {data.checked && (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full font-bold uppercase">
                                  Assigning
                                </span>
                              )}
                            </div>
                            
                            {data.checked && (
                              <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                                <div>
                                  <label className="text-[9px] font-bold text-neutral-400 uppercase">Topic / Title</label>
                                  <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary text-xs font-semibold"
                                    placeholder={`${subName} Topic (added automatically)`}
                                    value={data.title}
                                    onChange={(e) => {
                                      setSubjectsHomework(prev => ({
                                        ...prev,
                                        [subName]: {
                                          ...prev[subName],
                                          title: e.target.value
                                        }
                                      }));
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-neutral-400 uppercase">Homework Description</label>
                                  <textarea
                                    required
                                    rows={2}
                                    className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary resize-none text-xs font-medium"
                                    placeholder={`Enter ${subName} homework description...`}
                                    value={data.description}
                                    onChange={(e) => {
                                      setSubjectsHomework(prev => ({
                                        ...prev,
                                        [subName]: {
                                          ...prev[subName],
                                          description: e.target.value
                                        }
                                      }));
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 py-1 border-t border-neutral-100 pt-3">
                  <input 
                    type="checkbox" 
                    id="sendToWhatsapp"
                    className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                    checked={sendToWhatsapp}
                    onChange={(e) => setSendToWhatsapp(e.target.checked)}
                  />
                  <label htmlFor="sendToWhatsapp" className="text-xs font-black text-neutral-600 uppercase cursor-pointer select-none">
                    Automatically Broadcast to WhatsApp
                  </label>
                </div>
                <button 
                  type="submit"
                  className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-sidebar transition-colors shadow-lg shadow-primary/20 cursor-pointer"
                >
                  Assign to Class
                </button>
              </form>

              <div className="p-6 bg-neutral-50 flex flex-col max-h-[80vh] overflow-y-auto space-y-4">
                <div className="flex justify-between items-center border-b border-neutral-200/50 pb-2">
                  <h3 className="text-sm font-bold text-sidebar flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Offline AI Suggestions
                  </h3>
                  <button 
                    onClick={getAiSuggestions}
                    className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1 rounded-lg font-bold transition-all cursor-pointer"
                  >
                    Generate
                  </button>
                </div>

                {/* AI Suggestions Selectors strictly showing class-related subjects only */}
                <div className="space-y-3 bg-white p-4 rounded-xl border border-neutral-200/60">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">Select Subject</label>
                    <select
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary text-xs font-bold"
                      value={suggestionSubject}
                      onChange={(e) => setSuggestionSubject(e.target.value)}
                    >
                      <option value="">Choose Class Subject</option>
                      {getClassRelatedSubjects().map(subName => (
                        <option key={subName} value={subName}>
                          {subName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">Topic / Lesson</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary text-xs font-semibold"
                      placeholder="e.g. Quadratic Equations, Optics, Plants..."
                      value={suggestionTopic}
                      onChange={(e) => setSuggestionTopic(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-neutral-200 flex-1 min-h-[220px] overflow-y-auto text-left shadow-2xs">
                  {aiSuggestions ? (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap">{aiSuggestions}</p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-8">
                      <Sparkles className="w-8 h-8 text-neutral-300 mb-2 animate-pulse" />
                      <p className="text-xs text-neutral-400 font-medium">Choose a subject & topic above, then click Generate to load creative assignment ideas offline!</p>
                    </div>
                  )}
                </div>

                {aiSuggestions && suggestionSubject && (
                  <button 
                    type="button"
                    onClick={() => {
                      setSubjectsHomework(prev => ({
                        ...prev,
                        [suggestionSubject]: {
                          checked: true,
                          title: suggestionTopic || `${suggestionSubject} Homework`,
                          description: aiSuggestions
                        }
                      }));
                      toast.success(`Suggestions applied to ${suggestionSubject}!`);
                    }}
                    className="w-full py-2.5 text-xs font-black uppercase tracking-wider text-primary border-2 border-primary/30 rounded-xl hover:bg-primary/5 transition-colors cursor-pointer"
                  >
                    Use suggestion for {suggestionSubject}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Homework Detail Modal */}
      {selectedHomework && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-sidebar text-white">
              <div>
                <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold uppercase mb-1 inline-block">
                  {selectedHomework.subject}
                </span>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  {selectedHomework.title}
                </h2>
              </div>
              <button onClick={() => setSelectedHomework(null)} className="text-white/60 hover:text-white text-2xl">
                &times;
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-left">
              <div className="grid grid-cols-2 gap-4 text-sm bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                <div>
                  <p className="text-xs text-neutral-400 font-bold uppercase">Class/Batch</p>
                  <p className="font-bold text-neutral-700">
                    {(batches.find(b => b.id === selectedHomework.class)?.name) || (classes.find(c => c.id === selectedHomework.class)?.name) || selectedHomework.class}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 font-bold uppercase">Due Date</p>
                  <p className="font-bold text-neutral-700 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-primary" />
                    {selectedHomework.dueDate}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-400 uppercase">Homework Description</h4>
                <div className="p-4 bg-white border border-neutral-200 rounded-xl whitespace-pre-wrap text-sm text-neutral-700 leading-relaxed">
                  {selectedHomework.description}
                </div>
              </div>

              {/* Conditional view: Student submission or Teacher review */}
              {(isStudent || isParent) ? (
                <div className="border-t border-neutral-100 pt-6 space-y-4">
                  <h3 className="font-bold text-sidebar text-md">Your Submission Status</h3>
                  {(() => {
                    const studentUid = profile?.uid || '';
                    const submission = submissions.find(sub => sub.homeworkId === selectedHomework.id && sub.studentId === studentUid);
                    const isSubmitted = submission?.status === 'submitted';

                    return isSubmitted ? (
                      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                          <span>Completed and Submitted!</span>
                        </div>
                        {submission.notes && (
                          <div className="text-xs text-emerald-700 bg-white p-3 rounded-lg border border-emerald-100 italic">
                            "{submission.notes}"
                          </div>
                        )}
                        <button 
                          onClick={async () => {
                            try {
                              await dbService.delete('homework_submissions', submission.id);
                              toast.success("Homework marked as pending.");
                            } catch (err) {
                              toast.error("Failed to update status");
                            }
                          }}
                          className="px-4 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Undo Submission
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 bg-amber-50/50 border border-amber-200/60 p-4 rounded-xl">
                        <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                          <Clock className="w-5 h-5 text-amber-600 animate-pulse" />
                          <span>Pending Submission</span>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-neutral-500 uppercase">Submission Notes / Link (Optional)</label>
                          <textarea
                            rows={2}
                            placeholder="Add some notes or a link to your work..."
                            className="w-full px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary resize-none font-medium text-neutral-700"
                            value={studentNotes}
                            onChange={(e) => setStudentNotes(e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={async () => {
                            try {
                              await dbService.add('homework_submissions', {
                                homeworkId: selectedHomework.id,
                                studentId: studentUid,
                                studentName: profile?.name || 'Student',
                                classId: selectedHomework.class,
                                status: 'submitted',
                                notes: studentNotes,
                                submittedAt: new Date().toISOString()
                              });
                              toast.success("Homework marked as completed!");
                              setStudentNotes('');
                            } catch (err) {
                              toast.error("Failed to submit homework");
                            }
                          }}
                          className="w-full bg-primary text-white py-2 rounded-xl text-xs font-bold hover:bg-sidebar transition-colors shadow-lg shadow-primary/20 cursor-pointer"
                        >
                          🚀 Mark as Completed
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="border-t border-neutral-100 pt-6 space-y-4">
                  <h3 className="font-bold text-sidebar text-md">Student Submissions Tracking</h3>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                    {(() => {
                      const classStudents = allStudents.filter(s => s.batchId === selectedHomework.class || s.classId === selectedHomework.class);
                      
                      if (classStudents.length === 0) {
                        return <p className="text-xs text-neutral-400">No students enrolled in this class/batch.</p>;
                      }

                      return classStudents.map(student => {
                        const studentId = student.uid || student.id;
                        const submission = submissions.find(sub => sub.homeworkId === selectedHomework.id && sub.studentId === studentId);
                        const isSubmitted = submission?.status === 'submitted';

                        return (
                          <div key={studentId} className="flex justify-between items-center p-3 bg-neutral-50 border border-neutral-200 rounded-xl hover:bg-neutral-100/50 transition-colors">
                            <div>
                              <p className="text-xs font-bold text-sidebar">{student.name}</p>
                              <p className="text-[10px] text-neutral-400">Roll No: {student.rollNumber || 'N/A'}</p>
                              {isSubmitted && submission.notes && (
                                <p className="text-[10.5px] text-neutral-500 italic mt-1 bg-white px-2 py-1 rounded border border-neutral-100 inline-block">
                                  "{submission.notes}"
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                isSubmitted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {isSubmitted ? '✅ Submitted' : '⏳ Pending'}
                              </span>
                              <button
                                onClick={async () => {
                                  try {
                                    if (isSubmitted) {
                                      await dbService.delete('homework_submissions', submission.id);
                                      toast.success(`Marked ${student.name} as pending`);
                                    } else {
                                      await dbService.add('homework_submissions', {
                                        homeworkId: selectedHomework.id,
                                        studentId: studentId,
                                        studentName: student.name,
                                        classId: selectedHomework.class,
                                        status: 'submitted',
                                        notes: 'Marked as completed by teacher',
                                        submittedAt: new Date().toISOString()
                                      });
                                      toast.success(`Marked ${student.name} as completed`);
                                    }
                                  } catch (err) {
                                    toast.error("Failed to update student submission");
                                  }
                                }}
                                className="px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/5 rounded border border-primary/20 transition-all cursor-pointer"
                              >
                                Toggle Status
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Homework;