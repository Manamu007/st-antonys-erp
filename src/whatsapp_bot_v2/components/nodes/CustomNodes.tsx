import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play, MessageSquare, ShieldAlert, Hourglass, HelpCircle, AlertCircle, ArrowRight, List } from 'lucide-react';
import { NodeType, ConditionField, ConditionOperator, ActionType } from '../../types';

// Premium node container styling
const NodeContainer: React.FC<{
  title: string;
  icon: React.ReactNode;
  headerBg: string;
  borderColor: string;
  children: React.ReactNode;
  selected?: boolean;
}> = ({ title, icon, headerBg, borderColor, children, selected }) => (
  <div
    className={`w-64 bg-white dark:bg-slate-900 rounded-xl shadow-lg border-2 overflow-hidden transition-all duration-200 ${
      selected ? 'ring-4 ring-primary/20 scale-102 border-primary' : borderColor
    }`}
  >
    <div className={`px-4 py-2.5 flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider ${headerBg}`}>
      {icon}
      <span>{title}</span>
    </div>
    <div className="p-4 flex flex-col gap-3 text-slate-700 dark:text-slate-300">
      {children}
    </div>
  </div>
);

// 1. Start Node Component
export const StartNode: React.FC<any> = ({ data, selected }) => {
  const keywords = data.triggerKeywords ? data.triggerKeywords.split(',').map((k: string) => k.trim()) : [];
  
  return (
    <NodeContainer
      title="Start"
      icon={<Play className="w-4 h-4 fill-white" />}
      headerBg="bg-emerald-600 dark:bg-emerald-700"
      borderColor="border-emerald-200 dark:border-emerald-800"
      selected={selected}
    >
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-mono">
        Triggers:
      </div>
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw: string, idx: number) => (
            <span
              key={idx}
              className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-md text-[10px] font-mono font-black border border-emerald-100 dark:border-emerald-900/40 shadow-sm"
            >
              "{kw}"
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-slate-400 italic">No keywords. Triggers on any message.</span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />
    </NodeContainer>
  );
};

// 2. Interactive Button Message Node
export const ButtonMessageNode: React.FC<any> = ({ data, selected }) => {
  const buttons = data.buttons || [];
  
  return (
    <NodeContainer
      title="Interactive Message"
      icon={<MessageSquare className="w-4 h-4" />}
      headerBg="bg-blue-600 dark:bg-blue-700"
      borderColor="border-blue-200 dark:border-blue-800"
      selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />
      
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Message Text:</span>
        <div className="text-xs bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-900 max-h-20 overflow-y-auto font-sans leading-relaxed text-slate-600 dark:text-slate-400 italic whitespace-pre-wrap">
          {data.text || "Type message content..."}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Buttons (Max 3):</span>
        {buttons.length > 0 ? (
          <div className="flex flex-col gap-2">
            {buttons.map((btn: any, idx: number) => (
              <div key={btn.id || idx} className="relative flex items-center justify-between">
                <div className="w-full text-[11px] font-bold text-center py-1.5 px-3 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-100/70 dark:border-blue-900/30 rounded-lg shadow-sm">
                  {btn.text || `Button ${idx + 1}`}
                </div>
                {/* Visual Connector Handle */}
                <Handle
                  type="source"
                  position={Position.Bottom}
                  id={`btn-${idx}`}
                  style={{ left: `${25 + idx * 25}%` }}
                  className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 shadow-sm hover:scale-125 transition-transform"
                />
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">No interactive buttons added.</span>
        )}
      </div>

      {data.footer && (
        <div className="text-[9px] text-slate-400 font-medium tracking-tight italic border-t border-slate-100 dark:border-slate-900 pt-1.5 mt-1 text-right">
          {data.footer}
        </div>
      )}
    </NodeContainer>
  );
};

// 3. Condition Node Component
export const ConditionNode: React.FC<any> = ({ data, selected }) => {
  const getFieldLabel = (f: ConditionField) => {
    if (f === ConditionField.ATTENDANCE) return 'Attendance %';
    if (f === ConditionField.EXAM_MARKS) return 'Exam Marks %';
    return f;
  };

  return (
    <NodeContainer
      title="Check Condition"
      icon={<HelpCircle className="w-4 h-4" />}
      headerBg="bg-amber-500 dark:bg-amber-600"
      borderColor="border-amber-200 dark:border-amber-800"
      selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />

      <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 p-2.5 rounded-lg text-xs font-bold text-amber-800 dark:text-amber-400">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="text-[9px] uppercase tracking-wider text-amber-500/80 font-mono">Evaluate:</span>
          <span>{getFieldLabel(data.field || ConditionField.ATTENDANCE)} {data.operator || ConditionOperator.LESS_THAN} {data.value ?? 75}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] font-black tracking-widest uppercase font-mono mt-1 text-slate-400">
        <span className="text-emerald-600 dark:text-emerald-400">True</span>
        <span className="text-rose-600 dark:text-rose-400">False</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ left: '25%' }}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ left: '75%' }}
        className="!w-3 !h-3 !bg-rose-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />
    </NodeContainer>
  );
};

// 4. Delay Node Component
export const DelayNode: React.FC<any> = ({ data, selected }) => {
  return (
    <NodeContainer
      title="Delay Timer"
      icon={<Hourglass className="w-4 h-4" />}
      headerBg="bg-purple-600 dark:bg-purple-700"
      borderColor="border-purple-200 dark:border-purple-800"
      selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />

      <div className="flex flex-col gap-1 text-center py-2 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-lg">
        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest font-mono">Duration:</span>
        <span className="text-sm font-black text-purple-700 dark:text-purple-400">{data.durationSeconds ?? 5} Seconds</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />
    </NodeContainer>
  );
};

// 5. Action Node Component
export const ActionNode: React.FC<any> = ({ data, selected }) => {
  const getActionLabel = (act: ActionType) => {
    switch (act) {
      case ActionType.AUTH_GUARD:
        return '🔒 Parent Auth Gatekeeper';
      case ActionType.FETCH_ATTENDANCE:
        return '📅 Fetch Attendance';
      case ActionType.FETCH_MARKS:
        return '✍️ Fetch Exam Marks';
      case ActionType.TRIGGER_ALERT:
        return '🔔 Trigger Custom Alert';
      case ActionType.SEND_PAYMENT_RECEIPT:
        return '🧾 Send Payment Receipt';
      case ActionType.FETCH_HOLIDAYS:
        return '🗓️ Fetch Holiday Status';
      default:
        return '⚡ Custom Action';
    }
  };

  return (
    <NodeContainer
      title="Execute Action"
      icon={<ShieldAlert className="w-4 h-4" />}
      headerBg="bg-rose-600 dark:bg-rose-700"
      borderColor="border-rose-200 dark:border-rose-800"
      selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-rose-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Operations:</span>
        <div className="text-xs font-bold py-2 px-3 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 rounded-lg shadow-sm">
          {getActionLabel(data.actionType || ActionType.AUTH_GUARD)}
        </div>
      </div>

      {data.customPayload && (
        <div className="text-[10px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900 p-2 rounded text-slate-500 dark:text-slate-400 truncate">
          Payload: {data.customPayload}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3 !h-3 !bg-rose-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />
    </NodeContainer>
  );
};

// 6. Interactive List Message Node
export const ListMessageNode: React.FC<any> = ({ data, selected }) => {
  const rows = data.rows || [];
  
  return (
    <NodeContainer
      title="List Message"
      icon={<List className="w-4 h-4" />}
      headerBg="bg-indigo-600 dark:bg-indigo-700"
      borderColor="border-indigo-200 dark:border-indigo-800"
      selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-slate-900 shadow-md"
      />
      
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Message Body Text:</span>
        <div className="text-xs bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-900 max-h-20 overflow-y-auto font-sans leading-relaxed text-slate-600 dark:text-slate-400 italic whitespace-pre-wrap">
          {data.text || "Select from menu..."}
        </div>
      </div>

      <div className="flex flex-col gap-1 mt-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Menu Button Label:</span>
        <div className="text-[11px] font-bold py-1.5 px-3 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100/70 dark:border-indigo-900/30 rounded-lg shadow-sm">
          {data.buttonText || "View Menu"}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">List Rows (Max 10):</span>
        {rows.length > 0 ? (
          <div className="flex flex-col gap-2">
            {rows.map((row: any, idx: number) => (
              <div key={row.id || idx} className="relative flex items-center justify-between">
                <div className="w-full text-[11px] font-bold text-left py-1.5 px-3 bg-indigo-50/30 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100/50 dark:border-indigo-900/20 rounded-lg shadow-sm">
                  {row.title || `Row ${idx + 1}`}
                </div>
                {/* Visual Connector Handle */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`row-${idx}`}
                  style={{ top: '50%' }}
                  className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-white dark:!border-slate-900 shadow-sm hover:scale-125 transition-transform"
                />
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">No list options added.</span>
        )}
      </div>
    </NodeContainer>
  );
};

// Export all node types mapped for React Flow
export const nodeTypes = {
  [NodeType.START]: StartNode,
  [NodeType.BUTTON_MESSAGE]: ButtonMessageNode,
  [NodeType.LIST_MESSAGE]: ListMessageNode,
  [NodeType.CONDITION]: ConditionNode,
  [NodeType.DELAY]: DelayNode,
  [NodeType.ACTION]: ActionNode,
};
export default nodeTypes;
