import type {
  MessagingProvider,
  ProviderType,
  ProviderCapabilities,
  Chat,
  Message,
  PaginatedMessages,
  SendResult,
  SendTextParams,
  SendMediaParams,
  SendButtonsParams,
  FindMessagesOptions,
  DeleteMessageParams,
} from '../providers/types';
import type { DebugStore, HttpRequestDetail } from './debug-store';
import {
  validateChats,
  validateMessages,
  validatePaginatedMessages,
  validateSendResult,
  validateConnectionState,
} from './validators';

/** Mask sensitive header values (tokens, auth). */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = ['apikey', 'authorization', 'cookie', 'set-cookie'];
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (sensitive.includes(k.toLowerCase()) && v.length > 8) {
      masked[k] = v.slice(0, 4) + '****' + v.slice(-4);
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

/** Extract headers from a Headers object into a plain record. */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => { record[key] = value; });
  return record;
}

/** Parse request body for logging (truncate large base64 payloads). */
function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      // Truncate base64 media fields
      if (parsed.media && typeof parsed.media === 'string' && parsed.media.length > 200) {
        parsed.media = parsed.media.slice(0, 100) + `...[${parsed.media.length} chars]`;
      }
      return parsed;
    } catch {
      return body.length > 500 ? body.slice(0, 500) + '...' : body;
    }
  }
  return '[non-string body]';
}

// ---------------------------------------------------------------------------
// Fetch interceptor: patches globalThis.fetch ONCE and uses an apikey-based
// routing table so concurrent provider calls don't bleed into each other.
// Each DebugProviderProxy registers its instanceToken; captured fetches are
// routed to the matching collector by the `apikey` header in the request.
// ---------------------------------------------------------------------------

type ActiveCollector = { collected: HttpRequestDetail[] };

/** Map from masked instanceToken → active collector for that call. */
const activeCollectors = new Map<string, ActiveCollector>();
let fetchPatched = false;
let originalFetch: typeof globalThis.fetch;

function ensureFetchPatched() {
  if (fetchPatched) return;
  fetchPatched = true;
  originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Extract apikey from request headers to route to the right collector
    let apikey: string | undefined;
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        apikey = init.headers.get('apikey') ?? undefined;
      } else if (Array.isArray(init.headers)) {
        const entry = init.headers.find(([k]) => k.toLowerCase() === 'apikey');
        if (entry) apikey = entry[1];
      } else {
        apikey = (init.headers as Record<string, string>)['apikey'] ??
                 (init.headers as Record<string, string>)['Apikey'] ?? undefined;
      }
    }
    // For generic-server: check Authorization header
    if (!apikey && init?.headers) {
      let authHeader: string | undefined;
      if (init.headers instanceof Headers) {
        authHeader = init.headers.get('authorization') ?? undefined;
      } else if (!Array.isArray(init.headers)) {
        authHeader = (init.headers as Record<string, string>)['Authorization'] ??
                     (init.headers as Record<string, string>)['authorization'] ?? undefined;
      }
      if (authHeader) apikey = authHeader; // use full "Bearer xxx" as key
    }

    // Find the active collector for this token
    const collector = apikey ? activeCollectors.get(apikey) : undefined;

    if (!collector) {
      // No debug proxy is active for this token — pass through
      return originalFetch(input, init);
    }

    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const httpMethod = init?.method || 'GET';
    const requestHeaders = maskHeaders(
      init?.headers
        ? (init.headers instanceof Headers
          ? headersToRecord(init.headers)
          : Array.isArray(init.headers)
            ? Object.fromEntries(init.headers)
            : init.headers as Record<string, string>)
        : {}
    );
    const requestBody = parseRequestBody(init?.body);

    const start = performance.now();
    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - start;
      const responseHeaders = headersToRecord(response.headers);
      const contentLength = response.headers.get('content-length');

      collector.collected.push({
        url,
        httpMethod,
        requestHeaders,
        requestBody,
        statusCode: response.status,
        responseHeaders,
        responseSize: contentLength ? parseInt(contentLength, 10) : null,
        duration,
      });

      return response;
    } catch (err) {
      const duration = performance.now() - start;
      collector.collected.push({
        url,
        httpMethod,
        requestHeaders,
        requestBody,
        statusCode: null,
        responseHeaders: {},
        responseSize: null,
        duration,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

export class DebugProviderProxy implements MessagingProvider {
  get type(): ProviderType { return this.inner.type; }
  get capabilities(): ProviderCapabilities { return this.inner.capabilities; }

  constructor(
    private inner: MessagingProvider,
    private store: DebugStore,
    private deviceId: string,
  ) {
    ensureFetchPatched();
  }

  /** The token used by the inner provider to authenticate requests. */
  private get tokenKey(): string {
    // Access the token from the inner provider. Both EvolutionProvider and
    // GenericServerProvider store it, but it's private. We detect it from
    // the first captured fetch. As a fallback, use deviceId.
    return (this.inner as unknown as { instanceToken?: string }).instanceToken
      ?? (this.inner as unknown as { token?: string }).token
      ?? this.deviceId;
  }

  /** For generic-server the auth header is "Bearer <token>". */
  private get authKeys(): string[] {
    const token = this.tokenKey;
    return [token, `Bearer ${token}`];
  }

  async getConnectionState(channelId: string): Promise<'open' | 'close' | 'connecting'> {
    return this._wrap('getConnectionState', channelId, {}, async () => {
      const state = await this.inner.getConnectionState(channelId);
      this.store.trackConnectionState(this.deviceId, state);
      return state;
    }, (state) => ({
      summary: `state: ${state}`,
      validate: validateConnectionState(state, { method: 'getConnectionState', deviceId: this.deviceId }),
    }));
  }

  async findChats(channelId: string): Promise<Chat[]> {
    return this._wrap('findChats', channelId, {}, async () => {
      const chats = await this.inner.findChats(channelId);
      this.store.addEvent({
        type: 'chat_refresh',
        deviceId: this.deviceId,
        summary: `Loaded ${chats.length} chats`,
      });
      return chats;
    }, (chats) => ({
      summary: `${chats.length} chats`,
      validate: validateChats(chats, { method: 'findChats', deviceId: this.deviceId }),
    }));
  }

  async findMessages(channelId: string, chatId: string, limit?: number): Promise<Message[]> {
    return this._wrap('findMessages', channelId, { chatId, limit }, async () => {
      return this.inner.findMessages(channelId, chatId, limit);
    }, (msgs) => ({
      summary: `${msgs.length} messages`,
      validate: validateMessages(msgs, { method: 'findMessages', deviceId: this.deviceId }),
    }));
  }

  async findMessagesPaginated(channelId: string, chatId: string, options?: FindMessagesOptions): Promise<PaginatedMessages> {
    return this._wrap('findMessagesPaginated', channelId, { chatId, ...options }, async () => {
      return this.inner.findMessagesPaginated(channelId, chatId, options);
    }, (result) => ({
      summary: `${result.messages.length} msgs (page ${result.pagination.currentPage}/${result.pagination.totalPages})`,
      validate: validatePaginatedMessages(result, { method: 'findMessagesPaginated', deviceId: this.deviceId }),
    }));
  }

  async sendText(channelId: string, params: SendTextParams): Promise<SendResult> {
    return this._wrap('sendText', channelId, { to: params.to, bodyLength: params.body.length }, async () => {
      const result = await this.inner.sendText(channelId, params);
      this.store.addEvent({
        type: 'message_sent',
        deviceId: this.deviceId,
        summary: `Text to ${params.to} (${params.body.length} chars)`,
      });
      return result;
    }, (result) => ({
      summary: `messageId: ${result.messageId}`,
      validate: validateSendResult(result, { method: 'sendText', deviceId: this.deviceId }),
    }));
  }

  async sendMedia(channelId: string, params: SendMediaParams): Promise<SendResult> {
    return this._wrap('sendMedia', channelId, { to: params.to, mediaType: params.mediaType, fileName: params.fileName, mimeType: params.mimeType }, async () => {
      const result = await this.inner.sendMedia(channelId, params);
      this.store.addEvent({
        type: 'message_sent',
        deviceId: this.deviceId,
        summary: `${params.mediaType} to ${params.to}`,
      });
      return result;
    }, (result) => ({
      summary: `messageId: ${result.messageId}`,
      validate: validateSendResult(result, { method: 'sendMedia', deviceId: this.deviceId }),
    }));
  }

  async sendButtons(channelId: string, params: SendButtonsParams): Promise<SendResult> {
    return this._wrap('sendButtons', channelId, { to: params.to, buttonCount: params.buttons.length }, async () => {
      const result = await this.inner.sendButtons(channelId, params);
      this.store.addEvent({
        type: 'message_sent',
        deviceId: this.deviceId,
        summary: `Buttons to ${params.to} (${params.buttons.length} buttons)`,
      });
      return result;
    }, (result) => ({
      summary: `messageId: ${result.messageId}`,
      validate: validateSendResult(result, { method: 'sendButtons', deviceId: this.deviceId }),
    }));
  }

  async getMediaUrl(channelId: string, messageId: string): Promise<string | null> {
    return this._wrap('getMediaUrl', channelId, { messageId }, async () => {
      return this.inner.getMediaUrl(channelId, messageId);
    }, (url) => ({
      summary: url ? `blob URL (${url.slice(0, 30)}…)` : 'null',
      validate: [],
    }));
  }

  async deleteMessage(channelId: string, params: DeleteMessageParams): Promise<void> {
    return this._wrap('deleteMessage', channelId, { messageId: params.messageId }, async () => {
      return this.inner.deleteMessage(channelId, params);
    }, () => ({
      summary: 'deleted',
      validate: [],
    }));
  }

  async markChatAsRead(channelId: string, chatId: string): Promise<void> {
    return this._wrap('markChatAsRead', channelId, { chatId }, async () => {
      return this.inner.markChatAsRead(channelId, chatId);
    }, () => ({
      summary: 'marked as read',
      validate: [],
    }));
  }

  // --- Internal helper ---

  private async _wrap<T>(
    method: string,
    channelId: string,
    params: unknown,
    fn: () => Promise<T>,
    onSuccess: (result: T) => { summary: string; validate: import('./debug-store').ValidationIssue[] },
  ): Promise<T> {
    const start = performance.now();

    // Register a collector for this device's auth keys
    const collector: ActiveCollector = { collected: [] };
    for (const key of this.authKeys) {
      activeCollectors.set(key, collector);
    }

    try {
      const result = await fn();
      const duration = performance.now() - start;
      const { summary, validate } = onSuccess(result);

      // Truncate raw response for large arrays
      let responseRaw: unknown = result;
      if (Array.isArray(result) && result.length > 20) {
        responseRaw = { _truncated: true, count: result.length, first5: result.slice(0, 5), last5: result.slice(-5) };
      }

      this.store.addRequest({
        method,
        deviceId: this.deviceId,
        channelId,
        duration,
        params,
        responseSummary: summary,
        responseRaw,
        success: true,
        validationIssues: validate,
        httpRequests: collector.collected,
      });
      return result;
    } catch (err) {
      const duration = performance.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.store.addRequest({
        method,
        deviceId: this.deviceId,
        channelId,
        duration,
        params,
        responseSummary: `ERROR: ${errorMessage}`,
        responseRaw: null,
        success: false,
        error: errorMessage,
        validationIssues: [{
          severity: 'error',
          method,
          deviceId: this.deviceId,
          message: errorMessage,
        }],
        httpRequests: collector.collected,
      });
      this.store.addEvent({
        type: 'error',
        deviceId: this.deviceId,
        summary: `${method} failed: ${errorMessage}`,
      });
      throw err;
    } finally {
      // Unregister collector
      for (const key of this.authKeys) {
        if (activeCollectors.get(key) === collector) {
          activeCollectors.delete(key);
        }
      }
    }
  }
}
