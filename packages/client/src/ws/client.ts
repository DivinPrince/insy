import type { WebSocketMessage, PromptSubmitPayload, DiffApprovalPayload } from '@insy/shared';

export type WSEventType =
  | 'connected'
  | 'status'
  | 'diff'
  | 'applied'
  | 'undone'
  | 'toggled'
  | 'accepted'
  | 'error';

export type WSEventHandler<T = unknown> = (data: T) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WSEventHandler>>();
  private _clientId: string;
  private _isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: WebSocketMessage[] = [];

  constructor(private baseUrl: string) {
    // Generate unique client ID
    this._clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Get the client ID
   */
  get clientId(): string {
    return this._clientId;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Convert HTTP URL to WebSocket URL
        const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/ws?clientId=${this._clientId}`;
        this.ws = new WebSocket(wsUrl);

        // Handle connection open
        this.ws.onopen = () => {
          console.log('[Insy] WebSocket connected');
          this._isConnected = true;
          this.reconnectAttempts = 0;
          this.flushMessageQueue();
        };

        // Handle connection close
        this.ws.onclose = (event) => {
          console.log('[Insy] WebSocket closed:', event.code, event.reason);
          this._isConnected = false;
          this.attemptReconnect();
        };

        // Handle connection error
        this.ws.onerror = (error) => {
          console.error('[Insy] WebSocket error:', error);
          this._isConnected = false;

          // Only reject if this is the initial connection attempt
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

        // Handle incoming messages
        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage;
            this.handleMessage(message);

            // Resolve on connected message
            if (message.type === 'connected') {
              resolve();
            }
          } catch (err) {
            console.error('[Insy] Failed to parse WebSocket message:', err);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WebSocketMessage): void {
    const { type, payload } = message;
    console.log(`[Insy] Received ${type}:`, payload);
    this.emit(type as WSEventType, payload);
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Insy] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(
      `[Insy] Reconnecting in ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[Insy] Reconnect failed:', error);
      });
    }, delay);
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }

  /**
   * Send a message through WebSocket
   */
  private sendMessage(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue message for later
      this.messageQueue.push(message);
      console.warn('[Insy] WebSocket not connected, message queued');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
    this.messageQueue = [];
    console.log('[Insy] WebSocket disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to an event type
   */
  on<T = unknown>(event: WSEventType | 'connected', handler: WSEventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as WSEventHandler);
  }

  /**
   * Unsubscribe from an event type
   */
  off<T = unknown>(event: WSEventType | 'connected', handler: WSEventHandler<T>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler as WSEventHandler);
    }
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[Insy] Error in ${event} handler:`, err);
        }
      });
    }
  }

  // ============================================================================
  // API Methods (previously REST, now WebSocket)
  // ============================================================================

  /**
   * Submit a prompt for processing
   */
  submitPrompt(payload: PromptSubmitPayload): void {
    this.sendMessage({
      type: 'prompt/submit',
      payload,
    });
  }

  /**
   * Approve or reject a diff
   */
  approveDiff(payload: DiffApprovalPayload): void {
    this.sendMessage({
      type: 'diff/approve',
      payload,
    });
  }

  /**
   * Undo a diff
   */
  undoDiff(diffId: string): void {
    this.sendMessage({
      type: 'diff/undo',
      payload: { diffId },
    });
  }

  /**
   * Toggle a diff preview
   */
  toggleDiff(diffId: string): void {
    this.sendMessage({
      type: 'diff/toggle',
      payload: { diffId },
    });
  }

  // ============================================================================
  // HTTP Methods (kept for non-realtime operations)
  // ============================================================================

  /**
   * Send a GET request to the server
   */
  async get<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Client-ID': this._clientId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }
}
