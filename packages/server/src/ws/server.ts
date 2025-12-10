import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { WebSocketMessage } from '@insy/shared';

export interface WSClientConnection {
  id: string;
  ws: WebSocket;
  pingInterval: NodeJS.Timeout;
}

export type WSEventType =
  | 'connected'
  | 'status'
  | 'done'
  | 'error';

export type MessageHandler = (clientId: string, message: WebSocketMessage) => void;

export class InsyWSServer {
  private clients = new Map<string, WSClientConnection>();
  private wss: WebSocketServer | null = null;
  private messageHandler?: MessageHandler;

  /**
   * Attach WebSocket server to an existing HTTP server
   */
  attach(server: { on: Function }): void {
    this.wss = new WebSocketServer({ server: server as any, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      // Extract clientId from query string
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const clientId = url.searchParams.get('clientId');

      if (!clientId) {
        console.warn('[WS] Connection rejected: missing clientId');
        ws.close(4000, 'clientId is required');
        return;
      }

      this.handleConnection(clientId, ws);
    });

    this.wss.on('error', (error: Error) => {
      console.error('[WS] Server error:', error);
    });

    console.log('[WS] WebSocket server attached');
  }

  /**
   * Handle a new WebSocket connection
   */
  private handleConnection(clientId: string, ws: WebSocket): void {
    // Setup ping interval for keepalive (every 30 seconds)
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    // Store client
    const client: WSClientConnection = {
      id: clientId,
      ws,
      pingInterval,
    };

    this.clients.set(clientId, client);
    console.log(`[WS] Client connected: ${clientId} (total: ${this.clients.size})`);

    // Send immediate "connected" event
    this.send(clientId, 'connected', { message: 'Connected to Insy', clientId });

    // Handle incoming messages
    ws.on('message', (data: Buffer | string) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        console.log(`[WS] Received from ${clientId}:`, message.type);

        if (this.messageHandler) {
          this.messageHandler(clientId, message);
        }
      } catch (err) {
        console.error(`[WS] Failed to parse message from ${clientId}:`, err);
      }
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[WS] Client ${clientId} closed: ${code} ${reason.toString()}`);
      this.removeClient(clientId);
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error(`[WS] Client ${clientId} error:`, error);
      this.removeClient(clientId);
    });

    // Handle pong responses (for keepalive)
    ws.on('pong', () => {
      // Client is alive
    });
  }

  /**
   * Set the message handler for incoming messages
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Remove a client and cleanup resources
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      clearInterval(client.pingInterval);
      this.clients.delete(clientId);
      console.log(`[WS] Client disconnected: ${clientId} (remaining: ${this.clients.size})`);
    }
  }

  /**
   * Send an event to a specific client
   * Returns true if client exists and message was sent, false otherwise
   */
  send(clientId: string, event: WSEventType, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`[WS] Client not found: ${clientId}`);
      return false;
    }

    if (client.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WS] Client ${clientId} not in OPEN state`);
      return false;
    }

    const message: WebSocketMessage = {
      type: event,
      payload: data,
    };

    client.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: WSEventType, data: unknown): void {
    const message: WebSocketMessage = {
      type: event,
      payload: data,
    };
    const messageStr = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  }

  /**
   * Check if a client is connected
   */
  hasClient(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections and cleanup
   */
  close(): void {
    for (const client of this.clients.values()) {
      clearInterval(client.pingInterval);
      client.ws.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('[WS] Server closed, all clients disconnected');
  }
}
