import { h } from 'preact';
import type { FunctionComponent } from 'preact';

interface StatusBadgeProps {
  connected: boolean;
  compact?: boolean;
}

export const StatusBadge: FunctionComponent<StatusBadgeProps> = ({ connected, compact = false }) => {
  if (compact) {
    return (
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: connected ? '#10b981' : '#ef4444',
          boxShadow: connected ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
        }}
        title={connected ? 'Connected' : 'Disconnected'}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '12px',
        backgroundColor: connected ? '#d1fae5' : '#fee2e2',
        fontSize: '12px',
        fontWeight: '500',
        color: connected ? '#065f46' : '#991b1b',
      }}
    >
      <div
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: connected ? '#10b981' : '#ef4444',
        }}
      />
      {connected ? 'Connected' : 'Disconnected'}
    </div>
  );
};
