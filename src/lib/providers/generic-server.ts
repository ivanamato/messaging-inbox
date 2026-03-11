import type {
  MessagingProvider,
  ProviderCapabilities,
  DeleteMessageParams,
  Chat,
  Message,
  SendTextParams,
  SendMediaParams,
  SendButtonsParams,
  SendResult,
  FindMessagesOptions,
  PaginatedMessages,
  GenericServerEndpoints,
} from './types';

const DEFAULT_ENDPOINTS: Required<GenericServerEndpoints> = {
  status:      'GET /channels/{channelId}/status',
  chats:       'GET /channels/{channelId}/chats',
  messages:    'GET /channels/{channelId}/chats/{chatId}/messages?page={page}&pageSize={pageSize}',
  sendText:    'POST /channels/{channelId}/messages/text',
  sendMedia:   'POST /channels/{channelId}/messages/media',
  sendButtons: 'POST /channels/{channelId}/messages/buttons',
  media:       'GET /channels/{channelId}/media/{messageId}',
  deleteMsg:   'DELETE /channels/{channelId}/messages/{messageId}',
};

const DEFAULT_GENERIC_CAPABILITIES: ProviderCapabilities = {
  templates: false,
  messagingWindow24h: false,
  pushToTalk: false,
  interactiveButtons: false,
  deleteForEveryone: false,
  conversationInitiation: { canInitiate: false, identifierType: 'opaque' },
};

/**
 * Parse an endpoint string like `"POST /channels/{channelId}/messages/text"`
 * into `{ method, path }`, interpolating placeholders from `vars`.
 */
function resolveEndpoint(
  template: string,
  vars: Record<string, string>,
): { method: string; path: string } {
  const spaceIdx = template.indexOf(' ');
  const method = spaceIdx > 0 ? template.slice(0, spaceIdx).toUpperCase() : 'GET';
  let path = spaceIdx > 0 ? template.slice(spaceIdx + 1) : template;

  path = path.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? encodeURIComponent(val) : `{${key}}`;
  });

  return { method, path };
}

export class GenericServerProvider implements MessagingProvider {
  readonly type = 'generic-server' as const;
  readonly capabilities: ProviderCapabilities;
  private readonly endpoints: Required<GenericServerEndpoints>;

  constructor(
    private readonly baseUrl: string,
    private readonly instanceToken: string,
    capabilitiesOverride?: Partial<ProviderCapabilities>,
    endpoints?: GenericServerEndpoints,
  ) {
    this.capabilities = { ...DEFAULT_GENERIC_CAPABILITIES, ...capabilitiesOverride };
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...endpoints };
  }

  private async request<T>(
    endpointKey: keyof GenericServerEndpoints,
    vars: Record<string, string>,
    options?: RequestInit,
  ): Promise<T> {
    const template = this.endpoints[endpointKey];
    const { method: templateMethod, path } = resolveEndpoint(template, vars);
    const method = options?.method ?? templateMethod;

    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.instanceToken}`,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Request failed (${res.status}): ${body.slice(0, 200)}`);
    }

    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  async getConnectionState(channelId: string): Promise<'open' | 'close' | 'connecting'> {
    const data = await this.request<{ state: 'open' | 'close' | 'connecting' }>(
      'status', { channelId },
    );
    return data.state;
  }

  async findChats(channelId: string): Promise<Chat[]> {
    return this.request<Chat[]>('chats', { channelId });
  }

  async findMessages(channelId: string, chatId: string, limit = 50): Promise<Message[]> {
    const result = await this.findMessagesPaginated(channelId, chatId, { page: 1, pageSize: limit });
    return result.messages;
  }

  async findMessagesPaginated(
    channelId: string,
    chatId: string,
    options: FindMessagesOptions = {},
  ): Promise<PaginatedMessages> {
    const { page = 1, pageSize = 50 } = options;
    return this.request<PaginatedMessages>(
      'messages',
      { channelId, chatId, page: String(page), pageSize: String(pageSize) },
    );
  }

  async sendText(channelId: string, params: SendTextParams): Promise<SendResult> {
    return this.request<SendResult>(
      'sendText', { channelId },
      { body: JSON.stringify(params) },
    );
  }

  async sendMedia(channelId: string, params: SendMediaParams): Promise<SendResult> {
    return this.request<SendResult>(
      'sendMedia', { channelId },
      { body: JSON.stringify(params) },
    );
  }

  async sendButtons(channelId: string, params: SendButtonsParams): Promise<SendResult> {
    return this.request<SendResult>(
      'sendButtons', { channelId },
      { body: JSON.stringify(params) },
    );
  }

  async getMediaUrl(channelId: string, messageId: string): Promise<string | null> {
    try {
      const data = await this.request<{ url: string }>(
        'media', { channelId, messageId },
      );
      return data.url || null;
    } catch {
      return null;
    }
  }

  async deleteMessage(channelId: string, params: DeleteMessageParams): Promise<void> {
    await this.request(
      'deleteMsg', { channelId, messageId: params.messageId },
      { body: params.metadata ? JSON.stringify({ metadata: params.metadata }) : undefined },
    );
  }
}
