import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Clock, 
  UserCheck, 
  AlertCircle, 
  History, 
  Search,
  CheckCircle,
  XCircle,
  Play,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { limit, orderBy, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getStaffDisplayName } from '../lib/utils';

interface StaffAutoAttendanceConfigProps {
  selectedDate: Date;
  onRefresh?: () => void;
}

export default function StaffAutoAttendanceConfig({ selectedDate, onRefresh }: StaffAutoAttendanceConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  
  // Settings state
  const [enabled, setEnabled] = useState(false);
  const [runTime, setRunTime] = useState('08:00');
  const [exemptedStaffIds, setExemptedStaffIds] = useState<string[]>([]);
  
  // Staff list & history logs
  const [staffList, setStaffList] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Expanded log state
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, any[]>>({});
  const [loadingExpanded, setLoadingExpanded] = useState<Record<string, boolean>>({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  const fetchConfigAndData = async () => {
    setLoading(true);
    try {
      // 1. Fetch settings
      const settings = await dbService.get('settings', 'staff_auto_attendance').catch(() => null);
      if (settings) {
        setEnabled(settings.enabled || false);
        setRunTime(settings.runTime || '08:00');
        setExemptedStaffIds(settings.exemptedStaffIds || []);
      }

      // 2. Fetch staff
      const staff = await dbService.list('staff');
      const activeStaff = (staff || []).filter((s: any) => s.status !== 'inactive');
      setStaffList(activeStaff);

      // 3. Fetch logs of previous runs
      const runLogs = await dbService.list('staff_auto_attendance_runs', [
        orderBy('runAt', 'desc'),
        limit(100)
      ]).catch(() => []);
      setLogs(runLogs);

    } catch (error) {
      console.error('[AutoStaffAttendance] Error loading settings:', error);
      toast.error('Failed to load auto-attendance settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigAndData();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await dbService.set('settings', 'staff_auto_attendance', {
        enabled,
        runTime,
        exemptedStaffIds,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Auto-attendance settings updated successfully!');
      fetchConfigAndData();
    } catch (error) {
      console.error('[AutoStaffAttendance] Save Error:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleExemption = (staffId: string) => {
    setExemptedStaffIds(prev => 
      prev.includes(staffId) 
        ? prev.filter(id => id !== staffId) 
        : [...prev, staffId]
    );
  };

  const handleSelectAllEnroll = () => {
    if (exemptedStaffIds.length === 0) {
      setExemptedStaffIds(staffList.map(s => s.uid || s.id));
    } else {
      setExemptedStaffIds([]);
    }
  };

  const triggerManualMark = async () => {
    const confirmRun = window.confirm(
      `Are you sure you want to trigger Auto-Mark Present now for ${format(selectedDate, 'MMM dd, yyyy')}?\n` +
      `This will mark all non-exempted, active staff members who do not yet have an attendance record for today and are not on leave as PRESENT.`
    );
    if (!confirmRun) return;

    setRunning(true);
    toast.loading('Running daily staff auto-attendance...', { id: 'manual-run' });

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Fetch approved leaves for selected date
      const approvedLeaves = await dbService.list('leaves', [
        where('status', '==', 'approved')
      ]).catch(() => []);

      const activeLeaveUserIds = new Set<string>();
      (approvedLeaves || []).forEach((l: any) => {
        if (dateStr >= l.startDate && dateStr <= l.endDate) {
          activeLeaveUserIds.add(l.applicantId);
        }
      });

      // Fetch existing staff attendance for selected date
      const existingAttendance = await dbService.list('staff_attendance', [
        where('date', '==', dateStr)
      ]).catch(() => []);

      const existingUserIds = new Set<string>();
      (existingAttendance || []).forEach((a: any) => {
        if (a.userId) {
          existingUserIds.add(a.userId);
        }
      });

      const exemptedIdsSet = new Set<string>(exemptedStaffIds);

      // Determine who to mark present
      const toMark = staffList.filter(s => {
        const id = s.uid || s.id;
        return !exemptedIdsSet.has(id) && !activeLeaveUserIds.has(id) && !existingUserIds.has(id);
      });

      if (toMark.length === 0) {
        toast.success('No eligible staff members needed attendance marking for today.', { id: 'manual-run' });
        setRunning(false);
        return;
      }

      // Perform batch update
      const batchItems = toMark.map(s => {
        const studentId = s.uid || s.id;
        const customId = `${dateStr}_unknown_class_${studentId}`;
        const payload = {
          userId: studentId,
          date: dateStr,
          status: 'present',
          timestamp: new Date().toISOString(),
          autoMarked: true
        };
        return { id: customId, data: payload };
      });

      await dbService.setBatch('staff_attendance', batchItems);

      // Log the run
      const logId = `${dateStr}_manual_${Date.now()}`;
      const markedStaffList = toMark.map(s => ({
        userId: s.uid || s.id,
        name: getStaffDisplayName(s),
        role: s.role || 'Staff Member',
        phone: s.phone || '',
        timestamp: new Date().toISOString()
      }));

      await dbService.set('staff_auto_attendance_runs', logId, {
        id: logId,
        runAt: new Date().toISOString(),
        markedCount: toMark.length,
        staffCount: staffList.length,
        isManual: true,
        success: true,
        markedStaff: markedStaffList
      });

      toast.success(`Successfully marked ${toMark.length} staff members as present for ${format(selectedDate, 'MMM dd, yyyy')}!`, { id: 'manual-run' });
      fetchConfigAndData();
      if (onRefresh) onRefresh();

    } catch (error) {
      console.error('[AutoStaffAttendance] Manual Run Error:', error);
      toast.error('Failed to complete manual auto-attendance run', { id: 'manual-run' });
    } finally {
      setRunning(false);
    }
  };

  const toggleExpandLog = async (log: any) => {
    const isExpanded = expandedLogId === log.id;
    if (isExpanded) {
      setExpandedLogId(null);
      return;
    }

    setExpandedLogId(log.id);

    if (expandedLogs[log.id]) {
      return;
    }

    setLoadingExpanded(prev => ({ ...prev, [log.id]: true }));
    try {
      const dateStr = log.runAt ? log.runAt.substring(0, 10) : log.id.substring(0, 10);
      const attendance = await dbService.list('staff_attendance', [
        where('date', '==', dateStr),
        where('status', '==', 'present')
      ]).catch(() => []);

      // Only show staff members who are auto-marked present on this date
      const markedDetails = (attendance || [])
        .filter((att: any) => att.autoMarked === true)
        .map((att: any) => {
          const staff = staffList.find(s => (s.uid || s.id) === att.userId);
          return {
            userId: att.userId,
            name: staff ? getStaffDisplayName(staff) : 'Unknown Staff',
            role: staff ? (staff.role || 'Staff Member') : 'Staff Member',
            phone: staff ? (staff.phone || '') : '',
            timestamp: att.timestamp || log.runAt
          };
        });

      markedDetails.sort((a, b) => a.name.localeCompare(b.name));
      setExpandedLogs(prev => ({ ...prev, [log.id]: markedDetails }));
    } catch (error) {
      console.error('[AutoStaffAttendance] Error loading log details:', error);
      toast.error('Failed to load marked staff details');
    } finally {
      setLoadingExpanded(prev => ({ ...prev, [log.id]: false }));
    }
  };

  // Helper methods to get start and end of week (Monday start)
  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(date.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const getEndOfWeek = (d: Date) => {
    const start = getStartOfWeek(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const filteredStaff = staffList.filter(s => {
    const fullName = `${getStaffDisplayName(s)} ${s.name || ''} ${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) || (s.phone && s.phone.includes(searchTerm));
  });

  const now = new Date();
  const startOfCurrentWeek = getStartOfWeek(now);
  const endOfCurrentWeek = getEndOfWeek(now);

  const currentWeekLogs = logs.filter(log => {
    if (!log.runAt) return false;
    const logDate = new Date(log.runAt);
    return logDate >= startOfCurrentWeek && logDate <= endOfCurrentWeek;
  });

  const olderLogs = logs.filter(log => {
    if (!log.runAt) return true;
    const logDate = new Date(log.runAt);
    return logDate < startOfCurrentWeek;
  });

  const itemsPerPage = 5;
  const totalPages = 1 + (olderLogs.length > 0 ? Math.ceil(olderLogs.length / itemsPerPage) : 0);

  const displayedLogs = currentPage === 1 
    ? currentWeekLogs 
    : olderLogs.slice((currentPage - 2) * itemsPerPage, (currentPage - 2) * itemsPerPage + itemsPerPage);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 bg-white rounded-3xl border border-neutral-100 shadow-sm">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-neutral-500 font-bold mt-4">Loading Auto-Attendance System...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="p-6 bg-green-50 border border-green-200 rounded-3xl flex items-start gap-4 shadow-sm">
        <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-700 shadow-sm shrink-0">
          <UserCheck className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h3 className="font-bold text-green-900 text-lg">Daily Staff Auto-Attendance</h3>
          <p className="text-sm text-green-700 font-medium mt-1 leading-relaxed">
            Configure the system to automatically mark all eligible active staff members as <strong>Present</strong> daily. 
            Staff members currently on approved leaves or marked as exempted will not be auto-marked.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Settings & Configuration Card */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="font-bold text-[14px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" /> Settings Configuration
            </h3>

            {/* Toggle Daily Run */}
            <div className="space-y-2">
              <label className="text-sm font-black text-neutral-700 block">Status</label>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enabled ? 'bg-primary' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="ml-3 text-sm font-bold text-neutral-600 align-middle">
                {enabled ? 'Daily auto-run enabled' : 'Disabled'}
              </span>
            </div>

            {/* Daily Run Time */}
            <div className="space-y-2">
              <label className="text-sm font-black text-neutral-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-neutral-400" /> Run Time (IST)
              </label>
              <select
                value={runTime}
                onChange={(e) => setRunTime(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary focus:bg-white transition-all"
              >
                <option value="06:00">06:00 AM</option>
                <option value="06:30">06:30 AM</option>
                <option value="07:00">07:00 AM</option>
                <option value="07:30">07:30 AM</option>
                <option value="08:00">08:00 AM</option>
                <option value="08:30">08:30 AM</option>
                <option value="09:00">09:00 AM</option>
                <option value="09:30">09:30 AM</option>
                <option value="10:00">10:00 AM</option>
              </select>
              <p className="text-xs text-neutral-400 font-medium leading-relaxed">
                The automatic scheduler runs daily at this hour (Kolkata Standard Time) to mark staff present.
              </p>
            </div>

            {/* Quick Stats */}
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 text-xs font-bold text-neutral-600">
              <div className="flex justify-between">
                <span>Active Staff:</span>
                <span className="text-neutral-800">{staffList.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Auto-Marking Enrolled:</span>
                <span className="text-green-600">{staffList.length - exemptedStaffIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Exempted from Auto:</span>
                <span className="text-amber-600">{exemptedStaffIds.length}</span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-neutral-100 mt-6 space-y-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full py-3 bg-primary hover:bg-primary/95 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-55"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Configuration
            </button>

            <button
              onClick={triggerManualMark}
              disabled={running}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-55"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
              Run Auto-Mark for Today
            </button>
          </div>
        </div>

        {/* Exemption Management Card */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm lg:col-span-2 space-y-6 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-[14px] uppercase tracking-wider text-neutral-500">Exemption & Attendance Policy</h3>
              <p className="text-xs text-neutral-400 font-medium">Select staff members to ENROLL them in automatic daily present markings. Unchecked members will be exempted.</p>
            </div>
            
            <button
              onClick={handleSelectAllEnroll}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl text-xs transition-all w-fit"
            >
              {exemptedStaffIds.length === 0 ? 'Deselect All' : 'Select All for Auto Present'}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search staff members by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none text-sm focus:border-primary focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Staff Table */}
          <div className="border border-neutral-100 rounded-xl overflow-hidden flex-1 max-h-[350px] overflow-y-auto">
            <table className="w-full text-left text-sm text-neutral-500">
              <thead className="bg-neutral-50 text-neutral-700 uppercase font-mono text-[10px] tracking-wider border-b border-neutral-100">
                <tr>
                  <th className="px-6 py-3 font-black text-center w-28">Auto Present</th>
                  <th className="px-6 py-3 font-black">Staff Member</th>
                  <th className="px-6 py-3 font-black">Role / Designation</th>
                  <th className="px-6 py-3 font-black">Auto-Mark Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center font-bold text-neutral-400">
                      No matching staff members found.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((staff) => {
                    const id = staff.uid || staff.id;
                    const isExempt = exemptedStaffIds.includes(id);
                    const isEnrolled = !isExempt;
                    return (
                      <tr key={id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-6 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={isEnrolled}
                            onChange={() => handleToggleExemption(id)}
                            className="w-4 h-4 rounded text-primary focus:ring-primary border-neutral-300"
                          />
                        </td>
                        <td className="px-6 py-4 font-bold text-neutral-800">
                          <div>
                            <p className="text-sm">{getStaffDisplayName(staff)}</p>
                            <p className="text-[11px] font-medium text-neutral-400 font-mono mt-0.5">{staff.phone || 'No phone'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-neutral-600 capitalize">
                          {staff.role || 'Staff Member'}
                        </td>
                        <td className="px-6 py-4">
                          {isExempt ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertCircle className="w-3.5 h-3.5" /> Manual Only
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                              <CheckCircle className="w-3.5 h-3.5" /> Auto Present
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Execution Logs Section */}
      <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
        <h3 className="font-bold text-[14px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
          <History className="w-4 h-4 text-neutral-400" /> Recent Execution Logs
        </h3>

        <div className="border border-neutral-100 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-neutral-500">
            <thead className="bg-neutral-50 text-neutral-700 uppercase font-mono text-[10px] tracking-wider border-b border-neutral-100">
              <tr>
                <th className="px-6 py-3 font-black">Run Timestamp (IST)</th>
                <th className="px-6 py-3 font-black">Marked Present</th>
                <th className="px-6 py-3 font-black">Total Active Staff</th>
                <th className="px-6 py-3 font-black">Trigger Mode</th>
                <th className="px-6 py-3 font-black">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center font-bold text-neutral-400">
                    No recent execution logs found. Daily runs will register here once completed.
                  </td>
                </tr>
              ) : currentPage === 1 && currentWeekLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center font-bold text-neutral-400">
                    No execution logs in the Present Week. Older logs are available on pages below.
                  </td>
                </tr>
              ) : (
                displayedLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-neutral-50/50 transition-colors">
                        <td 
                          onClick={() => toggleExpandLog(log)}
                          className="px-6 py-4 font-bold text-neutral-800 cursor-pointer hover:text-primary transition-colors"
                          title="Click to expand details"
                        >
                          <div className="flex items-center gap-1.5 select-none">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-primary shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                            )}
                            <span>{format(new Date(log.runAt), 'yyyy-MM-dd hh:mm a')}</span>
                          </div>
                        </td>
                        <td 
                          onClick={() => toggleExpandLog(log)}
                          className="px-6 py-4 font-mono font-bold text-green-600 cursor-pointer hover:text-primary transition-colors"
                          title="Click to expand details"
                        >
                          <span className="bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded-lg border border-green-200 transition-colors">
                            {log.markedCount} Staff
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-neutral-600">
                          {log.staffCount}
                        </td>
                        <td className="px-6 py-4">
                          {log.isManual ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600 uppercase">
                              Manual Trigger
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                              System Scheduler
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {log.success ? (
                            <span className="inline-flex items-center gap-1 text-green-600 font-bold text-xs">
                              <CheckCircle className="w-4 h-4" /> Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-bold text-xs">
                              <XCircle className="w-4 h-4" /> Failed
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Section */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/50">
                          <td colSpan={5} className="px-8 py-5">
                            <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4 shadow-sm">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                                <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                                  <UserCheck className="w-4 h-4 text-green-600" />
                                  Auto-Present Marked Staff Names
                                </h4>
                                <span className="text-xs font-semibold text-neutral-400">
                                  Run Timestamp: {format(new Date(log.runAt), 'yyyy-MM-dd hh:mm a')}
                                </span>
                              </div>

                              {loadingExpanded[log.id] ? (
                                <div className="flex items-center gap-2 py-4 text-neutral-400 text-sm font-medium">
                                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                  <span>Loading staff names...</span>
                                </div>
                              ) : !expandedLogs[log.id] || expandedLogs[log.id].length === 0 ? (
                                <p className="text-xs font-bold text-neutral-400 py-3">
                                  No staff members were marked present in this run. (All were either already marked, on approved leave, or exempted)
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {expandedLogs[log.id].map((staff: any) => (
                                    <div 
                                      key={staff.userId} 
                                      className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100 hover:border-neutral-200 transition-all"
                                    >
                                      <div>
                                        <p className="text-sm font-bold text-neutral-800">{staff.name}</p>
                                        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mt-0.5">{staff.role}</p>
                                      </div>
                                      <div className="text-right">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 font-mono">
                                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                          {staff.timestamp ? format(new Date(staff.timestamp), 'hh:mm a') : format(new Date(log.runAt), 'hh:mm a')}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-neutral-100 pt-4 mt-2">
            <p className="text-xs font-bold text-neutral-400">
              {currentPage === 1 ? (
                <span>Showing <strong>Present Week</strong> ({currentWeekLogs.length} logs)</span>
              ) : (
                <span>Showing Older Logs (Page {currentPage} of {totalPages})</span>
              )}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => {
                  setCurrentPage(1);
                  setExpandedLogId(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  currentPage === 1
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
                }`}
              >
                Present Week
              </button>
              {Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map((page) => (
                <button
                  key={page}
                  onClick={() => {
                    setCurrentPage(page);
                    setExpandedLogId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    currentPage === page
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-neutral-600 hover:bg-neutral-50 border-neutral-200'
                  }`}
                >
                  Page {page}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
