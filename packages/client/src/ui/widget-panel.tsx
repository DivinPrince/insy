import { h } from 'preact';
import type { FunctionComponent } from 'preact';
import type { RecentEdit } from '@pixelcode/shared';
import { StatusBadge } from './status-badge.js';

interface WidgetPanelProps {
  connected: boolean;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onClose: () => void;
  recentEdits: RecentEdit[];
  position: { x: number; y: number }; // pixels from bottom-right
}

export const WidgetPanel: FunctionComponent<WidgetPanelProps> = ({
  connected,
  active,
  onActivate,
  onDeactivate,
  onClose,
  recentEdits,
  position,
}) => {
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

  return (
    <div
      style={{
        position: 'fixed',
        right: `${position.x}px`,
        bottom: `${position.y + 60}px`, // 60px above button
        width: '280px',
        maxHeight: '400px',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 12px 48px rgba(0, 0, 0, 0.2)',
        zIndex: 999996,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>PixelCode</div>
          <StatusBadge connected={connected} />
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            lineHeight: '1',
          }}
          title="Minimize"
        >
          ×
        </button>
      </div>

      {/* Main Action */}
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
        {active ? (
          <button
            onClick={onDeactivate}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ef4444',
              borderRadius: '8px',
              backgroundColor: 'white',
              color: '#ef4444',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>✕</span>
            Cancel Selection
          </button>
        ) : (
          <button
            onClick={onActivate}
            disabled={!connected}
            style={{
              width: '100%',
              padding: '12px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: connected ? '#3b82f6' : '#e5e7eb',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: connected ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>🎨</span>
            Select Element
          </button>
        )}
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>
          or press <kbd style={{ 
            padding: '2px 6px', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '10px'
          }}>⌘+Shift+E</kbd>
        </div>
      </div>

      {/* Recent Edits */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
          Recent Edits
        </div>
        {recentEdits.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '16px' }}>
            No edits yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentEdits.slice(0, 5).map((edit) => (
              <div
                key={edit.id}
                style={{
                  padding: '8px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <div style={{ color: '#374151', fontWeight: '500', marginBottom: '2px' }}>
                  {edit.file.split('/').pop()}
                </div>
                <div style={{ color: '#6b7280', fontSize: '11px' }}>
                  {formatTimestamp(edit.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          fontSize: '11px',
          color: '#9ca3af',
          textAlign: 'center',
        }}
      >
        Click & drag button to reposition
      </div>
    </div>
  );
};
