import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

export type Translations = {
  // Conversation list
  'conversationList.chats': string;
  'conversationList.autoUpdating': string;
  'conversationList.searchPlaceholder': string;
  'conversationList.searchOnlyPlaceholder': string;
  'conversationList.noConversationsFound': string;
  'conversationList.noConversationsYet': string;
  'conversationList.selectInstance': string;
  'conversationList.yesterday': string;

  // Message view
  'messageView.title': string;
  'messageView.emptyStateDescription': string;
  'messageView.encryptionNotice': string;
  'messageView.messageDeleted': string;
  'messageView.downloadFile': string;
  'messageView.notDelivered': string;
  'messageView.readOnlyMode': string;
  'messageView.uploadFile': string;
  'messageView.sendInteractiveMessage': string;
  'messageView.typeMessage': string;
  'messageView.sendTemplate': string;
  'messageView.noInboundMessages': string;
  'messageView.outside24HourWindow': string;
  'messageView.today': string;
  'messageView.yesterday': string;
  'messageView.loadingOlderMessages': string;

  // Instance selector
  'instanceSelector.loadingDevices': string;
  'instanceSelector.noDevicesConfigured': string;
  'instanceSelector.selectDevice': string;
  'instanceSelector.allDevices': string;
  'instanceSelector.connected': string;
  'instanceSelector.close': string;
  'instanceSelector.mergeDevices': string;

  // Message context menu
  'contextMenu.messageOptions': string;
  'contextMenu.copy': string;
  'contextMenu.forward': string;
  'contextMenu.delete': string;
  'contextMenu.deleteMessage': string;
  'contextMenu.deleteConfirmation': string;
  'contextMenu.cancel': string;
  'contextMenu.deleteForEveryone': string;

  // Forward message dialog
  'forwardDialog.title': string;
  'forwardDialog.description': string;
  'forwardDialog.forwarding': string;
  'forwardDialog.searchContacts': string;
  'forwardDialog.noContactsFound': string;
  'forwardDialog.cancel': string;
  'forwardDialog.forward': string;
  'forwardDialog.genericError': string;

  // Template selector dialog
  'templateSelector.title': string;
  'templateSelector.description': string;
  'templateSelector.noTemplates': string;
  'templateSelector.cancel': string;
  'templateSelector.send': string;
  'templateSelector.notSupported': string;

  // Template parameters dialog
  'templateParameters.title': string;
  'templateParameters.description': string;
  'templateParameters.fillAllParameters': string;
  'templateParameters.example': string;
  'templateParameters.back': string;
  'templateParameters.sendTemplate': string;
  'templateParameters.notSupported': string;

  // Interactive message dialog
  'interactiveDialog.title': string;
  'interactiveDialog.description': string;
  'interactiveDialog.headerLabel': string;
  'interactiveDialog.headerPlaceholder': string;
  'interactiveDialog.bodyLabel': string;
  'interactiveDialog.bodyPlaceholder': string;
  'interactiveDialog.buttonsLabel': string;
  'interactiveDialog.addButton': string;
  'interactiveDialog.buttonPlaceholder': string;
  'interactiveDialog.moreButtons': string;
  'interactiveDialog.cancel': string;
  'interactiveDialog.send': string;
  'interactiveDialog.validationError': string;
  'interactiveDialog.noConversation': string;
  'interactiveDialog.noInstance': string;
  'interactiveDialog.sendError': string;

  // Media message
  'mediaMessage.unavailable': string;
  'mediaMessage.downloadDocument': string;

  // File upload errors
  'messageView.fileTooLarge': string;
  'messageView.fileTypeNotAllowed': string;

  // Connection status
  'connectionStatus.connecting': string;
  'connectionStatus.disconnected': string;
};

export const defaultTranslations: Translations = {
  // Conversation list
  'conversationList.chats': 'Chats',
  'conversationList.autoUpdating': 'Auto-updating',
  'conversationList.searchPlaceholder': 'Search or start new chat',
  'conversationList.searchOnlyPlaceholder': 'Search chats',
  'conversationList.noConversationsFound': 'No conversations found',
  'conversationList.noConversationsYet': 'No conversations yet',
  'conversationList.selectInstance': 'Select an instance to view chats',
  'conversationList.yesterday': 'Yesterday',

  // Message view
  'messageView.title': 'WhatsApp Inbox',
  'messageView.emptyStateDescription': 'Send and receive messages. Select a conversation from the sidebar to get started.',
  'messageView.encryptionNotice': 'Messages are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
  'messageView.messageDeleted': 'This message was deleted',
  'messageView.downloadFile': 'Download file',
  'messageView.notDelivered': 'Not delivered',
  'messageView.readOnlyMode': 'This device is in read-only mode',
  'messageView.uploadFile': 'Upload file',
  'messageView.sendInteractiveMessage': 'Send interactive message',
  'messageView.typeMessage': 'Type a message',
  'messageView.sendTemplate': 'Send template',
  'messageView.noInboundMessages': "User hasn't messaged yet. Send a template message or wait for them to reply.",
  'messageView.outside24HourWindow': 'Last message was over 24 hours ago. Send a template message or wait for the user to message you.',
  'messageView.today': 'Today',
  'messageView.yesterday': 'Yesterday',
  'messageView.loadingOlderMessages': 'Loading older messages...',

  // Instance selector
  'instanceSelector.loadingDevices': 'Loading devices...',
  'instanceSelector.noDevicesConfigured': 'No devices configured',
  'instanceSelector.selectDevice': 'Select device',
  'instanceSelector.allDevices': 'All Devices',
  'instanceSelector.connected': 'connected',
  'instanceSelector.close': 'Close',
  'instanceSelector.mergeDevices': 'Merge devices',

  // Message context menu
  'contextMenu.messageOptions': 'Message options',
  'contextMenu.copy': 'Copy',
  'contextMenu.forward': 'Forward',
  'contextMenu.delete': 'Delete',
  'contextMenu.deleteMessage': 'Delete message',
  'contextMenu.deleteConfirmation': 'This will delete the message for everyone in the chat. This action cannot be undone.',
  'contextMenu.cancel': 'Cancel',
  'contextMenu.deleteForEveryone': 'Delete for everyone',

  // Forward message dialog
  'forwardDialog.title': 'Forward message',
  'forwardDialog.description': 'Choose a contact to forward this message to',
  'forwardDialog.forwarding': 'Forwarding:',
  'forwardDialog.searchContacts': 'Search contacts...',
  'forwardDialog.noContactsFound': 'No contacts found',
  'forwardDialog.cancel': 'Cancel',
  'forwardDialog.forward': 'Forward',
  'forwardDialog.genericError': 'Failed to forward message',

  // Template selector dialog
  'templateSelector.title': 'Send template message',
  'templateSelector.description': 'Select a template to send to {phoneNumber}',
  'templateSelector.noTemplates': 'No approved templates found',
  'templateSelector.cancel': 'Cancel',
  'templateSelector.send': 'Send',
  'templateSelector.notSupported': 'Templates are not yet supported for this provider',

  // Template parameters dialog
  'templateParameters.title': 'Template parameters',
  'templateParameters.description': 'Fill in the parameters for {templateName}',
  'templateParameters.fillAllParameters': 'Please fill in all parameters',
  'templateParameters.example': 'Example: {example}',
  'templateParameters.back': 'Back',
  'templateParameters.sendTemplate': 'Send template',
  'templateParameters.notSupported': 'Templates are not yet supported for this provider',

  // Interactive message dialog
  'interactiveDialog.title': 'Send interactive message',
  'interactiveDialog.description': 'Create a message with interactive buttons',
  'interactiveDialog.headerLabel': 'Header (optional)',
  'interactiveDialog.headerPlaceholder': 'Add a header to your message',
  'interactiveDialog.bodyLabel': 'Body',
  'interactiveDialog.bodyPlaceholder': 'Enter your message text',
  'interactiveDialog.buttonsLabel': 'Buttons',
  'interactiveDialog.addButton': 'Add button',
  'interactiveDialog.buttonPlaceholder': 'Button {index} title',
  'interactiveDialog.moreButtons': 'You can add up to {count} more button(s)',
  'interactiveDialog.cancel': 'Cancel',
  'interactiveDialog.send': 'Send',
  'interactiveDialog.validationError': 'Please fill in the body and all button titles',
  'interactiveDialog.noConversation': 'No conversation selected',
  'interactiveDialog.noInstance': 'No instance selected',
  'interactiveDialog.sendError': 'Failed to send message',

  // Media message
  'mediaMessage.unavailable': 'Media unavailable',
  'mediaMessage.downloadDocument': 'Download document',

  // File upload errors
  'messageView.fileTooLarge': 'File exceeds 16 MB limit',
  'messageView.fileTypeNotAllowed': 'File type not supported',

  // Connection status
  'connectionStatus.connecting': 'Connecting to WhatsApp...',
  'connectionStatus.disconnected': 'WhatsApp disconnected. Messages may not be delivered.',
};

type TranslationFunction = {
  (key: keyof Translations): string;
  (key: keyof Translations, params: Record<string, string | number>): string;
};

const TranslationsContext = createContext<Translations>(defaultTranslations);

export function TranslationsProvider({
  translations,
  children,
}: PropsWithChildren<{ translations?: Partial<Translations> }>) {
  const merged = useMemo(
    () => (translations ? { ...defaultTranslations, ...translations } : defaultTranslations),
    [translations]
  );

  return (
    <TranslationsContext.Provider value={merged}>
      {children}
    </TranslationsContext.Provider>
  );
}

export function useTranslations(): TranslationFunction {
  const translations = useContext(TranslationsContext);

  return useMemo(() => {
    const t: TranslationFunction = (
      key: keyof Translations,
      params?: Record<string, string | number>
    ): string => {
      let value = translations[key] || defaultTranslations[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    };
    return t;
  }, [translations]);
}
