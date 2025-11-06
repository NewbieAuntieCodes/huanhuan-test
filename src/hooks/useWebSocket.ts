/**
 * WebSocket React Hook
 *
 * 职责：
 * - 封装 WebSocketService 供 React 组件使用
 * - 管理 WebSocket 生命周期与 React 组件生命周期的同步
 * - 提供状态和方法给组件
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketService, WebSocketStatus, WebSocketConfig, WebSocketCallbacks } from '../services/websocketService';

export interface UseWebSocketOptions extends Partial<WebSocketConfig> {
  // 是否在组件挂载时自动连接
  autoConnect?: boolean;
  // 在组件卸载时是否自动断开
  autoDisconnectOnUnmount?: boolean;
  // 自定义回调
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
}

export interface UseWebSocketReturn {
  // 连接状态
  status: WebSocketStatus;
  isConnected: boolean;

  // 方法
  connect: () => void;
  disconnect: () => void;
  send: (data: any) => boolean;

  // 服务实例（高级用法）
  service: WebSocketService | null;
}

/**
 * WebSocket Hook
 *
 * @example
 * ```tsx
 * const { status, isConnected, send } = useWebSocket({
 *   url: 'ws://127.0.0.1:9002',
 *   autoConnect: true,
 *   onMessage: (data) => {
 *     console.log('收到消息:', data);
 *   }
 * });
 *
 * // 发送消息
 * send({ action: 'ping' });
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    autoConnect = true,
    autoDisconnectOnUnmount = true,
    reconnectDelay = 5000,
    autoReconnect = true,
    maxReconnectAttempts = 0,
    onOpen,
    onMessage,
    onError,
    onClose,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const serviceRef = useRef<WebSocketService | null>(null);
  const callbacksRef = useRef<WebSocketCallbacks>({});

  // 更新回调引用，避免闭包问题
  useEffect(() => {
    callbacksRef.current = {
      onOpen,
      onMessage,
      onError,
      onClose,
      onStatusChange: setStatus,
    };

    // 如果服务已存在，更新其回调
    if (serviceRef.current) {
      serviceRef.current.updateCallbacks(callbacksRef.current);
    }
  }, [onOpen, onMessage, onError, onClose]);

  // 初始化 WebSocket 服务
  useEffect(() => {
    if (!url) {
      console.warn('WebSocket URL 未提供，无法连接');
      return;
    }

    // 创建 WebSocket 服务实例
    const service = new WebSocketService({
      url,
      reconnectDelay,
      autoReconnect,
      maxReconnectAttempts,
    });

    serviceRef.current = service;

    // 如果设置了自动连接，立即连接
    if (autoConnect) {
      service.connect(callbacksRef.current);
    }

    // 清理函数
    return () => {
      if (autoDisconnectOnUnmount) {
        service.destroy();
      }
      serviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reconnectDelay, autoReconnect, maxReconnectAttempts, autoConnect, autoDisconnectOnUnmount]);

  // 连接方法
  const connect = useCallback(() => {
    if (!serviceRef.current) {
      console.warn('WebSocket 服务未初始化');
      return;
    }
    serviceRef.current.connect(callbacksRef.current);
  }, []);

  // 断开方法
  const disconnect = useCallback(() => {
    if (!serviceRef.current) {
      console.warn('WebSocket 服务未初始化');
      return;
    }
    serviceRef.current.disconnect();
  }, []);

  // 发送消息方法
  const send = useCallback((data: any): boolean => {
    if (!serviceRef.current) {
      console.warn('WebSocket 服务未初始化');
      return false;
    }
    return serviceRef.current.send(data);
  }, []);

  // 计算是否已连接
  const isConnected = status === 'connected';

  return {
    status,
    isConnected,
    connect,
    disconnect,
    send,
    service: serviceRef.current,
  };
}

/**
 * 简化版 Hook - 仅用于接收消息
 *
 * @example
 * ```tsx
 * useWebSocketListener({
 *   url: 'ws://127.0.0.1:9002',
 *   onMessage: (data) => {
 *     if (data.action === 'nextLine') {
 *       goToNextLine();
 *     }
 *   }
 * });
 * ```
 */
export function useWebSocketListener(options: UseWebSocketOptions): void {
  useWebSocket(options);
}
