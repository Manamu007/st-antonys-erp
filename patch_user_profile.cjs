const fs = require('fs');
let content = fs.readFileSync('src/pages/UserProfile.tsx', 'utf8');

// Add firstName and lastName to formData state
content = content.replace(
  /name: profile\?.name \|\| '',/,
  `name: profile?.name || '',
    firstName: profile?.firstName || profile?.name?.split(' ')[0] || '',
    lastName: profile?.lastName || profile?.name?.split(' ').slice(1).join(' ') || '',
    feeType: profile?.feeType || 'day_schooler',
    hostelName: profile?.hostelName || '',`
);

content = content.replace(
  /name: profile.name \|\| '',/,
  `name: profile.name || '',
        firstName: profile.firstName || profile.name?.split(' ')[0] || '',
        lastName: profile.lastName || profile.name?.split(' ').slice(1).join(' ') || '',
        feeType: profile.feeType || 'day_schooler',
        hostelName: profile.hostelName || '',`
);

const oldNameField = /<div className="space-y-2">\s*<label className="text-\[10px\] font-bold text-neutral-400 uppercase tracking-widest">Full Display Name<\/label>\s*<input[^>]*value=\{formData\.name\}[^>]*\/>\s*<\/div>/;

const newNameFields = `<div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">First Name</label>
                    <input 
                      type="text"
                      disabled={!isEditing}
                      value={formData.firstName}
                      onChange={(e) => {
                        const firstName = e.target.value;
                        setFormData({...formData, firstName, name: \`\${firstName} \${formData.lastName}\`.trim()})
                      }}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Last Name</label>
                    <input 
                      type="text"
                      disabled={!isEditing}
                      value={formData.lastName}
                      onChange={(e) => {
                        const lastName = e.target.value;
                        setFormData({...formData, lastName, name: \`\${formData.firstName} \${lastName}\`.trim()})
                      }}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                    />
                  </div>`;

content = content.replace(oldNameField, newNameFields);

const additionalStudentFields = `
                {/* Hostel Selection for Students */}
                {profile.role === 'student' && (
                  <div className="space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Hostel Details</h4>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Accommodation Status</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.feeType}
                        onChange={(e) => setFormData({...formData, feeType: e.target.value})}
                        className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                      >
                        <option value="day_schooler">Day Scholar</option>
                        <option value="hostel">Hostel Resident</option>
                      </select>
                    </div>

                    {formData.feeType === 'hostel' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Hostel Name</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.hostelName}
                          onChange={(e) => setFormData({...formData, hostelName: e.target.value})}
                          placeholder="e.g. Block A"
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                    )}
                  </div>
                )}
`;

content = content.replace(/\{\/\* Professional Section \*\/\}/, additionalStudentFields + '\n\n                {/* Professional Section */}');

fs.writeFileSync('src/pages/UserProfile.tsx', content);
