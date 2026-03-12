/**
 * useFileUpload - Manages file selection, validation, and preview.
 *
 * Single Responsibility: File upload UI state.
 * Extracted from useMessageThread for better testability and maintainability.
 */

import { useState, useCallback } from 'react';
import { useTranslations } from '@/lib/i18n';
import { validateFile, hasSuspiciousHeader, getMediaType } from '@/domain/media';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileUploadState = {
  selectedFile: File | null;
  filePreview: string | null;
  fileError: string | null;
};

export type FileUploadActions = {
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveFile: () => void;
  setFileError: React.Dispatch<React.SetStateAction<string | null>>;
};

export type UseFileUploadParams = {
  /** Max file size in bytes (default: 16MB) */
  maxFileSizeBytes?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFileUpload({
  maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE,
}: UseFileUploadParams = {}): FileUploadState & FileUploadActions {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const t = useTranslations();

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFilePreview(null);
    setFileError(null);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileError(null);

      // Validate file size
      const validation = validateFile(
        file,
        maxFileSizeBytes,
        t('messageView.fileTooLarge') || 'File exceeds 16 MB limit',
        t('messageView.fileTypeNotAllowed') || 'File type not supported',
      );

      if (!validation.valid) {
        setFileError(validation.error);
        e.target.value = '';
        return;
      }

      // Check for suspicious content (HTML/scripts in header)
      if (await hasSuspiciousHeader(file)) {
        setFileError(t('messageView.fileTypeNotAllowed') || 'File type not supported');
        e.target.value = '';
        return;
      }

      setSelectedFile(file);

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setFilePreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    },
    [t, maxFileSizeBytes],
  );

  return {
    // State
    selectedFile,
    filePreview,
    fileError,
    // Actions
    handleFileSelect,
    handleRemoveFile,
    setFileError,
  };
}

// ─── Utility Exports ──────────────────────────────────────────────────────────

export { getMediaType } from '@/domain/media';
