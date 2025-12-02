import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { RecentEdit, ToolInfo, ModelInfo, ElementInfo, CodeChangeAction } from '@pixelcode/shared';
import { StatusBadge } from './status-badge.js';

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

interface ChatMessage {
  id: string;
  type: 'user' | 'system' | 'error';
  content: string;
  timestamp: number;
}

interface DiffPreview {
  file: string;
  before: string;
  after: string;
  diffId: string;
  action?: CodeChangeAction;
}

interface WidgetPanelProps {
  connected: boolean;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onClose: () => void;
  recentEdits: RecentEdit[];
  position: { x: number; y: number };
  // Chat functionality
  onSubmitPrompt?: (prompt: string) => void;
  messages?: ChatMessage[];
  isLoading?: boolean;
  statusMessage?: string;
  // Actions
  onSelectElement?: () => void;
  onTagConsole?: () => void;
  isSelectingElement?: boolean;
  // Model selection
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  // Undo/Keep actions
  hasChanges?: boolean;
  onUndoAll?: () => void;
  onKeepAll?: () => void;
  // Selected element
  selectedElementInfo?: ElementInfo | null;
  // Diff preview
  showDiff?: boolean;
  diffs?: DiffPreview[];
  onApplyDiff?: (diffId?: string) => void;
  onRejectDiff?: (diffId?: string) => void;
  onApplyAllDiffs?: () => void;
  onRejectAllDiffs?: () => void;
}

export const WidgetPanel: FunctionComponent<WidgetPanelProps> = ({
  connected,
  active,
  onActivate,
  onDeactivate,
  onClose,
  recentEdits,
  position,
  onSubmitPrompt,
  messages = [],
  isLoading,
  statusMessage,
  onSelectElement,
  onTagConsole,
  isSelectingElement,
  models,
  selectedModel,
  onModelChange,
  hasChanges,
  onUndoAll,
  onKeepAll,
  selectedElementInfo,
  showDiff,
  diffs = [],
  onApplyDiff,
  onRejectDiff,
  onApplyAllDiffs,
  onRejectAllDiffs,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatTimestamp = (ts: number) => {
    const now = Date.now();
    const diff = now - ts;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const handleSubmit = (e?: Event) => {
    e?.preventDefault();
    if (inputValue.trim() && onSubmitPrompt && !isLoading) {
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
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputValue]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      style={{
        position: 'fixed',
        right: `${position.x}px`,
        bottom: `${position.y + 60}px`,
        width: '400px',
        maxHeight: '600px',
        backgroundColor: '#fff',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        zIndex: 999996,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp 0.2s ease-out',
        overflow: 'hidden',
      }}
    >
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
          {!hasChanges && (
            <>
              <span style={{ fontSize: '16px', fontWeight: '600', color: '#000', letterSpacing: '-0.02em' }}>
                PixelCode
              </span>
              <StatusBadge connected={connected} />
            </>
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
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{
              background: showHistory ? '#f5f5f5' : 'transparent',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Recent edits"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
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
            title="Minimize"
          >
            ×
          </button>
        </div>
      </div>

      {/* Recent Edits Panel (collapsible) */}
      {showHistory && (
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #e5e5e5',
            backgroundColor: '#fafafa',
            maxHeight: '150px',
            overflow: 'auto',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Recent Edits
          </div>
          {recentEdits.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#999', textAlign: 'center', padding: '12px' }}>
              No edits yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {recentEdits.slice(0, 5).map((edit) => (
                <div
                  key={edit.id}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    fontSize: '12px',
                    border: '1px solid #e5e5e5',
                  }}
                >
                  <div style={{ color: '#000', fontWeight: '500', marginBottom: '2px' }}>
                    {edit.file.split('/').pop()}
                  </div>
                  <div style={{ color: '#999', fontSize: '11px' }}>
                    {formatTimestamp(edit.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
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
          minHeight: '200px',
          maxHeight: '350px',
        }}
      >
        {/* Selected Element Badge */}
        {selectedElementInfo && messages.length === 0 && !isLoading && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #e5e5e5',
              fontSize: '12px',
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
            <span>
              <strong style={{ color: '#000' }}>&lt;{selectedElementInfo.tagName.toLowerCase()}&gt;</strong>
              {selectedElementInfo.className && (
                <span style={{ color: '#999', marginLeft: '4px' }}>
                  .{selectedElementInfo.className.split(' ')[0]}
                </span>
              )}
            </span>
          </div>
        )}

        {messages.length === 0 && !isLoading && !selectedElementInfo && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              textAlign: 'center',
              padding: '20px',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>💬</div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#666', marginBottom: '4px' }}>
              Start a conversation
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>
              Select an element or type a message
            </div>
          </div>
        )}

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
        {isLoading && statusMessage && (
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '12px',
              color: '#333',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          </div>
        )}

        {/* Diff Preview - Compact File List */}
        {showDiff && diffs.length > 0 && (
          <div
            style={{
              backgroundColor: '#fafafa',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid #e5e5e5',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#f5f5f5',
                borderBottom: '1px solid #e5e5e5',
                fontSize: '12px',
                color: '#666',
                fontWeight: '600',
              }}
            >
              Changes ({diffs.length} {diffs.length === 1 ? 'file' : 'files'})
            </div>
            <div style={{ padding: '8px' }}>
              {diffs.map((d) => {
                // Calculate line changes
                const beforeLines = d.before ? d.before.split('\n').length : 0;
                const afterLines = d.after ? d.after.split('\n').length : 0;
                const additions = d.action === 'create' ? afterLines : Math.max(0, afterLines - beforeLines);
                const deletions = d.action === 'delete' ? beforeLines : Math.max(0, beforeLines - afterLines);
                
                return (
                  <div
                    key={d.diffId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      marginBottom: '4px',
                      border: '1px solid #e5e5e5',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      {/* Action icon */}
                      {d.action === 'create' && (
                        <span style={{ 
                          color: '#16a34a',
                          fontSize: '14px',
                          fontWeight: '600',
                          width: '16px',
                          textAlign: 'center',
                        }}>+</span>
                      )}
                      {d.action === 'delete' && (
                        <span style={{ 
                          color: '#dc2626',
                          fontSize: '14px',
                          fontWeight: '600',
                          width: '16px',
                          textAlign: 'center',
                        }}>−</span>
                      )}
                      {d.action === 'modify' && (
                        <span style={{ 
                          color: '#ca8a04',
                          fontSize: '14px',
                          fontWeight: '600',
                          width: '16px',
                          textAlign: 'center',
                        }}>~</span>
                      )}
                      {/* Filename */}
                      <span style={{ 
                        fontSize: '13px', 
                        color: '#333',
                        fontWeight: '500',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {d.file.split(/[/\\]/).pop() || d.file}
                      </span>
                    </div>
                    {/* Line changes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {additions > 0 && (
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#16a34a',
                          fontWeight: '600',
                          fontFamily: 'SF Mono, Monaco, monospace',
                        }}>+{additions}</span>
                      )}
                      {deletions > 0 && (
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#dc2626',
                          fontWeight: '600',
                          fontFamily: 'SF Mono, Monaco, monospace',
                        }}>-{deletions}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Quick actions row */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '8px 12px 12px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => onRejectAllDiffs?.()}
                style={{
                  padding: '6px 14px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  backgroundColor: '#fff',
                  color: '#666',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Reject
              </button>
              <button
                onClick={() => onApplyAllDiffs?.()}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#000',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>



      {/* Input Area - Always visible for continuing conversation */}
      <div
        style={{
          padding: '12px 16px',
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
            disabled={!connected || isLoading}
            placeholder={connected ? "Plan, @ for context, / for commands" : "Connecting..."}
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
              opacity: connected ? 1 : 0.5,
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
                onClick={active ? onDeactivate : onActivate}
                disabled={!connected}
                style={{
                  background: active || isSelectingElement ? '#000' : 'transparent',
                  border: 'none',
                  color: active || isSelectingElement ? '#fff' : '#666',
                  cursor: connected ? 'pointer' : 'not-allowed',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.15s ease',
                  opacity: connected ? 1 : 0.5,
                }}
                title="Select an element on page"
              >
                <CursorIcon />
                <span>Cursor</span>
              </button>

              {/* Terminal/Console */}
              <button
                onClick={onTagConsole}
                disabled={!connected}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  cursor: connected ? 'pointer' : 'not-allowed',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.15s ease',
                  opacity: connected ? 1 : 0.5,
                }}
                title="Tag console logs"
              >
                <TerminalIcon />
                <span>Console</span>
              </button>

              {/* Dropdown for model - compact */}
              {models && models.length > 0 && (
                <div style={{ position: 'relative', marginLeft: '4px', maxWidth: '100px' }}>
                  <select
                    value={selectedModel || ''}
                    onChange={(e) => onModelChange?.((e.target as HTMLSelectElement).value)}
                    disabled={!connected || isLoading}
                    style={{
                      appearance: 'none',
                      background: 'transparent',
                      border: 'none',
                      color: '#999',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      cursor: connected && !isLoading ? 'pointer' : 'not-allowed',
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
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Right side - send button */}
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!inputValue.trim() || !connected || isLoading}
              style={{
                width: '32px',
                height: '32px',
                padding: '0',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: inputValue.trim() && connected && !isLoading ? '#000' : '#e5e5e5',
                color: inputValue.trim() && connected && !isLoading ? '#fff' : '#999',
                cursor: inputValue.trim() && connected && !isLoading ? 'pointer' : 'not-allowed',
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

        {/* Keyboard hint - only show when no diff */}
        {!showDiff && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#999', textAlign: 'center' }}>
            Press <kbd style={{ 
              padding: '2px 6px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '4px',
              fontFamily: 'SF Mono, Monaco, monospace',
              fontSize: '10px',
              border: '1px solid #e5e5e5',
            }}>⌘+Shift+E</kbd> to select element
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
