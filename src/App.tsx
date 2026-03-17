import { useRef, useCallback, useState, useEffect } from 'react';
import { ConversationList, type ConversationListRef } from '@/components/conversation-list';
import { MessageView } from '@/components/message-view';
import { InstanceSelector } from '@/components/instance-selector';
import { ConnectionStatus } from '@/components/connection-status';
import { DebugPanel } from '@/components/debug-panel/debug-panel';
import { useDeviceContext } from '@/lib/provider-context';
import { useAppState } from '@/use-cases/use-app-state';
import { useTabTitle } from '@/hooks/use-tab-title';
import { useSoundNotifications } from '@/hooks/use-sound-notifications';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';
import type { ChatActionsResolver, ChatTagsResolver, BulkChatTagsResolver, PrebuiltMessage } from '@/lib/providers/types';
import type { RefObject } from 'react';

type AppProps = {
  conversationListRef?: RefObject<ConversationListRef | null>;
  chatActions?: ChatActionsResolver;
  chatTags?: ChatTagsResolver;
  chatTagsBulk?: BulkChatTagsResolver;
  prefillToken?: { id: number; message: string } | null;
};

export function App({ conversationListRef: externalRef, chatActions, chatTags, chatTagsBulk, prefillToken }: AppProps = {}) {
  const { selectedDevice, viewMode } = useDeviceContext();
  const prebuiltMessages: PrebuiltMessage[] | undefined = selectedDevice?.prebuiltMessages;
  const internalRef = useRef<ConversationListRef>(null);
  const conversationListRef = externalRef || internalRef;

  // Notification state
  const [totalUnread, setTotalUnread] = useState(0);
  const { isMuted, toggleMute } = useSoundNotifications();
  const { permission, isEnabled: notificationsEnabled, toggleEnabled: toggleNotifications } = useBrowserNotifications();

  // Update total unread count from conversation list
  useEffect(() => {
    const updateUnread = () => {
      const count = conversationListRef.current?.getTotalUnread() ?? 0;
      setTotalUnread(count);
    };
    // Initial update after a short delay to let conversations load
    const initialTimer = setTimeout(updateUnread, 500);
    // Then update periodically
    const interval = setInterval(updateUnread, 5000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [conversationListRef]);

  // Tab title with unread count
  useTabTitle(totalUnread);

  const {
    selectedConversation,
    setSelectedConversation,
    handleBackToList,
    handleTemplateSent,
    instance,
    provider,
    effectiveReadOnly,
    providerOverride,
  } = useAppState(conversationListRef);

  const handleDeviceChange = useCallback(
    (_device: { instanceName: string; provider: string } | null) => {
      // Device selection is managed by context; callback reserved for future use
    },
    [],
  );

  return (
    <div className="wa:h-full wa:flex wa:flex-col wa:bg-[#d1d7db] wa:relative">
      {/* Teal top bar — the iconic WhatsApp Web color band */}
      <div className="wa:bg-[#00a884] wa:flex-shrink-0" style={{ height: 127 }}>
        <div style={{ padding: '19px 19px 12px' }}>
          {/* Device selector sits inside the teal bar */}
          <div className="wa:bg-[#111b21] wa:rounded-lg" style={{ padding: '6px 12px' }}>
            <InstanceSelector onDeviceChange={handleDeviceChange} />
          </div>
        </div>
      </div>

      {/* Connection status banner */}
      <ConnectionStatus />

      {/* Main chat layout — negative margin to overlap with the teal bar */}
      <div className="wa:flex-1 wa:min-h-0 wa:w-full" style={{ marginTop: -68, padding: '0 19px 19px' }}>
        <div className="wa:flex wa:h-full wa:bg-white wa:overflow-hidden" style={{ boxShadow: '0 1px 1px rgba(0,0,0,0.06), 0 2px 5px rgba(0,0,0,0.06)', borderRadius: '0 0 3px 3px' }}>
        <ConversationList
          ref={conversationListRef}
          onSelectConversation={setSelectedConversation}
          selectedConversationId={
            viewMode === 'all' && selectedConversation?.deviceId
              ? `${selectedConversation.deviceId}::${selectedConversation.id}`
              : selectedConversation?.id
          }
          isHidden={!!selectedConversation}
          instance={selectedDevice?.instanceName}
          provider={provider}
          chatActions={chatActions}
          chatTags={chatTags}
          chatTagsBulk={chatTagsBulk}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          notificationsEnabled={notificationsEnabled}
          notificationPermission={permission}
          onToggleNotifications={toggleNotifications}
        />
        <MessageView
          conversationId={selectedConversation?.id}
          phoneNumber={selectedConversation?.phoneNumber}
          contactName={selectedConversation?.contactName}
          profilePicUrl={selectedConversation?.profilePicUrl}
          onTemplateSent={handleTemplateSent}
          onMessageSent={() => conversationListRef.current?.refresh()}
          onBack={handleBackToList}
          isVisible={!!selectedConversation}
          instance={instance}
          provider={provider}
          readOnly={effectiveReadOnly}
          providerOverride={providerOverride}
          prefillToken={prefillToken}
          prebuiltMessages={prebuiltMessages}
        />
        </div>
      </div>
      <DebugPanel />
    </div>
  );
}
