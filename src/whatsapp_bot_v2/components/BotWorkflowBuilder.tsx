import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Save,
  FolderOpen,
  Plus,
  Trash,
  Settings,
  HelpCircle,
  Play,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Power,
  List
} from 'lucide-react';
import { db } from '../../firebase';
import { dbService, handleFirestoreError, OperationType } from '../../services/dbService';
import { NodeType, ConditionField, ConditionOperator, ActionType, BotWorkflow } from '../types';
import { nodeTypes } from './nodes/CustomNodes';
import { toast } from 'sonner';

const initialNodes = [
  {
    id: 'start-1',
    type: NodeType.START,
    position: { x: 250, y: 100 },
    data: { triggerKeywords: 'hi, hello, start, menu', description: 'Default chatbot entry point' },
  }
];

const initialEdges: Edge[] = [];

export default function BotWorkflowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Flows persistence state
  const [flowsList, setFlowsList] = useState<BotWorkflow[]>([]);
  const [currentFlowId, setCurrentFlowId] = useState<string>('default-wa-flow');
  const [flowName, setFlowName] = useState<string>('Standard WhatsApp Bot Flow');
  const [flowDescription, setFlowDescription] = useState<string>('Visual chatbot flow for parent registrations and automatic academic queries.');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoadingFlows, setIsLoadingFlows] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'sidebar' | 'canvas' | 'settings'>('sidebar');
  const [waStatus, setWaStatus] = useState<'connecting' | 'open' | 'close' | 'qr' | 'unknown'>('unknown');

  // Poll WhatsApp Engine status
  useEffect(() => {
    let isMounted = true;
    const fetchWAStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (isMounted) {
          setWaStatus(data.status || 'close');
        }
      } catch (err) {
        console.warn('Failed to fetch WhatsApp connection status:', err);
        if (isMounted) {
          setWaStatus('unknown');
        }
      }
    };

    fetchWAStatus();
    const interval = setInterval(fetchWAStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const [isRestartingWA, setIsRestartingWA] = useState<boolean>(false);
  const [isResettingWA, setIsResettingWA] = useState<boolean>(false);

  const handleRestartWA = async () => {
    setIsRestartingWA(true);
    try {
      const res = await fetch('/api/whatsapp/restart', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to restart');
      toast.success('WhatsApp Engine restart triggered!');
    } catch (err: any) {
      toast.error('Failed to restart engine: ' + err.message);
    } finally {
      setIsRestartingWA(false);
    }
  };

  const handleResetWA = async () => {
    if (!window.confirm('Wiping connection will completely delete your WhatsApp credentials and clear any active session, allowing you to link a completely fresh device. Are you sure you want to proceed?')) {
      return;
    }
    setIsResettingWA(true);
    try {
      const res = await fetch('/api/whatsapp/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset');
      toast.success('WhatsApp connection wiped. A new QR code will be generated shortly!');
    } catch (err: any) {
      toast.error('Failed to reset engine: ' + err.message);
    } finally {
      setIsResettingWA(false);
    }
  };

  // Load flows from Firestore
  const loadFlows = useCallback(async () => {
    setIsLoadingFlows(true);
    const path = 'whatsapp_bot_flows';
    try {
      const flows = await dbService.list(path) as BotWorkflow[];
      setFlowsList(flows);
      
      // Load current active or default flow
      if (flows.length > 0) {
        const activeOrFirst = flows.find(f => f.isActive) || flows[0];
        setCurrentFlowId(activeOrFirst.id);
        setFlowName(activeOrFirst.name);
        setFlowDescription(activeOrFirst.description || '');
        setIsActive(activeOrFirst.isActive);
        if (activeOrFirst.nodes) setNodes(activeOrFirst.nodes);
        if (activeOrFirst.edges) setEdges(activeOrFirst.edges);
      }
    } catch (err: any) {
      console.error("Failed to load WhatsApp Bot flows:", err);
      toast.error("Failed to fetch WhatsApp chatbot flows: " + err.message);
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        // Suppress propagating to prevent crashing the UI completely, but ensures logged in telemetry
      }
    } finally {
      setIsLoadingFlows(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  // Handle flow connection
  const onConnect = useCallback(
    (params: Connection) => {
      const edge = {
        ...params,
        type: 'smoothstep',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#3b82f6',
        },
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  // Add specific node type
  const addNode = (type: NodeType) => {
    const id = `${type}-${Date.now().toString().slice(-6)}`;
    const position = {
      x: 100 + Math.random() * 200,
      y: 150 + Math.random() * 200,
    };

    let data: any = {};
    if (type === NodeType.START) {
      data = { triggerKeywords: 'keyword', description: 'Triggers matching keyword' };
    } else if (type === NodeType.BUTTON_MESSAGE) {
      data = { text: 'Welcome to St. Antony\'s School ERP! Select an option below:', buttons: [{ id: 'opt1', text: 'Fees Status' }, { id: 'opt2', text: 'Attendance' }] };
    } else if (type === NodeType.LIST_MESSAGE) {
      data = { text: 'Please select an ERP service from the menu below:', buttonText: 'View Menu', rows: [{ id: 'row-1', title: 'Attendance' }, { id: 'row-2', title: 'Exam Marks' }, { id: 'row-3', title: 'Fees Status' }] };
    } else if (type === NodeType.CONDITION) {
      data = { field: ConditionField.ATTENDANCE, operator: ConditionOperator.LESS_THAN, value: 75 };
    } else if (type === NodeType.DELAY) {
      data = { durationSeconds: 5 };
    } else if (type === NodeType.ACTION) {
      data = { actionType: ActionType.AUTH_GUARD, customPayload: '' };
    }

    const newNode = {
      id,
      type,
      position,
      data,
    };

    setNodes((nds) => nds.concat(newNode as any));
    setSelectedNodeId(id);
    setActiveMobileTab('canvas'); // Auto focus canvas on mobile when adding node
    toast.success(`Added ${type.toUpperCase().replace('_', ' ')} Node`);
  };

  // Delete node
  const deleteNode = (id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
    toast.info("Node removed");
  };

  // Update node data helper
  const updateNodeData = (nodeId: string, updatedData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updatedData,
            },
          };
        }
        return node;
      })
    );
  };

  // Selected node configuration reference
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) as any;

  // Depth-First Search Cycle Detector to prevent infinite chatbot loops
  const detectCycleInGraph = (nodesList: any[], edgesList: any[]): string[] | null => {
    const nodeMap = new Map<string, any>();
    nodesList.forEach(n => nodeMap.set(n.id, n));

    const adjList = new Map<string, string[]>();
    nodesList.forEach(n => adjList.set(n.id, []));
    edgesList.forEach(e => {
      if (adjList.has(e.source)) {
        adjList.get(e.source)!.push(e.target);
      }
    });

    const state = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
    nodesList.forEach(n => state.set(n.id, 0));

    const path: string[] = [];

    const dfs = (nodeId: string): string[] | null => {
      state.set(nodeId, 1);
      path.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighborId of neighbors) {
        const neighborState = state.get(neighborId) || 0;
        if (neighborState === 1) {
          const cycleStartIndex = path.indexOf(neighborId);
          if (cycleStartIndex !== -1) {
            return path.slice(cycleStartIndex).concat(neighborId);
          }
          return [neighborId, nodeId];
        } else if (neighborState === 0) {
          const result = dfs(neighborId);
          if (result) return result;
        }
      }

      path.pop();
      state.set(nodeId, 2);
      return null;
    };

    for (const node of nodesList) {
      if ((state.get(node.id) || 0) === 0) {
        const cyclePath = dfs(node.id);
        if (cyclePath) return cyclePath;
      }
    }

    return null;
  };

  // Save Flow serialization
  const handleSaveFlow = async () => {
    if (!flowName.trim()) {
      toast.error("Please provide a flow name");
      return;
    }

    // 1. Perform Loop Detection
    const cycle = detectCycleInGraph(nodes, edges);
    if (cycle) {
      const nodeMap = new Map<string, any>();
      nodes.forEach(n => nodeMap.set(n.id, n));
      
      const getNodeLabel = (node: any) => {
        const typeLabel = node.type ? node.type.toUpperCase().replace('_', ' ') : 'NODE';
        const specificName = node.data?.triggerKeywords || node.data?.text || node.data?.actionType || '';
        const truncated = specificName && typeof specificName === 'string' 
          ? ` ("${specificName.slice(0, 15)}${specificName.length > 15 ? '...' : ''}")` 
          : '';
        return `[${typeLabel}] ${node.id}${truncated}`;
      };

      const cyclePathLabels = cycle.map(id => {
        const node = nodeMap.get(id);
        return node ? getNodeLabel(node) : id;
      }).join(' ➔ ');

      toast.error(
        <div className="flex flex-col gap-1.5 p-1">
          <div className="font-bold text-rose-600 uppercase text-[11px] tracking-wider">Infinite Loop Detected!</div>
          <div className="text-xs text-slate-700 dark:text-slate-300">
            Circular references are forbidden to prevent infinite messaging loops. Please correct the loop path:
          </div>
          <div className="text-[10px] font-mono bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-slate-800 break-all leading-relaxed whitespace-pre-wrap">
            {cyclePathLabels}
          </div>
        </div>,
        { duration: 10000 }
      );
      return;
    }

    setIsSaving(true);
    const serializedFlow: BotWorkflow = {
      id: currentFlowId,
      name: flowName,
      description: flowDescription,
      nodes,
      edges,
      isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await dbService.set('whatsapp_bot_flows', currentFlowId, serializedFlow);
      toast.success("Workflow Saved Successfully!");
      loadFlows();
    } catch (err: any) {
      console.error("Save workflow error:", err);
      toast.error("Failed to save flow: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, `whatsapp_bot_flows/${currentFlowId}`);
      } catch (e) {
        // Suppress propagating to prevent blocking the UI
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Load a selected flow
  const selectFlow = (flow: BotWorkflow) => {
    setCurrentFlowId(flow.id);
    setFlowName(flow.name);
    setFlowDescription(flow.description || '');
    setIsActive(flow.isActive);
    setNodes(flow.nodes || []);
    setEdges(flow.edges || []);
    setSelectedNodeId(null);
    toast.success(`Loaded "${flow.name}"`);
  };

  // Start fresh canvas
  const handleNewCanvas = () => {
    setCurrentFlowId(`flow-${Date.now()}`);
    setFlowName('New Custom Chatbot Flow');
    setFlowDescription('Description of this bot workflow...');
    setIsActive(true);
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedNodeId(null);
    toast.success("Initialized clean canvas");
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12rem)] min-h-[500px] bg-slate-50 dark:bg-slate-950 p-1 font-sans rounded-2xl overflow-hidden" id="wa-builder-root">
      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveMobileTab('sidebar')}
          className={`flex-1 py-2 text-center rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
            activeMobileTab === 'sidebar'
              ? 'bg-rose-500 text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
          }`}
        >
          Add & Meta
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab('canvas')}
          className={`flex-1 py-2 text-center rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
            activeMobileTab === 'canvas'
              ? 'bg-rose-500 text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
          }`}
        >
          Visual Canvas
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab('settings')}
          className={`flex-1 py-2 text-center rounded-lg text-[10px] font-black uppercase tracking-wider transition-all relative ${
            activeMobileTab === 'settings'
              ? 'bg-rose-500 text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
          }`}
        >
          Node Settings
          {selectedNodeId && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
          )}
        </button>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden h-full">
        {/* 1. Left Control Panel & Sidebar */}
        <div className={`w-full lg:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col justify-between overflow-y-auto shrink-0 ${
          activeMobileTab === 'sidebar' ? 'flex' : 'hidden lg:flex'
        }`}>
        <div className="flex flex-col gap-6">
          {/* Section: Config Meta */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-950 dark:text-white">Workflow Meta</h3>
              </div>
              {/* WhatsApp Connection Badge */}
              <div className="flex items-center gap-1.5" title="WhatsApp Engine Connection Status (Checks every 5s)">
                <span className={`w-2 h-2 rounded-full ${
                  waStatus === 'open' ? 'bg-emerald-500 animate-pulse' :
                  waStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
                  waStatus === 'qr' ? 'bg-blue-500 animate-pulse' :
                  waStatus === 'close' ? 'bg-rose-500' : 'bg-slate-400'
                }`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  waStatus === 'open' ? 'text-emerald-600 dark:text-emerald-400' :
                  waStatus === 'connecting' ? 'text-amber-600 dark:text-amber-400' :
                  waStatus === 'qr' ? 'text-blue-600 dark:text-blue-400' :
                  waStatus === 'close' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                }`}>
                  {waStatus === 'open' ? 'Connected' :
                   waStatus === 'connecting' ? 'Connecting...' :
                   waStatus === 'qr' ? 'Need Scan' :
                   waStatus === 'close' ? 'Offline' : 'Unknown'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Flow Name"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="w-full px-3.5 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-800 dark:text-slate-200"
              />
              <textarea
                placeholder="Description"
                value={flowDescription}
                onChange={(e) => setFlowDescription(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-800 dark:text-slate-200 resize-none"
              />
              {/* Active Toggle */}
              <button
                onClick={() => setIsActive(!isActive)}
                className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>Status: {isActive ? 'ACTIVE INTERCEPTOR' : 'PAUSED'}</span>
                {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Section: Node Palette */}
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono mb-2.5">Add Graph Nodes</h4>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => addNode(NodeType.START)}
                className="flex items-center gap-3 w-full p-2.5 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/20 rounded-xl text-xs font-bold transition-all text-left"
              >
                <div className="p-1.5 bg-emerald-600 rounded-lg text-white">
                  <Play className="w-3.5 h-3.5 fill-white" />
                </div>
                <div className="flex flex-col">
                  <span>Start Trigger Node</span>
                  <span className="text-[9px] font-medium text-emerald-600/70 font-sans">Sets WhatsApp Keywords</span>
                </div>
              </button>

              <button
                onClick={() => addNode(NodeType.BUTTON_MESSAGE)}
                className="flex items-center gap-3 w-full p-2.5 bg-blue-50/50 hover:bg-blue-50 dark:bg-blue-950/10 dark:hover:bg-blue-950/30 text-blue-800 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/20 rounded-xl text-xs font-bold transition-all text-left"
              >
                <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span>Interactive Button Msg</span>
                  <span className="text-[9px] font-medium text-blue-600/70 font-sans">Multi-Button (Max 3) Reply</span>
                </div>
              </button>

              <button
                onClick={() => addNode(NodeType.LIST_MESSAGE)}
                className="flex items-center gap-3 w-full p-2.5 bg-indigo-50/50 hover:bg-indigo-50 dark:bg-indigo-950/10 dark:hover:bg-indigo-950/30 text-indigo-800 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/20 rounded-xl text-xs font-bold transition-all text-left"
              >
                <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
                  <List className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span>Interactive List Msg</span>
                  <span className="text-[9px] font-medium text-indigo-600/70 font-sans">Multi-Row (Max 10) Menu</span>
                </div>
              </button>

              <button
                onClick={() => addNode(NodeType.CONDITION)}
                className="flex items-center gap-3 w-full p-2.5 bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/20 rounded-xl text-xs font-bold transition-all text-left"
              >
                <div className="p-1.5 bg-amber-500 rounded-lg text-white">
                  <HelpCircle className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span>Evaluation Condition</span>
                  <span className="text-[9px] font-medium text-amber-600/70 font-sans">Branch Attendance/Marks</span>
                </div>
              </button>

              <button
                onClick={() => addNode(NodeType.DELAY)}
                className="flex items-center gap-3 w-full p-2.5 bg-purple-50/50 hover:bg-purple-50 dark:bg-purple-950/10 dark:hover:bg-purple-950/30 text-purple-800 dark:text-purple-400 border border-purple-100/50 dark:border-purple-900/20 rounded-xl text-xs font-bold transition-all text-left"
              >
                <div className="p-1.5 bg-purple-600 rounded-lg text-white">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span>Delay Interceptor</span>
                  <span className="text-[9px] font-medium text-purple-600/70 font-sans">Pause bot replies (Seconds)</span>
                </div>
              </button>

              <button
                onClick={() => addNode(NodeType.ACTION)}
                className="flex items-center gap-3 w-full p-2.5 bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/10 dark:hover:bg-rose-950/30 text-rose-800 dark:text-rose-400 border border-rose-100/50 dark:border-rose-900/20 rounded-xl text-xs font-bold transition-all text-left"
              >
                <div className="p-1.5 bg-rose-600 rounded-lg text-white">
                  <Settings className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span>Action Execution Node</span>
                  <span className="text-[9px] font-medium text-rose-600/70 font-sans">Secure Gatekeeper/Database query</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Global Action Saves */}
        <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-6">
          <button
            onClick={handleNewCanvas}
            className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 transition-all hover:bg-slate-200"
          >
            New Flow
          </button>
          <button
            onClick={handleSaveFlow}
            disabled={isSaving}
            className="flex-1 py-2 px-3 bg-primary text-white rounded-xl text-xs font-bold transition-all hover:bg-slate-900 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Flow'}</span>
          </button>
        </div>
      </div>

        {/* 2. Middle Visual React Flow Builder Grid */}
        <div className={`flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm relative overflow-hidden flex flex-col ${
          activeMobileTab === 'canvas' ? 'flex' : 'hidden lg:flex'
        }`}>
        {/* Top bar loading flow selectors */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/30">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Load Saved Chatbot Workflow:</span>
            {isLoadingFlows ? (
              <span className="text-[10px] text-slate-400 animate-pulse">Scanning DB...</span>
            ) : flowsList.length > 0 ? (
              <select
                value={currentFlowId}
                onChange={(e) => {
                  const f = flowsList.find(fl => fl.id === e.target.value);
                  if (f) selectFlow(f);
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold py-1 px-3 rounded-lg focus:outline-none"
              >
                {flowsList.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.isActive ? '🟢' : '🔴'}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-slate-400 italic">No flows stored yet. Build & save!</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
              waStatus === 'open'
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
                : waStatus === 'connecting'
                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/30'
                : waStatus === 'qr'
                ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/30'
                : waStatus === 'close'
                ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/30'
                : 'bg-slate-50 dark:bg-slate-950/20 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-800'
            }`} title="WhatsApp Status: Automatically checked every 5 seconds">
              <span className={`w-1.5 h-1.5 rounded-full ${
                waStatus === 'open' ? 'bg-emerald-500 animate-pulse' :
                waStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
                waStatus === 'qr' ? 'bg-blue-500 animate-pulse' :
                waStatus === 'close' ? 'bg-rose-500' : 'bg-slate-400'
              }`} />
              <span>
                WA: {waStatus === 'open' ? 'CONNECTED' :
                     waStatus === 'connecting' ? 'CONNECTING' :
                     waStatus === 'qr' ? 'PAIRING NEEDED' :
                     waStatus === 'close' ? 'OFFLINE' : 'UNVERIFIED'}
              </span>
            </div>
            <span className="text-[10px] bg-primary/10 text-primary font-black uppercase tracking-widest py-1 px-2.5 rounded-full font-mono">
              V2 Bot Engine (Active)
            </span>

            {/* Quick connection actions */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 ml-auto sm:ml-0">
              <button
                onClick={handleRestartWA}
                disabled={isRestartingWA || isResettingWA}
                title="Force Reconnect / Restart WhatsApp Engine"
                className="flex items-center gap-1 py-1 px-2 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 rounded-md text-[9px] font-bold tracking-wide uppercase transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRestartingWA ? 'animate-spin text-amber-500' : 'text-slate-500'}`} />
                <span>{isRestartingWA ? 'Restarting...' : 'Restart'}</span>
              </button>
              <span className="text-slate-300 dark:text-slate-700 text-[10px] select-none">|</span>
              <button
                onClick={handleResetWA}
                disabled={isRestartingWA || isResettingWA}
                title="Wipe current WhatsApp credentials and reset state to fix linking errors"
                className="flex items-center gap-1 py-1 px-2 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-600/20 rounded-md text-[9px] font-bold tracking-wide uppercase transition-all disabled:opacity-50 cursor-pointer"
              >
                <Power className={`w-3 h-3 ${isResettingWA ? 'animate-pulse text-rose-500' : ''}`} />
                <span>{isResettingWA ? 'Resetting...' : 'Reset Session'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* The React Flow Workspace Canvas */}
        <div className="flex-1 h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setActiveMobileTab('settings'); // Auto focus settings on mobile when selecting node
            }}
            fitView
            className="bg-slate-50/30 dark:bg-slate-950/10"
          >
            <Controls />
            <MiniMap style={{ height: 100, width: 140 }} />
            <Background color="#cbd5e1" gap={16} size={1} />
          </ReactFlow>
        </div>
      </div>

      {/* 3. Right Selected Node Attributes Editor Panel */}
      {selectedNode ? (
        <div className={`w-full lg:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 overflow-y-auto shrink-0 animate-in fade-in slide-in-from-right duration-200 ${
          activeMobileTab === 'settings' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-5 w-full">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Node ID: {selectedNode.id}</span>
              <h4 className="text-xs font-black uppercase text-slate-900 dark:text-white mt-0.5">Edit Configuration</h4>
            </div>
            <button
              onClick={() => deleteNode(selectedNode.id)}
              className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all"
              title="Delete Node"
            >
              <Trash className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-5 w-full">
            {/* Condition node type editors */}
            {selectedNode.type === NodeType.START && (
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Trigger Keywords (Comma separated)</label>
                <input
                  type="text"
                  value={selectedNode.data.triggerKeywords || ''}
                  onChange={(e) => updateNodeData(selectedNode.id, { triggerKeywords: e.target.value })}
                  placeholder="e.g. hi, hello, help"
                  className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-800 dark:text-slate-200"
                />
                <span className="text-[10px] text-slate-400 italic font-medium leading-relaxed">
                  These keywords trigger this visual flow when sent by a registered parent.
                </span>
              </div>
            )}

            {selectedNode.type === NodeType.BUTTON_MESSAGE && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">WhatsApp Message Body</label>
                  <textarea
                    value={selectedNode.data.text || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { text: e.target.value })}
                    rows={4}
                    placeholder="Enter interactive text response..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-800 dark:text-slate-200"
                  />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Token options: {"{{student_name}}"}, {"{{attendance_percentage}}"}, {"{{exam_marks}}"}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Interactive Buttons (Up to 3)</label>
                  {(selectedNode.data.buttons || []).map((btn: any, idx: number) => (
                    <div key={btn.id} className="flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={btn.text}
                        onChange={(e) => {
                          const updatedBtns = [...selectedNode.data.buttons];
                          updatedBtns[idx].text = e.target.value;
                          updateNodeData(selectedNode.id, { buttons: updatedBtns });
                        }}
                        placeholder={`Button ${idx + 1}`}
                        className="flex-1 px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800 dark:text-slate-200"
                      />
                      <button
                        onClick={() => {
                          const updatedBtns = (selectedNode.data.buttons || []).filter((b: any) => b.id !== btn.id);
                          updateNodeData(selectedNode.id, { buttons: updatedBtns });
                        }}
                        className="text-rose-600 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {(selectedNode.data.buttons || []).length < 3 && (
                    <button
                      onClick={() => {
                        const updatedBtns = [
                          ...(selectedNode.data.buttons || []),
                          { id: `opt-${Date.now()}`, text: 'New Option' }
                        ];
                        updateNodeData(selectedNode.id, { buttons: updatedBtns });
                      }}
                      className="mt-1 py-1 px-2.5 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-blue-100/50 flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Option Button</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Footer Context Note</label>
                  <input
                    type="text"
                    value={selectedNode.data.footer || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { footer: e.target.value })}
                    placeholder="e.g. St. Antony's High School"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            )}

            {selectedNode.type === NodeType.LIST_MESSAGE && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">WhatsApp Message Body</label>
                  <textarea
                    value={selectedNode.data.text || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { text: e.target.value })}
                    rows={4}
                    placeholder="Enter interactive text response..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-800 dark:text-slate-200"
                  />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    Token options: {"{{student_name}}"}, {"{{attendance_percentage}}"}, {"{{exam_marks}}"}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Menu Button Label</label>
                  <input
                    type="text"
                    value={selectedNode.data.buttonText || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { buttonText: e.target.value })}
                    placeholder="e.g. View Menu"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Interactive Rows (Up to 10)</label>
                  {(selectedNode.data.rows || []).map((row: any, idx: number) => (
                    <div key={row.id} className="flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={row.title}
                        onChange={(e) => {
                          const updatedRows = [...selectedNode.data.rows];
                          updatedRows[idx].title = e.target.value;
                          updateNodeData(selectedNode.id, { rows: updatedRows });
                        }}
                        placeholder={`Row Option ${idx + 1}`}
                        className="flex-1 px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800 dark:text-slate-200"
                      />
                      <button
                        onClick={() => {
                          const updatedRows = (selectedNode.data.rows || []).filter((r: any) => r.id !== row.id);
                          updateNodeData(selectedNode.id, { rows: updatedRows });
                        }}
                        className="text-rose-600 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {(selectedNode.data.rows || []).length < 10 && (
                    <button
                      onClick={() => {
                        const updatedRows = [
                          ...(selectedNode.data.rows || []),
                          { id: `row-${Date.now()}`, title: 'New Menu Option' }
                        ];
                        updateNodeData(selectedNode.id, { rows: updatedRows });
                      }}
                      className="mt-1 py-1 px-2.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-indigo-100/50 flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Menu Row Option</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedNode.type === NodeType.CONDITION && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Database Field Criteria</label>
                  <select
                    value={selectedNode.data.field}
                    onChange={(e) => updateNodeData(selectedNode.id, { field: e.target.value as ConditionField })}
                    className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800"
                  >
                    <option value={ConditionField.ATTENDANCE}>Attendance Percentage (%)</option>
                    <option value={ConditionField.EXAM_MARKS}>Exam Marks %</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Operator</label>
                  <select
                    value={selectedNode.data.operator}
                    onChange={(e) => updateNodeData(selectedNode.id, { operator: e.target.value as ConditionOperator })}
                    className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800"
                  >
                    <option value={ConditionOperator.LESS_THAN}>&lt; Less Than</option>
                    <option value={ConditionOperator.GREATER_THAN}>&gt; Greater Than</option>
                    <option value={ConditionOperator.EQUAL_TO}>== Equal To</option>
                    <option value={ConditionOperator.LESS_THAN_OR_EQUAL}>&lt;= Less/Equal</option>
                    <option value={ConditionOperator.GREATER_THAN_OR_EQUAL}>&gt;= Greater/Equal</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Value Threshold</label>
                  <input
                    type="number"
                    value={selectedNode.data.value ?? 75}
                    onChange={(e) => updateNodeData(selectedNode.id, { value: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            )}

            {selectedNode.type === NodeType.DELAY && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Delay Duration (Seconds)</label>
                <input
                  type="number"
                  value={selectedNode.data.durationSeconds ?? 5}
                  onChange={(e) => updateNodeData(selectedNode.id, { durationSeconds: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800 dark:text-slate-200"
                />
                <span className="text-[10px] text-slate-400 font-medium italic mt-1 leading-relaxed">
                  Pauses chatbot thread before evaluating/dispatching the connected outgoing response.
                </span>
              </div>
            )}

            {selectedNode.type === NodeType.ACTION && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Action Type</label>
                  <select
                    value={selectedNode.data.actionType}
                    onChange={(e) => updateNodeData(selectedNode.id, { actionType: e.target.value as ActionType })}
                    className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800"
                  >
                    <option value={ActionType.AUTH_GUARD}>🔒 Parent Auth Gatekeeper</option>
                    <option value={ActionType.FETCH_ATTENDANCE}>📅 Fetch Attendance Data</option>
                    <option value={ActionType.FETCH_MARKS}>✍️ Fetch Exam Marks Data</option>
                    <option value={ActionType.TRIGGER_ALERT}>🔔 Send Custom Alert</option>
                    <option value={ActionType.SEND_PAYMENT_RECEIPT}>🧾 Send Payment Receipt</option>
                    <option value={ActionType.FETCH_HOLIDAYS}>🗓️ Fetch Holiday Status</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Custom Input Parameter</label>
                  <input
                    type="text"
                    value={selectedNode.data.customPayload || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { customPayload: e.target.value })}
                    placeholder="Payload arguments or settings..."
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none text-slate-800 dark:text-slate-200 font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`w-full lg:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col items-center justify-center text-center shrink-0 ${
          activeMobileTab === 'settings' ? 'flex' : 'hidden lg:flex'
        }`}>
          <Settings className="w-8 h-8 text-slate-300 dark:text-slate-700 animate-spin" style={{ animationDuration: '6s' }} />
          <h4 className="text-xs font-black uppercase text-slate-900 dark:text-white mt-3">Node Settings</h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px] leading-relaxed">
            Select any node on the canvas to configure trigger terms, messages, conditions, or actions.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
