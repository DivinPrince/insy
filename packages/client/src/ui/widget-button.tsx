import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';

interface WidgetButtonProps {
  connected: boolean;
  active: boolean;
  onClick: () => void;
  position: { x: number; y: number }; // pixels from bottom-right
  onPositionChange: (pos: { x: number; y: number }) => void;
}

export const WidgetButton: FunctionComponent<WidgetButtonProps> = ({
  connected,
  active,
  onClick,
  position,
  onPositionChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsDragging(true);
      setDragStart({
        x: e.clientX - (window.innerWidth - position.x),
        y: e.clientY - (window.innerHeight - position.y),
      });
      e.stopPropagation();
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(20, window.innerWidth - e.clientX + dragStart.x);
      const newY = Math.max(20, window.innerHeight - e.clientY + dragStart.y);
      onPositionChange({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, onPositionChange]);

  const handleClick = (e: MouseEvent) => {
    if (!isDragging) {
      onClick();
    }
    e.stopPropagation();
  };

  return (
    <button
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        position: 'fixed',
        right: `${position.x}px`,
        bottom: `${position.y}px`,
        width: '48px',
        height: '48px',
        borderRadius: '14px',
        border: active ? '2px solid #000' : connected ? '1px solid #e5e5e5' : '1px solid #e5e5e5',
        backgroundColor: active ? '#000' : '#fff',
        boxShadow: active
          ? '0 8px 24px rgba(0, 0, 0, 0.25)'
          : '0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        cursor: isDragging ? 'grabbing' : 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        zIndex: 999997,
        transition: isDragging ? 'none' : 'all 0.2s ease',
        transform: active ? 'scale(1.05)' : 'scale(1)',
      }}
      title={active ? 'Cancel Selection (Esc)' : `PixelCode${connected ? '' : ' (Disconnected)'}`}
    >
      {active ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={connected ? '#000' : '#999'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          <path d="M13 13l6 6" />
        </svg>
      )}
      
      {/* Connection indicator */}
      <div
        style={{
          position: 'absolute',
          top: '-3px',
          right: '-3px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: connected ? '#22c55e' : '#ef4444',
          border: '2px solid #fff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      />
    </button>
  );
};
