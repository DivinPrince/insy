import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { ToolInfo, ModelInfo, CodeChangeAction } from '@pixelcode/shared';

export type ChatState = 'prompt' | 'loading' | 'diff' | 'applying' | 'complete' | 'error';

export interface ChatMessage {
  id: string;
  type: 'user' | 'system' | 'diff' | 'error';
  content: string;
  timestamp: number;
}

export interface DiffPreview {
  file: string;
  before: string;
  after: string;
  diffId: string;
  action?: CodeChangeAction;  // 'create' | 'modify' | 'delete'
}

// Cursor icon for element selector
const CursorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  </svg>
);

// Terminal icon for console logs
const TerminalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

// Send icon
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16l4-4-4-4" />
    <path d="M8 12h8" />
  </svg>
);

interface ChatPanelProps {
  position: { x: number; y: number };
  state: ChatState;
  messages: ChatMessage[];
  diff?: DiffPreview;
  diffs?: DiffPreview[];  // Multiple diffs support
  diffSummary?: string;   // Summary of all changes
  statusMessage?: string;
  progress?: number;
  // Tool & Model selection
  tools?: ToolInfo[];
  selectedTool?: string;
  models?: ModelInfo[];
  selectedModel?: string;
  onToolChange?: (toolIdentifier: string) => void;
  onModelChange?: (modelId: string) => void;
  onSubmitPrompt: (prompt: string) => void;
  onApplyDiff: (diffId?: string) => void;  // Optional diffId for specific diff
  onRejectDiff: (diffId?: string) => void; // Optional diffId for specific diff
  onApplyAllDiffs?: () => void;   // Apply all diffs at once
  onRejectAllDiffs?: () => void;  // Reject all diffs at once
  onClose: () => void;
  onRetry?: () => void;
  // New actions
  onSelectElement?: () => void;
  onTagConsole?: () => void;
  isSelectingElement?: boolean;
  // Undo/Keep actions
  hasChanges?: boolean;
  onUndoAll?: () => void;
  onKeepAll?: () => void;
}

export const ChatPanel: FunctionComponent<ChatPanelProps> = ({
  position,
  state,
  messages,
  diff,
  diffs,
  diffSummary,
  statusMessage,
  progress,
  tools,
  selectedTool,
  models,
  selectedModel,
  onToolChange,
  onModelChange,
  onSubmitPrompt,
  onApplyDiff,
  onRejectDiff,
  onApplyAllDiffs,
  onRejectAllDiffs,
  onClose,
  onRetry,
  onSelectElement,
  onTagConsole,
  isSelectingElement,
  hasChanges,
  onUndoAll,
  onKeepAll,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDiffIndex, setSelectedDiffIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Use diffs array if provided, otherwise wrap single diff
  const allDiffs = diffs && diffs.length > 0 ? diffs : (diff ? [diff] : []);
  const currentViewDiff = allDiffs[selectedDiffIndex] || null;

  // Auto-show settings panel when error occurs so user can change tool/model
  useEffect(() => {
    if (state === 'error') {
      setShowSettings(true);
    }
  }, [state]);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (inputValue.trim() && state === 'prompt') {
      onSubmitPrompt(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputValue]);

  // Calculate position to stay within viewport
  const panelStyle: h.JSX.CSSProperties = {
    position: 'fixed',
    left: `${Math.min(position.x, window.innerWidth - 520)}px`,
    top: `${Math.min(position.y, window.innerHeight - 500)}px`,
    width: '500px',
    maxHeight: '600px',
    backgroundColor: '#fff',
    borderRadius: '16px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    zIndex: 999998,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e5e5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasChanges && (
            <span style={{ fontSize: '12px', color: '#666' }}>1 File</span>
          )}
          {state === 'loading' && (
            <span
              style={{
                fontSize: '12px',
                color: '#666',
                backgroundColor: '#f5f5f5',
                padding: '3px 10px',
                borderRadius: '12px',
                fontWeight: '500',
              }}
            >
              Processing...
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Undo All */}
          {hasChanges && (
            <button
              onClick={onUndoAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#666',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: '6px',
                fontWeight: '500',
                fontFamily: 'inherit',
              }}
              title="Undo all changes"
            >
              Undo All
            </button>
          )}
          {/* Keep All */}
          {hasChanges && (
            <button
              onClick={onKeepAll}
              style={{
                background: '#000',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: '500',
                fontFamily: 'inherit',
              }}
              title="Keep all changes"
            >
              Keep All
            </button>
          )}
          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: showSettings ? '#f5f5f5' : 'transparent',
              border: 'none',
              color: '#666',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '6px 8px',
              lineHeight: '1',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#999',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: '1',
              borderRadius: '6px',
              fontWeight: '300',
            }}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e5e5',
            backgroundColor: '#fafafa',
          }}
        >
          {/* Tool Selector */}
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                color: '#666',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: '600',
              }}
            >
              AI Tool
            </label>
            <select
              value={selectedTool || ''}
              onChange={(e) => onToolChange?.((e.target as HTMLSelectElement).value)}
              disabled={state === 'loading' || state === 'applying'}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                backgroundColor: '#fff',
                color: '#000',
                fontSize: '13px',
                fontFamily: 'inherit',
                cursor: state === 'loading' || state === 'applying' ? 'not-allowed' : 'pointer',
                opacity: state === 'loading' || state === 'applying' ? 0.5 : 1,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
              }}
            >
              {!tools || tools.length === 0 ? (
                <option value="">Loading tools...</option>
              ) : (
                tools.map((tool) => (
                  <option key={tool.identifier} value={tool.identifier}>
                    {tool.name}{tool.version ? ` (${tool.version})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Model Selector */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                color: '#666',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: '600',
              }}
            >
              Model
            </label>
            <select
              value={selectedModel || ''}
              onChange={(e) => onModelChange?.((e.target as HTMLSelectElement).value)}
              disabled={state === 'loading' || state === 'applying' || !models || models.length === 0}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                backgroundColor: '#fff',
                color: '#000',
                fontSize: '13px',
                fontFamily: 'inherit',
                cursor: state === 'loading' || state === 'applying' || !models || models.length === 0 ? 'not-allowed' : 'pointer',
                opacity: state === 'loading' || state === 'applying' || !models || models.length === 0 ? 0.5 : 1,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
              }}
            >
              {!models || models.length === 0 ? (
                <option value="">
                  {selectedTool ? 'Loading models...' : 'Select a tool first'}
                </option>
              ) : (
                models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}{model.provider ? ` (${model.provider})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: '120px',
          maxHeight: '300px',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              lineHeight: '1.5',
              ...(msg.type === 'user'
                ? {
                    backgroundColor: '#000',
                    color: '#fff',
                    alignSelf: 'flex-end',
                    maxWidth: '85%',
                  }
                : msg.type === 'error'
                ? {
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    alignSelf: 'flex-start',
                    border: '1px solid #fecaca',
                  }
                : {
                    backgroundColor: '#f5f5f5',
                    color: '#333',
                    alignSelf: 'flex-start',
                  }),
            }}
          >
            {msg.content}
          </div>
        ))}

        {/* Loading State */}
        {state === 'loading' && statusMessage && (
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '12px',
              color: '#333',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: progress !== undefined ? '10px' : '0' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid #000',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span style={{ fontSize: '13px' }}>{statusMessage}</span>
            </div>
            {progress !== undefined && (
              <div
                style={{
                  width: '100%',
                  height: '3px',
                  backgroundColor: '#e5e5e5',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#000',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: '#fef2f2',
              borderRadius: '12px',
              border: '1px solid #fecaca',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px' }}>⚠</span>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#dc2626' }}>Error occurred</span>
            </div>
            <div style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}>
              {statusMessage || 'An error occurred while processing your request.'}
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
              Try selecting a different tool or model above, then try again.
            </div>
            <button
              onClick={() => onRetry?.()}
              style={{
                padding: '6px 14px',
                border: '1px solid #dc2626',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                color: '#dc2626',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Diff Preview */}
        {state === 'diff' && allDiffs.length > 0 && (
          <div
            style={{
              backgroundColor: '#fafafa',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid #e5e5e5',
            }}
          >
            {/* File tabs for multiple diffs */}
            {allDiffs.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: '2px',
                  padding: '8px 8px 0',
                  backgroundColor: '#f0f0f0',
                  overflowX: 'auto',
                }}
              >
                {allDiffs.map((d, index) => (
                  <button
                    key={d.diffId}
                    onClick={() => setSelectedDiffIndex(index)}
                    style={{
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: '6px 6px 0 0',
                      backgroundColor: selectedDiffIndex === index ? '#fff' : 'transparent',
                      color: selectedDiffIndex === index ? '#000' : '#666',
                      fontSize: '11px',
                      fontWeight: selectedDiffIndex === index ? '600' : '400',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {d.action === 'create' && <span style={{ color: '#16a34a' }}>+</span>}
                    {d.action === 'delete' && <span style={{ color: '#dc2626' }}>−</span>}
                    {d.action === 'modify' && <span style={{ color: '#ca8a04' }}>~</span>}
                    {d.file.split(/[/\\]/).pop() || d.file}
                  </button>
                ))}
              </div>
            )}
            
            {currentViewDiff && (
              <>
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#f5f5f5',
                    borderBottom: '1px solid #e5e5e5',
                    fontSize: '12px',
                    color: '#666',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {currentViewDiff.action === 'create' && (
                    <span style={{ 
                      backgroundColor: '#dcfce7', 
                      color: '#16a34a', 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600',
                    }}>NEW</span>
                  )}
                  {currentViewDiff.action === 'delete' && (
                    <span style={{ 
                      backgroundColor: '#fee2e2', 
                      color: '#dc2626', 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600',
                    }}>DELETE</span>
                  )}
                  {currentViewDiff.action === 'modify' && (
                    <span style={{ 
                      backgroundColor: '#fef3c7', 
                      color: '#ca8a04', 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600',
                    }}>MODIFY</span>
                  )}
                  📄 {currentViewDiff.file.split(/[/\\]/).pop() || currentViewDiff.file}
                </div>
                <div
                  style={{
                    padding: '14px',
                    maxHeight: '200px',
                    overflow: 'auto',
                    fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                    fontSize: '11px',
                    lineHeight: '1.5',
                  }}
                >
                  {/* Show before/after for modify, only after for create, only before for delete */}
                  {currentViewDiff.action !== 'create' && currentViewDiff.before && (
                    <div style={{ marginBottom: currentViewDiff.action !== 'delete' ? '10px' : '0' }}>
                      <div style={{ color: '#dc2626', marginBottom: '4px', fontWeight: '500' }}>
                        {currentViewDiff.action === 'delete' ? '− File to be deleted:' : '− Before:'}
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '10px',
                          backgroundColor: '#fef2f2',
                          borderRadius: '6px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: '#b91c1c',
                          maxHeight: '80px',
                          overflow: 'auto',
                          border: '1px solid #fecaca',
                        }}
                      >
                        {currentViewDiff.before.substring(0, 500)}{currentViewDiff.before.length > 500 ? '...' : ''}
                      </pre>
                    </div>
                  )}
                  {currentViewDiff.action !== 'delete' && currentViewDiff.after && (
                    <div>
                      <div style={{ color: '#16a34a', marginBottom: '4px', fontWeight: '500' }}>
                        {currentViewDiff.action === 'create' ? '+ New file:' : '+ After:'}
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '10px',
                          backgroundColor: '#f0fdf4',
                          borderRadius: '6px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: '#15803d',
                          maxHeight: '80px',
                          overflow: 'auto',
                          border: '1px solid #bbf7d0',
                        }}
                      >
                        {currentViewDiff.after.substring(0, 500)}{currentViewDiff.after.length > 500 ? '...' : ''}
                      </pre>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons for Diff */}
      {state === 'diff' && allDiffs.length > 0 && (
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e5e5e5',
            display: 'flex',
            gap: '10px',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Left side - file count */}
          <div style={{ fontSize: '12px', color: '#666' }}>
            {allDiffs.length > 1 
              ? `${selectedDiffIndex + 1} of ${allDiffs.length} files`
              : '1 file'}
          </div>
          
          {/* Right side - actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {allDiffs.length > 1 ? (
              <>
                {/* Reject All */}
                <button
                  onClick={() => onRejectAllDiffs?.()}
                  style={{
                    padding: '8px 18px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    color: '#666',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Reject All
                </button>
                {/* Apply All */}
                <button
                  onClick={() => onApplyAllDiffs?.()}
                  style={{
                    padding: '8px 18px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#000',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Apply All ({allDiffs.length})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onRejectDiff(currentViewDiff?.diffId)}
                  style={{
                    padding: '8px 18px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    color: '#666',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Reject
                </button>
                <button
                  onClick={() => onApplyDiff(currentViewDiff?.diffId)}
                  style={{
                    padding: '8px 18px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#000',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Apply
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Input Area - Cursor-like design */}
      {state === 'prompt' && (
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #e5e5e5',
          }}
        >
          <div
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: '12px',
              border: '1px solid #e5e5e5',
              overflow: 'hidden',
            }}
          >
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onInput={(e) => setInputValue((e.target as HTMLTextAreaElement).value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="Plan, @ for context, / for commands"
              rows={1}
              style={{
                width: '100%',
                padding: '14px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#000',
                fontSize: '14px',
                outline: 'none',
                fontFamily: 'inherit',
                resize: 'none',
                lineHeight: '1.5',
                minHeight: '24px',
                maxHeight: '120px',
              }}
            />
            
            {/* Action bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderTop: '1px solid #e5e5e5',
                backgroundColor: '#fafafa',
              }}
            >
              {/* Left actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* Cursor/Element Selector */}
                <button
                  onClick={onSelectElement}
                  style={{
                    background: isSelectingElement ? '#000' : 'transparent',
                    border: 'none',
                    color: isSelectingElement ? '#fff' : '#666',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: '500',
                    transition: 'all 0.15s ease',
                  }}
                  title="Select an element on page"
                >
                  <CursorIcon />
                  <span>Cursor</span>
                </button>

                {/* Terminal/Console */}
                <button
                  onClick={onTagConsole}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: '500',
                    transition: 'all 0.15s ease',
                  }}
                  title="Tag console logs"
                >
                  <TerminalIcon />
                  <span>Console</span>
                </button>

                {/* Dropdown for model/tool - compact */}
                <div style={{ position: 'relative', marginLeft: '4px', maxWidth: '120px' }}>
                  <select
                    value={selectedModel || ''}
                    onChange={(e) => onModelChange?.((e.target as HTMLSelectElement).value)}
                    disabled={!models || models.length === 0}
                    style={{
                      appearance: 'none',
                      background: 'transparent',
                      border: 'none',
                      color: '#999',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      padding: '4px 16px 4px 4px',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0 center',
                    }}
                  >
                    {models?.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Right side - send button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                style={{
                  width: '32px',
                  height: '32px',
                  padding: '0',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: inputValue.trim() ? '#000' : '#e5e5e5',
                  color: inputValue.trim() ? '#fff' : '#999',
                  cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                title="Send message"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Applying State */}
      {state === 'applying' && (
        <div
          style={{
            padding: '20px',
            borderTop: '1px solid #e5e5e5',
            textAlign: 'center',
            color: '#666',
            fontSize: '13px',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid #000',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '10px',
            }}
          />
          Applying changes...
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
