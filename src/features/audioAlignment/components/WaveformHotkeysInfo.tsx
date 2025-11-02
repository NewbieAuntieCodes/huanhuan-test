import React from 'react';

export const WaveformHotkeysInfo: React.FC = () => {
  return (
    <div className="text-xs text-slate-500 mt-2 text-center space-y-1 bg-slate-900/50 p-2 rounded flex-shrink-0">
      <p className="flex items-center justify-center gap-x-4 flex-wrap">
        <span className="font-semibold text-slate-300">快捷键:</span>
        <span>空格：播放/暂停</span>
        <span className="text-slate-400">|</span>
        <span>M键 / + 按钮：添加标记</span>
        <span className="text-slate-400">|</span>
        <span>Delete / Backspace：删除选中标记</span>
      </p>
      <p className="flex items-center justify-center gap-x-4 flex-wrap">
        <span className="font-semibold text-slate-300">操作:</span>
        <span>点击标记头选择</span>
        <span className="text-slate-400">|</span>
        <span>拖拽标记头移动位置</span>
        <span className="text-slate-400">|</span>
        <span>鼠标滚轮缩放波形</span>
        <span className="text-slate-400">|</span>
        <span>按住鼠标中键拖动页面</span>
      </p>
      <p className="flex items-center justify-center gap-x-4 flex-wrap">
        <span className="font-semibold text-slate-300">标记颜色:</span>
        <span className="flex items-center">
          <span className="inline-block mr-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white"></span>
          蓝色 = 当前行开始
        </span>
        <span className="flex items-center">
          <span className="inline-block mr-1 w-3 h-3 rounded-full bg-yellow-500 border-2 border-white"></span>
          黄色 = 当前行结束
        </span>
        <span className="flex items-center">
          <span className="inline-block mr-1 w-3 h-3 rounded-full bg-slate-400"></span>
          灰色 = 其他标记
        </span>
        <span className="flex items-center">
          <span className="inline-block mr-1 w-3 h-3 rounded-full bg-slate-500 border-2 border-white shadow-[0_0_8px_2px_rgba(255,255,255,0.6)]"></span>
          白色光晕 = 已选中
        </span>
        <span className="flex items-center">
          <span className="inline-block mr-1 w-px h-4 bg-cyan-400"></span>
          青色 = 鼠标定位线
        </span>
      </p>
    </div>
  );
};
