import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, Search, Plus, Filter, Download, FileText, Send, CheckCircle2, Bot, Calendar, UserPlus, Receipt, X, Printer, Eye, Trash2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../services/dbService';
import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { toast } from 'sonner';
import { Expenditure } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const Payroll = () => {
  const { profile, hasPermission } = useAuth();

  if (profile?.role === 'clerk') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm min-h-[400px]">
        <Lock className="w-12 h-12 text-[#ef4444] mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have authorization to view or edit the Payroll module.
        </p>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'staff' | 'slips' | 'overview'>('staff');
  const [searchTerm, setSearchTerm] = useState('');
  const [staffList, setStaffList] = useState<any[]>([]);
  const [advances, setAdvances] = useState<Expenditure[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadData();
    loadPayslips();
  }, []);

  const loadData = async () => {
    try {
      const [staffData, allAdvances] = await Promise.all([
        dbService.list('staff'),
        dbService.list('expenditures', [where('category', '==', 'Staff Advances'), where('isDeducted', '==', false)])
      ]);
      setStaffList((staffData || []).filter((u: any) => u.status === 'active' && u.role !== 'admin'));
      setAdvances(allAdvances as Expenditure[]);
    } catch (error) {
      console.error(error);
    }
  };

  const loadPayslips = async () => {
    try {
      const slips = await dbService.list('payslips', [orderBy('createdAt', 'desc'), firestoreLimit(100)]);
      setPayslips(slips);
    } catch (error) {
      console.error(error);
    }
  };

  const getStaffAdvances = (staffId: string) => {
    return advances.filter(a => a.staffId === staffId);
  };

  const calculateTotalAdvance = (staffId: string) => {
    return getStaffAdvances(staffId).reduce((sum, a) => sum + a.amount, 0);
  };

  const calculateDeduction = (staff: any) => {
    // 3 late commings = 1 casual leave
    const lateDays = staff.lateCommings || 0;
    const casualLeavesDeducted = Math.floor(lateDays / 3);
    const daySalary = (staff.salary || staff.baseSalary || 45000) / 30;
    const attendanceDeduction = casualLeavesDeducted * daySalary;
    
    // Add staff advances
    const advanceDeduction = calculateTotalAdvance(staff.uid || staff.staffId);
    
    // Add EPF deduction
    const epfDeduction = Number(staff.epf) || 0;
    
    // OT / Leave Bonus Logic: If staff hasn't used casual leaves, pay 1 day salary
    const leavesUsed = staff.casualLeavesUsed || 0;
    const otSalary = leavesUsed === 0 ? daySalary : 0;
    
    return {
      attendanceDeduction,
      advanceDeduction,
      epfDeduction,
      otSalary,
      totalDeduction: attendanceDeduction + advanceDeduction + epfDeduction
    };
  };

  const handleSendPayslip = async (staff: any) => {
    setSendingId(staff.uid || staff.staffId);
    try {
      const { totalDeduction, otSalary } = calculateDeduction(staff);
      const baseSalary = staff.salary || staff.baseSalary || 45000;
      const net = (baseSalary + otSalary) - totalDeduction;
      
      let phone = staff.phone || staff.phoneNumber || staff.contact;

      // If phone is missing, try to find it in staffList
      if (!phone && (staff.uid || staff.staffId)) {
        const staffMember = staffList.find(s => s.uid === (staff.uid || staff.staffId) || s.id === (staff.uid || staff.staffId));
        if (staffMember) {
          phone = staffMember.phone || staffMember.phoneNumber || staffMember.contact || staffMember.phone;
        }
      }

      // Cleanup phone number
      const cleanPhone = phone ? phone.replace(/\D/g, '') : '';

      if (!cleanPhone || cleanPhone.length < 10) {
        toast.error(`Invalid phone number for ${staff.name}. Please update their profile.`);
        setSendingId(null);
        return;
      }

      const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
      const text = `Dear ${staff.name || 'Staff'},\n\nYour payslip for ${month} has been generated.\n\nNet Salary: ₹${Math.round(net).toLocaleString()}\n\nThank you,\nSt. Antony's School`;

      await dbService.add('whatsapp_queue', {
        to: cleanPhone,
        text: text,
        status: 'pending',
        timestamp: new Date().getTime(),
        type: 'payslip'
      });
      
      toast.success(`Payslip queued for WhatsApp: ${staff.name}`);
    } catch (error) {
      toast.error('Failed to queue WhatsApp message');
    } finally {
      setSendingId(null);
    }
  };

  const handleProcessSalary = async (staff: any) => {
    const staffAdvances = getStaffAdvances(staff.uid);
    if (staffAdvances.length === 0) {
      toast.info("No pending advances for this staff member.");
      return;
    }

    if (!window.confirm(`Are you sure you want to mark ${staffAdvances.length} advances as deducted for ${staff.name}?`)) return;

    try {
      const today = new Date();
      const deductionDate = today.toISOString();
      
      const promises = staffAdvances.map(a => 
        dbService.update('expenditures', a.id!, {
          isDeducted: true,
          deductionDate
        })
      );
      
      await Promise.all(promises);
      toast.success(`Processed salary for ${staff.name}. ${staffAdvances.length} advances marked as deducted.`);
      loadData(); // Refresh
    } catch (error) {
      toast.error("Failed to process salary deductions.");
    }
  };

  const handleGeneratePayslip = async (staff: any) => {
    const { attendanceDeduction, advanceDeduction, epfDeduction, otSalary, totalDeduction } = calculateDeduction(staff);
    const baseSal = staff.salary || 45000;
    const net = (baseSal + otSalary) - totalDeduction;
    const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    const payslipData = {
      staffId: staff.uid,
      staffName: staff.name,
      staffEmail: staff.email,
      month,
      baseSalary: baseSal,
      attendanceDeductions: attendanceDeduction,
      advanceDeductions: advanceDeduction,
      epf: epfDeduction,
      otSalary: otSalary,
      totalDeductions: totalDeduction,
      netPayable: net,
      status: 'issued',
      createdAt: new Date().toISOString(),
      issuedAt: new Date().toISOString()
    };

    try {
      await dbService.add('payslips', payslipData);
      toast.success(`Payslip generated for ${staff.name}`);
      loadPayslips();
      setSelectedPayslip(payslipData);
      setIsModalOpen(true);
    } catch (error) {
      toast.error('Failed to generate payslip');
    }
  };

  const handleDeletePayslip = async (id: string) => {
    if (!hasPermission('payroll_manage') && !hasPermission('staff_finance')) {
      toast.error('Permission denied');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this payslip? This action cannot be undone.')) return;
    try {
      await dbService.delete('payslips', id);
      toast.success('Payslip deleted successfully');
      loadPayslips();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete payslip');
    }
  };

  const handleBulkGenerate = async () => {
    if (staffList.length === 0) return toast.error('No staff to generate slips for');
    
    setIsProcessingBulk(true);
    const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    
    try {
      const slipsToCreate = staffList.map(staff => {
        const { attendanceDeduction, advanceDeduction, epfDeduction, otSalary, totalDeduction } = calculateDeduction(staff);
        const baseSal = staff.salary || 45000;
        const net = (baseSal + otSalary) - totalDeduction;
        return {
          staffId: staff.uid,
          staffName: staff.name,
          staffEmail: staff.email,
          month,
          baseSalary: baseSal,
          attendanceDeductions: attendanceDeduction,
          advanceDeductions: advanceDeduction,
          epf: epfDeduction,
          otSalary: otSalary,
          totalDeductions: totalDeduction,
          netPayable: net,
          status: 'issued',
          createdAt: new Date().toISOString(),
          issuedAt: new Date().toISOString()
        };
      });

      // Simple implementation: sequential for safety, or use createBatch if available
      for (const slip of slipsToCreate) {
        await dbService.add('payslips', slip);
      }
      
      toast.success(`Generated payslips for ${staffList.length} staff members.`);
      loadPayslips();
    } catch (error) {
      toast.error('Bulk generation failed');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkSendWhatsApp = async () => {
    if (staffList.length === 0) return toast.error('No staff to send messages to');
    
    setIsProcessingBulk(true);
    toast.info(`Queuing payslip notifications for ${staffList.length} staff...`);
    
    try {
      let skippedCount = 0;
      for (const staff of staffList) {
        const { totalDeduction, otSalary } = calculateDeduction(staff);
        const baseSal = staff.salary || 45000;
        const net = (baseSal + otSalary) - totalDeduction;
        const phone = staff.phone || staff.contact || '';

        if (!phone) {
          skippedCount++;
          continue;
        }
        
        const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
        const text = `Dear ${staff.name || 'Staff'},\n\nYour payslip for ${month} has been generated.\n\nNet Salary: ${net ? `₹${net.toLocaleString()}` : '₹0'}\n\nThank you,\nSt. Antony's School`;

        const payload = {
          to: phone,
          text: text
        };
        
        await dbService.add('whatsapp_queue', {
          ...payload,
          status: 'pending',
          timestamp: new Date().getTime(),
          type: 'payslip'
        });
      }
      
      if (skippedCount > 0) {
        toast.warning(`Queued payslips for ${staffList.length - skippedCount} staff members. Skipped ${skippedCount} due to missing phone numbers.`);
      } else {
        toast.success(`Successfully queued WhatsApp payslips for ${staffList.length} staff members!`);
      }
    } catch (error) {
      toast.error('Bulk WhatsApp sending failed');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkExportPDF = () => {
    const dataToExport = activeTab === 'slips' ? payslips : staffList;
    if (dataToExport.length === 0) return toast.error('No data to export');
    
    try {
      const doc = new jsPDF();
      const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
      
      doc.setFontSize(22);
      doc.setTextColor(5, 5, 5);
      doc.text('ST. ANTONY\'S HIGH SCHOOL', 105, 20, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text(`Bulk Payroll Export - ${activeTab === 'slips' ? 'Issued Slips' : 'Current Calculation'}`, 105, 30, { align: 'center' });
      doc.text(month, 105, 38, { align: 'center' });
      
      const head = [['Staff Name', 'Base Salary', 'EPF', 'Other Ded.', 'Leave Bonus', 'Net Payable']];
      const data = dataToExport.map(item => {
        if (activeTab === 'slips') {
          return [
            item.staffName,
            `Rs. ${item.baseSalary?.toLocaleString()}`,
            `Rs. ${item.epf?.toLocaleString() || '0'}`,
            `Rs. ${Math.round(item.attendanceDeductions + item.advanceDeductions || 0).toLocaleString()}`,
            `Rs. ${Math.round(item.otSalary || 0).toLocaleString()}`,
            `Rs. ${Math.round(item.netPayable || 0).toLocaleString()}`
          ];
        } else {
          const { totalDeduction, epfDeduction, otSalary, attendanceDeduction, advanceDeduction } = calculateDeduction(item);
          const baseSal = item.salary || 45000;
          const net = (baseSal + otSalary) - totalDeduction;
          return [
            item.name,
            `Rs. ${baseSal.toLocaleString()}`,
            `Rs. ${epfDeduction.toLocaleString()}`,
            `Rs. ${Math.round(attendanceDeduction + advanceDeduction).toLocaleString()}`,
            `Rs. ${Math.round(otSalary).toLocaleString()}`,
            `Rs. ${Math.round(net).toLocaleString()}`
          ];
        }
      });

      autoTable(doc, {
        head: head,
        body: data,
        startY: 45,
        theme: 'striped',
        headStyles: { 
          fillColor: [5, 5, 5],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 10, cellPadding: 5 }
      });
      
      const fileName = activeTab === 'slips' ? `payslips_${month.replace(' ', '_')}.pdf` : `payroll_est_${month.replace(' ', '_')}.pdf`;
      doc.save(fileName);
      toast.success('Payroll export generated successfully!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate PDF export');
    }
  };

  const drawPayslip = (doc: jsPDF, slip: any, yOffset: number) => {
    const startX = 20;
    const centerX = 105;
    const endX = 190;

    // Adjust centerX if A5 is the whole page (individual)
    // But since we are targeting A5 on A4, we use A4 width (210) for calculations if it's bulk
    // For individual A5 (148x210), centerX would be 74.
    const isA5 = doc.internal.pageSize.width < 200;
    const cX = isA5 ? 74 : 105;
    const eX = isA5 ? 128 : 190;
    const sX = isA5 ? 10 : 20;

    // Header
    doc.setFontSize(isA5 ? 16 : 20);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text("ST. ANTONY'S HIGH SCHOOL", cX, yOffset + (isA5 ? 15 : 20), { align: 'center' });
    
    doc.setFontSize(isA5 ? 9 : 10);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.text('PAY SLIP - ' + slip.month.toUpperCase(), cX, yOffset + (isA5 ? 22 : 28), { align: 'center' });
    
    doc.setDrawColor(229, 231, 235);
    doc.line(sX, yOffset + (isA5 ? 26 : 32), eX, yOffset + (isA5 ? 26 : 32));

    // Employee Details
    doc.setFontSize(isA5 ? 7 : 8);
    doc.setTextColor(107, 114, 128);
    doc.text('EMPLOYEE DETAILS', sX, yOffset + (isA5 ? 35 : 42));
    doc.text('PAYMENT DETAILS', isA5 ? 85 : 120, yOffset + (isA5 ? 35 : 42));

    doc.setFontSize(isA5 ? 9 : 10);
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.text(slip.staffName.toUpperCase(), sX, yOffset + (isA5 ? 42 : 50));
    doc.text('Status: ' + (slip.status || 'Issued').toUpperCase(), isA5 ? 85 : 120, yOffset + (isA5 ? 42 : 50));
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isA5 ? 7 : 8);
    doc.text(slip.staffEmail || '', sX, yOffset + (isA5 ? 46 : 55));
    doc.text('Date: ' + new Date(slip.createdAt || new Date()).toLocaleDateString(), isA5 ? 85 : 120, yOffset + (isA5 ? 46 : 55));

    const tableData = [
      ['Description', 'Earnings', 'Deductions'],
      ['Basic Salary', `Rs. ${slip.baseSalary?.toLocaleString()}`, ''],
      ['EPF Deduction', '', `Rs. ${slip.epf?.toLocaleString() || '0'}`],
      ['Attendance Deduction', '', `Rs. ${Math.round(slip.attendanceDeductions || 0).toLocaleString()}`],
      ['Advance Deduction', '', `Rs. ${slip.advanceDeductions?.toLocaleString() || '0'}`],
    ];

    if (slip.otSalary > 0) {
      tableData.push(['Leave Bonus (OT)', `Rs. ${Math.round(slip.otSalary).toLocaleString()}`, '']);
    }

    autoTable(doc, {
      head: [tableData[0]],
      body: tableData.slice(1),
      startY: yOffset + (isA5 ? 52 : 60),
      theme: 'grid',
      headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
      styles: { fontSize: isA5 ? 7 : 8, cellPadding: isA5 ? 3 : 4 },
      margin: { left: sX, right: isA5 ? 10 : 20 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 5;
    doc.setFontSize(isA5 ? 11 : 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text('NET PAYABLE', isA5 ? 85 : 120, finalY + 5);
    doc.setTextColor(5, 150, 105);
    doc.text(`RS. ${Math.round(slip.netPayable || ((slip.baseSalary + (slip.otSalary || 0)) - (slip.totalDeductions || 0))).toLocaleString()}`, eX, finalY + 5, { align: 'right' });

    // Footer
    doc.setFontSize(isA5 ? 6 : 7);
    doc.setTextColor(156, 163, 175);
    doc.text('This is a computer generated document. St. Antony\'s School', cX, yOffset + (isA5 ? 140 : 142), { align: 'center' });

    // Dotted line for A4 bulk
    if (!isA5 && yOffset === 0) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineDashPattern([2, 1], 0);
      doc.line(0, 148.5, 210, 148.5);
      doc.setLineDashPattern([], 0);
    }
  };

  const handleBulkExportDetailedPDF = () => {
    const dataToExport = activeTab === 'slips' ? payslips : staffList;
    if (dataToExport.length === 0) return toast.error('No data to export');
    
    setIsProcessingBulk(true);
    const toastId = toast.loading('Generating 2-up A5 payslips on A4...');

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
      
      dataToExport.forEach((item, index) => {
        // Page management: 2 slips per page
        if (index > 0 && index % 2 === 0) {
          doc.addPage();
        }
        
        const yOffset = (index % 2 === 0) ? 0 : 148.5;
        
        // Data prep
        const slip = activeTab === 'slips' ? item : {
          staffName: item.name,
          staffEmail: item.email,
          month: month,
          baseSalary: item.salary || 45000,
          ...calculateDeduction(item),
          status: 'issued',
          createdAt: new Date().toISOString()
        };

        drawPayslip(doc, slip, yOffset);
      });
      
      const fileName = `Bulk_Payslips_A5_2UP_${month.replace(' ', '_')}.pdf`;
      doc.save(fileName);
      toast.success('Bulk A5 (2-up) export complete!', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate bulk PDF export', { id: toastId });
    } finally {
      setIsProcessingBulk(false);
    }
  };


  const handleDeleteAllSlips = async () => {
    if (!hasPermission('payroll_manage') && !hasPermission('staff_finance')) {
      toast.error('Permission denied');
      return;
    }
    if (payslips.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ALL ${payslips.length} generated slips? This cannot be undone.`)) return;
    
    setIsProcessingBulk(true);
    const toastId = toast.loading('Deleting all slips...');
    try {
      await dbService.deleteBatch('payslips', payslips.map(s => s.id));
      toast.success('All payslips deleted successfully', { id: toastId });
      loadPayslips();
    } catch (error) {
       toast.error('Failed to delete slips', { id: toastId });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handlePrintIndividual = () => {
    toast.info("Preparing for print... Please use 'Print' in the browser dialog if it doesn't open automatically.");
    setTimeout(() => {
        window.print();
    }, 500);
  };

  const handleDownloadPDF = (slip: any) => {
    try {
      // Individual payslip defaults to A5
      const doc = new jsPDF('p', 'mm', 'a5');
      drawPayslip(doc, slip, 0);
      doc.save(`Payslip_${slip.staffName.replace(' ', '_')}_${slip.month.replace(' ', '_')}.pdf`);
      toast.success('Payslip downloaded in A5 format!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-neutral-100">
        <div>
          <h1 className="text-3xl font-black text-sidebar tracking-tighter uppercase flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-emerald-500" />
            Payroll System
          </h1>
          <p className="text-sm font-bold text-neutral-500 mt-1 uppercase tracking-tight">Advances, Deductions & Payslips</p>
        </div>
      </header>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-4">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h3 className="font-bold text-amber-800 uppercase tracking-tight text-sm">Smart Attendance & Leave Inference</h3>
          <p className="text-xs text-amber-700 mt-1 font-medium">The system automatically calculates 3 late commings as 1 casual leave and deducts accordingly from the base salary. Pay slips are automatically generated.</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-4">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
          <Calendar className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="font-bold text-blue-800 uppercase tracking-tight text-sm">Salary & Advance Policy</h3>
          <p className="text-xs text-blue-700 mt-1 font-medium">Salary date is the 15th of every month. Any staff advances recorded in Expenditures are automatically queued for deduction in the next salary cycle.</p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-neutral-100 shadow-2xl p-8">
        <div className="flex border-b border-neutral-100 mb-8">
          {[
            { id: 'staff', label: 'Staff Payroll', icon: UserPlus },
            { id: 'slips', label: 'Generated Slips', icon: Receipt },
            { id: 'overview', label: 'Overview', icon: FileText },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-8 py-4 font-black transition-all relative ${
                activeTab === tab.id ? 'text-sidebar' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'stroke-[3px]' : ''}`} />
              <span className="uppercase tracking-tighter text-sm">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div layoutId="activeTabPayroll" className="absolute bottom-0 left-0 right-0 h-1 bg-sidebar rounded-full" />
              )}
            </button>
          ))}
        </div>

        {activeTab === 'staff' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input 
                  type="text" 
                  placeholder="Search staff members..." 
                  className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl outline-none focus:border-sidebar transition-all font-bold text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleBulkExportPDF}
                  className="px-6 py-3 bg-neutral-100 text-neutral-700 rounded-xl font-bold hover:bg-neutral-200 transition-colors flex items-center gap-2 text-sm"
                  title="Summary Table Export"
                >
                  <Download className="w-4 h-4" />
                  Summary List
                </button>
                <button 
                  onClick={handleBulkExportDetailedPDF}
                  disabled={isProcessingBulk}
                  className="px-6 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                  title="Individual Slips PDF"
                >
                  <FileText className="w-4 h-4" />
                  Export All PDFs
                </button>
                <button 
                  onClick={handleBulkGenerate}
                  disabled={isProcessingBulk}
                  className="px-6 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold hover:bg-emerald-100 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  {isProcessingBulk ? 'Processing...' : 'Bulk Generate Slips'}
                </button>
                <button 
                  onClick={handleBulkSendWhatsApp}
                  disabled={isProcessingBulk}
                  className="px-6 py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors flex items-center gap-2 shadow-lg shadow-green-500/20 text-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isProcessingBulk ? 'Sending...' : 'Bulk Send WhatsApp'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-neutral-50">
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400 rounded-l-xl">Staff Member</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Role</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Base Salary</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">EPF</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Lates (-ve)</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Advances</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Leave Bonus (OT)</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400 text-emerald-600">Net Payable</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400 rounded-r-xl">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.filter(s => s.name?.toLowerCase().includes(searchTerm.toLowerCase())).map((staff, idx) => {
                    const lateDays = staff.lateCommings || 0;
                    const baseSal = staff.salary || staff.baseSalary || 45000;
                    const { attendanceDeduction, advanceDeduction, epfDeduction, otSalary, totalDeduction } = calculateDeduction(staff);
                    const net = (baseSal + otSalary) - totalDeduction;
                    
                    return (
                      <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-sidebar uppercase text-sm">{staff.name}</p>
                          <p className="text-xs text-neutral-500">{staff.email}</p>
                        </td>
                        <td className="px-6 py-4 font-bold text-xs uppercase text-neutral-600">{staff.role}</td>
                        <td className="px-6 py-4 font-black text-sm text-sidebar">₹{baseSal.toLocaleString()}</td>
                        <td className="px-6 py-4 font-bold text-xs text-indigo-500">- ₹{epfDeduction.toLocaleString()}</td>
                        <td className="px-6 py-4 font-bold text-xs text-red-500">- ₹{Math.round(attendanceDeduction).toLocaleString()} ({lateDays} Lates)</td>
                        <td className="px-6 py-4">
                           <span className={`font-bold text-xs ${advanceDeduction > 0 ? 'text-orange-500' : 'text-neutral-300'}`}>
                             - ₹{advanceDeduction.toLocaleString()}
                           </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-xs text-emerald-500 uppercase tracking-tighter">
                          {otSalary > 0 ? `+ ₹${Math.round(otSalary).toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 font-black text-sm text-emerald-600 font-mono">₹{Math.round(net).toLocaleString()}</td>
                        <td className="px-6 py-4 flex gap-2">
                          <button 
                            onClick={() => handleProcessSalary(staff)}
                            className={`p-2 rounded-xl transition-colors ${advanceDeduction > 0 ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'}`} 
                            title="Process Advance Deduction"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleGeneratePayslip(staff)}
                            className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors" 
                            title="Generate Payslip"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleSendPayslip(staff)}
                            disabled={sendingId === staff.uid}
                            className={`p-2 rounded-xl transition-colors ${sendingId === staff.uid ? 'bg-neutral-100 text-neutral-400' : 'bg-green-50 text-green-600 hover:bg-green-100'}`} 
                            title="Send via WhatsApp"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {staffList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-neutral-400 font-bold">
                        No staff found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'slips' && (
          <div className="space-y-6">
            <div className="flex justify-end gap-3">
              {(hasPermission('payroll_manage') || hasPermission('staff_finance')) && (
                <button 
                  onClick={handleDeleteAllSlips}
                  disabled={isProcessingBulk}
                  className="px-6 py-3 bg-red-50 text-red-700 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All Slips
                </button>
              )}
              <button 
                onClick={handleBulkExportDetailedPDF}
                disabled={isProcessingBulk}
                className="px-6 py-3 bg-neutral-100 text-neutral-700 rounded-xl font-bold hover:bg-neutral-200 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export All as PDF
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-neutral-50">
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400 rounded-l-xl">Staff</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Month</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Net Pay</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Status</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400">Issued At</th>
                    <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-neutral-400 rounded-r-xl">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((slip, idx) => (
                    <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-sm text-sidebar uppercase">{slip.staffName}</td>
                      <td className="px-6 py-4 font-bold text-sm text-neutral-600 uppercase">{slip.month}</td>
                      <td className="px-6 py-4 font-black text-sm text-emerald-600 font-mono">₹{slip.netPayable?.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-tighter">
                          {slip.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-500">{new Date(slip.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 flex gap-2">
                        <button 
                          onClick={() => {
                            setSelectedPayslip(slip);
                            setIsModalOpen(true);
                          }}
                          className="p-2 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 transition-colors"
                          title="View Payslip"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(hasPermission('payroll_manage') || hasPermission('staff_finance')) && (
                          <button 
                            onClick={() => handleDeletePayslip(slip.id)}
                            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                            title="Delete Payslip"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {payslips.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-neutral-400 font-bold italic">
                        No generated payslips found. Generate them from the Staff Payroll tab.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="p-8 bg-neutral-50 rounded-3xl border border-neutral-100 text-center">
               <h4 className="text-sm font-black text-neutral-400 uppercase tracking-widest mb-2">Total Staff</h4>
               <p className="text-4xl font-black text-sidebar tracking-tighter italic">{staffList.length}</p>
             </div>
             <div className="p-8 bg-neutral-50 rounded-3xl border border-neutral-100 text-center">
               <h4 className="text-sm font-black text-neutral-400 uppercase tracking-widest mb-2">Pending Advances</h4>
               <p className="text-4xl font-black text-orange-500 tracking-tighter italic">₹{advances.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}</p>
             </div>
             <div className="p-8 bg-neutral-50 rounded-3xl border border-neutral-100 text-center">
               <h4 className="text-sm font-black text-neutral-400 uppercase tracking-widest mb-2">Total Payroll (Est)</h4>
               <p className="text-4xl font-black text-emerald-600 tracking-tighter italic">₹{staffList.reduce((sum, s) => sum + (s.salary || 45000), 0).toLocaleString()}</p>
             </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && selectedPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-sidebar/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
              id="print-area"
            >
              <div className="p-10">
                <div className="flex justify-between items-start mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center shadow-inner">
                      <Receipt className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-sidebar tracking-tighter uppercase italic">Pay Slip</h2>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{selectedPayslip.month}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="p-3 bg-neutral-50 text-neutral-400 rounded-2xl hover:bg-neutral-100 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-10 mb-10 pb-10 border-b border-neutral-100">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-4">Employee Details</h4>
                    <div>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-tight">Name</p>
                      <p className="font-bold text-sidebar uppercase">{selectedPayslip.staffName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-tight">Email</p>
                      <p className="font-bold text-sidebar">{selectedPayslip.staffEmail}</p>
                    </div>
                  </div>
                  <div className="space-y-4 text-right">
                    <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-4 text-right">Payment Info</h4>
                    <div>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-tight">Status</p>
                      <span className="inline-block px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-tighter border border-emerald-100">
                        {selectedPayslip.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-tight">Date Issued</p>
                      <p className="font-bold text-sidebar">{new Date(selectedPayslip.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-10">
                  <div className="flex justify-between items-center py-4 border-b border-neutral-50">
                    <span className="text-sm font-bold text-sidebar uppercase tracking-tight">Basic Salary</span>
                    <span className="text-base font-black text-sidebar font-mono">₹{selectedPayslip.baseSalary?.toLocaleString()}</span>
                  </div>
                  {selectedPayslip.otSalary > 0 && (
                    <div className="flex justify-between items-center py-4 border-b border-neutral-50">
                      <span className="text-sm font-bold text-emerald-600 uppercase tracking-tight">Leave Bonus / OT</span>
                      <span className="text-base font-black text-emerald-600 font-mono">+ ₹{Math.round(selectedPayslip.otSalary).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-4 border-b border-neutral-50">
                    <span className="text-sm font-bold text-indigo-500 uppercase tracking-tight">EPF Deduction</span>
                    <span className="text-base font-black text-indigo-500 font-mono">- ₹{selectedPayslip.epf?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between items-center py-4 border-b border-neutral-50">
                    <span className="text-sm font-bold text-red-500 uppercase tracking-tight">Attendance Deductions</span>
                    <span className="text-base font-black text-red-500 font-mono">- ₹{Math.round(selectedPayslip.attendanceDeductions || 0)?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-4 border-b border-neutral-50">
                    <span className="text-sm font-bold text-orange-500 uppercase tracking-tight">Advance Deductions</span>
                    <span className="text-base font-black text-orange-500 font-mono">- ₹{(selectedPayslip.advanceDeductions || 0)?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-8">
                    <span className="text-lg font-black text-sidebar uppercase tracking-tighter italic">Net Payable</span>
                    <span className="text-3xl font-black text-emerald-600 font-mono tracking-tighter italic">₹{Math.round(selectedPayslip.netPayable || 0)?.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 no-print">
                  <button 
                    onClick={() => handleDownloadPDF(selectedPayslip)}
                    className="flex-1 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-colors flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20"
                  >
                    <Download className="w-5 h-5" />
                    Download PDF
                  </button>
                  <button 
                    onClick={handlePrintIndividual}
                    className="flex-1 px-8 py-4 bg-sidebar text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-neutral-800 transition-colors flex items-center justify-center gap-3 shadow-xl shadow-sidebar/20"
                  >
                    <Printer className="w-5 h-5" />
                    Print Slip
                  </button>
                  <button 
                    onClick={() => handleSendPayslip({ 
                      uid: selectedPayslip.staffId, 
                      staffId: selectedPayslip.staffId,
                      name: selectedPayslip.staffName, 
                      email: selectedPayslip.staffEmail, 
                      salary: selectedPayslip.baseSalary,
                      baseSalary: selectedPayslip.baseSalary
                    })}
                    className="flex-1 px-8 py-4 bg-green-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-green-600 transition-colors flex items-center justify-center gap-3 shadow-xl shadow-green-500/20"
                  >
                    <Send className="w-5 h-5" />
                    Send via WhatsApp
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Payroll;
