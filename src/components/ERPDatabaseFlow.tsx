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
  Network
} from 'lucide-react';

interface SchemaField {
  name: string;
  type: string;
  desc: string;
}

interface CollectionDetail {
  id: string;
  name: string;
  description: string;
  fields: SchemaField[];
  indexStatus: string;
}

const collectionsInfo: Record<string, CollectionDetail> = {
  users: {
    id: 'users',
    name: 'Users Collection',
    description: 'Central identity and authentication accounts mapped from Firebase Auth.',
    indexStatus: 'Healthy (Primary keys indexed)',
    fields: [
      { name: 'uid', type: 'string', desc: 'Firebase Authentication unique identifier' },
      { name: 'email', type: 'string', desc: 'User email address (normalized to lowercase)' },
      { name: 'role', type: 'string', desc: 'System-wide role: admin, vice_principal, accountant, teacher, receptionist, parent, student' },
      { name: 'name', type: 'string', desc: 'Full display name' },
      { name: 'phone', type: 'string', desc: 'Contact number for WhatsApp updates' }
    ]
  },
  students: {
    id: 'students',
    name: 'Students Collection',
    description: 'Academic student profiles containing enrollment, admission, and family details.',
    indexStatus: 'Healthy (Requires studentId + academicYear composite index for fee screens)',
    fields: [
      { name: 'uid', type: 'string', desc: 'Student unique identifier' },
      { name: 'admissionNo', type: 'string', desc: 'Institutional unique admission ID' },
      { name: 'name', type: 'string', desc: 'Student display name' },
      { name: 'classId', type: 'string', desc: 'Assigned classroom ID reference' },
      { name: 'parentEmail', type: 'string', desc: 'Father/Mother email for credentials connection' },
      { name: 'parentPhone', type: 'string', desc: 'Father/Mother WhatsApp destination' }
    ]
  },
  staff: {
    id: 'staff',
    name: 'Staff Collection',
    description: 'Employee profiles for teaching and non-teaching academic members.',
    indexStatus: 'Healthy (Direct mapping)',
    fields: [
      { name: 'uid', type: 'string', desc: 'Staff employee unique identifier' },
      { name: 'name', type: 'string', desc: 'Full employee name' },
      { name: 'email', type: 'string', desc: 'Primary institutional email' },
      { name: 'designation', type: 'string', desc: 'Job role: Teacher, Accountant, Receptionist, Driver' },
      { name: 'status', type: 'string', desc: 'Employment status: active, on_leave, inactive' }
    ]
  },
  attendance: {
    id: 'attendance',
    name: 'Attendance Collection',
    description: 'Daily attendance checkpoints recorded for all registered students.',
    indexStatus: 'Needs Composite Index (studentId + date for fast history loads)',
    fields: [
      { name: 'id', type: 'string', desc: 'Auto-generated transaction ID' },
      { name: 'studentId', type: 'string', desc: 'Foreign reference to students.uid' },
      { name: 'date', type: 'string', desc: 'Date of attendance check (YYYY-MM-DD)' },
      { name: 'status', type: 'string', desc: 'Attendance state: present, absent, half_day, late' },
      { name: 'markedBy', type: 'string', desc: 'Reference to staff ID of the teacher' }
    ]
  },
  fees: {
    id: 'fees',
    name: 'Fees Collection',
    description: 'Financial ledgers, fee receipts, structures, and student balances.',
    indexStatus: 'Needs Composite Index (studentId + academicYear to prevent pre-condition errors)',
    fields: [
      { name: 'id', type: 'string', desc: 'Invoice transaction unique ID' },
      { name: 'studentId', type: 'string', desc: 'Foreign reference to students.uid' },
      { name: 'academicYear', type: 'string', desc: 'Fiscal year reference (e.g. 2026-2027)' },
      { name: 'amountPaid', type: 'number', desc: 'Value cleared in this transaction' },
      { name: 'totalOutstanding', type: 'number', desc: 'Remaining unpaid dues' },
      { name: 'receiptNo', type: 'string', desc: 'Formatted invoice code' }
    ]
  },
  examMarks: {
    id: 'examMarks',
    name: 'Exams & Marks Collection',
    description: 'Academic gradebooks, report cards, and subject achievements.',
    indexStatus: 'Needs Composite Index (examId + studentId)',
    fields: [
      { name: 'id', type: 'string', desc: 'Result record unique ID' },
      { name: 'studentId', type: 'string', desc: 'Foreign reference to students.uid' },
      { name: 'examId', type: 'string', desc: 'Assigned examination event reference' },
      { name: 'marksObtained', type: 'number', desc: 'Subject score achieved' },
      { name: 'maxMarks', type: 'number', desc: 'Total aggregate score possible' }
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
          <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Authentication</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">Users Accounts</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #171717', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    }
  },
  {
    id: 'students',
    position: { x: 300, y: 80 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0 shadow-sm">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-rose-300 tracking-wider">Demographics</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">Students</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #f43f5e', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(244, 63, 94, 0.15)'
    }
  },
  {
    id: 'staff',
    position: { x: 300, y: 280 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">Human Resources</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">Staff & Teachers</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #6366f1', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(99, 102, 241, 0.15)'
    }
  },
  {
    id: 'attendance',
    position: { x: 550, y: 10 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-emerald-300 tracking-wider">Operations</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">Attendance</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #10b981', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(16, 185, 129, 0.15)'
    }
  },
  {
    id: 'fees',
    position: { x: 550, y: 130 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-amber-300 tracking-wider">Finance</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">Fees & Receipts</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #f59e0b', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(245, 158, 11, 0.15)'
    }
  },
  {
    id: 'examMarks',
    position: { x: 550, y: 250 },
    data: { 
      label: (
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Award className="w-4 h-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase text-purple-300 tracking-wider">Academics</p>
            <h4 className="text-xs font-black text-neutral-900 uppercase">Exam Marks</h4>
          </div>
        </div>
      )
    },
    style: { 
      background: '#ffffff', 
      border: '2px solid #a855f7', 
      borderRadius: '1rem',
      width: 180,
      boxShadow: '0 4px 10px -1px rgba(168, 85, 247, 0.15)'
    }
  }
];

const initialEdges: Edge[] = [
  { 
    id: 'e-users-students', 
    source: 'users', 
    target: 'students', 
    animated: true,
    label: 'parentEmail / email link',
    style: { stroke: '#f43f5e', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#f43f5e' }
  },
  { 
    id: 'e-users-staff', 
    source: 'users', 
    target: 'staff', 
    animated: true,
    label: 'email link',
    style: { stroke: '#6366f1', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
  },
  { 
    id: 'e-students-attendance', 
    source: 'students', 
    target: 'attendance', 
    animated: true,
    label: 'studentId match',
    style: { stroke: '#10b981', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
  },
  { 
    id: 'e-students-fees', 
    source: 'students', 
    target: 'fees', 
    animated: true,
    label: 'studentId match',
    style: { stroke: '#f59e0b', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' }
  },
  { 
    id: 'e-students-exams', 
    source: 'students', 
    target: 'examMarks', 
    animated: true,
    label: 'studentId match',
    style: { stroke: '#a855f7', strokeWidth: 2 },
    labelStyle: { fontSize: 8, fill: '#171717', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' }
  }
];

export const ERPDatabaseFlow: React.FC = () => {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedCollection, setSelectedCollection] = useState<CollectionDetail>(collectionsInfo.users);

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    const detail = collectionsInfo[node.id];
    if (detail) {
      setSelectedCollection(detail);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] border border-neutral-100 shadow-sm overflow-hidden flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-neutral-100 animate-in fade-in duration-300">
      
      {/* React Flow Interactive Arena */}
      <div className="flex-1 h-[450px] relative bg-neutral-50/50">
        <div className="absolute top-4 left-4 z-15 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-neutral-100 shadow-sm flex items-center gap-2">
          <Network className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-[10px] font-black uppercase text-neutral-800 tracking-wider">
            Interactive Database Map (Click Node to Inspect)
          </span>
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
          <Background color="#ccc" gap={16} size={1} />
          <Controls showInteractive={false} className="shadow-lg border border-neutral-100 rounded-xl overflow-hidden bg-white" />
          <MiniMap 
            zoomable 
            pannable 
            nodeColor={(node) => {
              if (node.id === 'users') return '#171717';
              if (node.id === 'students') return '#f43f5e';
              if (node.id === 'staff') return '#6366f1';
              if (node.id === 'attendance') return '#10b981';
              if (node.id === 'fees') return '#f59e0b';
              return '#a855f7';
            }}
            className="rounded-xl border border-neutral-150/80 shadow-md bg-white overflow-hidden" 
          />
        </ReactFlow>
      </div>

      {/* Selected Collection Schema Inspector Panel */}
      <div className="w-full lg:w-[380px] p-6 bg-white flex flex-col justify-between gap-6 shrink-0">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-neutral-900 text-white rounded-xl flex items-center justify-center shadow-sm">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Firestore Inspector</p>
              <h4 className="text-sm font-black text-sidebar uppercase tracking-tight leading-none">
                {selectedCollection.name}
              </h4>
            </div>
          </div>

          <p className="text-xs text-neutral-500 leading-relaxed font-semibold">
            {selectedCollection.description}
          </p>

          <div className="space-y-3 pt-2">
            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Schema Blueprint
            </p>
            <div className="divide-y divide-neutral-100 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin">
              {selectedCollection.fields.map((field) => (
                <div key={field.name} className="py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-neutral-800 tracking-tight font-mono">{field.name}</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded uppercase font-mono">{field.type}</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-semibold leading-relaxed">
                    {field.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Index Monitor Status */}
        <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl space-y-1">
          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">Index Status</p>
          <p className="text-[11px] text-neutral-700 font-bold leading-normal">
            {selectedCollection.indexStatus}
          </p>
          <div className="pt-2 flex items-center gap-1">
            <a
              href={`https://console.firebase.google.com/project/antonyserp-cc9df/firestore/databases/(default)/indexes`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[10px] font-black text-primary hover:text-indigo-600 uppercase tracking-widest flex items-center gap-1 transition-colors"
            >
              Verify Indexes in Console <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
