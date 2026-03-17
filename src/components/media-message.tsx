import { useEffect, useState, useCallback, useRef } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AudioPlayer } from '@/components/audio-player';
import { useProvider } from '@/lib/provider-context';
import { useTranslations } from '@/lib/i18n';
import { sanitizeUrl, sanitizeDisplayFilename } from '@/lib/url-utils';
import type { WhatsAppProvider } from '@/lib/providers/types';

type Props = {
  mediaId: string;
  messageType: string;
  caption?: string | null;
  filename?: string | null;
  isOutbound?: boolean;
  instance?: string;
  providerOverride?: WhatsAppProvider;
};

export function MediaMessage({ mediaId, messageType, caption, filename, isOutbound, instance, providerOverride }: Props) {
  const contextProvider = useProvider();
  const provider = providerOverride || contextProvider;
  const t = useTranslations();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLoadError = useCallback(() => {
    setLoadFailed(true);
  }, []);

  // Lazy-load: only fetch media when the element is visible in the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before visible
    );

    observer.observe(el);

    // Fallback: if IntersectionObserver doesn't fire (e.g. inside contain:strict
    // scroll containers or when element is added already in viewport), trigger
    // after a short delay.
    const fallbackTimer = setTimeout(() => {
      setIsVisible((prev) => {
        if (!prev) observer.disconnect();
        return true;
      });
    }, 500);

    return () => {
      observer.disconnect();
      clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !instance) {
      if (!instance) setLoading(false);
      return;
    }

    let cancelled = false;

    provider
      .getMediaUrl(instance, mediaId)
      .then((url) => {
        if (!cancelled) {
          setMediaUrl(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mediaId, instance, provider, isVisible]);

  if (!isVisible || loading) {
    return (
      <div ref={containerRef} className="wa:w-64 wa:h-48 wa:rounded wa:flex wa:items-center wa:justify-center">
        <Skeleton className="wa:w-full wa:h-full" />
      </div>
    );
  }

  if (loadFailed || !mediaUrl) {
    const isAudioType = messageType === 'audio';
    return (
      <div ref={containerRef} className={cn(
        'wa:bg-muted wa:rounded wa:flex wa:items-center wa:justify-center',
        isAudioType ? 'wa:min-w-[240px] wa:h-12 wa:px-4' : 'wa:w-64 wa:h-48'
      )}>
        <p className={cn('wa:text-sm', isOutbound ? 'wa:text-green-100' : 'wa:text-muted-foreground')}>
          {t('mediaMessage.unavailable')}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {messageType === 'sticker' && (
        <img
          src={sanitizeUrl(mediaUrl) ?? ''}
          alt="Sticker"
          className="wa:max-w-[150px] wa:max-h-[150px] wa:h-auto"
          onError={handleLoadError}
        />
      )}

      {messageType === 'image' && (
        <img
          src={sanitizeUrl(mediaUrl) ?? ''}
          alt={caption || 'Image'}
          className="wa:rounded wa:max-w-full wa:h-auto wa:max-h-96"
          onError={handleLoadError}
        />
      )}

      {messageType === 'video' && (
        <video
          src={sanitizeUrl(mediaUrl) ?? ''}
          controls
          className="wa:rounded wa:max-w-full wa:h-auto wa:max-h-96"
          onError={handleLoadError}
        />
      )}

      {messageType === 'audio' && (
        <AudioPlayer src={sanitizeUrl(mediaUrl) ?? ''} isOutbound={isOutbound} onError={handleLoadError} />
      )}

      {messageType === 'document' && (
        <a
          href={sanitizeUrl(mediaUrl) ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="wa:flex wa:items-center wa:gap-2 wa:text-sm wa:underline wa:cursor-pointer hover:wa:opacity-80 wa:transition-opacity wa:text-[#00a884]"
        >
          <FileText className="wa:h-4 wa:w-4" />
          {sanitizeDisplayFilename(filename) || t('mediaMessage.downloadDocument')}
        </a>
      )}
    </div>
  );
}
