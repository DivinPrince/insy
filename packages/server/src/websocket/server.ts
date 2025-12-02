import { WebSocketServer, WebSocket } from 'ws';
import type { Message } from '@pixelcode/shared';

export type MessageHandler = (ws: WebSocket, message: Message) => void | Promise<void>;

export class PixelCodeWebSocketServer {
  private wss: WebSocketServer;
  private handlers = new Map<string, MessageHandler>();

  constructor(server: any) {
    this.wss = new WebSocketServer({ server });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString()) as Message;
          const handler = this.handlers.get(message.type);
          
          if (handler) {
            await handler(ws, message);
          } else {
            console.warn(`[WS] No handler for message type: ${message.type}`);
          }
        } catch (error) {
          console.error('[WS] Error handling message:', error);
          this.sendError(ws, 'MESSAGE_PARSE_ERROR', 'Failed to parse message');
        }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
      });

      ws.on('error', (error) => {
        console.error('[WS] Error:', error);
      });

      // Send ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            id: crypto.randomUUID(),
            type: 'pong',
            payload: {},
            timestamp: Date.now(),
          }));
        }
      }, 30000);

      ws.on('close', () => clearInterval(pingInterval));
    });
  }

  on(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  broadcast(message: Message): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  send(ws: WebSocket, message: Message): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws: WebSocket, code: string, message: string, details?: unknown): void {
    this.send(ws, {
      id: crypto.randomUUID(),
      type: 'error',
      payload: { code, message, details },
      timestamp: Date.now(),
    });
  }

  close(): void {
    this.wss.close();
  }
}
