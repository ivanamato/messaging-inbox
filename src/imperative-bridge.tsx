import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { useProvider, useDeviceContext } from '@/lib/provider-context';
import { App } from '@/App';
import { ErrorBoundary } from '@/components/error-boundary';
import type { ConversationListRef } from '@/components/conversation-list';
import type { Chat, Message, SendResult, SendTextParams, ChatActionsResolver, ChatTagsResolver, BulkChatTagsResolver, DeviceConfig } from '@/lib/providers/types';

export type ImperativeApi = {
  getChats: () => Promise<Chat[]>;
  getMessages: (chatId: string, limit?: number) => Promise<Message[]>;
  sendText: (params: SendTextParams) => Promise<SendResult>;
  getConnectionState: () => Promise<'open' | 'close' | 'connecting'>;
  getActiveDevice: () => string | null;
  setActiveDevice: (deviceId: string) => void;
  selectConversation: (phoneNumber: string, prefillMessage?: string, deviceId?: string) => void;
  openChat: (phoneNumber: string, options?: { prefillMessage?: string; deviceId?: string }) => void;
  setWebSocketEnabled: (deviceId: string, enabled: boolean) => void;
  setWebSocketEnabledAll: (enabled: boolean) => void;
  updateDevice: (deviceId: string, patch: Partial<DeviceConfig>) => void;
};

type Props = {
  chatActions?: ChatActionsResolver;
  chatTags?: ChatTagsResolver;
  chatTagsBulk?: BulkChatTagsResolver;
};

export const ImperativeApiBridge = forwardRef<ImperativeApi, Props>(
  ({ chatActions, chatTags, chatTagsBulk }, ref) => {
    const provider = useProvider();
    const { selectedDevice, selectDevice, devices, getProviderForDevice, viewMode, setWebSocketEnabled: ctxSetWs, updateDevice: ctxUpdateDevice } = useDeviceContext();
    const conversationListRef = useRef<ConversationListRef>(null);
    const [prefillToken, setPrefillToken] = useState<{ id: number; message: string } | null>(null);
    const prefillCounterRef = useRef(0);
    const [pendingPhone, setPendingPhone] = useState<string | null>(null);
    const [pendingOpenPhone, setPendingOpenPhone] = useState<string | null>(null);

    // Apply a pending conversation selection after a device switch re-render.
    // Always refresh first so we search in the new device's chats, not stale data.
    useEffect(() => {
      if (!pendingPhone) return;
      const phone = pendingPhone;
      setPendingPhone(null);
      const ref = conversationListRef.current;
      if (!ref) return;
      ref.refresh().then(fresh => {
        const found = fresh.find(c => c.phoneNumber === phone);
        if (found) ref.select(found);
      });
    }, [selectedDevice?.id, pendingPhone]);

    // Apply a pending openChat after a device switch re-render.
    useEffect(() => {
      if (!pendingOpenPhone) return;
      const phone = pendingOpenPhone;
      setPendingOpenPhone(null);
      conversationListRef.current?.openChat(phone);
    }, [selectedDevice?.id, pendingOpenPhone]);

    useImperativeHandle(ref, () => ({
      getChats: async () => {
        if (!selectedDevice) return [];
        const deviceProvider = getProviderForDevice(selectedDevice);
        return deviceProvider.findChats(selectedDevice.instanceName);
      },
      getMessages: async (chatId: string, limit?: number) => {
        if (!selectedDevice) return [];
        const deviceProvider = getProviderForDevice(selectedDevice);
        return deviceProvider.findMessages(selectedDevice.instanceName, chatId, limit);
      },
      sendText: async (params: SendTextParams) => {
        if (!selectedDevice) throw new Error('No active device');
        const deviceProvider = getProviderForDevice(selectedDevice);
        return deviceProvider.sendText(selectedDevice.instanceName, params);
      },
      getConnectionState: async () => {
        if (!selectedDevice) throw new Error('No active device');
        const deviceProvider = getProviderForDevice(selectedDevice);
        return deviceProvider.getConnectionState(selectedDevice.instanceName);
      },
      getActiveDevice: () => {
        return selectedDevice?.id ?? null;
      },
      setActiveDevice: (deviceId: string) => {
        const device = devices.find(d => d.id === deviceId);
        if (device) selectDevice(deviceId);
      },
      selectConversation: (phoneNumber: string, prefillMessage?: string, deviceId?: string) => {
        if (prefillMessage !== undefined) {
          prefillCounterRef.current += 1;
          setPrefillToken({ id: prefillCounterRef.current, message: prefillMessage });
        }
        if (viewMode === 'all') {
          // Merged mode: all devices are visible in one list — no device switch needed.
          // Pass deviceId so we match the right device when the same number exists on multiple devices.
          conversationListRef.current?.selectByPhoneNumber(phoneNumber, deviceId);
        } else if (deviceId && deviceId !== selectedDevice?.id) {
          const device = devices.find(d => d.id === deviceId);
          if (device) selectDevice(deviceId);
          // Defer selection until after the device-switch re-render
          setPendingPhone(phoneNumber);
        } else {
          conversationListRef.current?.selectByPhoneNumber(phoneNumber);
        }
      },
      openChat: (phoneNumber: string, options?: { prefillMessage?: string; deviceId?: string }) => {
        const { prefillMessage, deviceId } = options ?? {};
        if (prefillMessage !== undefined) {
          prefillCounterRef.current += 1;
          setPrefillToken({ id: prefillCounterRef.current, message: prefillMessage });
        }
        if (viewMode === 'all') {
          conversationListRef.current?.openChat(phoneNumber, deviceId);
        } else if (deviceId && deviceId !== selectedDevice?.id) {
          const device = devices.find(d => d.id === deviceId);
          if (device) selectDevice(deviceId);
          setPendingOpenPhone(phoneNumber);
        } else {
          conversationListRef.current?.openChat(phoneNumber);
        }
      },
      setWebSocketEnabled: (deviceId: string, enabled: boolean) => {
        ctxSetWs(deviceId, enabled);
      },
      setWebSocketEnabledAll: (enabled: boolean) => {
        for (const device of devices) {
          ctxSetWs(device.id, enabled);
        }
      },
      updateDevice: (deviceId: string, patch: Partial<DeviceConfig>) => {
        ctxUpdateDevice(deviceId, patch);
      },
    }), [provider, selectedDevice, selectDevice, devices, getProviderForDevice, viewMode, ctxSetWs, ctxUpdateDevice]);

    return (
      <ErrorBoundary>
        <App
          conversationListRef={conversationListRef}
          chatActions={chatActions}
          chatTags={chatTags}
          chatTagsBulk={chatTagsBulk}
          prefillToken={prefillToken}
        />
      </ErrorBoundary>
    );
  }
);

ImperativeApiBridge.displayName = 'ImperativeApiBridge';
