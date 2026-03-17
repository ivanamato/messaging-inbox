import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  src: string;
  isOutbound?: boolean;
  onError?: () => void;
};

const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Generate a deterministic waveform pattern from the src string
function generateWaveform(seed: string, bars: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const heights: number[] = [];
  for (let i = 0; i < bars; i++) {
    hash = ((hash << 5) - hash + i) | 0;
    const normalized = (Math.abs(hash) % 100) / 100;
    heights.push(0.15 + normalized * 0.85);
  }
  return heights;
}

export function AudioPlayer({ src, isOutbound, onError }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [waveform] = useState(() => generateWaveform(src, 40));

  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onDurationChange = () => setDuration(audio.duration);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('durationchange', onDurationChange);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('durationchange', onDurationChange);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const cycleSpeed = useCallback(() => {
    const nextIndex = (PLAYBACK_SPEEDS.indexOf(speed) + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex];
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  }, [speed]);

  const displayTime = playing || currentTime > 0 ? currentTime : duration;

  return (
    <div data-testid="audio-player" className="wa:flex wa:items-center wa:gap-2 wa:min-w-[240px] wa:max-w-[320px]">
      <audio ref={audioRef} src={src} preload="metadata" onError={onError} playbackRate={speed} />

      {/* Mic icon */}
      <div className={cn(
        'wa:relative wa:flex-shrink-0 wa:w-10 wa:h-10 wa:rounded-full wa:flex wa:items-center wa:justify-center',
        isOutbound ? 'wa:bg-[#b3ddb1]' : 'wa:bg-[#e2e2e2]'
      )}>
        <Mic className={cn('wa:h-5 wa:w-5', isOutbound ? 'wa:text-[#4faa48]' : 'wa:text-[#8696a0]')} />
      </div>

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={cn(
          'wa:flex-shrink-0 wa:w-8 wa:h-8 wa:rounded-full wa:flex wa:items-center wa:justify-center wa:transition-colors',
          isOutbound
            ? 'wa:text-[#4faa48] hover:wa:bg-[#b3ddb1]'
            : 'wa:text-[#8696a0] hover:wa:bg-[#e2e2e2]'
        )}
      >
        {playing ? (
          <Pause className="wa:h-5 wa:w-5 wa:fill-current" />
        ) : (
          <Play className="wa:h-5 wa:w-5 wa:fill-current wa:ml-0.5" />
        )}
      </button>

      {/* Waveform + time */}
      <div className="wa:flex-1 wa:min-w-0">
        <div
          className="wa:relative wa:h-7 wa:flex wa:items-center wa:gap-[1.5px] wa:cursor-pointer"
          onClick={handleSeek}
        >
          {waveform.map((h, i) => {
            const barProgress = i / waveform.length;
            const isPlayed = barProgress < progress;
            return (
              <div
                key={i}
                className={cn(
                  'wa:w-[2.5px] wa:rounded-full wa:transition-colors wa:flex-shrink-0',
                  isPlayed
                    ? (isOutbound ? 'wa:bg-[#4faa48]' : 'wa:bg-[#4fc3f7]')
                    : (isOutbound ? 'wa:bg-[#b3ddb1]' : 'wa:bg-[#c8c8c8]')
                )}
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
          {/* Seek dot */}
          <div
            className={cn(
              'wa:absolute wa:w-3 wa:h-3 wa:rounded-full wa:top-1/2 -wa:translate-y-1/2 -wa:translate-x-1/2 wa:shadow-sm',
              isOutbound ? 'wa:bg-[#4faa48]' : 'wa:bg-[#8696a0]'
            )}
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <div className="wa:flex wa:items-center wa:justify-between">
          <span className={cn(
            'wa:text-[11px] wa:leading-none',
            isOutbound ? 'wa:text-[#4d8b4a]' : 'wa:text-[#8696a0]'
          )}>
            {formatTime(displayTime)}
            {duration > 0 && (playing || currentTime > 0) && (
              <span> / {formatTime(duration)}</span>
            )}
          </span>
          <button
            data-testid="audio-speed-button"
            onClick={cycleSpeed}
            className={cn(
              'wa:text-[11px] wa:font-medium wa:leading-none wa:px-1.5 wa:py-0.5 wa:rounded-full wa:transition-colors',
              isOutbound
                ? 'wa:text-[#4d8b4a] wa:bg-[#b3ddb1] hover:wa:bg-[#9dd09a]'
                : 'wa:text-[#8696a0] wa:bg-[#e2e2e2] hover:wa:bg-[#d5d5d5]'
            )}
          >
            {speed === 1 ? '1x' : speed === 1.5 ? '1.5x' : '2x'}
          </button>
        </div>
      </div>
    </div>
  );
}
