const fs = require('fs');

let content = fs.readFileSync('src/pages/Hostel.tsx', 'utf8');

const regex = /function HostelStudents\(\{ students, classes, batches \}: any\) \{.*?^    <\/div>\n  \);\n\}/sm;

const newHostelStudents = `function HostelStudents({ students, classes, batches }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hostel_students_manage');

  const hostelStudents = students.filter((s: any) => s.feeType === 'hostel' && s.status === 'active');
  const filteredStudents = hostelStudents.filter((s: any) => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.hostelName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.admissionNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.village?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportStudents = () => {
    const dataToExport = hostelStudents.map((s: any) => {
      const cls = classes.find((c: any) => c.id === s.classId)?.name || '';
      const batch = batches.find((b: any) => b.id === s.batchId)?.name || '';
      
      // We export everything plus formatted class/batch strings.
      return {
        ...s,
        ClassName: cls,
        BatchName: batch,
      };
    });

    if (dataToExport.length === 0) {
      toast.error('No hostel students found to export');
      return;
    }

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', \`hostel_students_detailed_\${new Date().toISOString().split('T')[0]}.csv\`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Hostel students exported successfully (All fields included)');
  };

  const handleDropStudent = async (student: any) => {
    if (!canManage) {
        toast.error("You don't have permission to manage hostel allocations.");
        return;
    }
    if (window.confirm(\`Are you sure you want to drop \${student.name} from the hostel? This will change their fee type to Day Scholar.\`)) {
        try {
            await dbService.update('users', student.uid, {
                feeType: 'day_schooler',
                hostelName: ''
            });
            toast.success(\`\${student.name} dropped from hostel successfully.\`);
        } catch (error) {
            console.error("Error dropping student: ", error);
            toast.error("Failed to drop student from hostel.");
        }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-neutral-800">Hostel Allocations ({hostelStudents.length})</h2>
          <p className="text-base text-neutral-500">
            Students with valid hostel configuration in their profile. <br />
            <span className="text-sm italic text-blue-600 bg-blue-50 px-2 rounded">Tip: To assign a student to the hostel, edit their profile in the Students module and set "Fee Type" to "Hostel Resident".</span>
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input 
              type="text"
              placeholder="Search by name, ID, village or hostel block..."
              className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl outline-none focus:border-primary text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={exportStudents}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-600 font-bold border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-colors whitespace-nowrap text-base shadow-sm"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
        </div>
      </div>

      {filteredStudents.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-left font-mono text-base text-neutral-600">
            <thead className="bg-neutral-50 font-bold border-b border-neutral-100 uppercase tracking-widest text-sm">
              <tr>
                <th className="py-5 px-6 md:px-8">Student Info</th>
                <th className="py-5 px-6">Class/Batch</th>
                <th className="py-5 px-6">Village/City</th>
                <th className="py-5 px-6">Hostel Details</th>
                <th className="py-5 px-6">Parent Contact</th>
                <th className="py-5 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredStudents.map((student: any) => {
                const cls = classes.find((c: any) => c.id === student.classId)?.name || 'N/A';
                const batch = batches.find((b: any) => b.id === student.batchId)?.name || 'N/A';
                return (
                  <tr key={student.uid} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-5 px-6 md:px-8">
                      <div>
                        <span className="font-bold text-neutral-900 text-lg">{student.name}</span>
                        <div className="flex gap-2 items-center text-sm text-neutral-500 mt-1">
                          <span>{student.admissionNumber || 'No ID'}</span>
                          <span>•</span>
                          <span className="capitalize">{student.gender || 'Unknown'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <span className="font-bold text-neutral-800">{cls}</span>
                      <span className="text-neutral-500 text-sm ml-1">{batch}</span>
                    </td>
                    <td className="py-5 px-6">
                      <span className="font-bold text-neutral-700">{student.village || student.city || 'N/A'}</span>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex items-center gap-2">
                        <Building className="w-5 h-5 text-emerald-500" />
                        <span className="font-bold text-emerald-700">{student.hostelName || 'Not Assigned'}</span>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex flex-col">
                        <span className="font-bold">{student.parentName || student.fatherName || 'Unknown Parent'}</span>
                        <span className="text-sm text-neutral-500 flex items-center gap-1 mt-1"><Phone className="w-4 h-4" /> {student.whatsappNumber || student.contact || 'No Contact'}</span>
                      </div>
                    </td>
                    <td className="py-5 px-6 text-center">
                        <button 
                            onClick={() => handleDropStudent(student)}
                            title="Drop from Hostel"
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors inline-block"
                        >
                            <XCircle className="w-6 h-6" />
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-16 text-center flex flex-col items-center justify-center">
          <Users className="w-16 h-16 text-neutral-200 mb-6" />
          <h3 className="text-2xl font-bold text-neutral-800">No hostel allocations found</h3>
          <p className="text-neutral-500 max-w-md mt-4 text-base leading-relaxed">Create and allocate students to hostels in the student management profile. Ensure their Fee Type is set to "Hostel Resident".</p>
        </div>
      )}
    </div>
  );
}`;

content = content.replace(regex, newHostelStudents);
fs.writeFileSync('src/pages/Hostel.tsx', content);
