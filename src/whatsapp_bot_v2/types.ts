export enum NodeType {
  START = 'start',
  BUTTON_MESSAGE = 'button_message',
  LIST_MESSAGE = 'list_message',
  CONDITION = 'condition',
  DELAY = 'delay',
  ACTION = 'action'
}

export interface NodeButton {
  id: string;
  text: string;
}

export interface StartNodeData {
  triggerKeywords: string; // Comma-separated triggers
  description: string;
}

export interface ButtonMessageNodeData {
  text: string;
  buttons: NodeButton[];
  footer?: string;
}

export enum ConditionField {
  ATTENDANCE = 'attendance_percentage',
  EXAM_MARKS = 'exam_marks'
}

export enum ConditionOperator {
  LESS_THAN = '<',
  GREATER_THAN = '>',
  EQUAL_TO = '==',
  LESS_THAN_OR_EQUAL = '<=',
  GREATER_THAN_OR_EQUAL = '>='
}

export interface ConditionNodeData {
  field: ConditionField;
  operator: ConditionOperator;
  value: number;
}

export interface DelayNodeData {
  durationSeconds: number;
}

export enum ActionType {
  AUTH_GUARD = 'auth_guard',
  FETCH_ATTENDANCE = 'fetch_attendance',
  FETCH_MARKS = 'fetch_marks',
  TRIGGER_ALERT = 'trigger_alert',
  SEND_PAYMENT_RECEIPT = 'send_payment_receipt',
  FETCH_HOLIDAYS = 'fetch_holidays'
}

export interface ActionNodeData {
  actionType: ActionType;
  customPayload?: string;
}

// Custom types for React Flow representation
export interface BotWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BotSession {
  id: string; // phoneNumber
  currentFlowId: string;
  currentNodeId: string;
  variables: Record<string, any>;
  lastInteractionAt: string;
  last_activity_at?: string;
  history: string[];
  fullJid?: string;
}

export interface WhatsAppCommunity {
  id?: string; // Firestore auto-gen
  communityJid: string; // e.g., '120363321548@g.us'
  communityName: string; // e.g., "St. Antony's Primary Wing"
  associatedClasses: string[]; // e.g., ['6A', '6B', '7A']
  isActive: boolean;
}

