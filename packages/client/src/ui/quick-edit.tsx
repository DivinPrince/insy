import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type {
  ElementInfo,
  CodeChangeAction,
  FrameworkContext,
  ReactContext,
  FileAttachment,
} from '@insy/shared';

// Constants for attachments
const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Helper to convert file to data URL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

  // Actions
  onSubmit: (instanceId: string, prompt: string, attachments?: FileAttachment[]) => void;
  onClose: () => void;
  onCompact: () => void;

  // Changes
  diffs?: DiffPreview[];
  onAcceptChanges?: (instanceId: string, diffIds: string[]) => void;
  onRejectChanges?: (instanceId: string) => void;
  onTogglePreview?: (instanceId: string, diffId: string) => void;
  onToggleAllPreviews?: (instanceId: string, diffIds: string[]) => void;

  // Compact mode
  isCompact?: boolean;
}

// Icon Components
const CheckIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#16a34a"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#dc2626"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
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

const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const EyeIcon = () => (
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
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
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
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const AttachIcon = () => (
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
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

export const QuickEdit: FunctionComponent<QuickEditProps> = ({
  instanceId,
  targetElement,
  elementInfo,
  frameworkContext,
  state,
  statusMessage,
  onSubmit,
  onClose,
  onCompact,
  diffs = [],
  onAcceptChanges,
  onRejectChanges,
  onTogglePreview,
  onToggleAllPreviews,
  isCompact = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track which diffs have preview enabled (changes visible)
  const [previewEnabled, setPreviewEnabled] = useState<Record<string, boolean>>(() => {
    // Default: all diffs start with preview ON (changes are auto-applied)
    const initial: Record<string, boolean> = {};
    diffs.forEach((d) => {
      initial[d.diffId] = true;
    });
    return initial;
  });

  // Check if all previews are enabled (for toggle all button state)
  const allPreviewsEnabled = diffs.length > 0 && diffs.every((d) => previewEnabled[d.diffId]);

  // Extract component info if React
  const reactContext = frameworkContext as ReactContext | null;
  const componentName = reactContext?.componentName;

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
      onSubmit(instanceId, inputValue.trim(), attachments.length > 0 ? attachments : undefined);
      setInputValue('');
      setAttachments([]);
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

  // Add image attachment from file
  const addImageAttachment = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      console.warn(`[QuickEdit] Invalid file type: ${file.type}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`[QuickEdit] File too large: ${file.size} bytes`);
      return;
    }
    if (attachments.length >= MAX_IMAGES) {
      console.warn(`[QuickEdit] Max ${MAX_IMAGES} images allowed`);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      const attachment: FileAttachment = {
        type: 'image',
        mime: file.type,
        filename: file.name,
        url: dataUrl,
      };
      setAttachments((prev) => [...prev, attachment]);
    } catch (error) {
      console.error('[QuickEdit] Failed to read file:', error);
    }
  };

  // Handle file input change
  const handleFileSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      await addImageAttachment(file);
    }
    // Reset input so same file can be selected again
    input.value = '';
  };

  // Handle paste event for images
  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await addImageAttachment(file);
        }
      }
    }
  };

  // Remove attachment
  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
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

  // Listen for paste events on the textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const pasteHandler = (e: Event) => handlePaste(e as unknown as ClipboardEvent);
    textarea.addEventListener('paste', pasteHandler);
    return () => {
      textarea.removeEventListener('paste', pasteHandler);
    };
  }, [attachments.length]); // Re-attach when attachments change to get latest count

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
              title={
                componentName
                  ? `${componentName} <${elementInfo.tagName.toLowerCase()}>`
                  : `<${elementInfo.tagName.toLowerCase()}>`
              }
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
              {/* Attachment thumbnails */}
              {attachments.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    padding: '8px 12px',
                    borderBottom: '1px solid #e5e5e5',
                  }}
                >
                  {attachments.map((attachment, index) => (
                    <div
                      key={index}
                      style={{
                        position: 'relative',
                        width: '48px',
                        height: '48px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid #ddd',
                      }}
                    >
                      <img
                        src={attachment.url}
                        alt={attachment.filename || 'Attached image'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      <button
                        onClick={() => handleRemoveAttachment(index)}
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: '#dc2626',
                          border: 'none',
                          color: '#fff',
                          fontSize: '10px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

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

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
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
                {/* Attach button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_IMAGES}
                  style={{
                    width: '28px',
                    height: '28px',
                    padding: '0',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    color: attachments.length >= MAX_IMAGES ? '#ccc' : '#666',
                    cursor: attachments.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  title={
                    attachments.length >= MAX_IMAGES
                      ? `Max ${MAX_IMAGES} images`
                      : 'Attach image (paste also works)'
                  }
                >
                  <AttachIcon />
                </button>

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
              {/* Accept - Keep changes */}
              <button
                onClick={() => {
                  const diffIds = diffs.map((d) => d.diffId);
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
                title="Accept changes"
              >
                <CheckIcon />
              </button>

              {/* Reject - Restore original */}
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
                title="Reject changes"
              >
                <XIcon />
              </button>

              {/* Toggle All - Show/hide all changes */}
              <button
                onClick={() => {
                  const diffIds = diffs.map((d) => d.diffId);
                  // Toggle local state for all diffs
                  const newState = !allPreviewsEnabled;
                  setPreviewEnabled((prev) => {
                    const updated: Record<string, boolean> = {};
                    diffs.forEach((d) => {
                      updated[d.diffId] = newState;
                    });
                    return { ...prev, ...updated };
                  });
                  // Call handler to toggle on server
                  onToggleAllPreviews?.(instanceId, diffIds);
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
                  color: allPreviewsEnabled ? '#3b82f6' : '#999',
                }}
                title={allPreviewsEnabled ? 'Hide all changes (show original)' : 'Show all changes'}
              >
                {allPreviewsEnabled ? <EyeIcon /> : <EyeOffIcon />}
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
              const additions =
                diff.action === 'create' ? afterLines : Math.max(0, afterLines - beforeLines);
              const deletions =
                diff.action === 'delete' ? beforeLines : Math.max(0, beforeLines - afterLines);

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
                    {diff.action === 'create' && (
                      <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: '600' }}>
                        +
                      </span>
                    )}
                    {diff.action === 'delete' && (
                      <span style={{ color: '#dc2626', fontSize: '14px', fontWeight: '600' }}>
                        −
                      </span>
                    )}
                    {diff.action === 'modify' && (
                      <span style={{ color: '#ca8a04', fontSize: '14px', fontWeight: '600' }}>
                        ~
                      </span>
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
                  {/* Line changes and toggle */}
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
                    {/* Toggle preview button */}
                    <button
                      onClick={() => {
                        const newState = !previewEnabled[diff.diffId];
                        setPreviewEnabled((prev) => ({ ...prev, [diff.diffId]: newState }));
                        onTogglePreview?.(instanceId, diff.diffId);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: previewEnabled[diff.diffId] ? '#3b82f6' : '#999',
                        marginLeft: '4px',
                      }}
                      title={
                        previewEnabled[diff.diffId]
                          ? 'Hide changes (show original)'
                          : 'Show changes'
                      }
                    >
                      {previewEnabled[diff.diffId] ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
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
