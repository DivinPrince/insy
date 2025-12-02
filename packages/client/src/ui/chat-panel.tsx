import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { ToolInfo, ModelInfo } from '@pixelcode/shared';

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
}

interface ChatPanelProps {
  position: { x: number; y: number };
  state: ChatState;
  messages: ChatMessage[];
  diff?: DiffPreview;
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
  onApplyDiff: () => void;
  onRejectDiff: () => void;
  onClose: () => void;
  onRetry?: () => void;
}

export const ChatPanel: FunctionComponent<ChatPanelProps> = ({
  position,
  state,
  messages,
  diff,
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
  onClose,
  onRetry,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);

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
  };

  // Calculate position to stay within viewport
  const panelStyle: h.JSX.CSSProperties = {
    position: 'fixed',
    left: `${Math.min(position.x, window.innerWidth - 420)}px`,
    top: `${Math.min(position.y, window.innerHeight - 400)}px`,
    width: '400px',
    maxHeight: '500px',
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    zIndex: 999998,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #2d2d44',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #2d2d44',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#16162a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🎨</span>
          <span style={{ color: '#fff', fontWeight: '600', fontSize: '14px' }}>PixelCode</span>
          {state === 'loading' && (
            <span
              style={{
                fontSize: '11px',
                color: '#60a5fa',
                backgroundColor: '#1e3a5f',
                padding: '2px 8px',
                borderRadius: '10px',
              }}
            >
              Processing...
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: showSettings ? '#2d2d44' : 'none',
              border: 'none',
              color: showSettings ? '#fff' : '#6b7280',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '4px 6px',
              lineHeight: '1',
              borderRadius: '4px',
            }}
            title="Settings"
          >
            ⚙️
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: '1',
              borderRadius: '4px',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #2d2d44',
            backgroundColor: '#16162a',
          }}
        >
          {/* Tool Selector */}
          <div style={{ marginBottom: '10px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                color: '#9ca3af',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
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
                padding: '8px 10px',
                border: '1px solid #3d3d5c',
                borderRadius: '6px',
                backgroundColor: '#1a1a2e',
                color: '#fff',
                fontSize: '13px',
                fontFamily: 'inherit',
                cursor: state === 'loading' || state === 'applying' ? 'not-allowed' : 'pointer',
                opacity: state === 'loading' || state === 'applying' ? 0.6 : 1,
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
                color: '#9ca3af',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
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
                padding: '8px 10px',
                border: '1px solid #3d3d5c',
                borderRadius: '6px',
                backgroundColor: '#1a1a2e',
                color: '#fff',
                fontSize: '13px',
                fontFamily: 'inherit',
                cursor: state === 'loading' || state === 'applying' || !models || models.length === 0 ? 'not-allowed' : 'pointer',
                opacity: state === 'loading' || state === 'applying' || !models || models.length === 0 ? 0.6 : 1,
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
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: '100px',
          maxHeight: '300px',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: '1.4',
              ...(msg.type === 'user'
                ? {
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    alignSelf: 'flex-end',
                    maxWidth: '85%',
                  }
                : msg.type === 'error'
                ? {
                    backgroundColor: '#7f1d1d',
                    color: '#fecaca',
                    alignSelf: 'flex-start',
                  }
                : {
                    backgroundColor: '#2d2d44',
                    color: '#d1d5db',
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
              padding: '12px',
              backgroundColor: '#2d2d44',
              borderRadius: '8px',
              color: '#d1d5db',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #3b82f6',
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
                  height: '4px',
                  backgroundColor: '#1a1a2e',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
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
              padding: '12px',
              backgroundColor: '#7f1d1d',
              borderRadius: '8px',
              color: '#fecaca',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Error occurred</span>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '12px' }}>
              {statusMessage || 'An error occurred while processing your request.'}
            </div>
            <button
              onClick={() => onRetry?.()}
              style={{
                padding: '6px 12px',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                color: '#fecaca',
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
        {state === 'diff' && diff && (
          <div
            style={{
              backgroundColor: '#0d1117',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid #30363d',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#161b22',
                borderBottom: '1px solid #30363d',
                fontSize: '12px',
                color: '#8b949e',
              }}
            >
              📄 {diff.file.split('/').pop() || diff.file}
            </div>
            <div
              style={{
                padding: '12px',
                maxHeight: '200px',
                overflow: 'auto',
                fontFamily: 'Monaco, Consolas, monospace',
                fontSize: '11px',
                lineHeight: '1.5',
              }}
            >
              {/* Simple before/after diff display */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ color: '#f85149', marginBottom: '4px' }}>- Before:</div>
                <pre
                  style={{
                    margin: 0,
                    padding: '8px',
                    backgroundColor: '#2d1f1f',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#ffa7a7',
                    maxHeight: '80px',
                    overflow: 'auto',
                  }}
                >
                  {diff.before.substring(0, 500)}{diff.before.length > 500 ? '...' : ''}
                </pre>
              </div>
              <div>
                <div style={{ color: '#3fb950', marginBottom: '4px' }}>+ After:</div>
                <pre
                  style={{
                    margin: 0,
                    padding: '8px',
                    backgroundColor: '#1f2d1f',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#7ee787',
                    maxHeight: '80px',
                    overflow: 'auto',
                  }}
                >
                  {diff.after.substring(0, 500)}{diff.after.length > 500 ? '...' : ''}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons for Diff */}
      {state === 'diff' && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #2d2d44',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            backgroundColor: '#16162a',
          }}
        >
          <button
            onClick={onRejectDiff}
            style={{
              padding: '8px 16px',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: '#ef4444',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✕</span> Reject
          </button>
          <button
            onClick={onApplyDiff}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#22c55e',
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
            <span>✓</span> Apply
          </button>
        </div>
      )}

      {/* Input Area */}
      {state === 'prompt' && (
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '12px',
            borderTop: '1px solid #2d2d44',
            backgroundColor: '#16162a',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={inputValue}
              onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="What would you like to change?"
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #3d3d5c',
                borderRadius: '8px',
                backgroundColor: '#1a1a2e',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: inputValue.trim() ? '#3b82f6' : '#2d2d44',
                color: inputValue.trim() ? '#fff' : '#6b7280',
                fontSize: '13px',
                fontWeight: '500',
                cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              Send
            </button>
          </div>
        </form>
      )}

      {/* Applying State */}
      {state === 'applying' && (
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid #2d2d44',
            textAlign: 'center',
            color: '#60a5fa',
            fontSize: '13px',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              border: '2px solid #3b82f6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '8px',
            }}
          />
          Applying changes...
        </div>
      )}
    </div>
  );
};
