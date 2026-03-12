/**
 * useConversationSelection - Hook for conversation selection logic.
 *
 * Extracts business logic from ConversationList component following SRP.
 * Handles:
 * - Capability resolution (device + provider)
 * - Conversation selection with unread clearing
 * - Opening chats (existing or new)
 */

import { useCallback, useMemo } from 'react';
import type { DeviceConfig, ProviderCapabilities } from '@/lib/providers/types';
import { resolveInitiationCapability } from '@/lib/providers/types';
import type { Conversation } from './types';

export type ConversationSelectionConfig = {
  devices: DeviceConfig[];
  selectedDevice: DeviceConfig | null;
  getProviderForDevice: (device: DeviceConfig) => { capabilities: ProviderCapabilities };
  clearUnread: (chatId: string, deviceId?: string) => void;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  refresh: () => Promise<Conversation[]>;
};

export type ConversationSelectionActions = {
  /** Get effective capabilities for a device (merged device + provider) */
  getEffectiveCaps: (device: DeviceConfig) => ProviderCapabilities;
  /** Whether the current device supports initiating new chats */
  canInitiateChat: boolean;
  /** Select a conversation and clear its unread if autoRead is enabled */
  selectAndClearUnread: (conversation: Conversation) => void;
  /** Find and select a conversation by phone number */
  selectByPhoneNumber: (phoneNumber: string, deviceId?: string) => Promise<void>;
  /** Open a chat by phone number (creates synthetic conversation if not found) */
  openChat: (phoneNumber: string, deviceId?: string) => Promise<void>;
};

/**
 * Hook for conversation selection logic.
 * Encapsulates capability resolution, selection with unread clearing, and chat opening.
 */
export function useConversationSelection(config: ConversationSelectionConfig): ConversationSelectionActions {
  const {
    devices,
    selectedDevice,
    getProviderForDevice,
    clearUnread,
    onSelect,
    conversations,
    refresh,
  } = config;

  // Merge device-level capability overrides onto provider capabilities
  const getEffectiveCaps = useCallback((device: DeviceConfig): ProviderCapabilities => {
    const providerCaps = getProviderForDevice(device).capabilities;
    return device.capabilities ? { ...providerCaps, ...device.capabilities } : providerCaps;
  }, [getProviderForDevice]);

  // Check if current device supports initiating new chats
  const canInitiateChat = useMemo(() => {
    if (!selectedDevice) return true;
    return resolveInitiationCapability(getEffectiveCaps(selectedDevice)).canInitiate;
  }, [selectedDevice, getEffectiveCaps]);

  // Select a conversation and optimistically clear its unread badge when autoRead is on
  const selectAndClearUnread = useCallback((conversation: Conversation) => {
    onSelect(conversation);
    const device = conversation.deviceId
      ? devices.find(d => d.id === conversation.deviceId)
      : selectedDevice;
    if (device && device.autoRead !== false) {
      const provider = getProviderForDevice(device);
      if (provider.capabilities.markAsRead) {
        clearUnread(conversation.id, conversation.deviceId);
      }
    }
  }, [onSelect, devices, selectedDevice, getProviderForDevice, clearUnread]);

  // Find and select a conversation by phone number
  const selectByPhoneNumber = useCallback(async (phoneNumber: string, deviceId?: string) => {
    const match = (c: Conversation) =>
      c.phoneNumber === phoneNumber && (!deviceId || c.deviceId === deviceId);

    // Try to find in current list first
    const immediate = conversations.find(match);
    if (immediate) {
      onSelect(immediate);
      return;
    }

    // Not in current list — refresh first (handles just-switched device or merged mode)
    const fresh = await refresh();
    const found = fresh.find(match);
    if (found) {
      onSelect(found);
    }
  }, [conversations, onSelect, refresh]);

  // Open a chat by phone number (creates synthetic conversation if not found)
  const openChat = useCallback(async (phoneNumber: string, deviceId?: string) => {
    const match = (c: Conversation) =>
      c.phoneNumber === phoneNumber && (!deviceId || c.deviceId === deviceId);

    // Try existing chats first
    const immediate = conversations.find(match);
    if (immediate) {
      onSelect(immediate);
      return;
    }

    // Refresh to check for new chats
    const fresh = await refresh();
    const found = fresh.find(match);
    if (found) {
      onSelect(found);
      return;
    }

    // Not found — check if platform supports initiating new conversations
    const targetDeviceId = deviceId ?? selectedDevice?.id;
    const targetDevice = devices.find(d => d.id === targetDeviceId) ?? selectedDevice;

    if (targetDevice) {
      const initCap = resolveInitiationCapability(getEffectiveCaps(targetDevice));
      if (!initCap.canInitiate) return;
    }

    // Create synthetic conversation for new chat
    onSelect({
      id: phoneNumber,
      phoneNumber,
      deviceId: targetDevice?.id,
      deviceLabel: targetDevice?.label,
    });
  }, [conversations, refresh, selectedDevice, devices, getEffectiveCaps, onSelect]);

  return {
    getEffectiveCaps,
    canInitiateChat,
    selectAndClearUnread,
    selectByPhoneNumber,
    openChat,
  };
}
