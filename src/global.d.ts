import { Buffer } from 'buffer';

type HotkeyOptionsMap = Record<string, string>;

declare global {
  interface ElectronAPI {
    openTestPage: () => Promise<{ success: boolean; error?: string }>;
    toggleHotkey: (enable: boolean) => Promise<{ success: boolean; enabled: boolean; error?: string }>;
    getHotkeyStatus: () => Promise<{ enabled: boolean }>;
    getHotkeyOptions: () => Promise<{ options: HotkeyOptionsMap; current: string }>;
    changeHotkey: (newHotkey: string) => Promise<{ success: boolean; hotkey: string; error?: string }>;
  }

  interface Window {
    Buffer: typeof Buffer;
    electronAPI?: ElectronAPI;
  }
}

export {};
