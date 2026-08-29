import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Calendar, Filter, Grid, PieChart, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

interface HealthReportsProps {
  userId: string;
  role: string;
  schoolId: string;
  hospitalId?: string;
}

export default function HealthReports({ userId, role, schoolId, hospitalId }: HealthReportsProps) {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<any[]>([]);

  // Filters state
  const [studentType, setStudentType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchHospitals = async () => {
    try {
      const res = await fetch(`/api/student-health/hospitals?schoolId=${schoolId}`);
      if (res.ok) {
        const data = await res.json();
        setHospitals(data.hospitals || []);
      }
    } catch (err) {
      console.error("Failed to fetch hospitals list inside Reports context", err);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/student-health/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-role': role,
          'x-school-id': schoolId,
          'x-hospital-id': hospitalId || ''
        },
        body: JSON.stringify({
          studentType: studentType || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined
        })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReportData(data.report);
    } catch (err) {
      toast.error("Failed to generate analytical charts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
    fetchReports();
  }, [userId, role, schoolId, hospitalId, studentType, startDate, endDate]);

  const COLORS = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#6366f1'];

  // Map backend return arrays safely
  const billsList = reportData?.approvedBills || [];
  const hospitalShare = reportData?.hospitalDistribution || [];

  // Generate unique clinical partners represented in billsList (always filter empty values)
  const clinicalPartners = Array.from(new Set(billsList.map((b: any) => b.hospitalName).filter(Boolean))) as string[];

  // Dynamically group monthly trend metrics on the frontend
  const monthlyTrendMap: Record<string, number> = {};
  billsList.forEach((b: any) => {
    if (!b.billDate) return;
    const d = new Date(b.billDate);
    const monthStr = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    monthlyTrendMap[monthStr] = (monthlyTrendMap[monthStr] || 0) + (b.totalAmount || 0);
  });
  const monthlyTrend = Object.entries(monthlyTrendMap).map(([month, amount]) => ({ month, amount }));

  // Dynamic CSV generation
  const handleExportCsv = (hospitalFilter: 'both' | string) => {
    const listToExport = hospitalFilter === 'both'
      ? billsList
      : billsList.filter((b: any) => (b.hospitalName || '').toLowerCase() === hospitalFilter.toLowerCase());

    if (listToExport.length === 0) {
      toast.warning(`No approved medical bills found for ${hospitalFilter === 'both' ? 'any' : hospitalFilter} clinical partner.`);
      return;
    }

    const headers = [
      "Invoice Date",
      "Invoice Number",
      "Student Name",
      "Admission Number",
      "Residence Status",
      "Class",
      "Batch",
      "Attending Doctor",
      "Treatment Description",
      "Hospital Name",
      "Total Amount (INR)",
      "Health Card Deducted (INR)",
      "Extra Payable Amount (INR)"
    ];

    const csvRows = [
      headers.join(','),
      ...listToExport.map((b: any) => {
        const row = [
          new Date(b.billDate).toLocaleDateString(),
          `"${(b.billNumber || '').replace(/"/g, '""')}"`,
          `"${(b.studentName || '').replace(/"/g, '""')}"`,
          `"${(b.admissionNumber || '').replace(/"/g, '""')}"`,
          b.studentType || 'N/A',
          `"${(b.className || '').replace(/"/g, '""')}"`,
          `"${(b.batchName || '').replace(/"/g, '""')}"`,
          `"${(b.doctorName || '').replace(/"/g, '""')}"`,
          `"${(b.treatmentDescription || '').replace(/"/g, '""')}"`,
          `"${(b.hospitalName || '').replace(/"/g, '""')}"`,
          b.totalAmount || 0,
          b.deductedFromHealthCard || 0,
          b.extraPayableAmount || 0
        ];
        return row.join(',');
      })
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileName = `hospital_bills_${hospitalFilter.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Successfully exported bills for ${hospitalFilter === 'both' ? 'both hospitals' : hospitalFilter}!`);
  };

  return (
    <div className="space-y-6" id="health-reports-block">
      {/* Filtering Ribbon */}
      <div className="bg-white border border-zinc-100 rounded-[2rem] p-6 shadow-sm flex flex-wrap gap-5 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 px-3 py-2 rounded-xl">
            <Filter className="w-4 h-4 text-zinc-400" />
            <select
              value={studentType}
              onChange={(e) => setStudentType(e.target.value)}
              className="text-xs bg-transparent focus:outline-none text-zinc-700 font-bold uppercase tracking-wider"
            >
              <option value="">All Resident Statuses</option>
              <option value="HOSTELER">🏰 Hosteler</option>
              <option value="DAY_SCHOLAR">🏠 Day Scholar</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 px-3.5 py-2 rounded-xl">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-none text-zinc-700 font-semibold"
            />
            <span className="text-zinc-300 text-xs">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs bg-transparent focus:outline-none text-zinc-700 font-semibold"
            />
          </div>
        </div>

        <button
          onClick={fetchReports}
          className="px-6 py-2.5 bg-zinc-850 hover:bg-zinc-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
        >
          Recalc analytical views
        </button>
      </div>

      {/* Admin Export Center */}
      <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 rounded-2xl text-rose-500">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest">Medical Billing Export Center</h3>
            <p className="text-zinc-400 text-xs mt-0.5">Generate compliant clinical ledger CSV downloads for accounting audits.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Export Both Option */}
          {role !== 'DOCTOR' && (
            <button
              type="button"
              onClick={() => handleExportCsv('both')}
              disabled={loading || billsList.length === 0}
              className="flex flex-col items-start p-5 rounded-3xl border border-zinc-100 hover:border-zinc-350 bg-zinc-50/50 hover:bg-zinc-50 text-left transition-all group disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Consolidated</span>
                <Download className="w-4 h-4 text-zinc-400 group-hover:text-rose-500 transition-colors" />
              </div>
              <h4 className="font-extrabold text-sm text-zinc-800 mt-2">Export Both Hospitals</h4>
              <p className="text-[11px] text-zinc-400 mt-1">Export audited statements across all partner clinic networks simultaneously.</p>
            </button>
          )}

          {/* Dynamic option for each registered hospital in the registry */}
          {hospitals
            .filter((h) => role !== 'DOCTOR' || h.id === hospitalId)
            .map((h) => {
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => handleExportCsv(h.hospitalName)}
                  disabled={loading || billsList.length === 0}
                  className="flex flex-col items-start p-5 rounded-3xl border border-zinc-100 hover:border-zinc-350 bg-zinc-50/50 hover:bg-zinc-50 text-left transition-all group disabled:opacity-50"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-450 font-bold">Clinical Unit</span>
                    <Download className="w-4 h-4 text-zinc-400 group-hover:text-rose-500 transition-colors" />
                  </div>
                  <h4 className="font-extrabold text-sm text-zinc-800 mt-2 truncate max-w-full">{h.hospitalName}</h4>
                  <p className="text-[11px] text-zinc-400 mt-1">Export separate bills strictly recorded under {h.hospitalName}.</p>
                </button>
              );
            })}

          {/* Graceful fallback to dynamically identified clinical partners if registry list is empty */}
          {hospitals.length === 0 && clinicalPartners.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => handleExportCsv(name)}
              disabled={loading || billsList.length === 0}
              className="flex flex-col items-start p-5 rounded-3xl border border-zinc-100 hover:border-zinc-350 bg-zinc-50/50 hover:bg-zinc-50 text-left transition-all group disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Clinical Unit</span>
                <Download className="w-4 h-4 text-zinc-400 group-hover:text-rose-500 transition-colors" />
              </div>
              <h4 className="font-extrabold text-sm text-zinc-800 mt-2 truncate max-w-full">{name}</h4>
              <p className="text-[11px] text-zinc-400 mt-1">Export hospital-level audited bills for {name} partner.</p>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm mt-4 font-medium">Re-computing school analytics models...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Pie Chart: hospital share */}
          <div className="lg:col-span-12 xl:col-span-5 bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <PieChart className="w-5 h-5 text-rose-500" />
              Volume share by clinical hospital
            </h3>
            {hospitalShare.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 text-sm font-bold">Not enough data to populate charts.</div>
            ) : (
              <div className="h-64 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={hospitalShare}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {hospitalShare.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Bar Chart: Monthly spending breakdown */}
          <div className="lg:col-span-12 xl:col-span-7 bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-rose-500" />
              Monthly Treatment Spending Aggregation (₹)
            </h3>
            {monthlyTrend.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 text-sm font-bold">Not enough historical trend records.</div>
            ) : (
              <div className="h-64 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrend}>
                    <XAxis dataKey="month" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                    <Tooltip formatter={(value) => [`₹${value}`, "Expenditure"]} />
                    <Bar dataKey="amount" fill="#f43f5e" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Table list on bottom */}
          <div className="lg:col-span-12 bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm">
            <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Grid className="w-5 h-5 text-rose-500" />
              Categorical reports output
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Invoice date</th>
                    <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Student Profile</th>
                    <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Residence Status</th>
                    <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400">Treatment Details</th>
                    <th className="pb-4 font-black text-xs uppercase tracking-widest text-zinc-400 text-right">Debit Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {billsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-440 font-bold">No accounts matches found for filters.</td>
                    </tr>
                  ) : (
                    billsList.map((b: any) => (
                      <tr key={b.id || b.billNumber} className="hover:bg-zinc-50/50">
                        <td className="py-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">{new Date(b.billDate).toLocaleDateString()}</td>
                        <td className="py-4 font-extrabold text-zinc-805">{b.studentName}</td>
                        <td className="py-4">
                          <span className={`inline-block text-[9px] px-2 rounded-full font-black uppercase tracking-wider ${b.studentType === 'HOSTELER' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                            {b.studentType}
                          </span>
                        </td>
                        <td className="py-4 font-medium text-xs text-zinc-650">{b.treatmentDescription} @ <span className="font-semibold text-zinc-400">{b.hospitalName}</span></td>
                        <td className="py-4 font-black text-zinc-800 text-right">₹{b.totalAmount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
