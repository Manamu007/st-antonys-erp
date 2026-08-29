import React, { useEffect, useState } from 'react';
import { limit } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { 
  Library as LibraryIcon, 
  Search, 
  Plus, 
  Book, 
  User, 
  Sparkles, 
  CheckCircle, 
  Clock,
  Filter,
  MoreVertical,
  ArrowUpDown,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { generateAIContent } from '../services/aiService';

const Library: React.FC = () => {
  const { hasPermission, isStudent, profile } = useAuth();
  const isTeacherRole = profile?.role === 'teacher' || profile?.role === 'teacher_class' || profile?.role === 'teacher_subject';

  if (!hasPermission('library_view')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm text-center">
        <LibraryIcon className="w-12 h-12 text-sidebar/30 mb-4" />
        <h2 className="text-xl font-black text-sidebar uppercase tracking-tight">Access Restricted</h2>
        <p className="text-neutral-500 text-sm max-w-xs mt-2 font-medium">You don't have permission to view library records. Contact admin.</p>
      </div>
    );
  }
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Student specific subjects
  const [studentSubjects, setStudentSubjects] = useState<string[]>([]);
  const [classDetail, setClassDetail] = useState<any>(null);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [activeSubjectFilter, setActiveSubjectFilter] = useState<string>("All");

  useEffect(() => {
    const unsubSubjects = dbService.subscribe('subjects', [], (data) => {
      setAllSubjects(data || []);
    });
    return unsubSubjects;
  }, []);

  useEffect(() => {
    if (!isStudent || !profile?.classId) return;
    const unsubClass = dbService.subscribeDoc('classes', profile?.classId, (classData) => {
      setClassDetail(classData);
    });
    return unsubClass;
  }, [isStudent, profile?.classId]);

  useEffect(() => {
    const subjectsList: string[] = [];
    if (Array.isArray(profile?.subjects)) {
      profile.subjects.forEach((s: any) => {
        if (typeof s === 'string') subjectsList.push(s);
        else if (s && s.name) subjectsList.push(s.name);
      });
    }
    if (classDetail) {
      if (Array.isArray(classDetail.subjects)) {
        classDetail.subjects.forEach((s: any) => {
          if (s && s.name) subjectsList.push(s.name);
          else if (s && typeof s === 'string') subjectsList.push(s);
        });
      }
      if (Array.isArray(classDetail.subjectIds) && allSubjects.length > 0) {
        classDetail.subjectIds.forEach((sid: string) => {
          const matchSub = allSubjects.find(s => s && s.id === sid);
          if (matchSub && matchSub.name) {
            subjectsList.push(matchSub.name);
          }
        });
      }
    }
    const uniqueSubjects = Array.from(new Set(subjectsList.map(s => s.trim()).filter(Boolean)));
    setStudentSubjects(uniqueSubjects);
  }, [profile?.subjects, classDetail, allSubjects]);

  useEffect(() => {
    const fetchData = async () => {
      const data = await dbService.list('library', [limit(200)]);
      setBooks(data);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredBooksList = books.filter(book => {
    // If student, must ONLY match studentSubjects
    if (isStudent) {
      if (studentSubjects.length === 0) {
        return false;
      }
      const bookSubName = (book.subject || book.category || book.genre || book.subjectName || "").toLowerCase().trim();
      const matchesStudentSubject = studentSubjects.some(sub => {
        const sName = sub.toLowerCase().trim();
        return bookSubName.includes(sName) || sName.includes(bookSubName);
      });
      if (!matchesStudentSubject) return false;
    }

    // Active tab filter
    if (activeSubjectFilter !== "All") {
      const bookSubName = (book.subject || book.category || book.genre || book.subjectName || "").toLowerCase().trim();
      const filterName = activeSubjectFilter.toLowerCase().trim();
      return bookSubName.includes(filterName) || filterName.includes(bookSubName);
    }

    return true;
  });

  const sortedBooks = filteredBooksList
    .filter(b => (String(b.title || "")).toLowerCase().includes(searchTerm.toLowerCase()) || (String(b.author || "")).toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-sidebar">Library Management</h1>
          <p className="text-sm text-neutral-500">Track book inventory and manage lending.</p>
        </div>
        <div className="flex items-center gap-3">
          {(hasPermission('library_manage') && !isTeacherRole) && (
            <button className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sidebar transition-colors shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4" />
              <span>Add Book</span>
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Stats */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
            <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-4">Library Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Total Books</span>
                <span className="text-sm font-bold">12,450</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Issued</span>
                <span className="text-sm font-bold">420</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Overdue</span>
                <span className="text-sm font-bold text-red-500">15</span>
              </div>
            </div>
          </div>

          <div className="bg-sidebar p-6 rounded-2xl text-white shadow-xl">
            <h3 className="font-bold text-sm mb-4">Quick Search</h3>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input 
                type="text" 
                placeholder="ISBN or Title..." 
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/10 rounded-lg outline-none text-sm text-white placeholder:text-white/30" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="w-full bg-accent text-white py-2 rounded-lg text-xs font-bold hover:bg-accent/80 transition-colors">
              Check Availability
            </button>
          </div>
        </div>

        {/* Book Table */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 flex justify-between items-center">
            <div className="flex gap-2 flex-wrap">
              {isStudent ? (
                <>
                  <button 
                    onClick={() => setActiveSubjectFilter("All")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      activeSubjectFilter === "All" ? 'bg-primary text-white shadow-sm' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                    }`}
                  >
                    All My Subjects
                  </button>
                  {studentSubjects.map(sub => (
                    <button 
                      key={sub}
                      onClick={() => setActiveSubjectFilter(sub)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        activeSubjectFilter === sub ? 'bg-primary text-white shadow-sm' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setActiveSubjectFilter("All")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      activeSubjectFilter === "All" ? 'bg-primary text-white shadow-sm' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                    }`}
                  >
                    All Books
                  </button>
                  <button 
                    onClick={() => setActiveSubjectFilter("Science")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      activeSubjectFilter === "Science" ? 'bg-primary text-white shadow-sm' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                    }`}
                  >
                    Science
                  </button>
                  <button 
                    onClick={() => setActiveSubjectFilter("Literature")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      activeSubjectFilter === "Literature" ? 'bg-primary text-white shadow-sm' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                    }`}
                  >
                    Literature
                  </button>
                </>
              )}
            </div>
            <button className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-400">
              <Filter className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50/50 border-b border-neutral-100">
                    <th 
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('title')}
                    >
                      <div className="flex items-center gap-2">
                        Title
                        {sortConfig?.key === 'title' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('author')}
                    >
                      <div className="flex items-center gap-2">
                        Author
                        {sortConfig?.key === 'author' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-400 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        {sortConfig?.key === 'status' ? (
                          sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-neutral-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loading ? (
                    <tr><td colSpan={4} className="px-6 py-12 text-center text-neutral-400">Loading books...</td></tr>
                  ) : sortedBooks.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-12 text-center text-neutral-400">No books found.</td></tr>
                  ) : sortedBooks.map((book) => (
                    <tr key={book.id} className="hover:bg-neutral-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                            <Book className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-sidebar text-sm">{book.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">{book.author}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          book.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {book.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-primary text-xs font-bold hover:underline">
                          {book.status === 'available' ? 'Issue' : 'Reserve'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Library;
