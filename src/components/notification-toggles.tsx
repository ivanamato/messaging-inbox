import { Volume2, VolumeX, Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SoundToggleProps {
  isMuted: boolean;
  onToggle: () => void;
}

export function SoundToggle({ isMuted, onToggle }: SoundToggleProps) {
  return (
    <Button
      data-testid="sound-toggle"
      data-muted={isMuted}
      onClick={onToggle}
      variant="ghost"
      size="icon"
      title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
      className={cn(
        "wa:h-8 wa:w-8 wa:rounded-full",
        isMuted ? "wa:text-[#8696a0]" : "wa:text-[#54656f]"
      )}
    >
      {isMuted ? (
        <VolumeX className="wa:h-[18px] wa:w-[18px]" />
      ) : (
        <Volume2 className="wa:h-[18px] wa:w-[18px]" />
      )}
    </Button>
  );
}

interface NotificationToggleProps {
  isEnabled: boolean;
  permission: NotificationPermission;
  onToggle: () => void;
}

export function NotificationToggle({ isEnabled, permission, onToggle }: NotificationToggleProps) {
  const isBlocked = permission === 'denied';

  return (
    <Button
      data-testid="notification-toggle"
      data-enabled={isEnabled}
      onClick={onToggle}
      variant="ghost"
      size="icon"
      disabled={isBlocked}
      title={
        isBlocked
          ? 'Notifications blocked in browser'
          : isEnabled
            ? 'Disable notifications'
            : 'Enable notifications'
      }
      className={cn(
        "wa:h-8 wa:w-8 wa:rounded-full",
        isEnabled ? "wa:text-[#00a884]" : "wa:text-[#8696a0]",
        isBlocked && "wa:opacity-50 wa:cursor-not-allowed"
      )}
    >
      {isEnabled ? (
        <Bell className="wa:h-[18px] wa:w-[18px]" />
      ) : (
        <BellOff className="wa:h-[18px] wa:w-[18px]" />
      )}
    </Button>
  );
}
