import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Heart, FileText, ClipboardList, ShieldAlert, Users, Building, BarChart2, CreditCard } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'sonner';

// Import our beautifully isolated modular components
import DashboardOverview from '../components/DashboardOverview';
import BillingHub from '../components/BillingHub';
import AdminApprovals from '../components/AdminApprovals';
import StudentAccounts from '../components/StudentAccounts';
import HospitalMaster from '../components/HospitalMaster';
import HealthReports from '../components/HealthReports';
import PurchaseHealthCard from '../components/PurchaseHealthCard';

export default function StudentHealthPage() {
  const { profile } = usePermissions();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('OVERVIEW');

  // Derive parameters safely
  const userId = profile?.uid || user?.uid || '';
  const role = (profile?.role || '').toUpperCase();
  const schoolId = (profile as any)?.schoolId || 'ST_ANTONYS_PRIMARY';
  const hospitalId = (profile as any)?.hospitalId || '';

  // Access definitions based on school staff criteria
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'PRINCIPAL' || role === 'VICE_PRINCIPAL';
  const isHospital = role === 'HOSPITAL' || role === 'HOSPITAL_USER' || role === 'DOCTOR';
  const isWarden = role === 'WARDEN' || role === 'HOSTEL_WARDEN';
  const isFinStaff = role === 'ACCOUNTANT' || role === 'CLERK';

  // Define tabs dynamically
  const tabConfig = [
    { id: 'OVERVIEW', label: 'Overview', icon: Heart, show: true },
    { id: 'PURCHASE', label: 'Purchase Card', icon: CreditCard, show: isAdmin || isWarden || isFinStaff },
    { id: 'BILLING', label: 'Billing Hub', icon: FileText, show: isAdmin || isHospital },
    { id: 'APPROVALS', label: 'Admin Approvals', icon: ShieldAlert, show: isAdmin },
    { id: 'ACCOUNTS', label: 'Student Ledger', icon: Users, show: isAdmin || isWarden || isFinStaff },
    { id: 'HOSPITALS', label: 'Hospitals Registry', icon: Building, show: isAdmin },
    { id: 'REPORTS', label: 'Reports Analysis', icon: BarChart2, show: isAdmin || isFinStaff || isHospital }
  ];

  const visibleTabs = tabConfig.filter(t => t.show);

  // Auto redirect active tab if user role restricts them from seeing the default overview or standard tabs
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [role, activeTab]);

  return (
    <div className="container mx-auto max-w-[1400px] px-6 py-12 space-y-8" id="student-health-card-root-page">
      {/* Sleek, professional header action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-50 border border-zinc-150 rounded-3xl p-6 shadow-sm" id="student-health-card-compact-header">
        <div>
          <h2 className="text-xl font-black text-zinc-800 tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full inline-block animate-pulse" />
            Student Health Cards & Hospital Billing
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-1">
            Track student benefit ledgers, process medical claims, and generate partner clinical exports seamlessly.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-zinc-150 px-4 py-2.5 rounded-2xl" id="user-role-card-badge">
          <div className="text-right">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Operator Status</span>
            <span className="text-xs font-black block text-zinc-700">{profile?.name || "School Operator"}</span>
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-lg">
            {role.replace(/_/g, ' ') || 'GUEST'}
          </span>
        </div>
      </div>

      {/* Navigation tab links using smooth layouts */}
      <div className="flex border-b border-zinc-150 overflow-x-auto gap-2 scrollbar-thin bg-zinc-50/50 p-1.5 rounded-2xl" id="student-health-tabs-vibrant-container">
        {visibleTabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-xs font-black uppercase tracking-widest transition-all relative shrink-0 flex items-center gap-2.5 rounded-xl ${
                isSelected 
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-200' 
                  : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 font-extrabold'
              }`}
              id={`tab-navigation-link-${tab.id.toLowerCase()}`}
            >
              <tab.icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-800'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render selected active component tab */}
      <div className="mt-8">
        {activeTab === 'OVERVIEW' && (
          <DashboardOverview 
            userId={userId} 
            role={role} 
            schoolId={schoolId} 
            hospitalId={hospitalId} 
          />
        )}
        {activeTab === 'PURCHASE' && (
          <PurchaseHealthCard
            userId={userId}
            role={role}
            schoolId={schoolId}
          />
        )}
        {activeTab === 'BILLING' && (
          <BillingHub 
            userId={userId} 
            role={role} 
            schoolId={schoolId} 
            hospitalId={hospitalId} 
          />
        )}
        {activeTab === 'APPROVALS' && (
          <AdminApprovals 
            userId={userId} 
            role={role} 
            schoolId={schoolId} 
          />
        )}
        {activeTab === 'ACCOUNTS' && (
          <StudentAccounts 
            userId={userId} 
            role={role} 
            schoolId={schoolId} 
          />
        )}
        {activeTab === 'HOSPITALS' && (
          <HospitalMaster 
            userId={userId} 
            role={role} 
            schoolId={schoolId} 
          />
        )}
        {activeTab === 'REPORTS' && (
          <HealthReports 
            userId={userId} 
            role={role} 
            schoolId={schoolId} 
            hospitalId={hospitalId}
          />
        )}
      </div>
    </div>
  );
}
