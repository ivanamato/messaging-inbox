/**
 * Media access capabilities.
 * Used for retrieving media URLs and data.
 */

export interface MediaAccess {
  /**
   * Get the URL for a media message.
   * Returns a data URI for the media content.
   */
  getMediaUrl(channelId: string, messageId: string): Promise<string | null>;
}
