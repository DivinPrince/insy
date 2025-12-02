import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { StatusBadge } from './status-badge.js';

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
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: active ? '3px solid #3b82f6' : connected ? '2px solid #10b981' : '2px solid #9ca3af',
        backgroundColor: 'white',
        boxShadow: active
          ? '0 8px 24px rgba(59, 130, 246, 0.4)'
          : '0 4px 12px rgba(0, 0, 0, 0.15)',
        cursor: isDragging ? 'grabbing' : 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        fontWeight: '700',
        color: active ? '#3b82f6' : '#374151',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: 999997,
        transition: isDragging ? 'none' : 'all 0.2s ease',
        transform: active ? 'scale(1.1)' : 'scale(1)',
        animation: active ? 'pulse 2s infinite' : 'none',
      }}
      title={active ? 'Cancel Selection (Esc)' : `PixelCode${connected ? '' : ' (Disconnected)'} - Click to activate`}
    >
      {active ? '✕' : 'P'}
      <div
        style={{
          position: 'absolute',
          top: '-2px',
          right: '-2px',
        }}
      >
        <StatusBadge connected={connected} compact />
      </div>
    </button>
  );
};
