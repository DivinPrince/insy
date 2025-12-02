import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  position: { x: number; y: number };
}

export const PromptInput: FunctionComponent<PromptInputProps> = ({
  onSubmit,
  onCancel,
  position,
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value);
      setValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 999998,
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        padding: '16px',
        minWidth: '400px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
          What would you like to change?
        </div>
        <input
          type="text"
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="e.g., Make this button blue with rounded corners"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = '#3b82f6';
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = '#e5e7eb';
          }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: 'white',
              color: '#374151',
              fontSize: '14px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: value.trim() ? '#3b82f6' : '#e5e7eb',
              color: 'white',
              fontSize: '14px',
              cursor: value.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};
