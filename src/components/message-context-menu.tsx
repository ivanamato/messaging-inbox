import { useState } from 'react';
import { ChevronDown, Copy, Forward, Trash2, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProvider } from '@/lib/provider-context';
import { useTranslations } from '@/lib/i18n';

type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  phoneNumber: string;
  hasMedia: boolean;
  mediaData?: {
    url: string;
    contentType?: string;
    filename?: string;
  };
  messageType?: string;
  caption?: string | null;
  mimeType?: string | null;
  filename?: string | null;
};

type Props = {
  message: Message;
  conversationId: string;
  instance?: string;
  provider?: string;
  onDeleted: (messageId: string) => void;
  onForward: (message: Message) => void;
  readOnly?: boolean;
};

export function MessageContextMenu({
  message,
  conversationId,
  instance,
  onDeleted,
  onForward,
  readOnly = false,
}: Props) {
  const provider = useProvider();
  const t = useTranslations();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCopy = () => {
    const text = message.caption || message.content;
    if (text) {
      navigator.clipboard.writeText(text);
    }
  };

  const handleDelete = async () => {
    if (!instance) return;

    setDeleting(true);
    try {
      await provider.deleteMessage(instance, {
        messageId: message.id,
        metadata: { remoteJid: conversationId, fromMe: message.direction === 'outbound' },
      });

      setShowDeleteConfirm(false);
      onDeleted(message.id);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error deleting message:', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="wa-hover-action wa:absolute wa:top-1 wa:right-1 wa:z-10 wa:opacity-0 wa:transition-opacity wa:rounded-full wa:p-0.5 hover:wa:bg-black/5"
            aria-label={t('contextMenu.messageOptions')}
          >
            <ChevronDown className="wa:h-4 wa:w-4 wa:text-[#667781]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="wa:w-40">
          <DropdownMenuItem onClick={handleCopy}>
            <Copy className="wa:h-4 wa:w-4 wa:mr-2" />
            {t('contextMenu.copy')}
          </DropdownMenuItem>
          {!readOnly && (
            <>
              <DropdownMenuItem onClick={() => onForward(message)}>
                <Forward className="wa:h-4 wa:w-4 wa:mr-2" />
                {t('contextMenu.forward')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="wa:text-red-600 focus:wa:text-red-600"
              >
                <Trash2 className="wa:h-4 wa:w-4 wa:mr-2" />
                {t('contextMenu.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:wa:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('contextMenu.deleteMessage')}</DialogTitle>
            <DialogDescription>
              {t('contextMenu.deleteConfirmation')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
            >
              {t('contextMenu.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="wa:h-4 wa:w-4 wa:animate-spin" />
              ) : (
                t('contextMenu.deleteForEveryone')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
