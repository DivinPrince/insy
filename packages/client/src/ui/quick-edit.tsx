import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type {
  ElementInfo,
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

export type QuickEditState = 'prompt' | 'loading' | 'done';

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

  // Compact mode
  isCompact?: boolean;
}

// Icon Components
const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SendIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const AttachIcon = () => (
  <svg
    width="14"
    height="14"
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

const FileIcon = () => (
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
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

// Opencode logo icon
const OpenCodeIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 240 300"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <g clipPath="url(#clip0_1401_86274)">
      <mask id="mask0_1401_86274" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300">
        <path d="M240 0H0V300H240V0Z" fill="white"/>
      </mask>
      <g mask="url(#mask0_1401_86274)">
        <path d="M180 240H60V120H180V240Z" fill="currentColor" fillOpacity="0.3"/>
        <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="currentColor"/>
      </g>
    </g>
    <defs>
      <clipPath id="clip0_1401_86274">
        <rect width="240" height="300" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

// React logo icon
const ReactIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="2.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(120 12 12)" />
  </svg>
);

// Loading dots component
const LoadingDots = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
    <span className="loading-dot" style={{ animationDelay: '0ms' }} />
    <span className="loading-dot" style={{ animationDelay: '150ms' }} />
    <span className="loading-dot" style={{ animationDelay: '300ms' }} />
  </div>
);

export const QuickEdit: FunctionComponent<QuickEditProps> = ({
  instanceId,
  targetElement,
  elementInfo,
  frameworkContext,
  state,
  onSubmit,
  onClose,
  isCompact = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract component info if React
  const reactContext = frameworkContext as ReactContext | null;
  const componentName = reactContext?.componentName;
  const tagName = elementInfo.tagName.toLowerCase();

  // Display name logic:
  // - If component name exists, show "ComponentName.tsx → tagName" for elements inside
  // - Otherwise just show the tag name
  const displayName = componentName 
      ? `${componentName}.tsx` 
      : tagName;
  
  // Show element path if inside a component (e.g., "App.tsx → div")
  const showElementPath = componentName && tagName !== componentName.toLowerCase();

  // Calculate position relative to target element
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const calculatePosition = () => {
    if (!targetElement) return;

    const rect = targetElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const qeWidth = 340;
    const qeHeight = 120;
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
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 80) + 'px';
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
  }, [attachments.length]);

  // Main bubble styles - white theme
  const bubbleStyle: h.JSX.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    backgroundColor: '#ffffff',
    borderRadius: '0 16px 16px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    zIndex: 999997,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'qe-fadeIn 0.2s ease-out',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
  };

  // Loading State - Animated dots bubble
  if (state === 'loading') {
    return (
      <div style={{ ...bubbleStyle, padding: '16px 24px', minWidth: '80px' }}>
        <LoadingDots />
        <style>{`
          .loading-dot {
            width: 6px;
            height: 6px;
            background: #999;
            border-radius: 50%;
            animation: qe-bounce 1.4s ease-in-out infinite both;
          }
          @keyframes qe-bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
          @keyframes qe-fadeIn {
            from { opacity: 0; transform: scale(0.95) translateY(4px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // Changes State - Compact bubble with action icons
  if (state === 'done') {
    return (
      <div style={{ ...bubbleStyle, padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
         Done!
        </div>
        <style>{`
          .qe-action-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 6px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
          }
          .qe-action-btn:hover {
            background: #f5f5f5;
          }
          .qe-btn-eye {
            color: #60a5fa;
          }
          .qe-btn-eye:hover {
            color: #3b82f6;
            background: #eff6ff;
          }
          .qe-btn-reject {
            color: #f87171;
          }
          .qe-btn-reject:hover {
            color: #ef4444;
            background: #fef2f2;
          }
          .qe-btn-accept {
            color: #4ade80;
          }
          .qe-btn-accept:hover {
            color: #22c55e;
            background: #f0fdf4;
          }
          .qe-btn-diff {
            color: #a78bfa;
          }
          .qe-btn-diff:hover {
            color: #7c3aed;
            background: #f5f3ff;
          }
          @keyframes qe-fadeIn {
            from { opacity: 0; transform: scale(0.95) translateY(4px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // Prompt State - Main input bubble
  return (
    <div style={{ ...bubbleStyle, width: '340px' }}>
      {/* File reference tag */}
      <div style={{ padding: '12px 14px 0 14px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '6px',
            fontSize: '12px',
            color: "#3b82f6",
          }}
        >
          {componentName ? <ReactIcon /> : <FileIcon />}
          <span style={{ fontFamily: 'SF Mono, Monaco, monospace' }}>
            {displayName}
          </span>
          {showElementPath && (
            <>
              <span style={{ color: '#999' }}>→</span>
              <span style={{ fontFamily: 'SF Mono, Monaco, monospace', color: '#666' }}>
                {tagName}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Attachment thumbnails */}
      {attachments.length > 0 && (
        <div style={{ padding: '10px 14px 0 14px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {attachments.map((attachment, index) => (
            <div
              key={index}
              style={{
                position: 'relative',
                width: '40px',
                height: '40px',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              <img
                src={attachment.url}
                alt={attachment.filename || 'Attached image'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <button
                onClick={() => handleRemoveAttachment(index)}
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: '#dc2626',
                  border: 'none',
                  color: '#fff',
                  fontSize: '9px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{ padding: '10px 14px' }}>
        <textarea
          ref={textareaRef}
          value={inputValue}
          onInput={(e) => setInputValue((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to change?"
          rows={1}
          style={{
            width: '100%',
            padding: '0',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#000',
            fontSize: '14px',
            outline: 'none',
            fontFamily: 'inherit',
            resize: 'none',
            lineHeight: '1.5',
            minHeight: '21px',
            maxHeight: '80px',
          }}
        />
      </div>

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
          padding: '10px 14px',
          borderTop: '1px solid #f0f0f0',
        }}
      >
        {/* Left side - Model selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: '#f5f5f5',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#666',
              cursor: 'pointer',
            }}
          >
            <OpenCodeIcon />
            <span>opencode</span>
          </div>
        </div>

        {/* Right side - Attach and send */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
              color: attachments.length >= MAX_IMAGES ? '#ccc' : '#999',
              cursor: attachments.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease',
            }}
            title={attachments.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : 'Attach image'}
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
              borderRadius: '50%',
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

      <style>{`
        @keyframes qe-fadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};
