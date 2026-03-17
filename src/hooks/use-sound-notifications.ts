import { useState, useCallback, useRef, useEffect } from 'react';

const NOTIFICATION_SOUND_KEY = 'whatsapp-inbox-sound-enabled';

/**
 * Hook to manage sound notification preferences.
 * Persists the muted state to localStorage.
 */
export function useSoundNotifications() {
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(NOTIFICATION_SOUND_KEY);
    return stored === 'false';
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Pre-create audio element for faster playback
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      localStorage.setItem(NOTIFICATION_SOUND_KEY, String(!newValue));
      return newValue;
    });
  }, []);

  const playSound = useCallback((soundUrl: string = '/notification.mp3') => {
    if (isMuted || !audioRef.current) return;

    try {
      audioRef.current.src = soundUrl;
      audioRef.current.volume = 0.5;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore play errors (browser may block autoplay)
      });
    } catch {
      // Ignore errors
    }
  }, [isMuted]);

  return {
    isMuted,
    toggleMute,
    playSound,
  };
}
