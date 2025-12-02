import { h } from 'preact';
import type { FunctionComponent } from 'preact';
import type { DiffResult } from '@pixelcode/shared';

interface DiffViewerProps {
  diff: DiffResult;
  onApply: () => void;
  onReject: () => void;
}

export const DiffViewer: FunctionComponent<DiffViewerProps> = ({ diff, onApply, onReject }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 999999,
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        padding: '24px',
        maxWidth: '800px',
        maxHeight: '80vh',
        overflow: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
          Review Changes
        </div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>{diff.file}</div>
      </div>

      <div
        style={{
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
          maxHeight: '400px',
          overflow: 'auto',
        }}
      >
        <pre
          style={{
            margin: '0',
            fontFamily: 'Monaco, Consolas, monospace',
            fontSize: '12px',
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {diff.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx}>
              <div
                style={{
                  backgroundColor: '#e5e7eb',
                  padding: '4px 8px',
                  marginBottom: '8px',
                  borderRadius: '4px',
                  color: '#6b7280',
                  fontSize: '11px',
                }}
              >
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>
              {hunk.changes.map((change, changeIdx) => (
                <div
                  key={changeIdx}
                  style={{
                    backgroundColor:
                      change.type === 'add'
                        ? '#d1fae5'
                        : change.type === 'remove'
                        ? '#fee2e2'
                        : 'transparent',
                    color:
                      change.type === 'add'
                        ? '#065f46'
                        : change.type === 'remove'
                        ? '#991b1b'
                        : '#374151',
                    paddingLeft: '8px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '20px',
                      color: change.type === 'add' ? '#10b981' : change.type === 'remove' ? '#ef4444' : '#9ca3af',
                    }}
                  >
                    {change.type === 'add' ? '+' : change.type === 'remove' ? '-' : ' '}
                  </span>
                  {change.line}
                </div>
              ))}
            </div>
          ))}
        </pre>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onReject}
          style={{
            padding: '10px 20px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: 'white',
            color: '#374151',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reject
        </button>
        <button
          onClick={onApply}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#3b82f6',
            color: 'white',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
};
