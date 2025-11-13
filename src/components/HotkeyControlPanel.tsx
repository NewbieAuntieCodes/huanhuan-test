import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

type HotkeyOptionsMap = Record<string, string>;

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  width: '280px',
  background: 'rgba(15, 23, 42, 0.95)',
  color: '#f8fafc',
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.4)',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.45)',
  padding: '18px',
  zIndex: 1100,
  fontSize: '0.9rem',
  backdropFilter: 'blur(10px)',
};

const headerStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: '10px',
  fontSize: '1rem',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(226, 232, 240, 0.5)',
  background: 'rgba(15, 23, 42, 0.8)',
  color: '#f8fafc',
  marginBottom: '10px',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  borderRadius: '10px',
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s ease',
};

const statusStyle: React.CSSProperties = {
  marginTop: '10px',
  fontSize: '0.8rem',
  opacity: 0.85,
  minHeight: '20px',
};

const HotkeyControlPanel: React.FC = () => {
  const isRecordingMode = useStore((state) => state.isRecordingMode);
  const [isElectronEnv, setIsElectronEnv] = useState(false);
  const [hotkeyOptions, setHotkeyOptions] = useState<HotkeyOptionsMap>({});
  const [currentHotkey, setCurrentHotkey] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = (message: string) => {
    setStatusMessage(message);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setStatusMessage('');
    }, 3200);
  };

  useEffect(() => {
    const available = typeof window !== 'undefined' && !!window.electronAPI;
    setIsElectronEnv(available);
    if (!available) return;

    const loadStatus = async () => {
      try {
        const [optionsResult, statusResult] = await Promise.all([
          window.electronAPI.getHotkeyOptions(),
          window.electronAPI.getHotkeyStatus(),
        ]);
        setHotkeyOptions(optionsResult.options);
        setCurrentHotkey(optionsResult.current);
        setIsEnabled(statusResult.enabled);
        showMessage('热键信息已同步');
      } catch (error) {
        console.error('无法读取热键配置', error);
        showMessage('无法连接 Electron 热键服务');
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!isElectronEnv || !isRecordingMode) {
    return null;
  }

  const handleToggle = async () => {
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.toggleHotkey(!isEnabled);
      if (result.success) {
        setIsEnabled(result.enabled);
        showMessage(result.enabled ? '热键已启用' : '热键已关闭');
      } else {
        showMessage(result.error || '热键切换失败');
      }
    } catch (error) {
      console.error('切换热键失败', error);
      showMessage('热键服务异常');
    } finally {
      setIsLoading(false);
    }
  };

  const handleHotkeyChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newHotkey = event.target.value;
    if (newHotkey === currentHotkey || !window.electronAPI) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.changeHotkey(newHotkey);
      if (result.success) {
        setCurrentHotkey(result.hotkey);
        showMessage('热键已更新');
      } else {
        showMessage(result.error || '热键修改失败');
      }
    } catch (error) {
      console.error('热键修改失败', error);
      showMessage('热键服务异常');
    } finally {
      setIsLoading(false);
    }
  };

  const buttonLabel = isEnabled ? '关闭热键监听' : '启用热键监听';
  const hotkeyLabel = hotkeyOptions[currentHotkey] || currentHotkey || '未选择';

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>热键控制</div>
      <div className="text-slate-300 mb-1">
        当前热键：<strong>{hotkeyLabel}</strong>
      </div>
      <select
        style={selectStyle}
        value={currentHotkey}
        onChange={handleHotkeyChange}
        disabled={isLoading || !hotkeyOptions || Object.keys(hotkeyOptions).length === 0}
      >
        {Object.entries(hotkeyOptions).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        style={{
          ...buttonStyle,
          background: isEnabled ? 'linear-gradient(135deg, #f97316, #ef4444)' : 'linear-gradient(135deg, #10b981, #059669)',
          color: '#fff',
        }}
        onClick={handleToggle}
        disabled={isLoading}
      >
        {isLoading ? '同步中...' : buttonLabel}
      </button>
      <div style={statusStyle}>{statusMessage}</div>
    </div>
  );
};

export default HotkeyControlPanel;
