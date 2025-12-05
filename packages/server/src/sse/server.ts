export interface SSEClientStream {
  id: string;
  write: (data: string) => void;
  close: () => void;
  keepaliveInterval: NodeJS.Timeout;
}

export type SSEEventType =
  | 'connected'
  | 'status'
  | 'diff'
  | 'applied'
  | 'undone'
  | 'toggled'
  | 'accepted'
  | 'error';

export class PixelCodeSSEServer {
  private clients = new Map<string, SSEClientStream>();

  /**
   * Handle a new SSE connection
   * Returns a Response that streams events to the client
   */
  handleConnection(clientId: string): Response {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    const write = (data: string) => {
      writer.write(encoder.encode(data)).catch(() => {
        // Client disconnected
        this.removeClient(clientId);
      });
    };

    const close = () => {
      writer.close().catch(() => {});
      this.removeClient(clientId);
    };

    // Setup keepalive interval (every 15 seconds)
    const keepaliveInterval = setInterval(() => {
      write(`: keepalive\n\n`);
    }, 15000);

    // Store client
    const client: SSEClientStream = {
      id: clientId,
      write,
      close,
      keepaliveInterval,
    };

    this.clients.set(clientId, client);
    console.log(`[SSE] Client connected: ${clientId} (total: ${this.clients.size})`);

    // Send immediate "connected" event
    write(this.formatSSE('connected', { message: 'Connected to PixelCode', clientId }));

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  /**
   * Remove a client and cleanup resources
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      clearInterval(client.keepaliveInterval);
      this.clients.delete(clientId);
      console.log(`[SSE] Client disconnected: ${clientId} (remaining: ${this.clients.size})`);
    }
  }

  /**
   * Send an event to a specific client
   * Returns true if client exists and message was sent, false otherwise
   */
  send(clientId: string, event: SSEEventType, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`[SSE] Client not found: ${clientId}`);
      return false;
    }

    const message = this.formatSSE(event, data);
    client.write(message);
    return true;
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: SSEEventType, data: unknown): void {
    const message = this.formatSSE(event, data);
    for (const client of this.clients.values()) {
      client.write(message);
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
   * Format an SSE message
   */
  private formatSSE(event: string, data: unknown): string {
    const jsonData = JSON.stringify(data);
    return `event: ${event}\ndata: ${jsonData}\n\n`;
  }

  /**
   * Close all connections and cleanup
   */
  close(): void {
    for (const client of this.clients.values()) {
      clearInterval(client.keepaliveInterval);
      client.close();
    }
    this.clients.clear();
    console.log('[SSE] Server closed, all clients disconnected');
  }
}
