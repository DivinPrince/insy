export type SSEEventType =
  | 'connected'
  | 'status'
  | 'diff'
  | 'applied'
  | 'undone'
  | 'accepted'
  | 'error';
  
export type SSEEventHandler<T = unknown> = (data: T) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private handlers = new Map<string, Set<SSEEventHandler>>();
  private _clientId: string;
  private _isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

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
   * Connect to the SSE stream
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `${this.baseUrl}/events?clientId=${this._clientId}`;
        this.eventSource = new EventSource(url);

        // Handle connection open
        this.eventSource.onopen = () => {
          console.log('[Insy] SSE connected');
          this._isConnected = true;
          this.reconnectAttempts = 0;
        };

        // Handle connection error
        this.eventSource.onerror = (error) => {
          console.error('[Insy] SSE error:', error);
          this._isConnected = false;

          if (this.eventSource?.readyState === EventSource.CLOSED) {
            this.attemptReconnect();
          }

          // Only reject if this is the initial connection attempt
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

        // Listen for the 'connected' event to confirm connection
        this.eventSource.addEventListener('connected', (event) => {
          try {
            const data = JSON.parse((event as MessageEvent).data);
            console.log('[Insy] Connected:', data.message);
            this._isConnected = true;
            this.emit('connected', data);
            resolve();
          } catch (err) {
            console.error('[Insy] Failed to parse connected event:', err);
          }
        });

        // Setup listeners for all event types
        this.setupEventListeners();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Setup listeners for all SSE event types
   */
  private setupEventListeners(): void {
    if (!this.eventSource) return;

    const eventTypes: SSEEventType[] = ['status', 'diff', 'applied', 'undone', 'accepted', 'error'];

    for (const eventType of eventTypes) {
      this.eventSource.addEventListener(eventType, (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          this.emit(eventType, data);
        } catch (err) {
          console.error(`[Insy] Failed to parse ${eventType} event:`, err);
        }
      });
    }
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
   * Disconnect from the SSE stream
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._isConnected = false;
    console.log('[Insy] SSE disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._isConnected && this.eventSource?.readyState === EventSource.OPEN;
  }

  /**
   * Subscribe to an event type
   */
  on<T = unknown>(event: SSEEventType | 'connected', handler: SSEEventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as SSEEventHandler);
  }

  /**
   * Unsubscribe from an event type
   */
  off<T = unknown>(event: SSEEventType | 'connected', handler: SSEEventHandler<T>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler as SSEEventHandler);
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

  /**
   * Send a POST request to the server
   */
  async post<T = unknown>(endpoint: string, payload?: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': this._clientId,
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Request failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

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
