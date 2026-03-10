import { useRef, useCallback } from 'react';
import { ConversationList, type ConversationListRef } from '@/components/conversation-list';
import { MessageView } from '@/components/message-view';
import { InstanceSelector } from '@/components/instance-selector';
import { ConnectionStatus } from '@/components/connection-status';
import { useDeviceContext } from '@/lib/provider-context';
import { useAppState } from '@/use-cases/use-app-state';
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
    <div className="wa:h-full wa:flex wa:flex-col wa:bg-[#d1d7db]">
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
    </div>
  );
}
