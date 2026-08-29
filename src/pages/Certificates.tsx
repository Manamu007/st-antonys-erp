import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { where, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { 
  FileText, 
  Plus, 
  Upload, 
  Printer, 
  Search, 
  ChevronRight, 
  Download,
  Trash2,
  Edit,
  X,
  Save,
  User,
  GraduationCap,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../firebase';
import { uploadService } from '../services/uploadService';
import { CertificateTemplate, IssuedCertificate, StudentDetails } from '../types';
import { motion, AnimatePresence } from 'motion/react';

import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const PlaceholderNode: React.FC<any> = ({ data }) => {
  return (
    <div className="bg-white/95 backdrop-blur-sm border-2 border-indigo-500/50 hover:border-indigo-600 text-indigo-700 px-3 py-1.5 rounded-xl shadow-lg flex items-center gap-2 font-black text-[10px] uppercase tracking-wider transition-all">
      <span className="cursor-move">{data.label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          data.onDelete();
        }}
        className="text-neutral-400 hover:text-red-500 transition-colors ml-1 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

const nodeTypes = {
  placeholder: PlaceholderNode
};

interface CertificateFlowDesignerProps {
  template: Partial<CertificateTemplate>;
  onChange: (updated: Partial<CertificateTemplate>) => void;
}

const CertificateFlowDesigner: React.FC<CertificateFlowDesignerProps> = ({ template, onChange }) => {
  const canvasWidth = template.paperSize === 'A5' ? 500 : 400;
  const canvasHeight = template.paperSize === 'A5' ? 352 : 565;

  const nodes: Node[] = (template.placeholders || []).map(p => {
    const pos = (template.placeholderPositions || {})[p] || { x: 50, y: 50 };
    return {
      id: p,
      type: 'placeholder',
      position: {
        x: (pos.x / 100) * canvasWidth,
        y: (pos.y / 100) * canvasHeight
      },
      data: {
        label: p,
        onDelete: () => {
          const updatedPositions = { ...(template.placeholderPositions || {}) };
          delete updatedPositions[p];
          onChange({
            ...template,
            placeholders: template.placeholders?.filter(item => item !== p),
            placeholderPositions: updatedPositions
          });
        }
      }
    };
  });

  const onNodesChange = (changes: any) => {
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        const p = change.id;
        const xPercent = (change.position.x / canvasWidth) * 100;
        const yPercent = (change.position.y / canvasHeight) * 100;

        onChange({
          ...template,
          placeholderPositions: {
            ...(template.placeholderPositions || {}),
            [p]: {
              x: Math.max(0, Math.min(95, xPercent)),
              y: Math.max(0, Math.min(95, yPercent))
            }
          }
        });
      }
    });
  };

  return (
    <div 
      className="bg-neutral-200 p-4 rounded-[40px] flex justify-center items-center overflow-hidden border border-neutral-300"
      style={{ width: '100%', height: '620px' }}
    >
      <div 
        className="bg-white shadow-2xl relative border border-neutral-300 rounded-3xl overflow-hidden"
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={[]}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          panOnScroll={false}
          panOnDrag={false}
          style={{
            width: '100%',
            height: '100%',
            backgroundImage: template.backgroundURL ? `url(${template.backgroundURL})` : 'none',
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center'
          }}
        >
          <Background color="#ccc" gap={16} />
          {!template.backgroundURL && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 pointer-events-none p-8 text-center bg-white/70 backdrop-blur-sm z-10">
              <Upload className="w-10 h-10 mb-3 text-neutral-300" />
              <p className="font-black uppercase tracking-widest text-[10px]">Upload background scan to start visual positioning</p>
              <p className="text-[9px] mt-1 max-w-[180px] text-neutral-400">Nodes are custom-draggable directly on the template with React Flow.</p>
            </div>
          )}
        </ReactFlow>
      </div>
    </div>
  );
};

const Certificates: React.FC = () => {
  const { hasPermission, isStudent } = useAuth();
  const canManage = hasPermission('certificates_manage');
  const canView = (hasPermission('certificates_view') || canManage) && !isStudent;
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'issue' | 'templates' | 'history'>('issue');
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [issuedCertificates, setIssuedCertificates] = useState<IssuedCertificate[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CertificateTemplate | null>(null);
  
  const [newTemplate, setNewTemplate] = useState<Partial<CertificateTemplate>>({
    name: '',
    type: 'Bonafide',
    content: '',
    paperSize: 'A4',
    placeholders: ['studentName', 'fatherName', 'class', 'rollNumber', 'academicYear', 'date'],
    placeholderPositions: {}
  });

  const [issueData, setIssueData] = useState<Record<string, any>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'html'>('visual');
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [templatesData, issuedData] = await Promise.all([
        dbService.list('certificateTemplates'),
        dbService.list('issuedCertificates')
      ]);
      setTemplates(templatesData as CertificateTemplate[]);
      setIssuedCertificates(issuedData as IssuedCertificate[]);
      
      // Initially fetch a few students or just skip and use search
      const studentsData = await dbService.list('students', [
        limit(10)
      ]);
      setStudents(studentsData as any[]);
    } catch (error) {
      console.error("Error fetching certificates:", error);
      toast.error("Failed to load certificate data");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchStudents = async (query: string) => {
    if (query.length < 3) return;
    try {
      const studentsData = await dbService.list('students', [
        where('name', '>=', query),
        where('name', '<=', query + '\uf8ff'),
        limit(10)
      ]);
      setStudents(studentsData as any[]);
    } catch (error) {
       console.error("Error searching students:", error);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.length >= 3) {
        handleSearchStudents(searchTerm);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const loadDefaultTemplates = async () => {
    if (loading) return;
    
    const defaults: Partial<CertificateTemplate>[] = [
      {
        name: "Official Study Certificate",
        type: "Study",
        paperSize: "A4",
        content: `
          <div style="text-align: center; border: 5px solid #1e293b; padding: 50px; font-family: 'Times New Roman', serif;">
            <h1 style="font-size: 32px; color: #1e293b; margin-bottom: 10px;">{{schoolName}}</h1>
            <p style="font-size: 14px; margin-bottom: 30px;">{{schoolAddress}}</p>
            <h2 style="text-decoration: underline; margin-bottom: 40px;">STUDY CERTIFICATE</h2>
            <p style="font-size: 18px; line-height: 2; text-align: justify;">
              This is to certify that Master/Miss <b>{{studentName}}</b>, 
              son/daughter of Sri <b>{{fatherName}}</b>, 
              is/was a bonafide student of this school. 
              He/She is studying/has studied in <b>{{class}}</b> 
              during the academic year <b>{{academicYear}}</b>.
            </p>
            <p style="font-size: 18px; text-align: justify; margin-top: 20px;">
              His/Her date of birth as per our school records is <b>{{dateOfBirth}}</b>.
            </p>
            <div style="margin-top: 80px; display: flex; justify-content: space-between;">
              <div style="text-align: center;">
                <div style="border-top: 1px solid #1e293b; width: 150px; padding-top: 5px;">Clerk</div>
              </div>
              <div style="text-align: center;">
                <div style="border-top: 1px solid #1e293b; width: 150px; padding-top: 5px;">Head Master</div>
              </div>
            </div>
          </div>
        `,
        placeholders: ['studentName', 'fatherName', 'class', 'academicYear', 'dateOfBirth', 'schoolName', 'schoolAddress'],
        placeholderPositions: {},
        updatedAt: new Date().toISOString()
      },
      {
        name: "Standard TC",
        type: "TC",
        paperSize: "A4",
        content: `
          <div style="text-align: center; border: 2px solid #000; padding: 40px; font-family: sans-serif;">
            <h2>TRANSFER CERTIFICATE</h2>
            <p>Admission No: <b>{{admissionNumber}}</b> | SL No: <b>{{tcNumber}}</b></p>
            <table style="width: 100%; text-align: left; margin-top: 30px; border-collapse: collapse;">
              <tr><td style="padding: 10px;">1. Name of Pupil:</td><td><b>{{studentName}}</b></td></tr>
              <tr><td style="padding: 10px;">2. Parent Name:</td><td><b>{{fatherName}}</b></td></tr>
              <tr><td style="padding: 10px;">3. Date of Leaving:</td><td><b>{{dropDate}}</b></td></tr>
              <tr><td style="padding: 10px;">4. Class at time of leaving:</td><td><b>{{class}}</b></td></tr>
              <tr><td style="padding: 10px;">5. Conduct & Character:</td><td><b>Good</b></td></tr>
            </table>
            <div style="margin-top: 100px; display: flex; justify-content: flex-end;">
              <div style="text-align: center; border-top: 1px solid #000; width: 200px;">Principal Signature</div>
            </div>
          </div>
        `,
        placeholders: ['admissionNumber', 'tcNumber', 'studentName', 'fatherName', 'dropDate', 'class'],
        placeholderPositions: {},
        updatedAt: new Date().toISOString()
      }
    ];

    try {
      const currentTemplates = await dbService.list('certificateTemplates') as CertificateTemplate[];
      let addedCount = 0;
      
      for (const t of defaults) {
        const exists = currentTemplates.some(tmp => 
          (String(tmp.name || '')).toLowerCase().trim() === (String(t.name || '')).toLowerCase().trim()
        );
        if (!exists) {
          await dbService.add('certificateTemplates', t);
          addedCount++;
        }
      }
      
      if (addedCount > 0) {
        toast.success(`Loaded ${addedCount} new templates`);
      } else {
        toast.info("Default templates already exist");
      }
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to process default templates");
    }
  };

  const handleUploadBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadService.uploadFile(file);
      setNewTemplate(prev => ({ ...prev, backgroundURL: url }));
      toast.success("Background uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload background image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const templateData = {
        ...newTemplate,
        updatedAt: new Date().toISOString()
      };
      
      if ((newTemplate as any).id) {
        await dbService.update('certificateTemplates', (newTemplate as any).id, templateData);
        toast.success("Template updated successfully");
      } else {
        await dbService.add('certificateTemplates', templateData);
        toast.success("Template created successfully");
      }
      setShowTemplateModal(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to save template");
    }
  };

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedTemplate) return;

    try {
      let content = selectedTemplate.content;
      // Replace placeholders
      Object.entries(issueData).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
      });

      const certNumber = `CERT-${Date.now()}`;
      
      const issuedCert: Partial<IssuedCertificate> = {
        studentId: selectedStudent.uid,
        templateId: selectedTemplate.id,
        type: selectedTemplate.type,
        certificateNumber: certNumber,
        issuedDate: new Date().toISOString(),
        issuedBy: auth.currentUser?.uid || 'System',
        academicYear: settings.currentAcademicYear || '2024-2025',
        content: content,
        placeholderPositions: selectedTemplate.placeholderPositions || {},
        metadata: issueData
      };

      const customId = `${selectedTemplate.name.trim().replace(/\s+/g, '_')}_${certNumber}`;
      await dbService.create('issuedCertificates', customId, issuedCert);
      toast.success("Certificate issued successfully");
      setShowIssueModal(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to issue certificate");
    }
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-neutral-200">
        <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
        <h2 className="text-2xl font-black text-sidebar mb-2">Access Denied</h2>
        <p className="text-neutral-500">You do not have permission to view this module.</p>
      </div>
    );
  }

  const deleteTemplate = async (id: string) => {
    if (!id) {
      toast.error("Cannot delete: Template ID missing");
      return;
    }
    setIsDeleting(id);
    try {
      await dbService.delete('certificateTemplates', id);
      toast.success("Template deleted successfully");
      setShowConfirmDelete(null);
      await fetchData();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete template. Check permissions.");
    } finally {
      setIsDeleting(null);
    }
  };

  const printCertificate = (cert: IssuedCertificate) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    // Find the template to check for background and paper size
    const template = templates.find(t => t.id === cert.templateId);
    const paperSize = template?.paperSize || 'A4';
    const isA5 = paperSize === 'A5';
    
    // Dimensions for A4 and A5
    const width = isA5 ? '210mm' : '210mm';
    const height = isA5 ? '148mm' : '297mm';
    
    const backgroundStyle = template?.backgroundURL 
      ? `background-image: url('${template.backgroundURL}'); background-size: 100% 100%; background-repeat: no-repeat; border: none;` 
      : 'border: 10px double #333;';
    
    // If we have positions, we ignore cert.content and build it from metadata
    const hasPositions = cert.placeholderPositions && Object.keys(cert.placeholderPositions).length > 0;
    
    let renderContent = cert.content;
    
    if (hasPositions) {
      renderContent = Object.entries(cert.placeholderPositions!).map(([key, pos]) => {
        const val = cert.metadata[key] || '';
        return `<div style="position: absolute; left: ${pos.x}%; top: ${pos.y}%; transform: translate(-50%, -50%); font-weight: bold; font-family: sans-serif; font-size: 14pt;">${val}</div>`;
      }).join('');
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Certificate - ${cert.certificateNumber}</title>
          <style>
            @page {
              size: ${paperSize} ${isA5 ? 'landscape' : 'portrait'};
              margin: 0;
            }
            body { 
              margin: 0; 
              padding: 0; 
              -webkit-print-color-adjust: exact;
            }
            .certificate-container { 
              width: ${width}; 
              height: ${height}; 
              padding: 40px; 
              text-align: center; 
              font-family: serif; 
              position: relative;
              box-sizing: border-box;
              ${backgroundStyle}
              display: flex;
              flex-direction: column;
              justify-content: ${hasPositions ? 'flex-start' : 'center'};
            }
            .content-wrapper {
              position: relative;
              z-index: 10;
              height: 100%;
              width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="certificate-container">
            <div class="content-wrapper">
              ${renderContent}
            </div>
          </div>
          <script>
            window.onload = () => {
              // Delay to ensure images/fonts are loaded
              setTimeout(() => {
                window.print();
                // window.close();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-sidebar">Certificate Management</h1>
          <p className="text-neutral-500 font-medium tracking-tight">Issue TC, Study, and Bonafide certificates with custom templates.</p>
        </div>
        <div className="flex bg-white p-2 rounded-[24px] border border-neutral-200 shadow-sm shadow-neutral-100">
          {[
            { id: 'issue', icon: GraduationCap, label: 'Issue New', show: canManage },
            { id: 'history', icon: FileText, label: 'Issue History', show: canView },
            { id: 'templates', icon: Upload, label: 'Templates', show: canManage },
          ].filter(t => t.show).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all ${
                activeTab === tab.id 
                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                : 'text-neutral-400 hover:text-sidebar'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'issue' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white p-8 rounded-[40px] border border-neutral-200 shadow-xl shadow-neutral-100 space-y-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-black text-sidebar">Find Student</h3>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input 
                  type="text" 
                  placeholder="Search by name or roll number..." 
                  className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {students
                .filter(s => 
                  (String(s.name || "")).toLowerCase().includes(searchTerm.toLowerCase()) || 
                  (String(s.rollNumber || "")).toLowerCase().includes(searchTerm.toLowerCase())
                )
                .slice(0, 4)
                .map(student => (
                  <button 
                    key={student.uid}
                    onClick={() => {
                      setSelectedStudent(student);
                      setSearchTerm(student.name);
                    }}
                    className={`p-4 rounded-3xl border text-left transition-all flex items-center gap-4 ${
                      selectedStudent?.uid === student.uid 
                      ? 'bg-primary/5 border-primary ring-2 ring-primary/20' 
                      : 'bg-white border-neutral-100 hover:border-neutral-200'
                    }`}
                  >
                    <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center text-primary font-black uppercase">
                       {(String(student.name || "")).charAt(0)}
                    </div>
                    <div>
                      <p className={`font-black leading-tight ${(String(student.gender || "")).toLowerCase() === 'female' ? 'text-blue-600' : 'text-sidebar'}`}>{student.name}</p>
                      <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">Roll No: {student.rollNumber}</p>
                    </div>
                  </button>
                ))}
            </div>

            {selectedStudent && (
              <div className="pt-8 border-t border-neutral-100 space-y-6 animate-in slide-in-from-top duration-300">
                <h3 className="text-2xl font-black text-sidebar">Select Template</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {templates.map(tmp => (
                    <button 
                      key={tmp.id}
                      onClick={() => {
                        setSelectedTemplate(tmp);
                        const initialData: Record<string, any> = {};
                        
                        // Default mapping for common placeholders
                        const mapping: Record<string, any> = {
                          studentName: selectedStudent.name,
                          fatherName: selectedStudent.fatherName || selectedStudent.parentName,
                          motherName: selectedStudent.motherName || '',
                          rollNumber: selectedStudent.rollNumber,
                          class: selectedStudent.classId,
                          academicYear: settings.currentAcademicYear || '2024-2025',
                          date: new Date().toLocaleDateString(),
                          admissionNumber: selectedStudent.admissionNumber || selectedStudent.uid.slice(0, 8).toUpperCase(),
                          dateOfBirth: selectedStudent.dateOfBirth || '',
                          schoolName: settings.schoolName || 'Our Academy',
                          schoolAddress: settings.address || '',
                          dropDate: selectedStudent.dropDate || new Date().toLocaleDateString(),
                          tcNumber: `TC-${Date.now().toString().slice(-6)}`
                        };

                        // Only include placeholders that exist in the template
                        tmp.placeholders?.forEach(p => {
                          initialData[p] = mapping[p] || '';
                        });

                        setIssueData(initialData);
                        setShowIssueModal(true);
                      }}
                      className="p-6 bg-neutral-50 rounded-[32px] border border-neutral-100 hover:border-primary/30 transition-all text-center space-y-2 group"
                    >
                      <FileText className="w-10 h-10 text-primary mx-auto group-hover:scale-110 transition-transform" />
                      <p className="font-black text-sidebar">{tmp.name}</p>
                      <span className="inline-block px-3 py-1 bg-white rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-400 border border-neutral-100">
                        {tmp.type}
                      </span>
                    </button>
                  ))}
                  {templates.length === 0 && (
                     <div className="col-span-full py-12 text-center bg-neutral-50 rounded-[40px] border border-dashed border-neutral-200">
                        <AlertCircle className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                        <p className="text-neutral-500 font-medium">No templates found. Create one in the Templates tab.</p>
                     </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-sidebar">Certificate Templates</h3>
            {canManage && (
              <div className="flex gap-4">
                <button 
                  onClick={loadDefaultTemplates}
                  className="px-6 py-3 border-2 border-primary/20 text-primary rounded-2xl font-black flex items-center gap-2 hover:bg-primary/5 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Load Defaults
                </button>
                <button 
                  onClick={() => {
                    setNewTemplate({
                      name: '',
                      type: 'Bonafide',
                      content: '',
                      placeholders: ['studentName', 'fatherName', 'motherName', 'class', 'rollNumber', 'academicYear', 'date']
                    });
                    setShowTemplateModal(true);
                  }}
                  className="bg-primary text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-sidebar transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Add Template
                </button>
              </div>
            )}
          </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(tmp => (
              <div key={tmp.id} className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all group relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div className="p-4 bg-primary/10 text-primary rounded-3xl group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    {canManage && (
                      <>
                        <button 
                          onClick={() => {
                            setNewTemplate(tmp);
                            setShowTemplateModal(true);
                          }}
                          className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-400 hover:text-primary transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setShowConfirmDelete(tmp.id)}
                          className="p-2 hover:bg-red-50 rounded-xl text-neutral-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <h4 className="text-xl font-black text-sidebar mb-2">{tmp.name}</h4>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-3 py-1 bg-neutral-100 rounded-full text-[10px] font-black uppercase text-neutral-500">{tmp.type}</span>
                  {tmp.paperSize && <span className="px-3 py-1 bg-primary/5 rounded-full text-[10px] font-black uppercase text-primary">{tmp.paperSize}</span>}
                </div>
                <p className="text-xs text-neutral-400 font-medium">Last updated: {new Date(tmp.updatedAt).toLocaleDateString()}</p>

                {/* Inline Confirmation Card */}
                <AnimatePresence>
                  {showConfirmDelete === tmp.id && (
                    <motion.div 
                      initial={{ opacity: 0, y: 100 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 100 }}
                      className="absolute inset-0 bg-white/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center"
                    >
                      <div className="w-12 h-12 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center mb-4">
                        <Trash2 className="w-6 h-6" />
                      </div>
                      <p className="font-black text-sidebar mb-2">Delete Template?</p>
                      <p className="text-xs text-neutral-400 font-bold mb-6 italic leading-relaxed">
                        Are you sure you want to delete "{tmp.name}"? This action cannot be undone.
                      </p>
                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={() => setShowConfirmDelete(null)}
                          className="flex-1 py-3 bg-neutral-100 text-neutral-600 rounded-xl text-xs font-black hover:bg-neutral-200 transition-all"
                        >Cancel</button>
                        <button 
                          onClick={() => deleteTemplate(tmp.id)}
                          disabled={isDeleting === tmp.id}
                          className="flex-1 py-3 bg-red-500 text-white rounded-xl text-xs font-black hover:bg-red-600 transition-all shadow-lg shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isDeleting === tmp.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : 'Delete'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-[40px] border border-neutral-200 overflow-hidden">
          <div className="p-8 border-b border-neutral-100 flex justify-between items-center">
            <h3 className="text-2xl font-black text-sidebar">Issued Certificates</h3>
            <div className="relative w-64 text-xs">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
               <input 
                type="text" 
                placeholder="Search history..." 
                className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-100 rounded-xl outline-none"
               />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100">
                  <th className="px-8 py-4">Certificate #</th>
                  <th className="px-8 py-4">Student</th>
                  <th className="px-8 py-4">Type</th>
                  <th className="px-8 py-4">Issued On</th>
                  <th className="px-8 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {issuedCertificates.map(cert => {
                  const student = students.find(s => s.uid === cert.studentId);
                  return (
                    <tr key={cert.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-8 py-6 font-black text-xs text-sidebar">{cert.certificateNumber}</td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-primary font-bold text-xs uppercase">
                              {(String(student?.name || "")).charAt(0).toUpperCase() || '?'}
                           </div>
                           <span className={`font-bold ${student?.gender?.toLowerCase() === 'female' ? 'text-blue-600' : 'text-neutral-700'}`}>{student?.name || 'Unknown Student'}</span>
                        </div>
                      </td>
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                        cert.type === 'TC' ? 'bg-red-50 text-red-600' :
                        cert.type === 'Study' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {cert.type}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-xs font-medium text-neutral-500">
                      {new Date(cert.issuedDate).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => printCertificate(cert)}
                          className="p-3 bg-neutral-100 rounded-xl text-neutral-500 hover:bg-primary hover:text-white transition-all shadow-sm"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button className="p-3 bg-neutral-100 rounded-xl text-neutral-500 hover:bg-neutral-200 transition-all shadow-sm">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sidebar/80 backdrop-blur-sm" onClick={() => setShowTemplateModal(false)} />
          <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
            <header className="p-8 border-b border-neutral-100 flex justify-between items-center">
              <h3 className="text-2xl font-black text-sidebar">
                {newTemplate.id ? 'Edit Template' : 'Create Certificate Template'}
              </h3>
              <button 
                onClick={() => setShowTemplateModal(false)} 
                className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </header>
            
            <form onSubmit={handleSaveTemplate} className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest">Template Name</label>
                  <input 
                    required
                    type="text" 
                    className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl font-bold"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                    placeholder="e.g., Official Bonafide Certificate"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest">Certificate Type</label>
                  <select 
                    className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl font-bold"
                    value={newTemplate.type}
                    onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value as any})}
                  >
                    <option value="Bonafide">Bonafide Certificate</option>
                    <option value="Study">Study Certificate</option>
                    <option value="TC">Transfer Certificate (TC)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest">Paper Size</label>
                  <select 
                    className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl font-bold"
                    value={newTemplate.paperSize || 'A4'}
                    onChange={(e) => setNewTemplate({...newTemplate, paperSize: e.target.value as any})}
                  >
                    <option value="A4">A4 (Portrait)</option>
                    <option value="A5">A5 (Landscape)</option>
                  </select>
                </div>
              </div>

              <div className="flex bg-neutral-100 p-1.5 rounded-2xl w-fit">
                <button 
                  type="button"
                  onClick={() => setEditorMode('visual')}
                  className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${editorMode === 'visual' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}
                >Visual Designer</button>
                <button 
                  type="button"
                  onClick={() => setEditorMode('html')}
                  className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${editorMode === 'html' ? 'bg-white text-primary shadow-sm' : 'text-neutral-400'}`}
                >HTML Editor</button>
              </div>

              {editorMode === 'visual' ? (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-8">
                     {/* Placeholder Palette */}
                     <div className="w-full md:w-64 space-y-4">
                        <div className="p-6 bg-neutral-50 rounded-[32px] border border-neutral-100">
                          <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Available Fields</h4>
                          <div className="flex flex-wrap gap-2">
                             {['studentName', 'fatherName', 'motherName', 'class', 'rollNumber', 'academicYear', 'date', 'admissionNumber', 'dateOfBirth', 'schoolName', 'schoolAddress', 'dropDate', 'tcNumber'].map(p => (
                               <button 
                                 key={p}
                                 type="button"
                                 onClick={() => {
                                   const current = newTemplate.placeholders || [];
                                   if (!current.includes(p)) {
                                     setNewTemplate({
                                       ...newTemplate, 
                                       placeholders: [...current, p],
                                       placeholderPositions: {
                                         ...(newTemplate.placeholderPositions || {}),
                                         [p]: { x: 50, y: 50 } 
                                       }
                                     });
                                   }
                                 }}
                                 className="px-3 py-2 bg-white border border-neutral-100 text-neutral-600 rounded-xl text-[10px] font-black uppercase hover:border-primary hover:text-primary transition-all shadow-sm"
                               >
                                 + {p}
                               </button>
                             ))}
                          </div>
                        </div>

                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                           <p className="text-[10px] text-primary font-bold">Tip: Drag the labels on the right to position them exactly. Click X to remove.</p>
                        </div>

                        <div className="space-y-3">
                          <label className="text-xs font-black text-neutral-400 uppercase tracking-widest">Background</label>
                          <label className={`cursor-pointer w-full py-3 bg-white border-2 border-dashed border-neutral-200 text-neutral-400 text-[10px] font-black rounded-2xl hover:border-primary hover:text-primary transition-all flex flex-col items-center justify-center gap-1 ${isUploading ? 'opacity-50' : ''}`}>
                            <Upload className="w-4 h-4" />
                            {isUploading ? 'Uploading...' : 'Upload Scan'}
                            <input type="file" className="hidden" accept="image/*" onChange={handleUploadBackground} />
                          </label>
                          {newTemplate.backgroundURL && (
                            <button 
                              type="button"
                              onClick={() => setNewTemplate(prev => ({ ...prev, backgroundURL: '' }))}
                              className="w-full py-2 text-[10px] font-black text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >Remove Image</button>
                          )}
                        </div>
                     </div>

                     {/* Designer Canvas */}
                      <div className="flex-1 min-w-[500px]">
                         <CertificateFlowDesigner template={newTemplate} onChange={setNewTemplate} />
                      </div>
                     </div>
                  </div>
               ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest">Certificate Background (Optional Image Template)</label>
                    <div className="flex items-center gap-6 p-6 bg-neutral-50 border border-neutral-100 rounded-[32px]">
                       <div className="w-32 h-32 bg-white rounded-2xl border-2 border-dashed border-neutral-200 flex items-center justify-center overflow-hidden shrink-0">
                          {newTemplate.backgroundURL ? (
                            <img src={newTemplate.backgroundURL} alt="Background" className="w-full h-full object-cover" />
                          ) : (
                            <Upload className="w-8 h-8 text-neutral-300" />
                          )}
                       </div>
                       <div className="space-y-2">
                          <p className="font-black text-sidebar">Upload Certificate Frame</p>
                          <p className="text-xs text-neutral-400 font-medium leading-relaxed max-w-xs">
                            Upload a scan or design of your school's official certificate. 
                            You can then overlay text on top of this image.
                          </p>
                          <div className="flex gap-2">
                            <label className={`cursor-pointer px-4 py-2 bg-primary text-white text-xs font-black rounded-xl hover:bg-sidebar transition-all flex items-center gap-2 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                              <Upload className="w-4 h-4" />
                              {isUploading ? 'Uploading...' : (newTemplate.backgroundURL ? 'Change Image' : 'Upload Image')}
                              <input type="file" className="hidden" accept="image/*" onChange={handleUploadBackground} />
                            </label>
                            {newTemplate.backgroundURL && (
                              <button 
                                type="button"
                                onClick={() => setNewTemplate(prev => ({ ...prev, backgroundURL: '' }))}
                                className="px-4 py-2 bg-red-50 text-red-500 text-xs font-black rounded-xl hover:bg-red-100 transition-all border border-red-100"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-black text-neutral-400 uppercase tracking-widest">Certificate Content (HTML)</label>
                      <div className="text-[10px] text-neutral-400 font-bold bg-neutral-50 px-3 py-1 rounded-full border border-neutral-100">
                        Use placeholders like &#x7B;&#x7B;studentName&#x7D;&#x7D;
                      </div>
                    </div>
                    <textarea 
                      required
                      rows={12}
                      className="w-full p-6 bg-neutral-900 text-green-400 font-mono text-sm rounded-[32px] outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                      value={newTemplate.content}
                      onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
                      placeholder='<div class="header">To Whom It May Concern</div>\n<div class="body">This is to certify that {{studentName}}, son of {{fatherName}}...</div>'
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest">Available Placeholders (Comma separated)</label>
                    <input 
                      type="text" 
                      className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl font-bold text-sm"
                      value={newTemplate.placeholders?.join(', ')}
                      onChange={(e) => {
                        const list = e.target.value.split(',').map(s => s.trim()).filter(s => s !== '');
                        setNewTemplate({...newTemplate, placeholders: list});
                      }}
                      placeholder="studentName, fatherName, class, date"
                    />
                    <div className="flex flex-wrap gap-2 pt-2">
                      {['studentName', 'fatherName', 'motherName', 'class', 'rollNumber', 'academicYear', 'date', 'admissionNumber', 'busNumber', 'concession', 'dateOfBirth', 'schoolName', 'schoolAddress', 'dropDate', 'tcNumber'].map(p => (
                        <button 
                          key={p} 
                          type="button"
                          onClick={() => {
                            const current = newTemplate.placeholders || [];
                            if (!current.includes(p)) {
                              setNewTemplate({...newTemplate, placeholders: [...current, p]});
                            }
                          }}
                          className="px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          + {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </form>

            <footer className="p-8 border-t border-neutral-100 flex gap-4">
              <button 
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="flex-1 py-4 font-black text-neutral-400 hover:bg-neutral-100 rounded-2xl transition-colors"
              >
                Discard Changes
              </button>
              <button 
                onClick={handleSaveTemplate}
                className="flex-[2] bg-primary text-white py-4 font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-sidebar transition-all flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save Template
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Issue Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sidebar/80 backdrop-blur-sm" onClick={() => setShowIssueModal(false)} />
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
            <header className="p-8 border-b border-neutral-100 flex justify-between items-center bg-primary text-white">
              <div className="space-y-1">
                <h3 className="text-2xl font-black">Issue {selectedTemplate?.name}</h3>
                <p className="text-primary-foreground/70 text-xs font-bold uppercase tracking-widest">For: {selectedStudent?.name}</p>
              </div>
              <button 
                onClick={() => setShowIssueModal(false)} 
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </header>
            
            <form onSubmit={handleIssueCertificate} className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.keys(issueData).map(key => (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1')}</label>
                    <input 
                      type="text" 
                      className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl font-bold text-sm"
                      value={issueData[key]}
                      onChange={(e) => setIssueData({...issueData, [key]: e.target.value})}
                    />
                  </div>
                ))}
              </div>
              
              <div className="p-6 bg-red-50 rounded-3xl border border-red-100 space-y-2">
                 <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                    <AlertCircle className="w-4 h-4" />
                    Review Information
                 </div>
                 <p className="text-xs text-red-400 font-medium leading-relaxed">
                   Once issued, this certificate will be permanently logged in the history. Please ensure all student details are correct before proceeding.
                 </p>
              </div>
            </form>

            <footer className="p-8 border-t border-neutral-100 flex gap-4">
              <button 
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="flex-1 py-4 font-black text-neutral-400 hover:bg-neutral-100 rounded-2xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleIssueCertificate}
                className="flex-[2] bg-primary text-white py-4 font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-sidebar transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Generate & Issue
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Certificates;
