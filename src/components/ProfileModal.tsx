import React, { useState } from 'react';
import { X, User, Mail, Shield, Camera, Save, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { normalizeUrl } from '../lib/utils';
import { dbService } from '../services/dbService';
import { toast } from 'sonner';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { profile } = useAuth();
  const isStudent = profile?.role === 'student' || profile?.role?.toLowerCase() === 'student';
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: profile?.name || '',
    photoURL: profile?.photoURL || '',
  });

  if (!isOpen || !profile) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await dbService.update('users', profile.uid, {
        name: formData.name,
        photoURL: formData.photoURL,
        photoManuallyUploaded: true,
      });
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Update profile error:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <h3 className="text-xl font-bold text-sidebar flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            User Profile
          </h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-neutral-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        <div className="p-8">
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
                {normalizeUrl(formData.photoURL) ? (
                  <img 
                    src={normalizeUrl(formData.photoURL)} 
                    alt={profile.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-12 h-12 text-primary" />
                )}
              </div>
              {isEditing && (
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
            <div className="mt-4 text-center">
              <h4 className="text-lg font-bold text-sidebar">{profile.name}</h4>
              <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full">
                {profile.role}
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3" /> Full Name
              </label>
              <input
                type="text"
                disabled={!isEditing}
                className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none disabled:bg-neutral-50 disabled:text-neutral-500 transition-all"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email Address
              </label>
              <input
                type="email"
                disabled
                className="w-full px-4 py-3 rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-400 outline-none cursor-not-allowed"
                value={profile.email}
              />
            </div>

            {isEditing && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Photo URL
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-100 focus:border-primary outline-none transition-all"
                  placeholder="https://example.com/photo.jpg"
                  value={formData.photoURL}
                  onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
                />
              </div>
            )}

            {!isStudent && (
              <div className="pt-6 flex gap-3">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="flex-1 bg-sidebar text-white py-3 rounded-xl font-bold hover:bg-primary transition-all shadow-lg shadow-sidebar/10"
                  >
                    Edit Information
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setFormData({ name: profile.name, photoURL: profile.photoURL || '' });
                      }}
                      className="flex-1 bg-neutral-100 text-neutral-600 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Changes
                    </button>
                  </>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
