import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  User, Mail, Phone, Shield, Camera, Save, Loader2, 
  MapPin, Calendar, Briefcase, Banknote, Sparkles,
  ChevronRight, BadgeCheck, Globe, Trash2, Upload,
  Hash, GraduationCap, Users, Database
} from 'lucide-react';
import { normalizeUrl, getGravatarUrl } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { dbService } from '../services/dbService';
import { uploadService } from '../services/uploadService';
import CameraModal from '../components/CameraModal';
import { normalizeRole } from '../lib/profileUtils';
import { toast } from 'sonner';
import { where, limit } from 'firebase/firestore';
import { safeStorage as localStorage } from '../lib/safeStorage';

const UserProfile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const { isAdmin, isSuperAdmin, hasPermission } = usePermissions();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [formData, setFormData] = useState({
    name: profile?.name || '',
    firstName: profile?.firstName || profile?.name?.split(' ')[0] || '',
    lastName: profile?.lastName || profile?.name?.split(' ').slice(1).join(' ') || '',
    feeType: profile?.feeType || 'day_schooler',
    hostelName: profile?.hostelName || '',
    photoURL: profile?.photoURL || '',
    photoManuallyUploaded: profile?.photoManuallyUploaded || false,
    phone: profile?.phone || '',
    whatsappNumber: profile?.whatsappNumber || '',
    emergencyContact: profile?.emergencyContact || '',
    gender: profile?.gender || '',
    bloodGroup: profile?.bloodGroup || '',
    aadharNumber: profile?.aadharNumber || profile?.studentAadharNumber || '',
    address: profile?.address || '',
    village: profile?.village || '',
    city: profile?.city || '',
    state: profile?.state || '',
    zipCode: profile?.zipCode || '',
    // Student specific fields
    rollNumber: profile?.rollNumber || profile?.rollNo || '',
    classId: profile?.classId || profile?.class || '',
    batchId: profile?.batchId || profile?.batch || '',
    fatherName: profile?.fatherName || '',
    motherName: profile?.motherName || '',
    parentName: profile?.parentName || '',
    dateOfBirth: profile?.dateOfBirth || profile?.dob || '',
    admissionDate: profile?.admissionDate || '',
    admissionNumber: profile?.admissionNumber || '',
    caste: profile?.caste || '',
    subCaste: profile?.subCaste || '',
    religion: profile?.religion || '',
    penNumber: profile?.penNumber || '',
    // Staff specific fields
    department: profile?.department || '',
    designation: profile?.designation || '',
    dateOfJoining: profile?.dateOfJoining || '',
    qualification: profile?.qualification || '',
    experience: profile?.experience || '',
    subjects: profile?.subjects || [],
    // Transport fields
    transportBusId: profile?.transportBusId || '',
    transportStopId: profile?.transportStopId || '',
    busRoute: profile?.busRoute || '',
    transportType: profile?.transportType || 'private',
    transportStatus: profile?.transportStatus || 'inactive',
  });

  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [stops, setStops] = useState<any[]>([]);

  useEffect(() => {
    if (profile && !isEditing) {
      setFormData(prev => {
        // Fallback for classId/batchId if only names are present
        const resolvedClassId = profile.classId || (classes.find(c => c.name === profile.class)?.id) || profile.class || '';
        const resolvedBatchId = profile.batchId || (batches.find(b => b.name === profile.batch)?.id) || profile.batch || '';

        const currentGoogleEmail = (user?.email || '').toLowerCase().trim();
        const profileEmail = (profile.email || '').toLowerCase().trim();
        const isGoogleMatching = currentGoogleEmail && profileEmail && currentGoogleEmail === profileEmail;
        const resolvedPhoto = (profile.photoURL && !profile.photoURL.includes('gravatar.com')) 
          ? profile.photoURL 
          : (isGoogleMatching ? user?.photoURL : '') || '';

        const newData = {
          name: profile.name || '',
          firstName: profile.firstName || profile.name?.split(' ')[0] || '',
          lastName: profile.lastName || profile.name?.split(' ').slice(1).join(' ') || '',
          feeType: profile.feeType || 'day_schooler',
          hostelName: profile.hostelName || '',
          photoURL: resolvedPhoto,
          photoManuallyUploaded: profile.photoManuallyUploaded || false,
          phone: profile.phone || '',
          whatsappNumber: profile.whatsappNumber || '',
          emergencyContact: profile.emergencyContact || '',
          gender: profile.gender || '',
          bloodGroup: profile.bloodGroup || '',
          aadharNumber: profile.aadharNumber || profile.studentAadharNumber || '',
          address: profile.address || '',
          village: profile.village || '',
          city: profile.city || '',
          state: profile.state || '',
          zipCode: profile.zipCode || '',
          rollNumber: profile.rollNumber || profile.rollNo || '',
          classId: resolvedClassId,
          batchId: resolvedBatchId,
          fatherName: profile.fatherName || '',
          motherName: profile.motherName || '',
          parentName: profile.parentName || '',
          dateOfBirth: profile.dateOfBirth || profile.dob || '',
          admissionDate: profile.admissionDate || '',
          admissionNumber: profile.admissionNumber || '',
          caste: profile.caste || '',
          subCaste: profile.subCaste || '',
          religion: profile.religion || '',
          penNumber: profile.penNumber || '',
          department: profile.department || '',
          designation: profile.designation || '',
          dateOfJoining: profile.dateOfJoining || '',
          qualification: profile.qualification || '',
          experience: profile.experience || '',
          subjects: profile.subjects || [],
          transportBusId: profile.transportBusId || '',
          transportStopId: profile.transportStopId || '',
          busRoute: profile.busRoute || '',
          transportType: profile.transportType || 'private',
          transportStatus: profile.transportStatus || 'inactive',
        };
        
        // Prevent update if data is identical to avoid re-renders
        if (JSON.stringify(prev) === JSON.stringify(newData)) return prev;
        return newData;
      });
    }
  }, [profile, user?.uid, isEditing, classes, batches]);

  useEffect(() => {
    const fetchAcedemics = async () => {
      try {
        const [c, b, bs, st] = await Promise.all([
          dbService.list('classes'),
          dbService.list('batches'),
          dbService.list('buses'),
          dbService.list('stops')
        ]);
        setClasses(c);
        setBatches(b);
        setBuses(bs);
        setStops(st);
      } catch (e) {
        console.error("Failed to load academic and transport data");
      }
    };
    fetchAcedemics();
  }, []);

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!profile) return <div className="p-8 text-center text-neutral-500 font-bold">Profile not found</div>;

  const { isStudent: isCurrentStudent } = useAuth();
  const profileId = profile.id || profile.uid || user?.uid;
  const isViewingOwnProfile = profileId === user?.uid;
  
  // Student Portal restriction: Students can only edit photo and whatsapp on their own profile
  const isRestrictedStudent = isCurrentStudent && isViewingOwnProfile;
  
  const canEditAcademic = isAdmin || isSuperAdmin || hasPermission('manage_students');
  const role = normalizeRole(profile.role);
  const isStudentRole = role === 'student';

  const canEditField = (fieldName: string) => {
    if (!isEditing) return false;
    if (isCurrentStudent || isStudentRole) return false;
    if (isAdmin || isSuperAdmin) return true;
    if (isRestrictedStudent) {
      return ['photoURL', 'whatsappNumber'].includes(fieldName);
    }
    // For others (staff), check specific permissions or allow self-edit of basic info
    if (['rollNumber', 'classId', 'batchId', 'admissionNumber', 'department'].includes(fieldName)) {
      return canEditAcademic;
    }
    return true;
  };

  const [showRoleModal, setShowRoleModal] = useState(false);

  const handleSwitchRole = async (targetRole: string) => {
    if (!profileId) return;
    setLoading(true);
    try {
      const cleanRole = normalizeRole(targetRole);
      
      // Update user identity doc
      await dbService.update('users', profileId, { 
        role: cleanRole, 
        updatedAt: new Date().toISOString() 
      });

      if (cleanRole === 'teacher' || cleanRole === 'staff' || cleanRole === 'admin' || cleanRole === 'vice_principal') {
        // Save to staff collection
        await dbService.set('staff', profileId, {
          uid: profileId,
          id: profileId,
          name: formData.name || profile.name || 'Teacher / Staff',
          email: profile.email,
          role: cleanRole,
          department: formData.department || 'High School',
          designation: formData.designation || 'Class Teacher',
          qualification: formData.qualification || 'M.Sc, B.Ed',
          experience: formData.experience || '3 Years',
          status: 'active',
          updatedAt: new Date().toISOString()
        });
        // Delete accidental student doc if present
        try {
          await dbService.delete('students', profileId);
        } catch (e) {}
      } else if (cleanRole === 'student') {
        // Save to students collection
        await dbService.set('students', profileId, {
          uid: profileId,
          id: profileId,
          name: formData.name || profile.name,
          email: profile.email,
          role: 'student',
          admissionNumber: formData.admissionNumber || `ADM-${Math.floor(1000 + Math.random() * 9000)}`,
          rollNumber: formData.rollNumber || `STU-${Math.floor(100 + Math.random() * 900)}`,
          status: 'active',
          updatedAt: new Date().toISOString()
        });
        try {
          await dbService.delete('staff', profileId);
        } catch (e) {}
      }

      localStorage.setItem('bypass_user_role', cleanRole);
      toast.success(`Account Role updated to ${targetRole.toUpperCase()}! Reloading...`);
      setShowRoleModal(false);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      console.error("Role switch error:", err);
      toast.error("Failed to update role");
    } finally {
      setLoading(false);
    }
  };

  const [missingDataRecord, setMissingDataRecord] = useState<any | null>(null);

  useEffect(() => {
    if (!profile || authLoading) return;
    
    const checkMissingData = async () => {
      const targetCollection = (role === 'student' || role === 'parent') ? 'students' : 'staff';

      // Check if current detail profile has missing key data
      const isMissingData = role === 'student' 
        ? (!profile.classId && !profile.class) 
        : (!profile.department && !profile.qualification);

      if (isMissingData && profile.email) {
        // Search for records in the same collection with the same email but DIFFERENT ID
        try {
          const orphaned = await dbService.list(targetCollection, [
             where('email', '==', profile.email.toLowerCase().trim()),
             limit(5)
          ]);
          
          const candidate = orphaned.find(o => (o.uid || o.id) !== profileId);
          if (candidate) {
            setMissingDataRecord(candidate);
          }
        } catch (e) {
          console.warn("Could not check for orphaned records:", e);
        }
      }
    };
    
    checkMissingData();
  }, [profile, profileId, authLoading, role]);

  const handleRepairData = async () => {
    if (!missingDataRecord || !profileId) return;
    setLoading(true);
    try {
      const targetCollection = (role === 'student' || role === 'parent') ? 'students' : 'staff';
      
      // Merge candidate data into current profile
      const updatedData = { ...missingDataRecord, uid: profileId, id: profileId, updatedAt: new Date().toISOString() };
      await dbService.set(targetCollection, profileId, updatedData);
      
      // Delete old orphaned record
      const oldId = missingDataRecord.id || missingDataRecord.uid;
      if (oldId && oldId !== profileId) {
        try {
          await dbService.delete(targetCollection, oldId);
          await dbService.delete('users', oldId);
        } catch (e) {}
      }
      
      toast.success("Profile records linked and repaired successfully!");
      setMissingDataRecord(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      toast.error("Failed to repair profile data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) {
      toast.error('User identity not found');
      return;
    }

    setLoading(true);
    try {
    // Step 1: Update identity fields in 'users'
    const identityFields = ['name', 'email', 'photoURL', 'role', 'status', 'photoManuallyUploaded'];
    const identityUpdate: any = { updatedAt: new Date().toISOString() };
    const profileUpdate: any = { ...formData, updatedAt: new Date().toISOString() };

    if (formData.photoURL && formData.photoURL !== (profile?.photoURL || '')) {
      identityUpdate.photoManuallyUploaded = true;
      profileUpdate.photoManuallyUploaded = true;
    }

    // Sync redundant fields for better compatibility
    const currentRole = normalizeRole(profile.role);
    if (currentRole === 'student' || currentRole === 'parent') {
      const selectedClass = classes.find(c => c.id === formData.classId);
      const selectedBatch = batches.find(b => b.id === formData.batchId);
      if (selectedClass) profileUpdate.class = selectedClass.name;
      if (selectedBatch) profileUpdate.batch = selectedBatch.name;
      
      // Handle student-specific field naming mismatches
      profileUpdate.contact = formData.phone;
      profileUpdate.studentAadharNumber = formData.aadharNumber;
      profileUpdate.rollNo = formData.rollNumber;
    } else {
      profileUpdate.contact = formData.phone;
    }

    Object.keys(formData).forEach(key => {
      if (identityFields.includes(key)) {
        identityUpdate[key] = formData[key];
      }
    });

      // Step 2: Update detailed profile fields in students/staff
      const role = normalizeRole(profile.role);
      const targetCollection = (role === 'student' || role === 'parent') ? 'students' : 'staff';

      await dbService.update('users', profileId, identityUpdate);
      try {
        const detailExists = await dbService.get(targetCollection, profileId);
        if (detailExists) {
          await dbService.update(targetCollection, profileId, profileUpdate);
        } else {
          await dbService.set(targetCollection, profileId, { ...profileUpdate, email: profileUpdate.email || profile.email });
        }
      } catch (err) {
        await dbService.set(targetCollection, profileId, { ...profileUpdate, email: profileUpdate.email || profile.email });
      }

      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Update profile error:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      toast.loading("Processing and uploading photo...", { id: 'profile-photo' });
      const processedFile = await uploadService.processProfileImage(file);
      const url = await uploadService.uploadFile(processedFile);
      setFormData(prev => ({ ...prev, photoURL: url, photoManuallyUploaded: true }));
      toast.success("Photo uploaded! Formatted perfectly to 3:4 for ID cards. Save to apply.", { id: 'profile-photo' });
    } catch (error: any) {
      toast.error(error.message || "Upload failed", { id: 'profile-photo' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Profile Header Background */}
      <div className="h-64 bg-sidebar relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full transform -skew-y-12 bg-gradient-to-r from-primary to-accent" />
        </div>
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#F8FAFC] to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-32 relative z-10 pb-20">
        {/* Repair Banner */}
        {missingDataRecord && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-amber-600 p-6 rounded-[2rem] text-white shadow-2xl shadow-amber-900/20 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative"
          >
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-xl font-black uppercase tracking-tighter italic">Found Import Progress!</h3>
                <p className="text-amber-100 text-sm font-bold opacity-80">We've found an imported record with your email that contains your academic history. Link it now to restore your data.</p>
              </div>
            </div>
            <button 
              onClick={handleRepairData}
              disabled={loading}
              className="bg-white text-amber-700 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-neutral-50 transition-all active:scale-95 whitespace-nowrap flex items-center gap-3"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-5 h-5" />}
              RESTORE MY DATA
            </button>
            <div className="absolute right-0 bottom-0 opacity-10 blur-2xl">
              <GraduationCap className="w-48 h-48 -mr-12 -mb-12" />
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Summary Card */}
          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-xl overflow-hidden"
            >
              <div className="p-8 flex flex-col items-center">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-full bg-primary/5 flex items-center justify-center overflow-hidden border-8 border-white shadow-xl ring-1 ring-neutral-100">
                    {normalizeUrl(formData.photoURL) ? (
                      <img 
                        src={normalizeUrl(formData.photoURL)} 
                        alt={profile.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="w-16 h-16 text-primary/40" />
                    )}
                  </div>
                  {isEditing && (
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-4">
                      <label className="p-2 hover:bg-white/20 rounded-full cursor-pointer transition-colors" title="Upload Photo">
                        <Upload className="w-6 h-6 text-white" />
                        <input 
                          type="file" 
                          accept="image/*"
                          className="hidden" 
                          onChange={handlePhotoUpload}
                        />
                      </label>
                      <button 
                        type="button"
                        onClick={() => setShowCameraModal(true)}
                        className="p-2 hover:bg-white/20 rounded-full cursor-pointer transition-colors"
                        title="Capture Photo"
                      >
                        <Camera className="w-6 h-6 text-white" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 text-center">
                  <h2 className={`text-2xl font-black tracking-tight ${profile.role === 'student' && (String(profile.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>
                    {profile.role === 'student' 
                      ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.name
                      : profile.name
                    }
                  </h2>
                  <div className="flex flex-col items-center gap-2 mt-2">
                    {profile.role === 'student' && profile.fatherName && (
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-2">
                        Father: {profile.fatherName}
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-2">
                      <span className="px-3 py-1 bg-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-lg shadow-primary/20">
                        {profile.role}
                      </span>
                      <span className="px-3 py-1 bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-widest rounded-full border border-green-100">
                        {profile.status || 'Active'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full mt-8 pt-8 border-t border-neutral-100 space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-neutral-400 font-medium">Email</span>
                    <span className="text-sidebar font-bold flex items-center gap-2">
                      <Mail className="w-3 h-3 text-primary" /> {profile.email}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-neutral-400 font-medium">Joined On</span>
                    <span className="text-sidebar font-bold flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-primary" /> 
                      {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="w-full mt-8 space-y-3">
                  {isCurrentStudent || isStudentRole ? (
                    <>
                      <div className="w-full bg-neutral-100 text-neutral-500 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 border border-neutral-200 text-xs">
                        <Shield className="w-4 h-4 text-neutral-400" />
                        ReadOnly Student Profile
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRoleModal(true)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        <User className="w-4 h-4" />
                        Fix / Correct Account Role
                      </button>
                    </>
                  ) : !isEditing ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="w-full bg-sidebar text-white py-4 rounded-2xl font-bold hover:bg-primary transition-all shadow-xl shadow-sidebar/20 flex items-center justify-center gap-3"
                      >
                        <Sparkles className="w-5 h-5 text-yellow-400" />
                        Edit Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRoleModal(true)}
                        className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                      >
                        <User className="w-3.5 h-3.5 text-primary" />
                        Change Account Role
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="flex-1 bg-neutral-100 text-neutral-600 py-4 rounded-2xl font-bold hover:bg-neutral-200 transition-all font-mono text-sm tracking-tighter"
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={loading}
                        className="flex-[2] bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        SAVE CHANGES
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Account</p>
                <p className="text-xl font-black text-sidebar">Verified</p>
                <div className="w-full h-1 bg-green-500 rounded-full mt-2" />
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Security</p>
                <p className="text-xl font-black text-sidebar">High</p>
                <div className="w-full h-1 bg-primary rounded-full mt-2" />
              </div>
            </div>
          </div>

          {/* Right Column: Detailed Info Form */}
          <div className="lg:col-span-2 space-y-8 text-neutral-900">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-3xl shadow-xl p-10"
            >
              <div className="flex items-center gap-4 mb-10 pb-6 border-b border-neutral-100">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <BadgeCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-sidebar tracking-tight">Detailed Information</h3>
                  <p className="text-neutral-400 text-sm font-medium">Personal and professional details</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {/* Personal Section */}
                <div className="space-y-6">
                  <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Personal Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">First Name</label>
                      <input 
                        type="text"
                        disabled={!canEditField('firstName')}
                        value={formData.firstName}
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                        className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Last Name</label>
                      <input 
                        type="text"
                        disabled={!canEditField('lastName')}
                        value={formData.lastName}
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                        className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Full Display Name</label>
                    <input 
                      type="text"
                      disabled={!canEditField('name')}
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Phone Number</label>
                    <input 
                      type="tel"
                      disabled={!canEditField('phone')}
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">WhatsApp Number</label>
                    <input 
                      type="tel"
                      disabled={!canEditField('whatsappNumber')}
                      value={formData.whatsappNumber}
                      onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Emergency Contact</label>
                    <input 
                      type="tel"
                      disabled={!canEditField('emergencyContact')}
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({...formData, emergencyContact: e.target.value})}
                      placeholder="Emergency contact details"
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Gender</label>
                    <select 
                      disabled={!canEditField('gender')}
                      value={formData.gender}
                      onChange={(e) => setFormData({...formData, gender: e.target.value})}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Identification & Address Section */}
                <div className="space-y-6">
                  <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Identity & Address</h4>

                  {profile.role === 'student' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Admission Number</label>
                      <input 
                        type="text"
                        disabled={!canEditField('admissionNumber')}
                        value={formData.admissionNumber}
                        onChange={(e) => setFormData({...formData, admissionNumber: e.target.value})}
                        className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        placeholder="Admission No"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Aadhar Number</label>
                    <input 
                      type="text"
                      disabled={!canEditField('aadharNumber')}
                      value={formData.aadharNumber}
                      onChange={(e) => setFormData({...formData, aadharNumber: e.target.value})}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                      placeholder="XXXX-XXXX-XXXX"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Blood Group</label>
                    <input 
                      type="text"
                      disabled={!canEditField('bloodGroup')}
                      value={formData.bloodGroup}
                      onChange={(e) => setFormData({...formData, bloodGroup: e.target.value})}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                      placeholder="e.g. A+ / B+"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Postal Address</label>
                    <textarea 
                      disabled={!canEditField('address')}
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={4}
                      className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 resize-none"
                    />
                  </div>
                </div>

                {/* Staff & Professional Details Section */}
                {profile.role !== 'student' && (
                  <div className="md:col-span-2 pt-8 border-t border-neutral-100 space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Staff & Professional Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Department</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.department}
                          onChange={(e) => setFormData({...formData, department: e.target.value})}
                          placeholder="e.g. Science, Mathematics, High School"
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Designation</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.designation}
                          onChange={(e) => setFormData({...formData, designation: e.target.value})}
                          placeholder="e.g. Class Teacher, Senior Teacher"
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Qualification</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.qualification}
                          onChange={(e) => setFormData({...formData, qualification: e.target.value})}
                          placeholder="e.g. M.Sc, B.Ed, M.A"
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Experience</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.experience}
                          onChange={(e) => setFormData({...formData, experience: e.target.value})}
                          placeholder="e.g. 5 Years"
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Date of Joining</label>
                        <input 
                          type="date"
                          disabled={!isEditing}
                          value={formData.dateOfJoining?.split('T')[0] || ''}
                          onChange={(e) => setFormData({...formData, dateOfJoining: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Fee Info for Students */}
                {profile.role === 'student' && (
                   <div className="md:col-span-2 pt-8 border-t border-neutral-100 space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Fee Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Concession Type</label>
                        <input 
                          type="text"
                          disabled
                          value={profile?.concession || profile?.feeConcessionType || 'None'}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent outline-none transition-all font-bold text-sidebar opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Academic Year</label>
                        <input 
                          type="text"
                          disabled
                          value={profile?.academicYear || 'N/A'}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent outline-none transition-all font-bold text-sidebar opacity-60"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Village</label>
                        <input 
                          type="text"
                          disabled={!canEditField('village')}
                          value={formData.village}
                          onChange={(e) => setFormData({...formData, village: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">City</label>
                          <input 
                            type="text"
                            disabled={!canEditField('city')}
                            value={formData.city}
                            onChange={(e) => setFormData({...formData, city: e.target.value})}
                            className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">State</label>
                          <input 
                            type="text"
                            disabled={!canEditField('state')}
                            value={formData.state}
                            onChange={(e) => setFormData({...formData, state: e.target.value})}
                            className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                          />
                        </div>
                      </div>
                    </div>
                )}

                {/* Academic Section for Students */}
                {profile.role === 'student' && (
                  <div className="md:col-span-2 pt-8 border-t border-neutral-100 space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Academic Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-x-12 gap-y-8">
                       <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Admission Date</label>
                        <input 
                          type="date"
                          disabled={!canEditField('admissionDate')}
                          value={formData.admissionDate?.split('T')[0] || ''}
                          onChange={(e) => setFormData({...formData, admissionDate: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Roll Number</label>
                        <div className="relative">
                          <input 
                            type="text"
                            disabled={!canEditField('rollNumber')}
                            value={formData.rollNumber}
                            onChange={(e) => setFormData({...formData, rollNumber: e.target.value})}
                            placeholder="Assign Roll No"
                            className="w-full bg-neutral-50 px-5 py-4 pl-12 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                          />
                          <Hash className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Class</label>
                        <div className="relative">
                          <select 
                            disabled={!canEditField('classId')}
                            value={formData.classId}
                            onChange={(e) => setFormData({...formData, classId: e.target.value})}
                            className="w-full bg-neutral-50 px-5 py-4 pl-12 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                          >
                            <option value="">No Class</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <GraduationCap className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Batch</label>
                        <div className="relative">
                          <select 
                            disabled={!canEditField('batchId')}
                            value={formData.batchId}
                            onChange={(e) => setFormData({...formData, batchId: e.target.value})}
                            className="w-full bg-neutral-50 px-5 py-4 pl-12 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                          >
                            <option value="">No Batch</option>
                            {batches.filter(b => b.classId === formData.classId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                          <Users className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Parent Section for Students */}
                {profile.role === 'student' && (
                  <div className="md:col-span-2 pt-8 border-t border-neutral-100 space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Parent Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Father's Name</label>
                        <input 
                          type="text"
                          disabled={!canEditField('fatherName')}
                          value={formData.fatherName}
                          onChange={(e) => setFormData({...formData, fatherName: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Mother's Name</label>
                        <input 
                          type="text"
                          disabled={!canEditField('motherName')}
                          value={formData.motherName}
                          onChange={(e) => setFormData({...formData, motherName: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Parent Name (Guardian)</label>
                        <input 
                          type="text"
                          disabled={!canEditField('parentName')}
                          value={formData.parentName}
                          onChange={(e) => setFormData({...formData, parentName: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Details Section for Students */}
                {profile.role === 'student' && (
                  <div className="md:col-span-2 pt-8 border-t border-neutral-100 space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Additional Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-8">
                       <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Date of Birth</label>
                        <input 
                          type="date"
                          disabled={!canEditField('dateOfBirth')}
                          value={formData.dateOfBirth?.split('T')[0] || ''}
                          onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Caste</label>
                        <input 
                          type="text"
                          disabled={!canEditField('caste')}
                          value={formData.caste}
                          onChange={(e) => setFormData({...formData, caste: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Sub Caste</label>
                        <input 
                          type="text"
                          disabled={!canEditField('subCaste')}
                          value={formData.subCaste}
                          onChange={(e) => setFormData({...formData, subCaste: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Religion</label>
                        <input 
                          type="text"
                          disabled={!canEditField('religion')}
                          value={formData.religion}
                          onChange={(e) => setFormData({...formData, religion: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">PEN Number</label>
                        <input 
                          type="text"
                          disabled={!canEditField('penNumber')}
                          value={formData.penNumber}
                          onChange={(e) => setFormData({...formData, penNumber: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>
                )}

                
                {/* Hostel Selection for Students */}
                {profile.role === 'student' && (
                  <div className="space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Hostel Details</h4>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Accommodation Status</label>
                      <select 
                        disabled={!canEditField('feeType')}
                        value={formData.feeType}
                        onChange={(e) => setFormData({...formData, feeType: e.target.value as any})}
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
                          disabled={!canEditField('hostelName')}
                          value={formData.hostelName}
                          onChange={(e) => setFormData({...formData, hostelName: e.target.value})}
                          placeholder="e.g. Block A"
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                    )}
                  </div>
                )}


                {/* Professional Section */}
                {profile.role !== 'student' && profile.role !== 'parent' && (
                  <div className="md:col-span-2 pt-8 border-t border-neutral-100 space-y-6">
                    <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Professional Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Department</label>
                        <input 
                          type="text"
                          disabled={!canEditField('department')}
                          value={formData.department}
                          onChange={(e) => setFormData({...formData, department: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Qualification</label>
                        <input 
                          type="text"
                          disabled={!canEditField('qualification')}
                          value={formData.qualification}
                          onChange={(e) => setFormData({...formData, qualification: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Experience</label>
                        <input 
                          type="text"
                          disabled={!canEditField('experience')}
                          value={formData.experience}
                          onChange={(e) => setFormData({...formData, experience: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Designation</label>
                        <input 
                          type="text"
                          disabled={!canEditField('designation')}
                          value={formData.designation}
                          onChange={(e) => setFormData({...formData, designation: e.target.value})}
                          placeholder="e.g. Senior Lecturer"
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Date of Joining</label>
                        <input 
                          type="date"
                          disabled={!canEditField('dateOfJoining')}
                          value={formData.dateOfJoining?.split('T')[0] || ''}
                          onChange={(e) => setFormData({...formData, dateOfJoining: e.target.value})}
                          className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Transportation Details Section (Available for everyone) */}
                <div className="md:col-span-2 pt-8 border-t border-neutral-100 space-y-6">
                  <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Transportation & Route Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Transport Usage Status</label>
                      <select 
                        disabled={!canEditField('transportStatus')}
                        value={formData.transportStatus}
                        onChange={(e) => setFormData({...formData, transportStatus: e.target.value as 'active' | 'inactive'})}
                        className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                      >
                        <option value="inactive">Not Using School Bus Route</option>
                        <option value="active">Active Bus Commuter</option>
                      </select>
                    </div>

                    {formData.transportStatus === 'active' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Transport Type</label>
                          <select 
                            disabled={!canEditField('transportType')}
                            value={formData.transportType}
                            onChange={(e) => setFormData({...formData, transportType: e.target.value as 'school' | 'private'})}
                            className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                          >
                            <option value="school">School Provided Vehicle</option>
                            <option value="private">Private Arrangement</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Assigned School Bus</label>
                          <select 
                            disabled={!canEditField('transportBusId')}
                            value={formData.transportBusId}
                            onChange={(e) => setFormData({...formData, transportBusId: e.target.value})}
                            className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                          >
                            <option value="">No Bus Assigned</option>
                            {buses.map(b => (
                              <option key={b.id} value={b.id}>
                                Bus {b.busNumber} ({b.driverName || 'No Driver'})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Assigned Bus Stop</label>
                          <select 
                            disabled={!canEditField('transportStopId')}
                            value={formData.transportStopId}
                            onChange={(e) => setFormData({...formData, transportStopId: e.target.value})}
                            className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60 appearance-none"
                          >
                            <option value="">No Stop Assigned</option>
                            {stops.filter(s => !formData.transportBusId || s.busId === formData.transportBusId).map(s => (
                              <option key={s.id} value={s.id}>
                                {s.villageName || s.name} - ₹{s.fee || 0}/mo
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest font-mono">Custom Route/Notes</label>
                          <input 
                            type="text"
                            disabled={!canEditField('busRoute')}
                            value={formData.busRoute}
                            onChange={(e) => setFormData({...formData, busRoute: e.target.value})}
                            placeholder="Describe any custom directions or route specifications"
                            className="w-full bg-neutral-50 px-5 py-4 rounded-2xl border-2 border-transparent focus:border-primary focus:bg-white outline-none transition-all font-bold text-sidebar disabled:opacity-60"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Additional Info / Security Settings (Non-editable placeholders) */}
            <div className="bg-white rounded-3xl p-10 shadow-sm border border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-neutral-50 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-neutral-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-sidebar tracking-tight">System Access Role</p>
                  <p className="text-xs text-neutral-400">Your role determines your permissions within the portal</p>
                </div>
              </div>
              <div className="px-6 py-3 bg-neutral-50 text-neutral-600 rounded-xl font-bold text-xs uppercase tracking-widest shadow-sm border border-neutral-100 flex items-center gap-2">
                <BadgeCheck className="w-3.5 h-3.5 text-primary" />
                Access: {profile.role?.replace('_', ' ')}
              </div>
            </div>

            {/* System Metadata Inspector */}
            <div className="bg-white rounded-3xl p-10 shadow-sm border border-neutral-100 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Database className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-sidebar tracking-tight">Active Account Credentials & Document Metadata</p>
                  <p className="text-xs text-neutral-400">View real-time database attributes and connection properties</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-100">
                <div className="p-4 bg-neutral-50 rounded-2xl flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Database Identifier (UID)</span>
                  <span className="font-mono text-xs text-sidebar font-bold select-all truncate break-all">{profileId}</span>
                </div>
                <div className="p-4 bg-neutral-50 rounded-2xl flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Email Address</span>
                  <span className="font-mono text-xs text-sidebar font-bold select-all truncate break-all">{profile.email || 'N/A'}</span>
                </div>
                {profile.siblingKey && (
                  <div className="p-4 bg-neutral-50 rounded-2xl flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Active Sibling Family Key</span>
                    <span className="font-mono text-xs text-sidebar font-bold select-all truncate break-all">{profile.siblingKey}</span>
                  </div>
                )}
                {profile.concession && (
                  <div className="p-4 bg-neutral-50 rounded-2xl flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Assigned Fee Concession Detail</span>
                    <span className="font-mono text-xs text-sidebar font-bold select-all truncate break-all">{profile.concession}</span>
                  </div>
                )}
                {profile.createdAt && (
                  <div className="p-4 bg-neutral-50 rounded-2xl flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Profile Origination Date</span>
                    <span className="font-mono text-xs text-sidebar font-bold select-all truncate break-all">{new Date(profile.createdAt).toLocaleString()}</span>
                  </div>
                )}
                {(profile as any).updatedAt && (
                  <div className="p-4 bg-neutral-50 rounded-2xl flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Latest Database Synchronization</span>
                    <span className="font-mono text-xs text-sidebar font-bold select-all truncate break-all">{new Date((profile as any).updatedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showCameraModal && (
        <CameraModal 
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCapture={async (file) => {
            try {
              toast.loading("Uploading captured photo...", { id: 'profile-photo' });
              const url = await uploadService.uploadFile(file);
              setFormData(prev => ({ ...prev, photoURL: url, photoManuallyUploaded: true }));
              toast.success("Photo captured and uploaded! Save to apply.", { id: 'profile-photo' });
            } catch (error: any) {
              toast.error(error.message || "Capture upload failed", { id: 'profile-photo' });
            }
          }}
          title="Capture Profile Photo"
        />
      )}

      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-sidebar">Correct Account Role</h3>
                <p className="text-xs text-neutral-400 font-bold">Select the correct role for this user account</p>
              </div>
              <button onClick={() => setShowRoleModal(false)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <div className="space-y-3">
              {[
                { id: 'teacher', label: 'Teacher / Staff Member', desc: 'Grants access to Academics, Attendance, Marks & Teacher Portal' },
                { id: 'admin', label: 'Administrator', desc: 'Full administrative access to manage school, fees & staff' },
                { id: 'vice_principal', label: 'Vice Principal / Leadership', desc: 'Leadership access to school operations' },
                { id: 'student', label: 'Student', desc: 'Student portal access for fees, timetable & homework' },
              ].map(r => (
                <button
                  key={r.id}
                  onClick={() => handleSwitchRole(r.id)}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-2xl border-2 border-neutral-100 hover:border-primary hover:bg-primary/5 transition-all group flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sidebar group-hover:text-primary">{r.label}</span>
                    {normalizeRole(profile.role) === r.id && <span className="text-[10px] bg-primary text-white font-bold px-2 py-0.5 rounded-full">Current</span>}
                  </div>
                  <span className="text-xs text-neutral-400">{r.desc}</span>
                </button>
              ))}
            </div>

            <button onClick={() => setShowRoleModal(false)} className="w-full bg-neutral-100 text-neutral-600 py-3 rounded-2xl font-bold hover:bg-neutral-200 text-xs uppercase">
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
