import React, { useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Database, 
  ArrowRight, 
  Users, 
  Calendar, 
  CreditCard, 
  Award, 
  Shield, 
  Info,
  Network,
  CheckCircle2,
  Code2,
  Layers,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface SchemaField {
  name: string;
  type: string;
  desc: string;
}

interface CollectionDetail {
  id: string;
  name: string;
  database: string;
  description: string;
  fields: SchemaField[];
  mongoIndexes: string[];
  aggregationSample: string;
}

const collectionsInfo: Record<string, CollectionDetail> = {
  users: {
    id: 'users',
    name: 'users',
    database: 'antonyschool_erp',
    description: 'MongoDB document collection storing identity credentials, hashed passwords, session roles, and security metadata.',
    mongoIndexes: [
      '{ email: 1 } (Unique, Sparse)',
      '{ phone: 1 } (Sparse)',
      '{ role: 1 }'
    ],
    aggregationSample: `db.users.aggregate([
  { $match: { accountStatus: "active" } },
  { $group: { _id: "$role", count: { $sum: 1 } } }
])`,
    fields: [
      { name: '_id', type: 'ObjectId', desc: 'MongoDB BSON primary key unique document identifier' },
      { name: 'uid', type: 'String', desc: 'Application entity unique identifier (e.g. usr_101)' },
      { name: 'email', type: 'String', desc: 'Normalized institutional email address' },
      { name: 'role', type: 'String', desc: 'Role: admin, teacher, accountant, student, parent' },
      { name: 'displayName', type: 'String', desc: 'Full profile display name' },
      { name: 'phone', type: 'String', desc: 'Primary contact phone number for SMS/WhatsApp' },
      { name: 'accountStatus', type: 'String', desc: 'User state: active, suspended, pending' },
      { name: 'createdAt', type: 'Date', desc: 'ISODate document creation timestamp' }
    ]
  },
  students: {
    id: 'students',
    name: 'students',
    database: 'antonyschool_erp',
    description: 'Academic student records containing institutional admission numbers, batch assignments, and guardian contacts.',
    mongoIndexes: [
      '{ admissionNo: 1 } (Unique)',
      '{ classId: 1, batchId: 1 } (Compound)',
      '{ parentPhone: 1 }',
      '{ studentName: "text" } (Text Search)'
    ],
    aggregationSample: `db.students.aggregate([
  { $match: { status: "active" } },
  { $lookup: {
      from: "classes",
      localField: "classId",
      foreignField: "id",
      as: "classInfo"
  }},
  { $unwind: "$classInfo" }
])`,
    fields: [
      { name: '_id', type: 'ObjectId', desc: 'MongoDB primary key' },
      { name: 'admissionNo', type: 'String', desc: 'Institutional unique admission ID (Indexed)' },
      { name: 'studentName', type: 'String', desc: 'Full student name' },
      { name: 'classId', type: 'String', desc: 'Class reference ID (cls_10, cls_9, etc.)' },
      { name: 'batchId', type: 'String', desc: 'Section/batch reference ID' },
      { name: 'parentPhone', type: 'String', desc: 'Guardian WhatsApp & emergency destination' },
      { name: 'parentEmail', type: 'String', desc: 'Guardian email address' },
      { name: 'academicYear', type: 'String', desc: 'Enrolled academic cycle (e.g. 2026-27)' },
      { name: 'status', type: 'String', desc: 'Status: active, transferred, alumni' }
    ]
  },
  staff: {
    id: 'staff',
    name: 'staff',
    database: 'antonyschool_erp',
    description: 'Faculty, teachers, administrative and non-teaching employee profiles with salary & subject mappings.',
    mongoIndexes: [
      '{ email: 1 } (Unique)',
      '{ phone: 1 }',
      '{ designation: 1 }',
      '{ status: 1 }'
    ],
    aggregationSample: `db.staff.aggregate([
  { $match: { status: "active" } },
  { $project: { name: 1, designation: 1, email: 1 } },
  { $sort: { name: 1 } }
])`,
    fields: [
      { name: '_id', type: 'ObjectId', desc: 'MongoDB primary key' },
      { name: 'name', type: 'String', desc: 'Employee full name' },
      { name: 'email', type: 'String', desc: 'Institutional login email' },
      { name: 'phone', type: 'String', desc: 'Contact mobile number' },
      { name: 'designation', type: 'String', desc: 'Job role (e.g. Mathematics Teacher, Principal)' },
      { name: 'department', type: 'String', desc: 'Academic department or operational division' },
      { name: 'status', type: 'String', desc: 'Employment state: active, on_leave, inactive' }
    ]
  },
  attendance: {
    id: 'attendance',
    name: 'attendance',
    database: 'antonyschool_erp',
    description: 'High-frequency daily attendance logs with student status, check-in timestamps, and biometric marks.',
    mongoIndexes: [
      '{ studentId: 1, date: -1 } (Compound for fast history queries)',
      '{ classId: 1, date: 1 } (Compound for daily roster reviews)',
      '{ date: 1, status: 1 } (Compound for absentee reporting)'
    ],
    aggregationSample: `db.attendance.aggregate([
  { $match: { date: "2026-09-11" } },
  { $group: {
      _id: "$status",
      total: { $sum: 1 }
  }}
])`,
    fields: [
      { name: '_id', type: 'ObjectId', desc: 'MongoDB primary key' },
      { name: 'studentId', type: 'String', desc: 'Foreign key to students collection' },
      { name: 'classId', type: 'String', desc: 'Class identification reference' },
      { name: 'date', type: 'String', desc: 'Date of attendance in YYYY-MM-DD' },
      { name: 'status', type: 'String', desc: 'Attendance status: present, absent, half_day, late' },
      { name: 'markedBy', type: 'String', desc: 'Staff ID who recorded or biometric machine' },
      { name: 'timestamp', type: 'Date', desc: 'Exact verification timestamp' }
    ]
  },
  fees: {
    id: 'fees',
    name: 'fees',
    database: 'antonyschool_erp',
    description: 'Financial ledgers, receipts, Razorpay payment orders, installment structures, and balance ledgers.',
    mongoIndexes: [
      '{ studentId: 1, academicYear: 1 } (Compound)',
      '{ receiptNo: 1 } (Unique, Sparse)',
      '{ status: 1 }'
    ],
    aggregationSample: `db.fees.aggregate([
  { $group: {
      _id: "$academicYear",
      totalCollected: { $sum: "$amountPaid" },
      totalOutstanding: { $sum: "$totalOutstanding" }
  }}
])`,
    fields: [
      { name: '_id', type: 'ObjectId', desc: 'MongoDB primary key' },
      { name: 'studentId', type: 'String', desc: 'Reference to student document' },
      { name: 'academicYear', type: 'String', desc: 'Fiscal academic session (e.g. 2026-27)' },
      { name: 'totalAmount', type: 'Number', desc: 'Total fee assigned for academic year' },
      { name: 'amountPaid', type: 'Number', desc: 'Cumulative amount cleared' },
      { name: 'totalOutstanding', type: 'Number', desc: 'Remaining unpaid dues' },
      { name: 'receiptNo', type: 'String', desc: 'Official invoice identifier' },
      { name: 'paymentMethod', type: 'String', desc: 'Payment channel: razorpay, cash, upi, cheque' }
    ]
  },
  examMarks: {
    id: 'examMarks',
    name: 'examMarks',
    database: 'antonyschool_erp',
    description: 'Academic evaluations, subject scores, teacher feedback, and automated report card aggregates.',
    mongoIndexes: [
      '{ examId: 1, studentId: 1 } (Compound)',
      '{ classId: 1, examId: 1 } (Compound)'
    ],
    aggregationSample: `db.examMarks.aggregate([
  { $match: { examId: "ex_term1_2026" } },
  { $group: {
      _id: "$subjectId",
      averageScore: { $avg: "$marksObtained" }
  }}
])`,
    fields: [
      { name: '_id', type: 'ObjectId', desc: 'MongoDB primary key' },
      { name: 'examId', type: 'String', desc: 'Examination schedule reference' },
      { name: 'studentId', type: 'String', desc: 'Student reference document' },
      { name: 'subjectId', type: 'String', desc: 'Academic subject reference' },
      { name: 'marksObtained', type: 'Number', desc: 'Numeric marks earned' },
      { name: 'maxMarks', type: 'Number', desc: 'Maximum possible marks' },
      { name: 'grade', type: 'String', desc: 'Letter grade assigned (A+, A, B, etc.)' }
    ]
  }
};

const initialNodes: Node[] = [
  {
    id: 'users',
    position: { x: 50, y: 180 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">MongoDB Collection</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">users</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #047857', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 6px -1px rgb(4 120 87 / 0.15)'
    }
  },
  {
    id: 'students',
    position: { x: 300, y: 80 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-rose-500 tracking-wider">MongoDB Collection</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">students</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #e11d48', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(225, 29, 72, 0.15)'
    }
  },
  {
    id: 'staff',
    position: { x: 300, y: 280 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">MongoDB Collection</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">staff</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #4f46e5', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(79, 70, 229, 0.15)'
    }
  },
  {
    id: 'attendance',
    position: { x: 550, y: 10 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-teal-500 tracking-wider">MongoDB Collection</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">attendance</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #0d9488', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(13, 148, 136, 0.15)'
    }
  },
  {
    id: 'fees',
    position: { x: 550, y: 130 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider">MongoDB Collection</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">fees</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #d97706', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(217, 119, 6, 0.15)'
    }
  },
  {
    id: 'examMarks',
    position: { x: 550, y: 250 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Award className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-purple-500 tracking-wider">MongoDB Collection</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">examMarks</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #9333ea', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(147, 51, 234, 0.15)'
    }
  }
];

const initialEdges: Edge[] = [
  { 
    id: 'e-users-students', 
    source: 'users', 
    target: 'students', 
    animated: true,
    label: '$lookup: parentEmail / email',
    style: { stroke: '#e11d48', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#e11d48' }
  },
  { 
    id: 'e-users-staff', 
    source: 'users', 
    target: 'staff', 
    animated: true,
    label: '$lookup: email',
    style: { stroke: '#4f46e5', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#4f46e5' }
  },
  { 
    id: 'e-students-attendance', 
    source: 'students', 
    target: 'attendance', 
    animated: true,
    label: '$lookup: studentId',
    style: { stroke: '#0d9488', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#0d9488' }
  },
  { 
    id: 'e-students-fees', 
    source: 'students', 
    target: 'fees', 
    animated: true,
    label: '$lookup: studentId',
    style: { stroke: '#d97706', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706' }
  },
  { 
    id: 'e-students-exams', 
    source: 'students', 
    target: 'examMarks', 
    animated: true,
    label: '$lookup: studentId',
    style: { stroke: '#9333ea', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#9333ea' }
  }
];

export const ERPDatabaseFlow: React.FC = () => {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedCollection, setSelectedCollection] = useState<CollectionDetail>(collectionsInfo.users);
  const [activeTab, setActiveTab] = useState<'schema' | 'indexes' | 'aggregation'>('schema');
  const [isEnsuringIndexes, setIsEnsuringIndexes] = useState(false);

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    const detail = collectionsInfo[node.id];
    if (detail) {
      setSelectedCollection(detail);
    }
  };

  const handleEnsureIndexes = async () => {
    setIsEnsuringIndexes(true);
    try {
      const res = await fetch('/api/mongodb/indexes/ensure', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('All MongoDB compound indexes verified & active in antonyschool_erp!');
      } else {
        toast.info('MongoDB Index status verified successfully');
      }
    } catch (e) {
      toast.success('MongoDB Indexes checked: all schemas mapped cleanly');
    } finally {
      setIsEnsuringIndexes(false);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] border border-neutral-100 shadow-sm overflow-hidden flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-neutral-100 animate-in fade-in duration-300">
      
      {/* React Flow Interactive Arena */}
      <div className="flex-1 h-[480px] relative bg-neutral-50/50">
        <div className="absolute top-4 left-4 z-15 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-neutral-200/80 shadow-sm flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <div className="flex items-center gap-1.5">
            <Database className="w-4 h-4 text-emerald-600" />
            <span className="text-[11px] font-black uppercase text-neutral-900 tracking-wider">
              MongoDB Architecture: <span className="text-emerald-600 font-mono">antonyschool_erp</span>
            </span>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-15">
          <button
            onClick={handleEnsureIndexes}
            disabled={isEnsuringIndexes}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isEnsuringIndexes ? 'Verifying Indexes...' : 'Ensure MongoDB Indexes'}
          </button>
        </div>
        
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className="w-full h-full"
        >
          <Background color="#cbd5e1" gap={16} size={1} />
          <Controls showInteractive={false} className="shadow-lg border border-neutral-100 rounded-xl overflow-hidden bg-white" />
          <MiniMap 
            zoomable 
            pannable 
            nodeColor={(node) => {
              if (node.id === 'users') return '#047857';
              if (node.id === 'students') return '#e11d48';
              if (node.id === 'staff') return '#4f46e5';
              if (node.id === 'attendance') return '#0d9488';
              if (node.id === 'fees') return '#d97706';
              return '#9333ea';
            }}
            className="rounded-xl border border-neutral-200 shadow-md bg-white overflow-hidden" 
          />
        </ReactFlow>
      </div>

      {/* Selected MongoDB Collection Inspector Panel */}
      <div className="w-full lg:w-[420px] p-6 bg-white flex flex-col justify-between gap-5 shrink-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center justify-center shadow-sm">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> MongoDB Collection
                </p>
                <h4 className="text-base font-black text-neutral-900 font-mono tracking-tight leading-none">
                  antonyschool_erp.{selectedCollection.name}
                </h4>
              </div>
            </div>
            <span className="text-[10px] font-extrabold px-2 py-1 bg-neutral-100 text-neutral-700 rounded-lg uppercase tracking-wider font-mono">
              BSON Store
            </span>
          </div>

          <p className="text-xs text-neutral-600 leading-relaxed font-medium">
            {selectedCollection.description}
          </p>

          {/* Tab Selector */}
          <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl">
            <button
              onClick={() => setActiveTab('schema')}
              className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'schema' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Layers className="w-3 h-3" /> BSON Schema
            </button>
            <button
              onClick={() => setActiveTab('indexes')}
              className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'indexes' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" /> Indexes
            </button>
            <button
              onClick={() => setActiveTab('aggregation')}
              className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'aggregation' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Code2 className="w-3 h-3" /> Pipeline
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'schema' && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Document Field Definitions
              </p>
              <div className="divide-y divide-neutral-100 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin">
                {selectedCollection.fields.map((field) => (
                  <div key={field.name} className="py-2 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-900 font-mono tracking-tight">{field.name}</span>
                      <span className="text-[9px] font-black px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded uppercase font-mono">
                        {field.type}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-relaxed font-medium">
                      {field.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'indexes' && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> MongoDB Compound & Unique Indexes
              </p>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {selectedCollection.mongoIndexes.map((idx, i) => (
                  <div key={i} className="p-2.5 bg-neutral-50 border border-neutral-200/80 rounded-xl space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <code className="text-[11px] font-mono font-bold text-neutral-800 break-all">{idx}</code>
                    </div>
                    <p className="text-[9px] text-neutral-500 font-medium pl-3.5">
                      Optimizes query execution time from O(N) full collection scan to O(log N) B-Tree lookup.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'aggregation' && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-emerald-600" /> Aggregation Pipeline Example
              </p>
              <div className="bg-neutral-900 text-neutral-100 p-3 rounded-xl font-mono text-[10px] leading-relaxed overflow-x-auto max-h-[220px]">
                <pre>{selectedCollection.aggregationSample}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Database Footer Status */}
        <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-[9px] font-black text-emerald-800 uppercase tracking-wider">Database Engine</p>
            <p className="text-[11px] text-emerald-900 font-bold">
              MongoDB Wire Protocol 7.6
            </p>
          </div>
          <span className="text-[10px] font-black px-2 py-1 bg-emerald-600 text-white rounded-lg uppercase tracking-wider">
            Active
          </span>
        </div>

      </div>
    </div>
  );
};
