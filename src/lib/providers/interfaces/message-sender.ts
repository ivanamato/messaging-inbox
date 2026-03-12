/**
 * Message sending capabilities.
 * Used for sending text, media, and interactive messages.
 */
import type { SendTextParams, SendMediaParams, SendButtonsParams, SendResult } from '../types';

export interface MessageSender {
  /**
   * Send a text message.
   */
  sendText(channelId: string, params: SendTextParams): Promise<SendResult>;

  /**
   * Send a media message (image, video, audio, document).
   */
  sendMedia(channelId: string, params: SendMediaParams): Promise<SendResult>;

  /**
   * Send an interactive button message.
   */
  sendButtons(channelId: string, params: SendButtonsParams): Promise<SendResult>;
}
