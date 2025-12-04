import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { ElementInfo, ModelInfo, CodeChangeAction, FrameworkContext, ReactContext } from '@pixelcode/shared';

export type QuickEditState = 'prompt' | 'loading' | 'changes';

export interface DiffPreview {
  file: string;
  before: string;
  after: string;
  diffId: string;
  action?: CodeChangeAction;
}

export interface QuickEditProps {
  // Instance management
  instanceId: string;
  targetElement: HTMLElement;
  elementInfo: ElementInfo;
  frameworkContext?: FrameworkContext;
  
  // State
  state: QuickEditState;
  statusMessage?: string;
  
  // Model selection
  models?: ModelInfo[];
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  
  // Actions
  onSubmit: (instanceId: string, prompt: string) => void;
  onClose: () => void;
  onCompact: () => void;
  
  // Changes
  diffs?: DiffPreview[];
  onToggleChanges?: (instanceId: string, diffIds: string[], apply: boolean) => void;
  onAcceptChanges?: (instanceId: string, diffIds: string[]) => void;
  onRejectChanges?: (instanceId: string) => void;
  
  // Compact mode
  isCompact?: boolean;
}

// Icon Components
const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CompactIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16l4-4-4-4" />
    <path d="M8 12h8" />
  </svg>
);

const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const QuickEdit: FunctionComponent<QuickEditProps> = ({
  instanceId,
  targetElement,
  elementInfo,
  frameworkContext,
  state,
  statusMessage,
  models,
  selectedModel,
  onModelChange,
  onSubmit,
  onClose,
  onCompact,
  diffs = [],
  onToggleChanges,
  onAcceptChanges,
  onRejectChanges,
  isCompact = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [changesApplied, setChangesApplied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Extract component info if React
  const reactContext = frameworkContext as ReactContext | null;
  const componentName = reactContext?.componentName;
  const sourceFile = reactContext?.source?.fileName;

  // Calculate position relative to target element
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const calculatePosition = () => {
    if (!targetElement) return;
    
    const rect = targetElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const qeWidth = 300;
    const qeHeight = 300; // max estimated height
    const offset = 10;
    
    let x = rect.right + offset;
    let y = rect.top;
    
    // If overflows right, position to left
    if (x + qeWidth > viewportWidth) {
      x = rect.left - qeWidth - offset;
    }
    
    // If still overflows left, center it
    if (x < 0) {
      x = (viewportWidth - qeWidth) / 2;
    }
    
    // If overflows bottom, align to bottom
    if (y + qeHeight > viewportHeight) {
      y = Math.max(10, viewportHeight - qeHeight - offset);
    }
    
    // Ensure minimum top margin
    y = Math.max(10, y);
    
    setPosition({ x, y });
  };

  // Calculate position on mount and scroll
  useEffect(() => {
    calculatePosition();
    
    const handleScroll = () => calculatePosition();
    const handleResize = () => calculatePosition();
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [targetElement]);

  const handleSubmit = (e?: Event) => {
    e?.preventDefault();
    if (inputValue.trim() && state === 'prompt') {
      onSubmit(instanceId, inputValue.trim());
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
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [inputValue]);

  // Auto-focus input on mount
  useEffect(() => {
    if (state === 'prompt' && textareaRef.current && !isCompact) {
      textareaRef.current.focus();
    }
  }, [state, isCompact]);

  // Compact mode rendering
  if (isCompact) {
    return (
      <div
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 999996,
        }}
      >
        <button
          onClick={onCompact}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: state === 'changes' ? '#16a34a' : '#3b82f6',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            animation: state === 'changes' ? 'pulse 2s infinite' : 'none',
          }}
          title="Expand QuickEdit"
        >
          <ChatIcon />
          {state === 'changes' && (
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#fbbf24',
                border: '2px solid #fff',
              }}
            />
          )}
        </button>
      </div>
    );
  }

  // Main panel styles
  const panelStyle: h.JSX.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: '300px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    zIndex: 999997,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'fadeIn 0.2s ease-out',
  };

  return (
    <div style={panelStyle}>
      {/* Loading State - Full component */}
      {state === 'loading' && (
        <div
          style={{
            padding: '40px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              border: '3px solid #e5e5e5',
              borderTopColor: '#000',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div style={{ fontSize: '13px', color: '#666', textAlign: 'center' }}>
            {statusMessage || 'Processing...'}
          </div>
        </div>
      )}

      {/* Prompt State */}
      {state === 'prompt' && (
        <>
          {/* Element tag header */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #e5e5e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#fafafa',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontFamily: 'SF Mono, Monaco, monospace',
                color: componentName ? '#166534' : '#0066cc',
                backgroundColor: componentName ? '#f0fdf4' : '#e8f4ff',
                border: `1px solid ${componentName ? '#bbf7d0' : '#bde0ff'}`,
                borderRadius: '6px',
                padding: '4px 8px',
                overflow: 'hidden',
                flex: 1,
                minWidth: 0,
              }}
              title={componentName ? `${componentName} <${elementInfo.tagName.toLowerCase()}>` : `<${elementInfo.tagName.toLowerCase()}>`}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {componentName || `<${elementInfo.tagName.toLowerCase()}>`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
              <button
                onClick={onCompact}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Minimize"
              >
                <CompactIcon />
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#999',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  lineHeight: '1',
                  borderRadius: '4px',
                  fontWeight: '300',
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Input area */}
          <div style={{ padding: '12px' }}>
            <div
              style={{
                backgroundColor: '#f5f5f5',
                borderRadius: '10px',
                border: '1px solid #e5e5e5',
                overflow: 'hidden',
              }}
            >
              <textarea
                ref={textareaRef}
                value={inputValue}
                onInput={(e) => setInputValue((e.target as HTMLTextAreaElement).value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to change?"
                rows={1}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#000',
                  fontSize: '13px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'none',
                  lineHeight: '1.4',
                  minHeight: '20px',
                  maxHeight: '100px',
                }}
              />
              
              {/* Bottom bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderTop: '1px solid #e5e5e5',
                  backgroundColor: '#fafafa',
                }}
              >
                {/* Model selector */}
                {models && models.length > 0 && (
                  <select
                    value={selectedModel || ''}
                    onChange={(e) => onModelChange?.((e.target as HTMLSelectElement).value)}
                    style={{
                      appearance: 'none',
                      background: 'transparent',
                      border: 'none',
                      color: '#999',
                      fontSize: '11px',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      padding: '4px 16px 4px 4px',
                      maxWidth: '150px',
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
                )}

                {/* Send button */}
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!inputValue.trim()}
                  style={{
                    width: '28px',
                    height: '28px',
                    padding: '0',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: inputValue.trim() ? '#000' : '#e5e5e5',
                    color: inputValue.trim() ? '#fff' : '#999',
                    cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  title="Send"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Changes State */}
      {state === 'changes' && diffs.length > 0 && (
        <>
          {/* Header with icons */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #e5e5e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#fafafa',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Eye toggle - Apply/Unapply changes temporarily with backup/restore */}
              <button
                onClick={() => {
                  const newState = !changesApplied;
                  setChangesApplied(newState);
                  
                  // Toggle apply/unapply with undo capability
                  const diffIds = diffs.map(d => d.diffId);
                  onToggleChanges?.(instanceId, diffIds, newState);
                }}
                style={{
                  background: changesApplied ? '#dcfce7' : 'transparent',
                  border: '1px solid',
                  borderColor: changesApplied ? '#16a34a' : '#e5e5e5',
                  color: changesApplied ? '#16a34a' : '#666',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                title={changesApplied ? 'Undo changes (restore from backup)' : 'Apply changes (create backup)'}
              >
                <EyeIcon open={changesApplied} />
              </button>

              {/* Accept - Permanent */}
              <button
                onClick={() => {
                  const diffIds = diffs.map(d => d.diffId);
                  onAcceptChanges?.(instanceId, diffIds);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                title="Accept permanently (remove backup)"
              >
                <CheckIcon />
              </button>

              {/* Reject - Permanent */}
              <button
                onClick={() => onRejectChanges?.(instanceId)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                title="Reject changes permanently"
              >
                <XIcon />
              </button>

              {/* File name */}
              <span
                style={{
                  fontSize: '12px',
                  color: '#666',
                  fontFamily: 'SF Mono, Monaco, monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {diffs[0].file.split(/[/\\]/).pop()}
                {diffs.length > 1 && ` +${diffs.length - 1}`}
              </span>
            </div>

            {/* Close button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={onCompact}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Minimize"
              >
                <CompactIcon />
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#999',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  lineHeight: '1',
                  borderRadius: '4px',
                  fontWeight: '300',
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Preview section - Always visible */}
          <div
            style={{
              padding: '12px',
              maxHeight: '250px',
                overflow: 'auto',
                backgroundColor: '#fafafa',
              }}
            >
              {diffs.map((diff) => {
                const beforeLines = diff.before ? diff.before.split('\n').length : 0;
                const afterLines = diff.after ? diff.after.split('\n').length : 0;
                const additions = diff.action === 'create' ? afterLines : Math.max(0, afterLines - beforeLines);
                const deletions = diff.action === 'delete' ? beforeLines : Math.max(0, beforeLines - afterLines);

                return (
                  <div
                    key={diff.diffId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      marginBottom: '6px',
                      border: '1px solid #e5e5e5',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      {/* Action icon */}
                      {diff.action === 'create' && (
                        <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: '600' }}>+</span>
                      )}
                      {diff.action === 'delete' && (
                        <span style={{ color: '#dc2626', fontSize: '14px', fontWeight: '600' }}>−</span>
                      )}
                      {diff.action === 'modify' && (
                        <span style={{ color: '#ca8a04', fontSize: '14px', fontWeight: '600' }}>~</span>
                      )}
                      {/* Filename */}
                      <span
                        style={{
                          color: '#333',
                          fontWeight: '500',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'SF Mono, Monaco, monospace',
                        }}
                      >
                        {diff.file.split(/[/\\]/).pop() || diff.file}
                      </span>
                    </div>
                    {/* Line changes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {additions > 0 && (
                        <span
                          style={{
                            fontSize: '11px',
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
                            fontSize: '11px',
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
        </>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
          50% { box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4); }
        }
      `}</style>
    </div>
  );
};
