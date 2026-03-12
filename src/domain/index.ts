/**
 * Domain layer exports.
 * Pure business logic with no external dependencies.
 */

export {
  createOptimisticMessage,
  createOptimisticVoiceMessage,
  createOptimisticMediaMessage,
  processMessages,
  removeOptimisticMessages,
  markMessageFailed,
  isWithin24HourWindow,
  getDisabledInputMessage,
  type CreateOptimisticMessageParams,
  type MessageDirection,
  type MessageStatus,
  type MessageType,
} from './message';

export {
  getMediaType,
  isSafeMimeType,
  validateFile,
  hasSuspiciousHeader,
  sanitizeFilename,
  readFileAsBase64,
  base64ToBlobUrl,
  type MediaType,
  type FileValidationResult,
} from './media';
