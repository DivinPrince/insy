// Core types for Insy

// ============================================================================
// Framework Detection
// ============================================================================

export type FrameworkType = 'react' | 'vue' | 'svelte' | 'nextjs' | 'html';

export interface Framework {
  type: FrameworkType;
  version?: string;
  devtools?: boolean;
  baseFramework?: FrameworkType;
}

// ============================================================================
// Element Context
// ============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementInfo {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  boundingBox: BoundingBox;
  screenshot?: string; // base64 data URL
  html: string;
  css: Record<string, string>; // computed styles
  xpath: string;
  cssSelector: string;
}

export interface ReactContext {
  componentName?: string;
  props?: Record<string, unknown>;
  state?: Record<string, unknown>;
  hooks?: unknown[];
  fiberPath?: string[];
  source?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
}

export interface VueContext {
  componentName?: string;
  props?: Record<string, unknown>;
  data?: Record<string, unknown>;
  computed?: Record<string, unknown>;
  setupState?: Record<string, unknown>;
  source?: string;
}

export interface HtmlContext {
  attributes: Record<string, string>;
  dataAttributes: Record<string, string>;
  eventListeners?: string[];
}

export type FrameworkContext = ReactContext | VueContext | HtmlContext;

export interface SourceHints {
  dataSource?: string;
  filename?: string;
  lineNumber?: number;
}

export interface ElementContext {
  element: ElementInfo;
  framework: Framework;
  frameworkContext?: FrameworkContext;
  sourceHints?: SourceHints;
  prompt?: string; // User's prompt for the modification
}

// ============================================================================
// Source Files
// ============================================================================

export interface SourceFile {
  path: string;
  relevance: number; // 0-1 confidence score
  excerpt?: string;
  lineStart: number;
  lineEnd?: number;
}

// ============================================================================
// Code Modifications
// ============================================================================

export interface CodeModification {
  language: string;
  code: string;
  explanation?: string;
}


// ============================================================================
// File Attachments (Images)
// ============================================================================

export interface FileAttachment {
  type: 'image';
  mime: string; // e.g., 'image/png', 'image/jpeg', 'image/gif', 'image/webp'
  filename?: string;
  url: string; // base64 data URL
}

// ============================================================================
// WebSocket Messages
// ============================================================================

// Client → Server message types
export type WSClientMessageType = 'prompt/submit';

// Server → Client message types
export type WSServerMessageType =
  | 'connected'
  | 'status'
  | 'done'
  | 'error';

// Unified WebSocket message format
export interface WebSocketMessage<T = unknown> {
  type: WSClientMessageType | WSServerMessageType;
  payload: T;
}

export interface Message<T = unknown> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
}

// Client → Server Messages

// Conversation message for chat history
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  taggedElement?: {
    tagName: string;
    className?: string;
    id?: string;
    componentName?: string;
    sourceFile?: string;
    componentPath?: string[];
  };
}

export interface PromptSubmitPayload {
  // Instance identifier
  instanceId: string;

  // Element context (included directly, no separate element:select)
  element: ElementInfo;
  framework: Framework;
  frameworkContext?: FrameworkContext;
  sourceHints?: SourceHints;

  // Prompt data
  prompt: string;
  sessionId?: string; // Unique session ID per chat conversation
  conversationHistory?: ConversationMessage[]; // Full conversation history
  projectPath?: string; // Project root path for this request
  attachments?: FileAttachment[]; // Image attachments
}



// Server → Client Messages

export type StatusStage = 'analyzing' | 'ai_processing' | 'success' | 'error';

export interface StatusUpdatePayload {
  stage: StatusStage;
  message: string;
  progress?: number;
  instanceId?: string; // Instance-specific update
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// Configuration
// ============================================================================

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'opencode';
  model?: string;
  apiKey?: string;
}

export interface EditorConfig {
  mode: 'preview' | 'auto-apply';
  autoApply: boolean;
}

export interface UIConfig {
  theme: 'light' | 'dark' | 'auto';
  keybind: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface FrameworkConfig {
  detect: boolean;
  react?: { enabled: boolean };
  vue?: { enabled: boolean };
  html?: { enabled: boolean };
}

export interface SearchConfig {
  include: string[];
  exclude: string[];
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface InsyConfig {
  version: string;
  server?: ServerConfig;
  ai: AIConfig;
  editor?: EditorConfig;
  ui?: UIConfig;
  frameworks?: FrameworkConfig;
  search?: SearchConfig;
}

// ============================================================================
// Widget & UI State
// ============================================================================



export interface WidgetPreferences {
  position: { x: number; y: number };
  expanded: boolean;
  visible: boolean;
}

export interface UserSelections {
  selectedTool?: string;
  selectedModel?: string;
}

// ============================================================================
// Utilities
// ============================================================================

export function createMessage<T>(type: string, payload: T): Message<T> {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    timestamp: Date.now(),
  };
}
