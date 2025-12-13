import type { SignalingMessage, User, DetectionResult } from '../types';

type MessageHandler = (message: SignalingMessage) => void;
type DetectionHandler = (result: DetectionResult) => void;
type OnlineUsersHandler = (users: User[]) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private detectionHandlers: Set<DetectionHandler> = new Set();
  private onlineUsersHandlers: Set<OnlineUsersHandler> = new Set();
  private audioHandlers: Set<(data: ArrayBuffer) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private token: string | null = null;

  connect(token: string): void {
    // Prevent duplicate connections
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected, skipping');
      return;
    }

    this.token = token;
    this.createConnection();
  }

  private createConnection(): void {
    if (!this.token) return;

    let wsUrl: string;

    if (import.meta.env.VITE_WS_URL) {
      // Use explicit WebSocket URL for ngrok/remote
      wsUrl = `${import.meta.env.VITE_WS_URL}/ws?token=${this.token}`;
    } else {
      // Use current host with Vite proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?token=${this.token}`;
    }

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = async (event) => {
      try {
        // Handle Binary Audio Data
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          this.audioHandlers.forEach(handler => handler(arrayBuffer));
          return;
        }
        if (event.data instanceof ArrayBuffer) {
          this.audioHandlers.forEach(handler => handler(event.data));
          return;
        }

        const message = JSON.parse(event.data) as SignalingMessage;

        if (message.type === 'online-users') {
          const users = message.payload as User[];
          this.onlineUsersHandlers.forEach(handler => handler(users));
        } else if (message.type === 'detection-result') {
          const result = message.payload as DetectionResult;
          this.detectionHandlers.forEach(handler => handler(result));
        } else {
          this.messageHandlers.forEach(handler => handler(message));
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    this.socket.onclose = () => {
      console.log('[WS] Disconnected');
      this.attemptReconnect();
    };

    this.socket.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.createConnection(), delay);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.token = null;
  }

  send(message: SignalingMessage): void {
    console.log('[WS] Attempting to send message:', message.type, 'Socket state:', this.socket?.readyState);

    if (this.socket?.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(message);
      this.socket.send(data);
      console.log('[WS] Message sent on socket');
    } else {
      console.warn('[WS] Cannot send message, socket not open. State:', this.socket?.readyState);
    }
  }

  sendAudioData(data: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDetection(handler: DetectionHandler): () => void {
    this.detectionHandlers.add(handler);
    return () => this.detectionHandlers.delete(handler);
  }

  onOnlineUsers(handler: OnlineUsersHandler): () => void {
    this.onlineUsersHandlers.add(handler);
    return () => this.onlineUsersHandlers.delete(handler);
  }

  onAudioData(handler: (data: ArrayBuffer) => void): () => void {
    this.audioHandlers.add(handler);
    return () => this.audioHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
