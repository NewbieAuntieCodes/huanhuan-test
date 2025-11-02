import React from 'react';

interface WaveformZoomControlProps {
  zoomLevel: number;
  onZoomChange: (level: number) => void;
  onResetZoom: () => void;
}

export const WaveformZoomControl: React.FC<WaveformZoomControlProps> = ({
  zoomLevel,
  onZoomChange,
  onResetZoom,
}) => {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    // Use a logarithmic scale for more intuitive control
    const newZoomLevel = Math.pow(50, value / 100);
    onZoomChange(newZoomLevel);
  };
  
  const sliderValue = Math.log(zoomLevel) / Math.log(50) * 100;

  return (
    <div className="flex items-center gap-x-3 px-4 py-1.5 bg-slate-900/50 border-b border-slate-700 flex-shrink-0">
      <span className="text-xs text-slate-400 whitespace-nowrap">缩放:</span>
      <input
        type="range"
        min="0"
        max="100"
        value={sliderValue}
        onChange={handleSliderChange}
        className="flex-grow h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${sliderValue}%, #475569 ${sliderValue}%, #475569 100%)`,
        }}
        aria-label="Zoom control"
      />
      <span className="text-xs text-slate-300 font-mono whitespace-nowrap w-12 text-right">
        {zoomLevel.toFixed(1)}x
      </span>
      <button
        onClick={onResetZoom}
        className="text-xs px-2 py-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded transition-colors"
        title="重置缩放"
      >
        重置
      </button>
    </div>
  );
};
