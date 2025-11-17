import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableVerticalPanelsProps {
  topPanel: React.ReactNode;
  bottomPanel: React.ReactNode;
  initialTopHeightPercent?: number;
}

const ResizableVerticalPanels: React.FC<ResizableVerticalPanelsProps> = ({
  topPanel,
  bottomPanel,
  initialTopHeightPercent = 60,
}) => {
  const [topHeight, setTopHeight] = useState(initialTopHeightPercent);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Prevent text selection while dragging
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newTopHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100;
    // Min/max height constraints (e.g., 20% to 80%)
    if (newTopHeight >= 20 && newTopHeight <= 80) {
      setTopHeight(newTopHeight);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full overflow-hidden bg-slate-900">
      <div style={{ height: `${topHeight}%` }} className="w-full overflow-hidden">
        {topPanel}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="h-2 w-full bg-slate-700 hover:bg-sky-600 cursor-row-resize flex-shrink-0"
        title="Resize panels"
      />
      <div style={{ height: `${100 - topHeight}%` }} className="w-full overflow-hidden">
        {bottomPanel}
      </div>
    </div>
  );
};

export default ResizableVerticalPanels;
