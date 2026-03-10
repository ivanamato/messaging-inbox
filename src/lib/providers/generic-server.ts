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
} from './types';

const DEFAULT_GENERIC_CAPABILITIES: ProviderCapabilities = {
  templates: false,
  messagingWindow24h: false,
  pushToTalk: false,
  interactiveButtons: false,
  deleteForEveryone: false,
  conversationInitiation: { canInitiate: false, identifierType: 'opaque' },
};

export class GenericServerProvider implements MessagingProvider {
  readonly type = 'generic-server' as const;
  readonly capabilities: ProviderCapabilities;

  constructor(
    private readonly baseUrl: string,
    private readonly instanceToken: string,
    capabilitiesOverride?: Partial<ProviderCapabilities>,
  ) {
    this.capabilities = { ...DEFAULT_GENERIC_CAPABILITIES, ...capabilitiesOverride };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
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
      `/channels/${encodeURIComponent(channelId)}/status`
    );
    return data.state;
  }

  async findChats(channelId: string): Promise<Chat[]> {
    return this.request<Chat[]>(`/channels/${encodeURIComponent(channelId)}/chats`);
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
      `/channels/${encodeURIComponent(channelId)}/chats/${encodeURIComponent(chatId)}/messages?page=${page}&pageSize=${pageSize}`
    );
  }

  async sendText(channelId: string, params: SendTextParams): Promise<SendResult> {
    return this.request<SendResult>(
      `/channels/${encodeURIComponent(channelId)}/messages/text`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async sendMedia(channelId: string, params: SendMediaParams): Promise<SendResult> {
    return this.request<SendResult>(
      `/channels/${encodeURIComponent(channelId)}/messages/media`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async sendButtons(channelId: string, params: SendButtonsParams): Promise<SendResult> {
    return this.request<SendResult>(
      `/channels/${encodeURIComponent(channelId)}/messages/buttons`,
      { method: 'POST', body: JSON.stringify(params) }
    );
  }

  async getMediaUrl(channelId: string, messageId: string): Promise<string | null> {
    try {
      const data = await this.request<{ url: string }>(
        `/channels/${encodeURIComponent(channelId)}/media/${encodeURIComponent(messageId)}`
      );
      return data.url || null;
    } catch {
      return null;
    }
  }

  async deleteMessage(channelId: string, params: DeleteMessageParams): Promise<void> {
    await this.request(
      `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(params.messageId)}`,
      {
        method: 'DELETE',
        body: params.metadata ? JSON.stringify({ metadata: params.metadata }) : undefined,
      }
    );
  }
}
