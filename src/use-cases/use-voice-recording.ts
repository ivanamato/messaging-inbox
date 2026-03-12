/**
 * useVoiceRecording - Manages voice message recording and sending.
 *
 * Single Responsibility: Audio recording lifecycle.
 * Extracted from useMessageThread for better testability and maintainability.
 */

import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import type { Message, MessagingProvider } from '@/lib/providers/types';
import { createOptimisticVoiceMessage } from '@/domain/message';
// ─── Helpers ────────────────────────────────────────────────────────────────

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordingState = 'idle' | 'recording' | 'processing';

export type VoiceRecordingState = {
  recordingState: RecordingState;
  recordingDuration: number;
};

export type VoiceRecordingActions = {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
};

export type UseVoiceRecordingParams = {
  phoneNumber?: string;
  instance?: string;
  provider: MessagingProvider;
  /** Called after message is successfully sent */
  onMessageSent?: () => void;
  /** Ref to signal scroll-to-bottom for new messages */
  isNearBottomRef: RefObject<boolean>;
  /** Callback to add optimistic message to thread */
  addOptimisticMessage: (message: Message) => void;
  /** Callback to reconcile with server after send */
  reconcileMessage?: (optimisticId: string, serverMessage: Message) => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_MIME_TYPES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceRecording({
  phoneNumber,
  instance,
  provider,
  onMessageSent,
  isNearBottomRef,
  addOptimisticMessage,
}: UseVoiceRecordingParams): VoiceRecordingState & VoiceRecordingActions {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Cleanup Helpers ────────────────────────────────────────────────────────

  const stopRecordingCleanup = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingDuration(0);
    recordingChunksRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  // ─── Recording Controls ─────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Find best supported MIME type
      const mimeType = SUPPORTED_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const chunks = recordingChunksRef.current;
        stopRecordingCleanup();

        if (chunks.length === 0 || !phoneNumber || !instance) {
          setRecordingState('idle');
          return;
        }

        setRecordingState('processing');
        const blob = new Blob(chunks, { type: recorder.mimeType });

        try {
          const base64 = await readBlobAsBase64(blob);
          const optimisticId = `optimistic-${Date.now()}`;

          // Create optimistic message via domain factory
          const optimisticMessage = {
            ...createOptimisticVoiceMessage(phoneNumber, blob.type, optimisticId),
            direction: 'outbound' as const,
          };
          addOptimisticMessage(optimisticMessage);
          isNearBottomRef.current = true;

          await provider.sendMedia(instance, {
            to: phoneNumber,
            mediaType: 'audio',
            media: base64,
            fileName: 'voice.ogg',
            mimeType: blob.type,
            ptt: true,
          });

          onMessageSent?.();
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Error sending voice message:', error instanceof Error ? error.message : String(error));
          }
        } finally {
          setRecordingState('idle');
        }
      };

      recorder.start(100);
      setRecordingState('recording');
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Could not start recording:', error instanceof Error ? error.message : String(error));
      }
    }
  }, [phoneNumber, instance, provider, onMessageSent, stopRecordingCleanup, isNearBottomRef, addOptimisticMessage]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Clear handlers to prevent sending
      recorder.ondataavailable = null;
      recorder.onstop = () => {
        recorder.stream?.getTracks().forEach(t => t.stop());
      };
      recorder.stop();
    }
    stopRecordingCleanup();
    setRecordingState('idle');
  }, [stopRecordingCleanup]);

  // ─── Cleanup on Unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  return {
    // State
    recordingState,
    recordingDuration,
    // Actions
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
