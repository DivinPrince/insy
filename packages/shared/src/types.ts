// Core types for PixelCode

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
// Tool & Model Management
// ============================================================================

export interface ToolInfo {
  name: string;           // e.g., "OpenCode"
  identifier: string;     // e.g., "opencode" (lowercase, used for registry lookup)
  version?: string;
  available: boolean;
}

export interface ModelInfo {
  id: string;             // e.g., "claude-sonnet-4.5", "gpt-5"
  name: string;           // Display name
  provider?: string;      // Optional provider info
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
// Structured Code Changes (XML-based AI response format)
// ============================================================================

export type CodeChangeAction = 'create' | 'modify' | 'delete';

export interface CodeChange {
  filePath: string;
  action: CodeChangeAction;
  language: string;
  content: string;          // Full file content (empty for delete)
  description?: string;     // Optional description of this specific change
}

export interface StructuredCodeResponse {
  changes: CodeChange[];
  summary?: string;         // Overall summary of all changes
}

export interface DiffChange {
  type: 'add' | 'remove' | 'context';
  line: string;
  lineNumber: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface DiffResult {
  id: string;
  file: string;
  originalCode: string;
  modifiedCode: string;
  unifiedDiff: string;
  hunks: DiffHunk[];
}

// ============================================================================
// WebSocket Messages
// ============================================================================

export interface Message<T = unknown> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
}

// Client → Server Messages

export interface ElementSelectPayload {
  element: ElementInfo;
  framework?: Framework;
  frameworkContext?: FrameworkContext;
  sourceHints?: SourceHints;
  projectPath?: string;   // Project root path for this element
}

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
  elementId: string;
  prompt: string;
  mode?: 'preview' | 'auto-apply';
  tool?: string;          // User-selected tool
  model?: string;         // User-selected model
  sessionId?: string;     // Unique session ID per chat conversation
  conversationHistory?: ConversationMessage[];  // Full conversation history
  projectPath?: string;   // Project root path for this request
}

export interface DiffApprovalPayload {
  diffId: string;
  action: 'apply' | 'reject';
}

export interface ConfigUpdatePayload {
  apiKey?: string;
  provider?: 'openai' | 'anthropic' | 'opencode';
  model?: string;
  autoApply?: boolean;
  tool?: string;          // Tool preference
}

// New Tool & Model Payloads

export interface ToolsListPayload {
  tools: ToolInfo[];
}

export interface ModelsListPayload {
  tool: string;           // Tool identifier
  models: ModelInfo[];
}

export interface ToolConfigPayload {
  tool?: string;          // Selected tool identifier
  model?: string;         // Selected model ID
}

// Server → Client Messages

export type StatusStage =
  | 'analyzing'
  | 'ai_processing'
  | 'generating_diff'
  | 'complete'
  | 'error';

export interface StatusUpdatePayload {
  stage: StatusStage;
  message: string;
  progress?: number;
}

export interface SourceFoundPayload {
  elementId: string;
  files: SourceFile[];
}

export interface DiffGeneratedPayload {
  diffId: string;
  elementId: string;
  file: string;
  diff: string;
  preview: {
    before: string;
    after: string;
  };
}

export interface MultiDiffGeneratedPayload {
  elementId: string;
  summary?: string;
  diffs: Array<{
    diffId: string;
    file: string;
    action: CodeChangeAction;
    diff: string;
    preview: {
      before: string;
      after: string;
    };
  }>;
}

export interface DiffAppliedPayload {
  diffId: string;
  file: string;
  success: boolean;
  backupPath?: string;
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
  backupEnabled: boolean;
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

export interface PixelCodeConfig {
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

export interface RecentEdit {
  id: string;
  file: string;
  timestamp: number;
  description: string;
}

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
