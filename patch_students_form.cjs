const fs = require('fs');

let content = fs.readFileSync('src/pages/Students.tsx', 'utf8');

const personalInfoRegex = /\{\/\* Personal Information \*\/\}\s*<section className="space-y-4">[\s\S]*?(?=\{\/\* Academic Information \*\/)/;

const newPersonalInfo = `{/* Personal Information */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <User className="w-5 h-5" />
                  <h3 className="font-bold uppercase tracking-wider text-sm">Personal Information</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">First Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.firstName}
                      onChange={(e) => {
                        const firstName = e.target.value;
                        setNewStudent({...newStudent, firstName, name: \`\${firstName} \${newStudent.lastName}\`.trim()})
                      }}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Last Name</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.lastName}
                      onChange={(e) => {
                        const lastName = e.target.value;
                        setNewStudent({...newStudent, lastName, name: \`\${newStudent.firstName} \${lastName}\`.trim()})
                      }}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Gender</label>
                    <select 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.gender}
                      onChange={(e) => setNewStudent({...newStudent, gender: e.target.value as any})}
                      disabled={isEditing && !canEditBasic}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Date of Birth</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.dateOfBirth}
                      onChange={(e) => setNewStudent({...newStudent, dateOfBirth: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Blood Group</label>
                    <input 
                      type="text" 
                      placeholder="e.g. O+"
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.bloodGroup}
                      onChange={(e) => setNewStudent({...newStudent, bloodGroup: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Student Aadhar Number</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.studentAadharNumber}
                      onChange={(e) => setNewStudent({...newStudent, studentAadharNumber: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Religion</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.religion}
                      onChange={(e) => setNewStudent({...newStudent, religion: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Caste</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.caste}
                      onChange={(e) => setNewStudent({...newStudent, caste: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Sub Caste</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.subCaste}
                      onChange={(e) => setNewStudent({...newStudent, subCaste: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Ration Card Number</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.rationCardNumber}
                      onChange={(e) => setNewStudent({...newStudent, rationCardNumber: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Appar ID</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.apparId}
                      onChange={(e) => setNewStudent({...newStudent, apparId: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Child ID</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.childId}
                      onChange={(e) => setNewStudent({...newStudent, childId: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Remarks / Internal Notes</label>
                    <textarea 
                      placeholder="Enter any special remarks, health conditions, or internal notes..."
                      rows={2}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:border-primary transition-all resize-none disabled:opacity-50"
                      value={newStudent.remarks}
                      onChange={(e) => setNewStudent({...newStudent, remarks: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                </div>
              </section>

              `;

content = content.replace(personalInfoRegex, newPersonalInfo);

// Now for Academic Info: we need to move Roll Number, PEN Number, Admission Number, Admission Date from the old block to Academic Info
const addAcademicFields = `                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Roll Number</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.rollNumber}
                      onChange={(e) => setNewStudent({...newStudent, rollNumber: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">PEN Number</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.penNumber}
                      onChange={(e) => setNewStudent({...newStudent, penNumber: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Admission Number</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.admissionNumber}
                      onChange={(e) => setNewStudent({...newStudent, admissionNumber: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Admission Date</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none focus:border-primary transition-all disabled:opacity-50"
                      value={newStudent.admissionDate}
                      onChange={(e) => setNewStudent({...newStudent, admissionDate: e.target.value})}
                      readOnly={isEditing && !canEditBasic}
                    />
                  </div>
`;

// Insert these new academic fields right before Academic Year in the Academic info block
content = content.replace(
  /<label className="text-\[10px\] font-bold text-neutral-400 uppercase tracking-widest">Academic Year<\/label>/,
  addAcademicFields + '                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Academic Year</label>'
);

fs.writeFileSync('src/pages/Students.tsx', content);
