import { h } from 'preact';
import type { FunctionComponent } from 'preact';

interface LoadingProps {
  stage: string;
  message: string;
  progress?: number;
}

export const Loading: FunctionComponent<LoadingProps> = ({ stage, message, progress }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 999999,
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        padding: '16px 20px',
        minWidth: '300px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div
          style={{
            width: '20px',
            height: '20px',
            border: '3px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{stage}</div>
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', marginLeft: '32px' }}>{message}</div>
      {progress !== undefined && (
        <div
          style={{
            marginTop: '12px',
            marginLeft: '32px',
            height: '4px',
            backgroundColor: '#e5e7eb',
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
  );
};
