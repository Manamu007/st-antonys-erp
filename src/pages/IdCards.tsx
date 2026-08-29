import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Users, 
  UserSquare2, 
  Search, 
  Download, 
  Printer, 
  Settings, 
  Image as ImageIcon, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  ChevronDown, 
  Lock, 
  X,
  Eye,
  EyeOff,
  RotateCcw,
  Palette,
  Type,
  FileImage,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Save
} from 'lucide-react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// --- CUSTOM HIGH FIDELITY NODES FOR THE DESIGNER CANVAS ---

interface ResizeHandleProps {
  width: number;
  height: number;
  onResize: (newWidth: number, newHeight: number) => void;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ width, height, onResize }) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newWidth = Math.max(40, startWidth + deltaX);
      const newHeight = Math.max(20, startHeight + deltaY);
      onResize(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      onMouseDown={handleMouseDown}
      className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-indigo-500 hover:bg-indigo-600 rounded-tl-md flex items-center justify-center cursor-se-resize z-50 shadow-sm nodrag pointer-events-auto"
      title="Drag to resize text box"
    >
      <svg width="6" height="6" viewBox="0 0 6 6" fill="none" className="text-white">
        <path d="M6 0L0 6M6 3L3 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    </div>
  );
};

interface AlignmentToolbarProps {
  alignment: 'left' | 'center' | 'right';
  onAlign: (align: 'left' | 'center' | 'right') => void;
}

const AlignmentToolbar: React.FC<AlignmentToolbarProps> = ({ alignment, onAlign }) => {
  return (
    <div 
      className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border border-neutral-200 rounded-lg shadow-lg p-1 z-[100] nodrag pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onAlign('left')}
        className={`p-1 rounded hover:bg-neutral-100 text-[10px] transition-colors ${alignment === 'left' ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-neutral-500'}`}
        title="Align Left"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onAlign('center')}
        className={`p-1 rounded hover:bg-neutral-100 text-[10px] transition-colors ${alignment === 'center' ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-neutral-500'}`}
        title="Align Center"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onAlign('right')}
        className={`p-1 rounded hover:bg-neutral-100 text-[10px] transition-colors ${alignment === 'right' ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-neutral-500'}`}
        title="Align Right"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

const PhotoNode: React.FC<any> = ({ data }) => {
  return (
    <div 
      className="bg-neutral-50 rounded-lg overflow-hidden border-[2px] border-dashed border-indigo-500 hover:border-indigo-600 transition-colors shadow-md flex flex-col items-center justify-center p-1 cursor-move relative group"
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
      }}
    >
      <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-50/50 border border-dashed border-indigo-200 rounded-md p-1 text-center">
        <UserSquare2 className="w-5 h-5 text-indigo-500 mb-0.5" />
        <span className="font-extrabold uppercase tracking-wider text-[6px] text-indigo-600">PHOTO BOX</span>
      </div>
      <ResizeHandle width={data.width} height={data.height} onResize={data.onResize} />
    </div>
  );
};

const NameNode: React.FC<any> = ({ data }) => {
  const alignClass = data.alignment === 'left' ? 'text-left' : data.alignment === 'right' ? 'text-right' : 'text-center';
  return (
    <div 
      className="px-2 py-1 bg-white/95 backdrop-blur-sm border-[2px] border-dashed border-indigo-500 hover:border-indigo-600 rounded-md shadow-md flex flex-col justify-center relative cursor-move group"
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
      }}
    >
      <AlignmentToolbar alignment={data.alignment || 'center'} onAlign={data.onAlign} />
      <h3 className={`font-black text-neutral-900 uppercase leading-none truncate text-[10px] tracking-tight w-full ${alignClass}`}>
        JOHN DOE
      </h3>
      <span className={`text-[5px] font-bold uppercase tracking-widest text-indigo-500 block mt-0.5 w-full ${alignClass}`}>STUDENT NAME</span>
      <ResizeHandle width={data.width} height={data.height} onResize={data.onResize} />
    </div>
  );
};

const IdCodeNode: React.FC<any> = ({ data }) => {
  const alignClass = data.alignment === 'left' ? 'text-left' : data.alignment === 'right' ? 'text-right' : 'text-center';
  const justifyClass = data.alignment === 'left' ? 'justify-start' : data.alignment === 'right' ? 'justify-end' : 'justify-center';
  return (
    <div 
      className={`bg-neutral-900 text-white border-[2px] border-dashed border-indigo-400 px-2.5 py-1 rounded-full shadow-md flex items-center w-full relative cursor-move group ${justifyClass}`}
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
      }}
    >
      <AlignmentToolbar alignment={data.alignment || 'center'} onAlign={data.onAlign} />
      <div className={`flex items-center gap-1 truncate ${alignClass}`}>
        <span className="font-bold tracking-wider text-[8px]">ID: STD-102</span>
        <span className="text-[5px] text-indigo-400 uppercase font-black">BADGE</span>
      </div>
      <ResizeHandle width={data.width} height={data.height} onResize={data.onResize} />
    </div>
  );
};

const ClassRoleNode: React.FC<any> = ({ data }) => {
  const alignClass = data.alignment === 'left' ? 'text-left' : data.alignment === 'right' ? 'text-right' : 'text-center';
  return (
    <div 
      className="bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg border-[2px] border-dashed border-indigo-400 shadow-md flex flex-col justify-center relative cursor-move group"
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
      }}
    >
      <AlignmentToolbar alignment={data.alignment || 'center'} onAlign={data.onAlign} />
      <p className={`font-extrabold uppercase tracking-wider leading-none text-indigo-600 mb-0.5 text-[5px] w-full ${alignClass}`}>
        CLASS / ROLE
      </p>
      <p className={`font-bold text-neutral-800 text-[8px] leading-tight w-full ${alignClass}`}>
        Grade 10-A
      </p>
      <ResizeHandle width={data.width} height={data.height} onResize={data.onResize} />
    </div>
  );
};

const DobPhoneNode: React.FC<any> = ({ data }) => {
  const alignClass = data.alignment === 'left' ? 'text-left' : data.alignment === 'right' ? 'text-right' : 'text-center';
  return (
    <div 
      className="bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg border-[2px] border-dashed border-indigo-400 shadow-md flex flex-col justify-center relative cursor-move group"
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
      }}
    >
      <AlignmentToolbar alignment={data.alignment || 'center'} onAlign={data.onAlign} />
      <p className={`font-extrabold uppercase tracking-wider leading-none text-indigo-600 mb-0.5 text-[5px] w-full ${alignClass}`}>
        DOB / PHONE
      </p>
      <p className={`font-bold text-neutral-800 text-[8px] leading-tight w-full ${alignClass}`}>
        12-05-2010
      </p>
      <ResizeHandle width={data.width} height={data.height} onResize={data.onResize} />
    </div>
  );
};

const QrCodeNode: React.FC<any> = ({ data }) => {
  return (
    <div 
      className="bg-white/95 backdrop-blur-sm p-1 rounded-lg border-[2px] border-dashed border-indigo-500 hover:border-indigo-600 rounded-md shadow-md flex flex-col items-center justify-center cursor-move relative group"
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
      }}
    >
      <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-50/50 border border-dashed border-indigo-200 rounded-md p-1 text-center">
        <span className="font-extrabold uppercase tracking-wider text-[6px] text-indigo-600">OUTING QR</span>
        <div className="w-6 h-6 bg-indigo-200 rounded mt-1 opacity-60 flex items-center justify-center">
          <span className="text-[8px] font-black text-indigo-700">QR</span>
        </div>
      </div>
      <ResizeHandle width={data.width} height={data.height} onResize={data.onResize} />
    </div>
  );
};

const nodeTypes = {
  photo: PhotoNode,
  name: NameNode,
  idCode: IdCodeNode,
  classRole: ClassRoleNode,
  dobPhone: DobPhoneNode,
  outingQr: QrCodeNode,
};

interface IDCardFlowDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: any;
  onChange: (updated: any) => void;
}

const IDCardFlowDesignerModal: React.FC<IDCardFlowDesignerModalProps> = ({ isOpen, onClose, template, onChange }) => {
  if (!isOpen) return null;

  const [selectedFieldToTune, setSelectedFieldToTune] = useState<string>('name');

  const isPortrait = template.orientation === 'portrait';
  const canvasWidth = isPortrait ? 280 : 420;
  const canvasHeight = isPortrait ? 420 : 280;

  const fields = [
    { key: 'photo', label: 'Photo Box' },
    { key: 'name', label: 'Name Field' },
    { key: 'idCode', label: 'ID Code Field' },
    { key: 'classRole', label: 'Class / Role' },
    { key: 'dobPhone', label: 'DOB / Phone' },
    { key: 'outingQr', label: 'Outing QR Code' }
  ];

  const defaultPositions = isPortrait ? {
    photo: { x: 50, y: 35 },
    name: { x: 50, y: 55 },
    idCode: { x: 50, y: 65 },
    classRole: { x: 50, y: 73 },
    dobPhone: { x: 50, y: 81 },
    outingQr: { x: 50, y: 92 }
  } : {
    photo: { x: 25, y: 50 },
    name: { x: 65, y: 32 },
    idCode: { x: 65, y: 45 },
    classRole: { x: 65, y: 58 },
    dobPhone: { x: 65, y: 72 },
    outingQr: { x: 88, y: 80 }
  };

  const defaultSizes = isPortrait ? {
    photo: { width: 90, height: 120 },
    name: { width: 180, height: 35 },
    idCode: { width: 110, height: 28 },
    classRole: { width: 110, height: 42 },
    dobPhone: { width: 110, height: 42 },
    outingQr: { width: 50, height: 50 }
  } : {
    photo: { width: 85, height: 113 },
    name: { width: 180, height: 35 },
    idCode: { width: 110, height: 28 },
    classRole: { width: 110, height: 42 },
    dobPhone: { width: 110, height: 42 },
    outingQr: { width: 50, height: 50 }
  };

  const defaultAlignments: Record<string, 'left' | 'center' | 'right'> = {
    photo: 'center',
    name: 'center',
    idCode: 'center',
    classRole: 'center',
    dobPhone: 'center',
    outingQr: 'center'
  };

  const currentPositions = template.placeholderPositions || defaultPositions;
  const currentSizes = template.placeholderSizes || defaultSizes;
  const currentAlignments = template.fieldAlignments || defaultAlignments;
  const visibleFields = template.visibleFields || ['photo', 'name', 'idCode', 'classRole', 'dobPhone', 'outingQr'];

  const handleResize = (key: string, newWidth: number, newHeight: number) => {
    onChange({
      ...template,
      placeholderSizes: {
        ...currentSizes,
        [key]: { width: Math.round(newWidth), height: Math.round(newHeight) }
      }
    });
  };

  const handleAlign = (key: string, newAlign: 'left' | 'center' | 'right') => {
    onChange({
      ...template,
      fieldAlignments: {
        ...currentAlignments,
        [key]: newAlign
      }
    });
  };

  const nodes: Node[] = fields
    .filter(f => visibleFields.includes(f.key))
    .map(f => {
      const pos = currentPositions[f.key] || (defaultPositions as any)[f.key];
      const size = currentSizes[f.key] || (defaultSizes as any)[f.key];
      const alignment = currentAlignments[f.key] || 'center';
      return {
        id: f.key,
        type: f.key,
        position: {
          x: (pos.x / 100) * canvasWidth - (size.width / 2),
          y: (pos.y / 100) * canvasHeight - (size.height / 2)
        },
        data: {
          isPortrait,
          schoolName: template.schoolName,
          width: size.width,
          height: size.height,
          alignment,
          onResize: (w: number, h: number) => handleResize(f.key, w, h),
          onAlign: (align: 'left' | 'center' | 'right') => handleAlign(f.key, align)
        }
      };
    });

  const onNodesChange = (changes: any) => {
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        const key = change.id;
        const size = currentSizes[key] || (defaultSizes as any)[key];
        
        // Convert top-left dragged position back to center coordinate
        const centerX = change.position.x + (size.width / 2);
        const centerY = change.position.y + (size.height / 2);

        // Convert center coordinate to percentage
        let xPercent = (centerX / canvasWidth) * 100;
        let yPercent = (centerY / canvasHeight) * 100;

        // Bound positions between 0% and 100%
        xPercent = Math.max(0, Math.min(100, xPercent));
        yPercent = Math.max(0, Math.min(100, yPercent));

        onChange({
          ...template,
          placeholderPositions: {
            ...currentPositions,
            [key]: {
              x: Number(xPercent.toFixed(1)),
              y: Number(yPercent.toFixed(1))
            }
          }
        });
      }
    });
  };

  const toggleFieldVisibility = (key: string) => {
    let newVisible = [...visibleFields];
    if (newVisible.includes(key)) {
      newVisible = newVisible.filter(item => item !== key);
    } else {
      newVisible.push(key);
    }
    onChange({
      ...template,
      visibleFields: newVisible
    });
  };

  const handleDesignerFrontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.loading("Uploading background scan...", { id: 'designer-upload' });
      const url = await uploadService.uploadFile(file);
      onChange({
        ...template,
        backgroundImageUrlFront: url
      });
      toast.success("Front background updated", { id: 'designer-upload' });
    } catch (err: any) {
      toast.error(err.message || 'Upload failed', { id: 'designer-upload' });
    }
  };

  const THEME_PRESETS = [
    { name: 'Navy', theme: '#1e3a8a', text: '#ffffff' },
    { name: 'Maroon', theme: '#7c2d12', text: '#fefce8' },
    { name: 'Emerald', theme: '#064e3b', text: '#ecfdf5' },
    { name: 'Indigo', theme: '#4f46e5', text: '#ffffff' },
    { name: 'Charcoal', theme: '#171717', text: '#f5f5f5' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sidebar/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        <header className="p-6 border-b border-neutral-100 flex justify-between items-center bg-white">
          <div>
            <h3 className="text-2xl font-black text-sidebar flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-500 animate-pulse" />
              Advanced ID Card Builder
            </h3>
            <p className="text-xs text-neutral-400 mt-1 font-bold uppercase tracking-wider">Drag fields on the canvas & adjust all design options instantly</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-400 hover:text-red-500 transition-all cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* 2-Column Dashboard Layout */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-neutral-50/50">
          
          {/* LEFT: Live Interactive Drag & Drop Workspace */}
          <div className="flex-1 p-6 flex flex-col items-center justify-center border-r border-neutral-100 relative">
            <div className="absolute top-4 left-6 text-[10px] font-black uppercase tracking-widest text-neutral-400 bg-white/80 px-3 py-1.5 rounded-full border border-neutral-100 shadow-sm">
              Live Interactive Studio Area
            </div>

            <div 
              className="bg-neutral-200 p-6 rounded-[32px] flex justify-center items-center overflow-hidden border border-neutral-300 shadow-inner w-full max-w-[500px]"
              style={{ height: '460px' }}
            >
              <div 
                className="bg-white shadow-2xl relative border border-neutral-300 rounded-2xl overflow-hidden transition-all duration-300"
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
                    backgroundImage: template.backgroundImageUrlFront ? `url(${template.backgroundImageUrlFront})` : 'none',
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <Background color="#bbb" gap={10} size={1} />
                  
                  {/* Styled Dynamic Header Overlay */}
                  {template.showDefaultHeader !== false && (
                    <div 
                      className="absolute top-0 left-0 right-0 py-2.5 px-2 flex flex-col justify-center items-center shadow-sm pointer-events-none z-10"
                      style={{ backgroundColor: template.themeColor || '#4f46e5', height: isPortrait ? '22%' : '20%' }}
                    >
                      <div className="font-black text-center uppercase tracking-wider text-[8.5px] truncate max-w-full" style={{ color: template.fontColor || '#ffffff', fontFamily: template.fontFamily }}>
                        {template.schoolName || 'SCHOOL NAME'}
                      </div>
                    </div>
                  )}
                </ReactFlow>
              </div>
            </div>

            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-3">
              ★ Fields are absolute responsive percentages of the physical card sizes
            </p>
          </div>

          {/* RIGHT: Layout & Field Customization Sidebar */}
          <div className="w-full md:w-[400px] p-6 overflow-y-auto bg-white border-l border-neutral-100 space-y-6">
            
            {/* 1. Profile & School Identity */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-1.5">
                <Type className="w-4 h-4 text-neutral-400" />
                School Identity
              </h4>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-neutral-400 uppercase">School Title on Card Header</label>
                <input 
                  type="text"
                  value={template.schoolName || ''}
                  onChange={e => onChange({ ...template, schoolName: e.target.value })}
                  placeholder="Enter School Name..."
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/10 focus:border-primary focus:bg-white outline-none transition-all"
                />
              </div>
            </div>

            {/* 2. Orientation & Geometry */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider">Card Orientation</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...template, orientation: 'portrait' })}
                  className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all uppercase tracking-wider ${isPortrait ? 'bg-primary border-primary text-white shadow-md shadow-primary/10' : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}
                >
                  Portrait
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...template, orientation: 'landscape' })}
                  className={`py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all uppercase tracking-wider ${!isPortrait ? 'bg-primary border-primary text-white shadow-md shadow-primary/10' : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}
                >
                  Landscape
                </button>
              </div>
            </div>

            {/* 3. Toggles for Fields */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-neutral-400" />
                Active Layout Fields
              </h4>
              <div className="space-y-2.5 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/50">
                {fields.map(f => {
                  const isVisible = visibleFields.includes(f.key);
                  return (
                    <label key={f.key} className="flex items-center justify-between cursor-pointer select-none">
                      <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">{f.label}</span>
                      <input 
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleFieldVisibility(f.key)}
                        className="rounded border-neutral-300 text-primary focus:ring-primary h-4 w-4"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 3.5 Field Fine-Tuning & Alignment */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-neutral-400" />
                Field Sizing & Alignment
              </h4>
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/50 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase">Select Field to Tune</label>
                  <select
                    className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold"
                    value={selectedFieldToTune}
                    onChange={e => setSelectedFieldToTune(e.target.value)}
                  >
                    {fields.filter(f => visibleFields.includes(f.key)).map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {selectedFieldToTune && visibleFields.includes(selectedFieldToTune) && (
                  <>
                    {/* Width adjustment */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-bold text-neutral-500 uppercase">Width</span>
                        <span className="font-black text-indigo-600">{(currentSizes as any)[selectedFieldToTune]?.width || (defaultSizes as any)[selectedFieldToTune]?.width}px</span>
                      </div>
                      <input
                        type="range"
                        min="40"
                        max="350"
                        value={(currentSizes as any)[selectedFieldToTune]?.width || (defaultSizes as any)[selectedFieldToTune]?.width}
                        onChange={e => handleResize(selectedFieldToTune, parseInt(e.target.value), (currentSizes as any)[selectedFieldToTune]?.height || (defaultSizes as any)[selectedFieldToTune]?.height)}
                        className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Height adjustment */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-bold text-neutral-500 uppercase">Height</span>
                        <span className="font-black text-indigo-600">{(currentSizes as any)[selectedFieldToTune]?.height || (defaultSizes as any)[selectedFieldToTune]?.height}px</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="200"
                        value={(currentSizes as any)[selectedFieldToTune]?.height || (defaultSizes as any)[selectedFieldToTune]?.height}
                        onChange={e => handleResize(selectedFieldToTune, (currentSizes as any)[selectedFieldToTune]?.width || (defaultSizes as any)[selectedFieldToTune]?.width, parseInt(e.target.value))}
                        className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Alignment adjustment */}
                    {selectedFieldToTune !== 'photo' && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Text Alignment</span>
                        <div className="grid grid-cols-3 gap-1">
                          {(['left', 'center', 'right'] as const).map(align => {
                            const isCurrent = ((currentAlignments as any)[selectedFieldToTune] || 'center') === align;
                            return (
                              <button
                                key={align}
                                type="button"
                                onClick={() => handleAlign(selectedFieldToTune, align)}
                                className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                                  isCurrent 
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                                    : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                                }`}
                              >
                                {align}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Template Design Overlays */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-neutral-400" />
                Template Overlays
              </h4>
              <div className="space-y-2.5 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/50">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">Show Default Header</span>
                  <input 
                    type="checkbox"
                    checked={template.showDefaultHeader !== false}
                    onChange={e => onChange({ ...template, showDefaultHeader: e.target.checked })}
                    className="rounded border-neutral-300 text-primary focus:ring-primary h-4 w-4"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">Show Field Boxes</span>
                  <input 
                    type="checkbox"
                    checked={template.showDefaultFieldContainers !== false}
                    onChange={e => onChange({ ...template, showDefaultFieldContainers: e.target.checked })}
                    className="rounded border-neutral-300 text-primary focus:ring-primary h-4 w-4"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">Hide Column Headings</span>
                  <input 
                    type="checkbox"
                    checked={!!template.hideFieldLabels}
                    onChange={e => onChange({ ...template, hideFieldLabels: e.target.checked })}
                    className="rounded border-neutral-300 text-primary focus:ring-primary h-4 w-4"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">Headings on Side</span>
                  <input 
                    type="checkbox"
                    checked={template.labelsOnSide !== false}
                    onChange={e => onChange({ ...template, labelsOnSide: e.target.checked })}
                    className="rounded border-neutral-300 text-primary focus:ring-primary h-4 w-4"
                  />
                </label>
              </div>
            </div>

            {/* 4. Color Palette */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-neutral-400" />
                Color Theme
              </h4>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {THEME_PRESETS.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => onChange({ ...template, themeColor: p.theme, fontColor: p.text })}
                      className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg text-white border transition-all"
                      style={{ backgroundColor: p.theme, borderColor: template.themeColor === p.theme ? '#000' : 'transparent' }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-neutral-400 uppercase">Accent Color</label>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="color"
                        value={template.themeColor || '#4f46e5'}
                        onChange={e => onChange({ ...template, themeColor: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer overflow-hidden border border-neutral-200"
                      />
                      <span className="text-xs font-mono font-bold uppercase">{template.themeColor || '#4F46E5'}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-neutral-400 uppercase">Header Font</label>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="color"
                        value={template.fontColor || '#ffffff'}
                        onChange={e => onChange({ ...template, fontColor: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer overflow-hidden border border-neutral-200"
                      />
                      <span className="text-xs font-mono font-bold uppercase">{template.fontColor || '#FFFFFF'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Typography & Font Size Scaling */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider">Font Family & Size</h4>
              <div className="space-y-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/50">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-neutral-400 uppercase">Font Type</label>
                  <select
                    value={template.fontFamily || 'sans-serif'}
                    onChange={e => onChange({ ...template, fontFamily: e.target.value })}
                    className="w-full bg-white border border-neutral-200 rounded-xl px-2 py-1.5 text-xs font-bold focus:ring-2 focus:ring-primary/10 focus:border-primary"
                  >
                    <option value="sans-serif">Standard Sans-Serif</option>
                    <option value="'Inter', sans-serif">Inter (Modern & Clean)</option>
                    <option value="'JetBrains Mono', monospace">JetBrains Mono (Tech/Mono)</option>
                    <option value="'Playfair Display', serif">Playfair Display (Elegant Serif)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-black text-neutral-400 uppercase">Base Font Size</label>
                    <span className="text-xs font-black text-indigo-600">{template.baseFontSize || 12}px</span>
                  </div>
                  <input 
                    type="range"
                    min="8"
                    max="22"
                    step="0.5"
                    value={template.baseFontSize || 12}
                    onChange={e => onChange({ ...template, baseFontSize: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 6. Background Scan Image */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-black text-sidebar uppercase tracking-wider flex items-center gap-1.5">
                <FileImage className="w-4 h-4 text-neutral-400" />
                Card Background Scan
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 hover:border-indigo-500 rounded-2xl py-3 cursor-pointer hover:bg-indigo-50/20 transition-all">
                    <ImageIcon className="w-5 h-5 text-neutral-400 mb-1" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Upload Front Background</span>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleDesignerFrontUpload}
                      className="hidden" 
                    />
                  </label>
                  {template.backgroundImageUrlFront && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...template, backgroundImageUrlFront: '' })}
                      className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition-colors cursor-pointer"
                      title="Clear Background"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <footer className="p-6 border-t border-neutral-100 flex gap-4 bg-white">
          <button 
            type="button"
            onClick={() => {
              onChange({
                ...template,
                placeholderPositions: defaultPositions,
                visibleFields: ['photo', 'name', 'idCode', 'classRole', 'dobPhone', 'outingQr']
              });
              toast.success('Positions and visibility reset to defaults');
            }}
            className="px-6 py-4 font-black text-neutral-400 hover:bg-neutral-100 rounded-2xl transition-all text-xs uppercase flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Defaults
          </button>
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 bg-primary text-white py-4 font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-sidebar transition-all flex items-center justify-center gap-2 text-xs uppercase"
          >
            Save Layout Settings
          </button>
        </footer>
      </div>
    </div>
  );
};import { dbService } from '../services/dbService';
import { where } from 'firebase/firestore';
import { uploadService } from '../services/uploadService';
import { normalizeUrl } from '../lib/utils';
import { toast } from 'sonner';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';

const PRESET_DESIGNS = [
  {
    id: 'classic_blue',
    name: 'Classic',
    changes: {
      themeColor: '#1e3a8a',
      fontColor: '#ffffff',
      fontFamily: 'Inter, sans-serif'
    }
  },
  {
    id: 'modern_minimal',
    name: 'Modern Mono',
    changes: {
      themeColor: '#171717',
      fontColor: '#f5f5f5',
      fontFamily: "'JetBrains Mono', monospace"
    }
  },
  {
    id: 'elegant_maroon',
    name: 'Elegant',
    changes: {
      themeColor: '#7c2d12',
      fontColor: '#fefce8',
      fontFamily: "'Playfair Display', serif"
    }
  },
  {
    id: 'forest_green',
    name: 'Forest',
    changes: {
      themeColor: '#064e3b',
      fontColor: '#ecfdf5',
      fontFamily: "Inter, sans-serif"
    }
  },
  {
    id: 'vibrant_purple',
    name: 'Vibrant',
    changes: {
      themeColor: '#581c87',
      fontColor: '#f3e8ff',
      fontFamily: "'Space Grotesk', sans-serif"
    }
  }
];

export default function IdCards() {
  const { profile } = useAuth();

  if (profile?.role === 'clerk') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-neutral-100 shadow-sm min-h-[400px]">
        <Lock className="w-12 h-12 text-[#ef4444] mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-sidebar">Access Denied</h2>
        <p className="text-neutral-500 text-center max-w-md mt-2">
          You do not have authorization to view or edit the ID Cards module.
        </p>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'students' | 'staff'>('students');
  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDesignerModal, setShowDesignerModal] = useState(false);
  const [savedDesigns, setSavedDesigns] = useState<any[]>([]);

  const fetchSavedDesigns = async () => {
    try {
      const list = await dbService.list('id_card_designs');
      setSavedDesigns(list);
    } catch (err) {
      console.error("Failed to load saved designs", err);
    }
  };
  
  const [template, setTemplate] = useState({
    orientation: 'portrait' as 'portrait' | 'landscape',
    fontFamily: 'Inter, sans-serif',
    baseFontSize: 14,
    schoolName: "ST. ANTONY'S HIGH SCHOOL",
    address: '123 Education Lane, Learning City, 12345',
    themeColor: '#4f46e5',
    fontColor: '#ffffff',
    backgroundImageUrlFront: '',
    backgroundImageUrlBack: '',
    showBack: true,
    backText: 'If found, please return to St. Antony\'s High School. This card is valid only for the academic year 2024-2025.',
    placeholderPositions: null as any,
    placeholderSizes: null as any,
    fieldAlignments: null as any,
    visibleFields: undefined as string[] | undefined,
    showDefaultHeader: true,
    showDefaultFieldContainers: true,
    hideFieldLabels: false,
    labelsOnSide: true
  });

  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
    fetchSavedDesigns();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsData, staffData, classesData, batchesData] = await Promise.all([
        dbService.list('students'),
        dbService.list('staff'),
        dbService.list('classes'),
        dbService.list('batches'),
      ]);
      setStudents(studentsData);
      setStaff(staffData.filter((u: any) => u.role !== 'student' && u.role !== 'parent'));
      setClasses(classesData);
      setBatches(batchesData);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const currentList = activeTab === 'students' ? students : staff;
  
  const filteredList = currentList.filter(p => {
    if (activeTab === 'students' && selectedClass !== 'all' && p.classId !== selectedClass) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(searchLower)) ||
      (p.email && p.email.toLowerCase().includes(searchLower)) ||
      (p.idCode && p.idCode.toLowerCase().includes(searchLower))
    );
  });

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };
  
  const handleSelectAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(newSet => {
        const next = new Set(newSet);
        filteredList.forEach(p => next.delete(p.uid));
        return next;
      });
    } else {
      setSelectedIds(newSet => {
        const next = new Set(newSet);
        filteredList.forEach(p => next.add(p.uid));
        return next;
      });
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.loading(`Uploading ${side} background...`, { id: 'bg-upload' });
      const url = await uploadService.uploadFile(file);
      if (side === 'front') {
        setTemplate({ 
          ...template, 
          backgroundImageUrlFront: url,
          showDefaultHeader: false,
          showDefaultFieldContainers: false
        });
      } else {
        setTemplate({ ...template, backgroundImageUrlBack: url });
      }
      toast.success(`${side === 'front' ? 'Front' : 'Back'} background installed`, { id: 'bg-upload' });
    } catch (err: any) {
      toast.error(err.message || 'Upload failed', { id: 'bg-upload' });
    }
  };

  const isPortrait = template.orientation === 'portrait';
  // Dimensions for standard CR-80 card. In browser, we render at 96dpi roughly.
  // 3.375in ~ 324px, 2.125in ~ 204px for standard monitor. We'll use absolute CSS 'in'.
  const cardWidth = isPortrait ? '2.125in' : '3.375in';
  const cardHeight = isPortrait ? '3.375in' : '2.125in';

  const handlePrint = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one person to print.");
      return;
    }
    
    // We isolate the print area
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        body * {
          visibility: hidden;
        }
        #print-area, #print-area * {
          visibility: visible;
        }
        #print-area {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          display: block !important;
        }
        .print-page {
          page-break-after: always;
          break-after: page;
        }
        @page {
          size: ${isPortrait ? '2.125in 3.375in' : '3.375in 2.125in'};
          margin: 0;
        }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  const handleDownloadSingleImage = async (person: any) => {
    const el = document.getElementById(`card-front-${person.uid}`);
    if (!el) return;
    setIsProcessing(true);
    toast.loading("Generating image...", { id: 'img-gen' });
    try {
      const captureFilter = (node: any) => {
        if (node.classList && (
          node.classList.contains('nodrag') ||
          node.classList.contains('no-capture') ||
          node.classList.contains('alignment-toolbar') ||
          node.classList.contains('resize-handle')
        )) {
          return false;
        }
        return true;
      };

      const dataUrl = await htmlToImage.toPng(el, { pixelRatio: 3, filter: captureFilter });
      const link = document.createElement('a');
      link.download = `ID_${person.idCode || person.name || 'card'}_front.png`;
      link.href = dataUrl;
      link.click();
      
      if (template.showBack) {
        const elBack = document.getElementById(`card-back-${person.uid}`);
        if (elBack) {
          const dataUrlBack = await htmlToImage.toPng(elBack, { pixelRatio: 3, filter: captureFilter });
          const linkBack = document.createElement('a');
          linkBack.download = `ID_${person.idCode || person.name || 'card'}_back.png`;
          linkBack.href = dataUrlBack;
          setTimeout(() => linkBack.click(), 500); // Slight delay for second download
        }
      }
      toast.success("Image downloaded", { id: 'img-gen' });
    } catch (err) {
      toast.error("Failed to generate image. Try removing external backgrounds if cors issues occur.", { id: 'img-gen' });
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadBatchPdf = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one person.");
      return;
    }
    
    setIsProcessing(true);
    toast.loading("Generating PDF...", { id: 'pdf-gen' });
    try {
      // jsPDF expects dimensions. 'in' corresponds to inches.
      const pdf = new jsPDF({
        orientation: isPortrait ? 'portrait' : 'landscape',
        unit: 'in',
        format: [3.375, 2.125]
      });

      const captureFilter = (node: any) => {
        if (node.classList && (
          node.classList.contains('nodrag') ||
          node.classList.contains('no-capture') ||
          node.classList.contains('alignment-toolbar') ||
          node.classList.contains('resize-handle')
        )) {
          return false;
        }
        return true;
      };

      const ids = Array.from(selectedIds);
      let isFirstPage = true;

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        
        // FRONT
        const elFront = document.getElementById(`card-front-${id}`);
        if (elFront) {
          if (!isFirstPage) pdf.addPage();
          const imgData = await htmlToImage.toJpeg(elFront, { quality: 0.9, pixelRatio: 2, filter: captureFilter });
          pdf.addImage(imgData, 'JPEG', 0, 0, isPortrait ? 2.125 : 3.375, isPortrait ? 3.375 : 2.125);
          isFirstPage = false;
        }

        // BACK
        if (template.showBack) {
          const elBack = document.getElementById(`card-back-${id}`);
          if (elBack) {
            pdf.addPage();
            const imgDataBack = await htmlToImage.toJpeg(elBack, { quality: 0.9, pixelRatio: 2, filter: captureFilter });
            pdf.addImage(imgDataBack, 'JPEG', 0, 0, isPortrait ? 2.125 : 3.375, isPortrait ? 3.375 : 2.125);
          }
        }
      }

      pdf.save(`${activeTab}_ID_Cards_Batch.pdf`);
      toast.success("PDF generated successfully", { id: 'pdf-gen' });
    } catch (err) {
      toast.error("Failed to generate PDF.", { id: 'pdf-gen' });
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderCardFront = (person: any, isInteractive = false) => {
    const className = classes.find(c => c.id === person.classId)?.name || '';
    const isStudent = activeTab === 'students';
    const hasCustomPositions = template.placeholderPositions && Object.keys(template.placeholderPositions).length > 0;
    const personPhoto = person.photoURL || person.photoUrl || person.facePhotoURL || person.facePhotoUrl;

    const designWidth = isPortrait ? 280 : 420;
    const designHeight = isPortrait ? 420 : 280;

    const defaultPositions = isPortrait ? {
      photo: { x: 50, y: 35 },
      name: { x: 50, y: 55 },
      idCode: { x: 50, y: 65 },
      classRole: { x: 50, y: 73 },
      dobPhone: { x: 50, y: 81 },
      outingQr: { x: 50, y: 92 }
    } : {
      photo: { x: 25, y: 50 },
      name: { x: 65, y: 32 },
      idCode: { x: 65, y: 45 },
      classRole: { x: 65, y: 58 },
      dobPhone: { x: 65, y: 72 },
      outingQr: { x: 88, y: 80 }
    };

    const defaultSizes = isPortrait ? {
      photo: { width: 90, height: 120 },
      name: { width: 180, height: 35 },
      idCode: { width: 110, height: 28 },
      classRole: { width: 110, height: 42 },
      dobPhone: { width: 110, height: 42 },
      outingQr: { width: 50, height: 50 }
    } : {
      photo: { width: 85, height: 113 },
      name: { width: 180, height: 35 },
      idCode: { width: 110, height: 28 },
      classRole: { width: 110, height: 42 },
      dobPhone: { width: 110, height: 42 },
      outingQr: { width: 50, height: 50 }
    };

    const getFieldPercentageDimensions = (key: string) => {
      const size = template.placeholderSizes?.[key] || (defaultSizes as any)[key];
      const widthPct = (size.width / designWidth) * 100;
      const heightPct = (size.height / designHeight) * 100;
      return { widthPct, heightPct };
    };

    const getCustomStyle = (key: string, defaultLeft: number, defaultTop: number) => {
      const pos = template.placeholderPositions?.[key] || { x: defaultLeft, y: defaultTop };
      const alignment = template.fieldAlignments?.[key] || 'center';
      return {
        position: 'absolute' as const,
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        textAlign: alignment as any,
        zIndex: 30,
      };
    };

    // DRAG HANDLER FOR LIVE PREVIEW
    const handleFieldDragStart = (e: React.MouseEvent, key: string, defaultLeft: number, defaultTop: number) => {
      if (!isInteractive) return;
      // Skip if clicking inside resize handle or alignment toolbar
      if ((e.target as HTMLElement).closest('.nodrag')) return;

      e.preventDefault();
      e.stopPropagation();

      const cardElement = document.getElementById(`card-front-${person.uid}`);
      if (!cardElement) return;

      const rect = cardElement.getBoundingClientRect();
      const cardW = rect.width;
      const cardH = rect.height;

      const currentPos = template.placeholderPositions?.[key] || { x: defaultLeft, y: defaultTop };

      const startX = e.clientX;
      const startY = e.clientY;
      const startPercentX = currentPos.x;
      const startPercentY = currentPos.y;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const deltaPercentX = (deltaX / cardW) * 100;
        const deltaPercentY = (deltaY / cardH) * 100;

        let newPercentX = Math.round(startPercentX + deltaPercentX);
        let newPercentY = Math.round(startPercentY + deltaPercentY);

        newPercentX = Math.max(0, Math.min(100, newPercentX));
        newPercentY = Math.max(0, Math.min(100, newPercentY));

        const initializedPositions = template.placeholderPositions || defaultPositions;

        setTemplate(prev => ({
          ...prev,
          placeholderPositions: {
            ...initializedPositions,
            [key]: { x: newPercentX, y: newPercentY }
          }
        }));
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    const handleFieldResize = (key: string, newWidth: number, newHeight: number) => {
      const initializedSizes = template.placeholderSizes || defaultSizes;
      setTemplate(prev => ({
        ...prev,
        placeholderSizes: {
          ...initializedSizes,
          [key]: { width: Math.round(newWidth), height: Math.round(newHeight) }
        }
      }));
    };

    const handleFieldAlign = (key: string, alignment: 'left' | 'center' | 'right') => {
      const initializedAlignments = template.fieldAlignments || {
        photo: 'center',
        name: 'center',
        idCode: 'center',
        classRole: 'center',
        dobPhone: 'center'
      };
      setTemplate(prev => ({
        ...prev,
        fieldAlignments: {
          ...initializedAlignments,
          [key]: alignment
        }
      }));
    };

    const showAbsoluteLayout = isInteractive || hasCustomPositions || !!template.backgroundImageUrlFront;

    return (
      <div 
        id={`card-front-${person.uid}`}
        className="print-page relative bg-white shadow-xl border border-neutral-300 overflow-hidden flex-shrink-0 print:rounded-none print:shadow-none print:border-none"
        style={{
          width: cardWidth,
          height: cardHeight,
          boxSizing: 'border-box',
          backgroundImage: template.backgroundImageUrlFront ? `url(${template.backgroundImageUrlFront})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
          fontFamily: template.fontFamily,
          fontSize: `${template.baseFontSize}px`
        }}
      >
        {template.showDefaultHeader !== false && !template.backgroundImageUrlFront && (
          <div className="absolute top-0 left-0 right-0 py-3 px-2 flex flex-col justify-center items-center rounded-b-xl shadow-sm z-20"
               style={{ backgroundColor: template.themeColor, height: isPortrait ? '22%' : '20%' }}>
            <h2 className="font-black text-center uppercase tracking-wider leading-tight w-full" style={{ color: template.fontColor, fontSize: '0.9em' }}>
              {template.schoolName}
            </h2>
          </div>
        )}
        
        {showAbsoluteLayout ? (
          <div className="absolute inset-0 z-10 pointer-events-none">
            {/* Draggable Photo */}
            {(!template.visibleFields || template.visibleFields.includes('photo')) && (() => {
              const { widthPct, heightPct } = getFieldPercentageDimensions('photo');
              const size = template.placeholderSizes?.photo || defaultSizes.photo;
              return (
                <div 
                  onMouseDown={(e) => handleFieldDragStart(e, 'photo', isPortrait ? 50 : 25, isPortrait ? 35 : 50)}
                  className={`bg-neutral-100 rounded-xl overflow-hidden shadow-md border-[3px] border-white pointer-events-auto group/photo ${
                    isInteractive ? 'cursor-move hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1' : ''
                  }`}
                  style={{
                    ...getCustomStyle('photo', isPortrait ? 50 : 25, isPortrait ? 35 : 50),
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                >
                  {normalizeUrl(personPhoto) ? (
                    <img src={normalizeUrl(personPhoto)} className="w-full h-full object-cover" crossOrigin={normalizeUrl(personPhoto).startsWith('data:') ? undefined : 'anonymous'} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200">
                      <UserSquare2 className="w-1/2 h-1/2 text-gray-400" />
                    </div>
                  )}
                  {isInteractive && (
                    <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover/photo:opacity-100 transition-opacity pointer-events-none border border-indigo-500/20" />
                  )}
                  {isInteractive && (
                    <ResizeHandle width={size.width} height={size.height} onResize={(w, h) => handleFieldResize('photo', w, h)} />
                  )}
                </div>
              );
            })()}

            {/* Draggable Name */}
            {(!template.visibleFields || template.visibleFields.includes('name')) && (() => {
              const { widthPct, heightPct } = getFieldPercentageDimensions('name');
              const alignment = template.fieldAlignments?.name || 'center';
              const alignClass = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';
              const size = template.placeholderSizes?.name || defaultSizes.name;
              return (
                <div 
                  onMouseDown={(e) => handleFieldDragStart(e, 'name', isPortrait ? 50 : 65, isPortrait ? 55 : 35)}
                  style={{
                    ...getCustomStyle('name', isPortrait ? 50 : 65, isPortrait ? 55 : 35),
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }} 
                  className={`pointer-events-auto group/name transition-all ${
                    isInteractive ? 'cursor-move hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1 rounded-lg p-1' : ''
                  }`}
                >
                  {isInteractive && (
                    <AlignmentToolbar alignment={alignment} onAlign={(align) => handleFieldAlign('name', align)} />
                  )}
                  <h3 className={`font-black text-neutral-900 uppercase leading-none whitespace-nowrap overflow-hidden text-ellipsis animate-none w-full ${alignClass}`} style={{ fontSize: '1.05em' }}>{person.name || 'NAME'}</h3>
                  {isInteractive && (
                    <ResizeHandle width={size.width} height={size.height} onResize={(w, h) => handleFieldResize('name', w, h)} />
                  )}
                </div>
              );
            })()}

            {/* Draggable ID Code */}
            {(!template.visibleFields || template.visibleFields.includes('idCode')) && (() => {
              const { widthPct, heightPct } = getFieldPercentageDimensions('idCode');
              const alignment = template.fieldAlignments?.idCode || 'center';
              const alignClass = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';
              const justifyClass = alignment === 'left' ? 'justify-start' : alignment === 'right' ? 'justify-end' : 'justify-center';
              const size = template.placeholderSizes?.idCode || defaultSizes.idCode;
              return (
                <div 
                  onMouseDown={(e) => handleFieldDragStart(e, 'idCode', isPortrait ? 50 : 65, isPortrait ? 65 : 50)}
                  style={{
                    ...getCustomStyle('idCode', isPortrait ? 50 : 65, isPortrait ? 65 : 50),
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    display: 'flex',
                    alignItems: 'center',
                  }} 
                  className={`pointer-events-auto group/idCode ${justifyClass} ${
                    isInteractive ? 'cursor-move hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1 rounded-full p-1' : ''
                  }`}
                >
                  {isInteractive && (
                    <AlignmentToolbar alignment={alignment} onAlign={(align) => handleFieldAlign('idCode', align)} />
                  )}
                  <div className={`bg-neutral-800 text-white px-2.5 py-0.5 rounded-full font-bold tracking-widest whitespace-nowrap truncate ${alignClass}`} style={{ fontSize: '0.6em' }}>
                    ID: {person.idCode || 'N/A'}
                  </div>
                  {isInteractive && (
                    <ResizeHandle width={size.width} height={size.height} onResize={(w, h) => handleFieldResize('idCode', w, h)} />
                  )}
                </div>
              );
            })()}

            {/* Draggable Class/Role */}
            {(!template.visibleFields || template.visibleFields.includes('classRole')) && (() => {
              const { widthPct, heightPct } = getFieldPercentageDimensions('classRole');
              const alignment = template.fieldAlignments?.classRole || 'center';
              const alignClass = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';
              const size = template.placeholderSizes?.classRole || defaultSizes.classRole;
              return (
                <div 
                  onMouseDown={(e) => handleFieldDragStart(e, 'classRole', isPortrait ? 50 : 65, isPortrait ? 75 : 65)}
                  style={{
                    ...getCustomStyle('classRole', isPortrait ? 50 : 65, isPortrait ? 75 : 65),
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }} 
                  className={`px-2 rounded-lg border shadow-sm pointer-events-auto transition-all group/classRole ${
                    template.showDefaultFieldContainers !== false 
                      ? 'bg-white/80 backdrop-blur border-black/5' 
                      : 'bg-transparent border-transparent shadow-none'
                  } ${
                    isInteractive ? 'cursor-move hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1' : ''
                  }`}
                >
                  {isInteractive && (
                    <AlignmentToolbar alignment={alignment} onAlign={(align) => handleFieldAlign('classRole', align)} />
                  )}
                  {template.labelsOnSide !== false ? (
                    <div className={`flex items-baseline gap-1 w-full ${alignClass === 'text-center' ? 'justify-center' : alignClass === 'text-right' ? 'justify-end' : 'justify-start'}`}>
                      {!template.hideFieldLabels && (
                        <span className={`font-bold uppercase tracking-wider leading-none shrink-0 ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.55em' }}>
                          {isStudent ? 'Class:' : 'Role:'}
                        </span>
                      )}
                      <span className={`font-bold leading-tight ${template.showDefaultFieldContainers !== false ? 'text-neutral-800' : 'text-neutral-900'}`} style={{ fontSize: '0.75em' }}>
                        {isStudent ? (className || 'N/A') : (person.role || 'Staff')}
                      </span>
                    </div>
                  ) : (
                    <>
                      {!template.hideFieldLabels && (
                        <p className={`font-bold uppercase tracking-wider leading-none mb-0.5 w-full ${alignClass} ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.5em' }}>
                          {isStudent ? 'Class' : 'Role'}
                        </p>
                      )}
                      <p className={`font-bold leading-tight w-full ${alignClass} ${template.showDefaultFieldContainers !== false ? 'text-neutral-800' : 'text-neutral-900'}`} style={{ fontSize: '0.8em' }}>
                        {isStudent ? (className || 'N/A') : (person.role || 'Staff')}
                      </p>
                    </>
                  )}
                  {isInteractive && (
                    <ResizeHandle width={size.width} height={size.height} onResize={(w, h) => handleFieldResize('classRole', w, h)} />
                  )}
                </div>
              );
            })()}

            {/* Draggable DOB/Phone */}
            {(!template.visibleFields || template.visibleFields.includes('dobPhone')) && (() => {
              const { widthPct, heightPct } = getFieldPercentageDimensions('dobPhone');
              const alignment = template.fieldAlignments?.dobPhone || 'center';
              const alignClass = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';
              const size = template.placeholderSizes?.dobPhone || defaultSizes.dobPhone;
              return (
                <div 
                  onMouseDown={(e) => handleFieldDragStart(e, 'dobPhone', isPortrait ? 50 : 65, isPortrait ? 85 : 80)}
                  style={{
                    ...getCustomStyle('dobPhone', isPortrait ? 50 : 65, isPortrait ? 85 : 80),
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }} 
                  className={`px-2 rounded-lg border shadow-sm pointer-events-auto transition-all group/dobPhone ${
                    template.showDefaultFieldContainers !== false 
                      ? 'bg-white/80 backdrop-blur border-black/5' 
                      : 'bg-transparent border-transparent shadow-none'
                  } ${
                    isInteractive ? 'cursor-move hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1' : ''
                  }`}
                >
                  {isInteractive && (
                    <AlignmentToolbar alignment={alignment} onAlign={(align) => handleFieldAlign('dobPhone', align)} />
                  )}
                  {template.labelsOnSide !== false ? (
                    <div className={`flex items-baseline gap-1 w-full ${alignClass === 'text-center' ? 'justify-center' : alignClass === 'text-right' ? 'justify-end' : 'justify-start'}`}>
                      {!template.hideFieldLabels && (
                        <span className={`font-bold uppercase tracking-wider leading-none shrink-0 ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.55em' }}>
                          {isStudent ? 'DOB:' : 'Phone:'}
                        </span>
                      )}
                      <span className={`font-bold leading-tight ${template.showDefaultFieldContainers !== false ? 'text-neutral-800' : 'text-neutral-900'}`} style={{ fontSize: '0.75em' }}>
                        {isStudent ? (person.dob || 'N/A') : (person.phone || 'N/A')}
                      </span>
                    </div>
                  ) : (
                    <>
                      {!template.hideFieldLabels && (
                        <p className={`font-bold uppercase tracking-wider leading-none mb-0.5 w-full ${alignClass} ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.5em' }}>
                          {isStudent ? 'DOB' : 'Phone'}
                        </p>
                      )}
                      <p className={`font-bold leading-tight w-full ${alignClass} ${template.showDefaultFieldContainers !== false ? 'text-neutral-800' : 'text-neutral-900'}`} style={{ fontSize: '0.8em' }}>
                        {isStudent ? (person.dob || 'N/A') : (person.phone || 'N/A')}
                      </p>
                    </>
                  )}
                  {isInteractive && (
                    <ResizeHandle width={size.width} height={size.height} onResize={(w, h) => handleFieldResize('dobPhone', w, h)} />
                  )}
                </div>
              );
            })()}

            {(!template.visibleFields || template.visibleFields.includes('outingQr')) && (() => {
              const { widthPct, heightPct } = getFieldPercentageDimensions('outingQr');
              const size = template.placeholderSizes?.outingQr || defaultSizes.outingQr;
              const studentId = person.uid || person.id || '';
              const qrValue = `${window.location.origin}/outing-permission?studentId=${studentId}`;
              
              return (
                <div 
                  onMouseDown={(e) => handleFieldDragStart(e, 'outingQr', isPortrait ? 50 : 88, isPortrait ? 92 : 80)}
                  style={{
                    ...getCustomStyle('outingQr', isPortrait ? 50 : 88, isPortrait ? 92 : 80),
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'white',
                  }} 
                  className={`p-1 rounded shadow-sm border border-neutral-250/60 pointer-events-auto transition-all group/outingQr ${
                    isInteractive ? 'cursor-move hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1' : ''
                  }`}
                >
                  <div className="w-full h-full flex items-center justify-center p-0.5">
                    <QRCodeSVG 
                      value={qrValue} 
                      size={size.width} 
                      className="w-full h-full"
                    />
                  </div>
                  {isInteractive && (
                    <ResizeHandle width={size.width} height={size.height} onResize={(w, h) => handleFieldResize('outingQr', w, h)} />
                  )}
                </div>
              );
            })()}
          </div>
        ) : isPortrait ? (
          <div className="absolute inset-0 pt-[25%] p-3 flex flex-col items-center z-10">
            <div className="w-[40%] aspect-[3/4] bg-neutral-100 rounded-xl overflow-hidden shadow-md mb-2 border-[3px] border-white">
              {normalizeUrl(personPhoto) ? (
                <img src={normalizeUrl(personPhoto)} className="w-full h-full object-cover" crossOrigin={normalizeUrl(personPhoto).startsWith('data:') ? undefined : 'anonymous'} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-200">
                  <UserSquare2 className="w-1/2 h-1/2 text-gray-400" />
                </div>
              )}
            </div>
            
            <div className="text-center w-full">
              <h3 className="font-black text-neutral-900 uppercase leading-tight mb-1" style={{ fontSize: '1.1em' }}>{person.name || 'NAME'}</h3>
              <div className="bg-neutral-800 text-white px-2 py-0.5 rounded-full inline-block font-bold tracking-widest mb-2" style={{ fontSize: '0.6em' }}>
                ID: {person.idCode || 'N/A'}
              </div>
            </div>
            
            <div className={`w-full space-y-1.5 mt-auto text-center rounded-lg p-2 border pb-3 transition-all ${
              template.showDefaultFieldContainers !== false 
                ? 'bg-white/80 backdrop-blur border-black/5' 
                : 'bg-transparent border-transparent'
            }`}>
              {isStudent ? (
                <>
                  <div>
                    <p className={`font-bold uppercase tracking-wider leading-none mb-0.5 ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.5em' }}>Class</p>
                    <p className="font-bold text-neutral-800 leading-tight" style={{ fontSize: '0.8em' }}>{className || 'N/A'}</p>
                  </div>
                  <div>
                    <p className={`font-bold uppercase tracking-wider leading-none mb-0.5 ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.5em' }}>DOB</p>
                    <p className="font-bold text-neutral-800 leading-tight" style={{ fontSize: '0.8em' }}>{person.dob || 'N/A'}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className={`font-bold uppercase tracking-wider leading-none mb-0.5 ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.5em' }}>Role</p>
                    <p className="font-bold text-neutral-800 leading-tight capitalize truncate" style={{ fontSize: '0.8em' }}>{person.role || 'Staff'}</p>
                  </div>
                  <div>
                    <p className={`font-bold uppercase tracking-wider leading-none mb-0.5 ${template.showDefaultFieldContainers !== false ? 'text-indigo-600' : 'text-neutral-500'}`} style={{ fontSize: '0.5em' }}>Phone</p>
                    <p className="font-bold text-neutral-800 leading-tight" style={{ fontSize: '0.8em' }}>{person.phone || 'N/A'}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 pt-[20%] p-3 flex flex-row gap-4 items-center z-10 pl-4 pr-6">
            <div className="flex flex-col items-center">
              <div className="w-[1.2in] aspect-[3/4] bg-neutral-100 rounded-xl overflow-hidden shadow-md mb-2 border-[3px] border-white shrink-0 mt-2">
                {normalizeUrl(personPhoto) ? (
                  <img src={normalizeUrl(personPhoto)} className="w-full h-full object-cover" crossOrigin={normalizeUrl(personPhoto).startsWith('data:') ? undefined : 'anonymous'} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200">
                    <UserSquare2 className="w-1/2 h-1/2 text-gray-400" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center h-full pt-4">
              <h3 className="font-black text-neutral-900 uppercase leading-none mb-1" style={{ fontSize: '1.2em' }}>{person.name || 'NAME'}</h3>
              <div className="bg-neutral-800 text-white px-2 py-0.5 rounded w-fit font-bold tracking-widest mb-3" style={{ fontSize: '0.6em' }}>
                ID: {person.idCode || 'N/A'}
              </div>
              
              <div className="grid grid-cols-2 gap-y-2 gap-x-2">
                {isStudent ? (
                  <>
                    <div>
                      <p className="font-bold uppercase tracking-wider leading-none text-indigo-600 mb-0.5" style={{ fontSize: '0.55em' }}>Class</p>
                      <p className="font-bold text-neutral-800 leading-tight" style={{ fontSize: '0.85em' }}>{className || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wider leading-none text-indigo-600 mb-0.5" style={{ fontSize: '0.55em' }}>DOB</p>
                      <p className="font-bold text-neutral-800 leading-tight" style={{ fontSize: '0.85em' }}>{person.dob || 'N/A'}</p>
                    </div>
                    <div className="col-span-2 mt-1">
                      <p className="font-bold uppercase tracking-wider leading-none text-indigo-600 mb-0.5" style={{ fontSize: '0.55em' }}>Parent</p>
                      <p className="font-bold text-neutral-800 leading-tight truncate" style={{ fontSize: '0.85em' }}>{person.parentName || 'N/A'}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="font-bold uppercase tracking-wider leading-none text-indigo-600 mb-0.5" style={{ fontSize: '0.55em' }}>Role</p>
                      <p className="font-bold text-neutral-800 leading-tight capitalize truncate" style={{ fontSize: '0.85em' }}>{person.role || 'Staff'}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-wider leading-none text-indigo-600 mb-0.5" style={{ fontSize: '0.55em' }}>Phone</p>
                      <p className="font-bold text-neutral-800 leading-tight" style={{ fontSize: '0.85em' }}>{person.phone || 'N/A'}</p>
                    </div>
                    <div className="col-span-2 mt-1">
                      <p className="font-bold uppercase tracking-wider leading-none text-indigo-600 mb-0.5" style={{ fontSize: '0.55em' }}>Email</p>
                      <p className="font-bold text-neutral-800 leading-tight truncate" style={{ fontSize: '0.85em' }}>{person.email || 'N/A'}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCardBack = (person: any) => {
    return (
      <div 
        id={`card-back-${person.uid}`}
        className="print-page relative bg-neutral-100 shadow-xl border border-neutral-300 overflow-hidden flex-shrink-0 print:rounded-none print:shadow-none print:border-none"
        style={{
          width: cardWidth,
          height: cardHeight,
          boxSizing: 'border-box',
          backgroundImage: template.backgroundImageUrlBack ? `url(${template.backgroundImageUrlBack})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
          fontFamily: template.fontFamily,
          fontSize: `${template.baseFontSize}px`
        }}
      >
        <div className="absolute inset-0 p-4 flex flex-col justify-between items-center text-center">
          <div className="w-full flex-1 flex flex-col items-center justify-center">
            
            <div className="bg-white/90 backdrop-blur-sm p-3 rounded-xl border border-neutral-200 shadow-sm w-[90%] mb-4">
               <h4 className="font-black text-neutral-800 uppercase tracking-widest mb-1" style={{ fontSize: '0.7em' }}>Address</h4>
               <p className="font-medium text-neutral-600" style={{ fontSize: '0.75em' }}>{template.address}</p>
            </div>
            
            <p className="font-semibold text-neutral-700 leading-snug w-[80%]" style={{ fontSize: '0.75em' }}>
              {template.backText}
            </p>
          </div>
          
          <div className="w-full flex justify-between items-end mt-4 px-2">
            <div className="flex flex-col items-center">
               <div className="h-6 border-b border-neutral-400 w-16 mb-1"></div>
               <span className="font-bold text-neutral-500 uppercase tracking-wider" style={{ fontSize: '0.5em' }}>Principal</span>
            </div>
            <div className="flex flex-col items-center">
               <div className="h-6 border-b border-neutral-400 w-16 mb-1"></div>
               <span className="font-bold text-neutral-500 uppercase tracking-wider" style={{ fontSize: '0.5em' }}>Holder Sign</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-80px)] overflow-hidden flex flex-col">
      <header className="mb-6 flex-shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 mb-2 flex items-center gap-3">
            <UserSquare2 className="w-8 h-8 text-indigo-500" />
            ID Card Generator
          </h1>
          <p className="text-neutral-500 font-medium max-w-2xl">
            Design, customize, and print high-quality CR-80 standard ID cards. Compatible with Evolis Primacy 2.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleDownloadBatchPdf}
            disabled={selectedIds.size === 0 || isProcessing}
            className="px-6 py-2.5 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Download className="w-5 h-5 text-indigo-500" />
            Export PDF Batch
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedIds.size === 0 || isProcessing}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Cards
          </button>
        </div>
      </header>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left pane: Controls */}
        <div className="w-[380px] flex-shrink-0 flex flex-col gap-4 bg-white rounded-3xl p-6 border border-neutral-200 overflow-y-auto custom-scrollbar">
          
          <div className="p-1 bg-neutral-100 rounded-xl flex gap-1 mb-2 shrink-0">
            <button
              onClick={() => { setActiveTab('students'); setSelectedIds(new Set()); }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'students' ? 'bg-white text-indigo-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <Users className="w-4 h-4" /> Students
            </button>
            <button
              onClick={() => { setActiveTab('staff'); setSelectedIds(new Set()); }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'staff' ? 'bg-white text-indigo-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <UserSquare2 className="w-4 h-4" /> Staff
            </button>
          </div>

          <div className="space-y-4 shrink-0">
            <h3 className="font-bold text-sm text-neutral-800 uppercase tracking-wider flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-lg text-indigo-700">
              <ImageIcon className="w-4 h-4" />
              Quick Designs
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_DESIGNS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setTemplate(prev => ({ ...prev, ...preset.changes }))}
                  className="flex items-center gap-2 p-2 rounded-lg border border-neutral-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-left"
                >
                  <div className="w-6 h-6 rounded-md shadow-sm shrink-0 border border-neutral-200" style={{ backgroundColor: preset.changes.themeColor }}></div>
                  <span className="text-xs font-bold text-neutral-700 truncate">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* CUSTOM DATABASE-BACKED SAVED DESIGNS */}
          <div className="space-y-4 shrink-0 border-t border-neutral-100 pt-4">
            <h3 className="font-bold text-sm text-neutral-800 uppercase tracking-wider flex items-center justify-between bg-emerald-50 px-3 py-2 rounded-lg text-emerald-700">
              <span className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                Saved Designs
              </span>
            </h3>
            <div className="flex gap-2 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
              <input 
                type="text"
                placeholder="e.g., Design 1"
                id="new-design-name"
                className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-indigo-500 font-bold"
              />
              <button 
                onClick={async () => {
                  const input = document.getElementById('new-design-name') as HTMLInputElement;
                  const name = input?.value?.trim() || `Design ${savedDesigns.length + 1}`;
                  try {
                    toast.loading("Saving design...", { id: 'save-design' });
                    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    const designData = {
                      name,
                      template,
                      updatedAt: new Date().toISOString()
                    };
                    await dbService.create('id_card_designs', id, designData);
                    toast.success(`Design "${name}" saved!`, { id: 'save-design' });
                    if (input) input.value = '';
                    fetchSavedDesigns();
                  } catch (err: any) {
                    toast.error(err.message || "Failed to save design", { id: 'save-design' });
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg active:scale-95 transition-all flex items-center gap-1 shrink-0"
              >
                <Save className="w-3 h-3" />
                Save
              </button>
            </div>

            {savedDesigns.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                {savedDesigns.map(design => (
                  <div 
                    key={design.id}
                    className="flex items-center justify-between p-1.5 rounded-lg border border-neutral-200 bg-white hover:border-emerald-300 transition-all group"
                  >
                    <button
                      onClick={() => {
                        setTemplate(design.template);
                        toast.success(`Loaded saved design "${design.name}"`);
                      }}
                      className="flex-1 text-left truncate text-[11px] font-bold text-neutral-700 hover:text-emerald-600 focus:outline-none"
                    >
                      {design.name}
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Are you sure you want to delete "${design.name}"?`)) {
                          try {
                            toast.loading("Deleting design...", { id: 'delete-design' });
                            await dbService.delete('id_card_designs', design.id);
                            toast.success("Design deleted", { id: 'delete-design' });
                            fetchSavedDesigns();
                          } catch (err: any) {
                            toast.error(err.message || "Failed to delete", { id: 'delete-design' });
                          }
                        }
                      }}
                      className="p-1 text-neutral-400 hover:text-red-500 rounded-md transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-neutral-400 italic text-center py-2">No saved custom designs yet.</p>
            )}
          </div>

          <div className="space-y-4 shrink-0">
            <h3 className="font-bold text-sm text-neutral-800 uppercase tracking-wider flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-lg text-indigo-700">
              <Settings className="w-4 h-4" />
              Template Settings
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Orientation</label>
                <select 
                  value={template.orientation}
                  onChange={e => setTemplate({...template, orientation: e.target.value as any})}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Font Size</label>
                <input 
                  type="number"
                  value={template.baseFontSize}
                  onChange={e => setTemplate({...template, baseFontSize: Number(e.target.value)})}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
            
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Font Family</label>
              <select 
                  value={template.fontFamily}
                  onChange={e => setTemplate({...template, fontFamily: e.target.value})}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="Inter, sans-serif">Inter (Sans-serif)</option>
                  <option value="'Space Grotesk', sans-serif">Space Grotesk</option>
                  <option value="'Playfair Display', serif">Playfair Display (Serif)</option>
                  <option value="'JetBrains Mono', monospace">JetBrains Mono (Monospace)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">School Name</label>
              <input 
                value={template.schoolName}
                onChange={e => setTemplate({...template, schoolName: e.target.value})}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Theme Color</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color"
                    value={template.themeColor}
                    onChange={e => setTemplate({...template, themeColor: e.target.value})}
                    className="w-8 h-8 rounded shrink-0 cursor-pointer border-0 p-0"
                  />
                  <input 
                    value={template.themeColor}
                    onChange={e => setTemplate({...template, themeColor: e.target.value})}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Font Color</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color"
                    value={template.fontColor}
                    onChange={e => setTemplate({...template, fontColor: e.target.value})}
                    className="w-8 h-8 rounded shrink-0 cursor-pointer border-0 p-0"
                  />
                  <input 
                    value={template.fontColor}
                    onChange={e => setTemplate({...template, fontColor: e.target.value})}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Front BG</label>
                <div className="flex flex-col gap-2">
                  <label className="w-full py-1.5 px-3 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-xs text-center cursor-pointer hover:bg-indigo-100 transition-colors">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBackgroundUpload(e, 'front')} />
                  </label>
                  {template.backgroundImageUrlFront && (
                    <button onClick={() => setTemplate({...template, backgroundImageUrlFront: ''})} className="text-red-500 text-xs font-bold px-2 py-1 hover:bg-red-50 rounded border border-red-100">
                      Clear Front
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Back BG</label>
                <div className="flex flex-col gap-2">
                  <label className="w-full py-1.5 px-3 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-xs text-center cursor-pointer hover:bg-indigo-100 transition-colors">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBackgroundUpload(e, 'back')} />
                  </label>
                  {template.backgroundImageUrlBack && (
                    <button onClick={() => setTemplate({...template, backgroundImageUrlBack: ''})} className="text-red-500 text-xs font-bold px-2 py-1 hover:bg-red-50 rounded border border-red-100">
                      Clear Back
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 space-y-2.5">
              <label className="flex items-center justify-between cursor-pointer select-none">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">Show Default Header</span>
                <input 
                  type="checkbox"
                  checked={template.showDefaultHeader !== false}
                  onChange={e => setTemplate({...template, showDefaultHeader: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer select-none">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">Show Field Box Backgrounds</span>
                <input 
                  type="checkbox"
                  checked={template.showDefaultFieldContainers !== false}
                  onChange={e => setTemplate({...template, showDefaultFieldContainers: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer select-none">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">Hide Column Headings</span>
                <input 
                  type="checkbox"
                  checked={!!template.hideFieldLabels}
                  onChange={e => setTemplate({...template, hideFieldLabels: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer select-none">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">Headings on Side</span>
                <input 
                  type="checkbox"
                  checked={template.labelsOnSide !== false}
                  onChange={e => setTemplate({...template, labelsOnSide: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            </div>

            <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
              <label className="flex items-center justify-between cursor-pointer mb-2">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">Include Back Side</span>
                <input 
                  type="checkbox"
                  checked={template.showBack}
                  onChange={e => setTemplate({...template, showBack: e.target.checked})}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
              </label>
              {template.showBack && (
                <>
                  <input 
                    placeholder="Address"
                    value={template.address}
                    onChange={e => setTemplate({...template, address: e.target.value})}
                    className="w-full bg-white border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 mb-2"
                  />
                  <textarea 
                    placeholder="Back instructions text..."
                    value={template.backText}
                    onChange={e => setTemplate({...template, backText: e.target.value})}
                    className="w-full bg-white border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[60px] resize-none"
                  />
                </>
              )}
            </div>
            
            <button
              type="button"
              onClick={() => setShowDesignerModal(true)}
              className="w-full py-3.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-2xl font-black text-xs flex items-center justify-center gap-2 border border-indigo-100/50 transition-all mt-3 shadow-sm uppercase tracking-wider"
            >
              <Settings className="w-4 h-4" />
              Customize Layout with React Flow
            </button>
          </div>

          <hr className="border-neutral-100 my-1 shrink-0" />

          <div className="space-y-3 flex flex-col flex-1 min-h-0">
            <h3 className="font-bold text-sm text-neutral-800 uppercase tracking-wider shrink-0 bg-indigo-50 px-3 py-2 rounded-lg text-indigo-700">Select People</h3>
            
            <div className="shrink-0 space-y-2">
              <input
                type="text"
                placeholder="Search by name, ID or Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              
              {activeTab === 'students' && (
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="all">All Classes</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              <div className="flex items-center justify-between px-1 bg-white border border-neutral-200 rounded-lg py-1.5">
                <label className="flex items-center gap-2 text-sm font-bold text-neutral-600 cursor-pointer pl-2">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size > 0 && selectedIds.size === filteredList.length}
                    onChange={handleSelectAll}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Select All
                </label>
                <span className="text-xs font-bold bg-indigo-100 px-2 py-1 flex items-center justify-center rounded-md text-indigo-700 mr-1 min-w-[32px]">{selectedIds.size}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-2 space-y-1.5 custom-scrollbar min-h-[150px]">
              {filteredList.map(p => (
                <label key={p.uid} className="flex items-center gap-3 p-2 bg-white hover:bg-indigo-50/50 rounded-lg cursor-pointer transition-all border border-neutral-100 hover:border-indigo-200 shadow-sm">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(p.uid)}
                    onChange={() => toggleSelection(p.uid)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="w-8 h-8 rounded-md bg-neutral-100 overflow-hidden shrink-0 border border-neutral-200">
                    {normalizeUrl(p.photoURL || p.photoUrl || p.facePhotoURL || p.facePhotoUrl) ? (
                      <img src={normalizeUrl(p.photoURL || p.photoUrl || p.facePhotoURL || p.facePhotoUrl)} className="w-full h-full object-cover" />
                    ) : <UserSquare2 className="w-full h-full text-neutral-300 p-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-neutral-800 truncate leading-none mb-1">{p.name || 'Unnamed'}</p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider leading-none ml-0.5">{p.idCode || 'No ID'}</p>
                  </div>
                  <button 
                    onClick={(e) => { e.preventDefault(); handleDownloadSingleImage(p); }}
                    title="Download this card as image"
                    className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </label>
              ))}
              {filteredList.length === 0 && (
                <div className="p-4 text-center text-sm text-neutral-400 font-medium">No records found.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right pane: Preview */}
        <div className="flex-1 bg-neutral-100/50 rounded-3xl border border-neutral-200 overflow-hidden relative flex flex-col shadow-inner">
          <div className="absolute top-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-b border-neutral-200 z-20 flex justify-between items-center">
             <h2 className="font-bold text-neutral-800 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-500" />
                Live Preview
             </h2>
             <span className="text-sm text-neutral-500 font-medium px-3 py-1 bg-neutral-100 rounded-full">
               Standard CR-80 ({isPortrait ? 'Portrait' : 'Landscape'})
             </span>
          </div>
          
          <div className="flex-1 overflow-auto p-8 pt-20 relative bg-[#f1f5f9] custom-scrollbar">
            <div className="flex flex-wrap justify-center gap-12 isolate z-10 mx-auto" id="print-area">
              {/* Only show selected items for printing */}
              {Array.from(selectedIds).length > 0 ? (
                Array.from(selectedIds).map(id => {
                  const person = filteredList.find(p => p.uid === id);
                  if (!person) return null;
                  return (
                    <div key={id} className="flex gap-4 items-start pb-8 border-b border-neutral-200/50 last:border-0 print:border-0 print:pb-0">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1 print:hidden">Front - {person.name}</span>
                        {renderCardFront(person, true)}
                      </div>
                      {template.showBack && (
                         <div className="flex flex-col gap-2">
                           <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1 print:hidden">Back</span>
                           {renderCardBack(person)}
                         </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full h-full flex flex-col items-center justify-center text-neutral-400 min-h-[400px] mt-20">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-neutral-200 mb-6 relative">
                     <ImageIcon className="w-10 h-10 text-neutral-300 absolute" />
                     <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center border-2 border-white">
                        <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                     </div>
                  </div>
                  <p className="font-bold text-lg text-neutral-600">No people selected</p>
                  <p className="text-sm mt-1">Select boxes on the left to preview front and back prints.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: #94a3b8;
        }
      `}} />
      <IDCardFlowDesignerModal 
        isOpen={showDesignerModal}
        onClose={() => setShowDesignerModal(false)}
        template={template}
        onChange={setTemplate}
      />
    </div>
  );
}
