import { h } from 'preact';
import type { FunctionComponent } from 'preact';

interface ToastProps {
  message: string;
  variant?: 'info' | 'success' | 'error' | 'warning';
  onClose?: () => void;
}

export const Toast: FunctionComponent<ToastProps> = ({ message, variant = 'info', onClose }) => {
  const colors = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '8px',
        backgroundColor:
          variant === 'error'
            ? '#ef4444'
            : variant === 'success'
            ? '#10b981'
            : variant === 'warning'
            ? '#f59e0b'
            : '#3b82f6',
        color: 'white',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        maxWidth: '400px',
      }}
    >
      <span>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0',
            lineHeight: '1',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};
