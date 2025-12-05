import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type {
  RecentEdit,
  ElementInfo,
  CodeChangeAction,
  ReactContext,
  FrameworkContext,
} from '@pixelcode/shared';
import { StatusBadge } from './status-badge.js';

// Cursor icon for element selector
const CursorIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  </svg>
);

// Terminal icon for console logs
const TerminalIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

// Send icon
const SendIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
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
  taggedElement?: {
    tagName: string;
    className?: string;
    id?: string;
    componentName?: string;
    sourceFile?: string;
    componentPath?: string[];
  };
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
  // Undo/Keep actions
  hasChanges?: boolean;
  onUndoAll?: () => void;
  onKeepAll?: () => void;
  // Selected element
  selectedElementInfo?: ElementInfo | null;
  selectedElementContext?: FrameworkContext | null;
  // Diff preview
  showDiff?: boolean;
  diffs?: DiffPreview[];
  onApplyDiff?: (diffId?: string) => void;
  onRejectDiff?: (diffId?: string) => void;
  onApplyAllDiffs?: () => void;
  onRejectAllDiffs?: () => void;
  // New chat
  onNewChat?: () => void;
  // Clear selected element
  onClearElement?: () => void;
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
  hasChanges,
  onUndoAll,
  onKeepAll,
  selectedElementInfo,
  selectedElementContext,
  showDiff,
  diffs = [],
  onApplyDiff,
  onRejectDiff,
  onApplyAllDiffs,
  onRejectAllDiffs,
  onNewChat,
  onClearElement,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showElementDetails, setShowElementDetails] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Extract React context info if available
  const reactContext = selectedElementContext as ReactContext | null;
  const componentName = reactContext?.componentName;
  const sourceFile = reactContext?.source?.fileName;
  const componentPath = reactContext?.fiberPath;

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
          {hasChanges && <span style={{ fontSize: '12px', color: '#666' }}>1 File</span>}
          {!hasChanges && (
            <>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#000',
                  letterSpacing: '-0.02em',
                }}
              >
                PixelCode
              </span>
              <StatusBadge connected={connected} />
            </>
          )}
          {/* New Chat Button */}
          {messages.length > 0 && (
            <button
              onClick={onNewChat}
              style={{
                background: 'transparent',
                border: '1px solid #e5e5e5',
                color: '#666',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: '6px',
                fontWeight: '500',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '8px',
              }}
              title="Start a new conversation"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Chat
            </button>
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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
          <div
            style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#666',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
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
        {/* Empty state - no messages */}
        {messages.length === 0 && !isLoading && (
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
            <div
              style={{ fontSize: '14px', fontWeight: '500', color: '#666', marginBottom: '4px' }}
            >
              {selectedElementInfo ? 'Element selected' : 'Start a conversation'}
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>
              {selectedElementInfo
                ? 'Describe what you want to change'
                : 'Select an element or type a message'}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: msg.type === 'user' ? '85%' : '100%',
            }}
          >
            {/* Tagged element pill for user messages - shows component name if available */}
            {msg.type === 'user' && msg.taggedElement && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: msg.taggedElement.componentName
                    ? 'rgba(34, 197, 94, 0.2)'
                    : 'rgba(255, 255, 255, 0.15)',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  color: msg.taggedElement.componentName ? '#86efac' : 'rgba(255, 255, 255, 0.8)',
                  fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                  alignSelf: 'flex-end',
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                {msg.taggedElement.componentName ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                ) : (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                )}
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {msg.taggedElement.componentName ? (
                    <>
                      {msg.taggedElement.componentName}
                      {msg.taggedElement.sourceFile && (
                        <span style={{ color: 'rgba(255, 255, 255, 0.5)', marginLeft: '4px' }}>
                          {msg.taggedElement.sourceFile.split('/').pop()}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      &lt;{msg.taggedElement.tagName.toLowerCase()}
                      {msg.taggedElement.id && (
                        <span style={{ color: '#c4b5fd' }}>#{msg.taggedElement.id}</span>
                      )}
                      {msg.taggedElement.className && (
                        <span style={{ color: '#86efac' }}>
                          .{msg.taggedElement.className.split(' ')[0]}
                        </span>
                      )}
                      &gt;
                    </>
                  )}
                </span>
              </div>
            )}
            {/* Message content */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '13px',
                lineHeight: '1.5',
                ...(msg.type === 'user'
                  ? {
                      backgroundColor: '#000',
                      color: '#fff',
                    }
                  : msg.type === 'error'
                    ? {
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                      }
                    : {
                        backgroundColor: '#f5f5f5',
                        color: '#333',
                      }),
              }}
            >
              {msg.content}
            </div>
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
                const additions =
                  d.action === 'create' ? afterLines : Math.max(0, afterLines - beforeLines);
                const deletions =
                  d.action === 'delete' ? beforeLines : Math.max(0, beforeLines - afterLines);

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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {/* Action icon */}
                      {d.action === 'create' && (
                        <span
                          style={{
                            color: '#16a34a',
                            fontSize: '14px',
                            fontWeight: '600',
                            width: '16px',
                            textAlign: 'center',
                          }}
                        >
                          +
                        </span>
                      )}
                      {d.action === 'delete' && (
                        <span
                          style={{
                            color: '#dc2626',
                            fontSize: '14px',
                            fontWeight: '600',
                            width: '16px',
                            textAlign: 'center',
                          }}
                        >
                          −
                        </span>
                      )}
                      {d.action === 'modify' && (
                        <span
                          style={{
                            color: '#ca8a04',
                            fontSize: '14px',
                            fontWeight: '600',
                            width: '16px',
                            textAlign: 'center',
                          }}
                        >
                          ~
                        </span>
                      )}
                      {/* Filename */}
                      <span
                        style={{
                          fontSize: '13px',
                          color: '#333',
                          fontWeight: '500',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.file.split(/[/\\]/).pop() || d.file}
                      </span>
                    </div>
                    {/* Line changes */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
                    >
                      {additions > 0 && (
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#16a34a',
                            fontWeight: '600',
                            fontFamily: 'SF Mono, Monaco, monospace',
                          }}
                        >
                          +{additions}
                        </span>
                      )}
                      {deletions > 0 && (
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#dc2626',
                            fontWeight: '600',
                            fontFamily: 'SF Mono, Monaco, monospace',
                          }}
                        >
                          -{deletions}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Accept/Reject buttons - shown above input when diffs present */}
      {showDiff && diffs.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid #e5e5e5',
            gap: '12px',
          }}
        >
          <button
            onClick={() => onRejectAllDiffs?.()}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              backgroundColor: '#fff',
              color: '#666',
              fontSize: '13px',
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
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#16a34a',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Apply
          </button>
        </div>
      )}

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
          {/* Tagged Element Pill - Rich context display like React DevTools */}
          {selectedElementInfo && (
            <div
              style={{
                padding: '8px 12px 0 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {/* Main element tag */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: componentName ? '#f0fdf4' : '#e8f4ff',
                    border: `1px solid ${componentName ? '#bbf7d0' : '#bde0ff'}`,
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    color: componentName ? '#166534' : '#0066cc',
                    fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                  onClick={() => setShowElementDetails(!showElementDetails)}
                  title="Click to show/hide details"
                >
                  {/* Component/Element icon */}
                  {componentName ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                  )}
                  {/* Display component name or tag */}
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {componentName ? (
                      <>
                        <span style={{ color: '#166534' }}>{componentName}</span>
                        <span style={{ color: '#6b7280', marginLeft: '4px', fontSize: '10px' }}>
                          &lt;{selectedElementInfo.tagName.toLowerCase()}&gt;
                        </span>
                      </>
                    ) : (
                      <>
                        &lt;{selectedElementInfo.tagName.toLowerCase()}
                        {selectedElementInfo.id && (
                          <span style={{ color: '#9333ea' }}>#{selectedElementInfo.id}</span>
                        )}
                        {selectedElementInfo.className && (
                          <span style={{ color: '#059669' }}>
                            .{selectedElementInfo.className.split(' ')[0]}
                          </span>
                        )}
                        &gt;
                      </>
                    )}
                  </span>
                  {/* Expand/collapse indicator */}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: showElementDetails ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                      opacity: 0.5,
                    }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>

                {/* Remove button */}
                <button
                  onClick={onClearElement}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#999',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                  }}
                  title="Remove element"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Expanded details panel */}
              {showElementDetails && (
                <div
                  style={{
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '11px',
                    fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                    maxHeight: '150px',
                    overflow: 'auto',
                  }}
                >
                  {/* Source file location */}
                  {sourceFile && (
                    <div style={{ marginBottom: '8px' }}>
                      <div
                        style={{
                          color: '#6b7280',
                          fontSize: '10px',
                          marginBottom: '2px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Source
                      </div>
                      <div
                        style={{
                          color: '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span style={{ wordBreak: 'break-all' }}>
                          {sourceFile.split('/').slice(-2).join('/')}
                          {reactContext?.source?.lineNumber && `:${reactContext.source.lineNumber}`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Component tree path */}
                  {componentPath && componentPath.length > 0 && (
                    <div>
                      <div
                        style={{
                          color: '#6b7280',
                          fontSize: '10px',
                          marginBottom: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Component Tree
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {componentPath.slice(-6).map((comp, i, arr) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              color: i === arr.length - 1 ? '#166534' : '#6b7280',
                              fontWeight: i === arr.length - 1 ? '600' : '400',
                            }}
                          >
                            <span
                              style={{
                                marginLeft: `${i * 8}px`,
                                marginRight: '4px',
                                color: '#d1d5db',
                              }}
                            >
                              {i === arr.length - 1 ? '└─' : '├─'}
                            </span>
                            {comp}
                          </div>
                        ))}
                        {componentPath.length > 6 && (
                          <div style={{ color: '#9ca3af', fontSize: '10px', marginLeft: '8px' }}>
                            ... and {componentPath.length - 6} more ancestors
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* HTML snippet */}
                  {!componentPath && selectedElementInfo.html && (
                    <div>
                      <div
                        style={{
                          color: '#6b7280',
                          fontSize: '10px',
                          marginBottom: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        HTML
                      </div>
                      <div
                        style={{
                          color: '#374151',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: '60px',
                          overflow: 'hidden',
                        }}
                      >
                        {selectedElementInfo.html.substring(0, 200)}
                        {selectedElementInfo.html.length > 200 && '...'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onInput={(e) => setInputValue((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            disabled={!connected || isLoading}
            placeholder={
              connected
                ? selectedElementInfo
                  ? 'What would you like to change?'
                  : 'Select an element or describe what you need...'
                : 'Connecting...'
            }
            rows={1}
            style={{
              width: '100%',
              padding: selectedElementInfo ? '8px 16px 14px 16px' : '14px 16px',
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
            </div>

            {/* Right side - Send button */}
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
            Press{' '}
            <kbd
              style={{
                padding: '2px 6px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontFamily: 'SF Mono, Monaco, monospace',
                fontSize: '10px',
                border: '1px solid #e5e5e5',
              }}
            >
              ⌘+Shift+E
            </kbd>{' '}
            to select element
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
