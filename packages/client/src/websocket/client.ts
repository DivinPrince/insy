import type { Message } from '@pixelcode/shared';

export type MessageHandler = (message: Message) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers: Set<MessageHandler> = new Set();

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[PixelCode] Connected to server');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as Message;
            this.handlers.forEach((handler) => handler(message));
          } catch (error) {
            console.error('[PixelCode] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[PixelCode] WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[PixelCode] Disconnected from server');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[PixelCode] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `[PixelCode] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[PixelCode] Reconnect failed:', error);
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  send<T>(message: Message<T>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[PixelCode] WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  on(handler: MessageHandler): void {
    this.handlers.add(handler);
  }

  off(handler: MessageHandler): void {
    this.handlers.delete(handler);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
