/**
 * Connection status capabilities.
 * Used for checking provider connection state.
 */

export interface ConnectionStatus {
  /**
   * Get the connection state for a channel/instance.
   */
  getConnectionState(channelId: string): Promise<'open' | 'close' | 'connecting'>;
}
