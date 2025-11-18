/**
 * WebSocket 连接管理服务
 *
 * 职责：
 * - 管理 WebSocket 连接生命周期
 * - 自动重连机制
 * - 消息发送和接收
 * - 连接状态管理
 */

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

export interface WebSocketCallbacks {
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onStatusChange?: (status: WebSocketStatus) => void;
}

export interface WebSocketConfig {
  url: string;
  reconnectDelay?: number; // 重连延迟时间（毫秒）
  autoReconnect?: boolean; // 是否自动重连
  maxReconnectAttempts?: number; // 最大重连次数（0表示无限制）
}

export class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private config: Required<WebSocketConfig>;
  private callbacks: WebSocketCallbacks = {};
  private status: WebSocketStatus = 'disconnected';
  private hasWarnedConnection = false;
  private reconnectAttempts = 0;
  private isManualClose = false; // 是否是手动关闭

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      reconnectDelay: config.reconnectDelay ?? 5000,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 0, // 0 表示无限重连
    };
  }

  /**
   * 连接 WebSocket
   */
  connect(callbacks?: WebSocketCallbacks): void {
    if (callbacks) {
      this.callbacks = { ...this.callbacks, ...callbacks };
    }

    this.isManualClose = false;
    this.updateStatus('connecting');

    try {
      this.socket = new WebSocket(this.config.url);
      this.setupEventHandlers();
    } catch (error) {
      console.warn('WebSocket 连接初始化失败:', error);
      this.updateStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * 断开 WebSocket 连接
   */
  disconnect(): void {
    this.isManualClose = true;
    this.clearReconnectTimeout();

    if (this.socket) {
      // 移除事件监听器，防止触发重连
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;

      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }

    this.updateStatus('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * 发送消息
   */
  send(data: any): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket 未连接，无法发送消息');
      return false;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.socket.send(message);
      return true;
    } catch (error) {
      console.error('发送 WebSocket 消息失败:', error);
      return false;
    }
  }

  /**
   * 获取当前连接状态
   */
  getStatus(): WebSocketStatus {
    return this.status;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.status === 'connected' && this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * 更新回调函数
   */
  updateCallbacks(callbacks: WebSocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('✅ WebSocket 连接成功:', this.config.url);
      this.updateStatus('connected');
      this.hasWarnedConnection = false;
      this.reconnectAttempts = 0;
      this.callbacks.onOpen?.();
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onMessage?.(data);
      } catch (error) {
        console.error('解析 WebSocket 消息失败:', error);
        // 如果解析失败，传递原始数据
        this.callbacks.onMessage?.(event.data);
      }
    };

    this.socket.onerror = (event: Event) => {
      // 降级为警告，避免在没有运行本地服务时产生恐慌
      // 只有在首次连接失败时可能会打印，后续重连由 onclose 处理
      if (!this.hasWarnedConnection) {
         console.warn('⚠️ WebSocket 连接提示:', `无法连接到 ${this.config.url}。这在未启动本地热键服务时是正常的。`);
      }
      this.callbacks.onError?.(event);
    };

    this.socket.onclose = (event: CloseEvent) => {
      this.updateStatus('disconnected');

      if (event.wasClean) {
        console.log('WebSocket 连接已正常关闭');
      } else {
        // 只在第一次显示警告，避免控制台刷屏
        if (!this.hasWarnedConnection) {
          const delay = this.config.reconnectDelay / 1000;
          console.warn(`WebSocket 连接断开 (Code: ${event.code})。${this.config.autoReconnect ? `${delay}秒后将尝试重连...` : ''}`);
          this.hasWarnedConnection = true;
        }
      }

      this.callbacks.onClose?.(event);

      // 如果不是手动关闭，尝试重连
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (!this.config.autoReconnect || this.isManualClose) {
      return;
    }

    // 检查是否达到最大重连次数
    if (this.config.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`已达到最大重连次数 (${this.config.maxReconnectAttempts})，停止重连`);
      return;
    }

    this.clearReconnectTimeout();
    this.reconnectAttempts++;

    this.reconnectTimeout = window.setTimeout(() => {
      // console.log(`🔄 尝试重连 WebSocket (第 ${this.reconnectAttempts} 次)...`); // Reduce noise
      this.connect();
    }, this.config.reconnectDelay);
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * 更新连接状态
   */
  private updateStatus(newStatus: WebSocketStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatusChange?.(newStatus);
    }
  }

  /**
   * 销毁服务实例
   */
  destroy(): void {
    this.disconnect();
    this.callbacks = {};
  }
}