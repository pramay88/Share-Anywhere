import { useState } from 'react';
import { toast } from 'sonner';
import {
  retryWithBackoff,
  getUserFriendlyErrorMessage,
  logError,
  withTimeout,
  isOffline,
} from '@/lib/errorHandling';
import {
  validateFiles,
  getValidationSummary,
  validateShareCode,
  formatFileSize,
  getTotalFileSize,
} from '@/lib/fileValidation';
import {
  generateShareCode,
  isShareCodeUnique,
  createTransfer,
  addFileToTransfer,
  getTransferByCode,
  logDownload,
} from '@/integrations/firebase/firestore';
import { uploadToCloudinary, getCloudinaryUrl } from '@/integrations/cloudinary/config';
import { getCurrentUser } from '@/integrations/firebase/auth';

export const useFileTransfer = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFiles = async (
    files: File[],
    customCode?: string,
    expiresInHours?: number
  ): Promise<{ shareCode: string; transferId: string } | null> => {
    try {
      // Check if offline
      if (isOffline()) {
        toast.error('You are offline. Please check your internet connection.');
        return null;
      }

      setUploading(true);
      setUploadProgress(0);

      // Validate files
      const validationResults = validateFiles(files);
      const validationSummary = getValidationSummary(validationResults);

      if (!validationSummary.valid) {
        toast.error(validationSummary.error || 'Invalid files selected');
        return null;
      }

      // Validate custom code if provided
      if (customCode) {
        const codeValidation = validateShareCode(customCode);
        if (!codeValidation.valid) {
          toast.error(codeValidation.error || 'Invalid custom code');
          return null;
        }
      }

      // Show total size info
      const totalSize = getTotalFileSize(files);
      toast.info(`Uploading ${files.length} file(s) (${formatFileSize(totalSize)})`);

      // Get current user
      const user = getCurrentUser();

      // Generate or use custom code
      let shareCode: string;
      if (customCode && customCode.length >= 6) {
        // Validate custom code is unique with retry
        const checkCodeUnique = async () => {
          const isUnique = await isShareCodeUnique(customCode);
          if (!isUnique) {
            throw new Error('This code is already in use. Please choose another.');
          }
          return true;
        };

        await retryWithBackoff(checkCodeUnique, {
          maxAttempts: 2,
          delayMs: 500,
        });

        shareCode = customCode.toUpperCase();
      } else {
        // Generate unique code with retry
        const generateUniqueCode = async () => {
          let code = generateShareCode();
          let attempts = 0;
          while (!(await isShareCodeUnique(code)) && attempts < 10) {
            code = generateShareCode();
            attempts++;
          }
          if (attempts >= 10) {
            throw new Error('Failed to generate unique code. Please try again.');
          }
          return code;
        };

        shareCode = await retryWithBackoff(generateUniqueCode, {
          maxAttempts: 3,
          delayMs: 1000,
          onRetry: (attempt) => {
            toast.loading(`Generating code (attempt ${attempt})...`);
          },
        });
      }

      // Calculate expiration
      const expiresAt = expiresInHours
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
        : null;

      // Create transfer record with retry and timeout
      const createTransferRecord = async () => {
        return await createTransfer(shareCode, user?.uid || null, expiresAt);
      };

      const transferId = await withTimeout(
        retryWithBackoff(createTransferRecord, {
          maxAttempts: 3,
          delayMs: 1000,
        }),
        15000,
        'Creating transfer timed out. Please try again.'
      );

      // Upload files with progress tracking
      const totalFiles = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Upload to Cloudinary with retry
        const uploadFile = async () => {
          return await uploadToCloudinary(
            file,
            `sendanywhere/${transferId}`,
            (progress) => {
              // Calculate overall progress
              const fileProgress = (i + progress / 100) / totalFiles;
              setUploadProgress(Math.round(fileProgress * 100));
            }
          );
        };

        const uploadResult = await withTimeout(
          retryWithBackoff(uploadFile, {
            maxAttempts: 3,
            delayMs: 2000,
            onRetry: (attempt) => {
              toast.loading(`Retrying upload for "${file.name}" (attempt ${attempt})...`);
            },
          }),
          120000, // 2 minute timeout per file
          `Upload timed out for "${file.name}". Please try again.`
        );

        // Add file record to Firestore with retry
        const addFileRecord = async () => {
          return await addFileToTransfer(transferId, {
            cloudinary_public_id: uploadResult.publicId,
            cloudinary_url: uploadResult.secureUrl,
            original_name: file.name,
            file_size: file.size,
            mime_type: file.type || 'application/octet-stream',
          });
        };

        await retryWithBackoff(addFileRecord, {
          maxAttempts: 3,
          delayMs: 1000,
        });

        // Update progress
        const progress = Math.round(((i + 1) / totalFiles) * 100);
        setUploadProgress(progress);

        // Show progress toast
        if (i < totalFiles - 1) {
          toast.loading(`Uploading... ${i + 1}/${totalFiles} files (${progress}%)`);
        }
      }

      toast.success(`Successfully uploaded ${totalFiles} file(s)!`);
      return { shareCode, transferId };
    } catch (error: any) {
      logError(error, 'uploadFiles');
      const friendlyMessage = getUserFriendlyErrorMessage(error);
      toast.error(friendlyMessage);
      return null;
    }
  };

  const uploadText = async (
    text: string,
    customCode?: string,
    expiresInHours?: number
  ): Promise<{ shareCode: string; transferId: string } | null> => {
    try {
      // Check if offline
      if (isOffline()) {
        toast.error('You are offline. Please check your internet connection.');
        return null;
      }

      setUploading(true);
      setUploadProgress(0);

      // Import text validation (dynamic to avoid circular deps)
      const { validateTextContent, getTextStats, detectLanguageHint } = await import('@/lib/textValidation');

      // Validate text
      const validation = validateTextContent(text);
      if (!validation.valid) {
        toast.error(validation.error || 'Invalid text content');
        return null;
      }

      // Validate custom code if provided
      if (customCode) {
        const codeValidation = validateShareCode(customCode);
        if (!codeValidation.valid) {
          toast.error(codeValidation.error || 'Invalid custom code');
          return null;
        }
      }

      // Get text stats
      const stats = getTextStats(text);
      const languageHint = detectLanguageHint(text);

      toast.info(`Sharing text (${stats.characters} characters)`);

      // Get current user
      const user = getCurrentUser();

      // Generate or use custom code
      let shareCode: string;
      if (customCode && customCode.length >= 6) {
        // Validate custom code is unique with retry
        const checkCodeUnique = async () => {
          const isUnique = await isShareCodeUnique(customCode);
          if (!isUnique) {
            throw new Error('This code is already in use. Please choose another.');
          }
          return true;
        };

        await retryWithBackoff(checkCodeUnique, {
          maxAttempts: 2,
          delayMs: 500,
        });

        shareCode = customCode.toUpperCase();
      } else {
        // Generate unique code with retry
        const generateUniqueCode = async () => {
          let code = generateShareCode();
          let attempts = 0;
          while (!(await isShareCodeUnique(code)) && attempts < 10) {
            code = generateShareCode();
            attempts++;
          }
          if (attempts >= 10) {
            throw new Error('Failed to generate unique code. Please try again.');
          }
          return code;
        };

        shareCode = await retryWithBackoff(generateUniqueCode, {
          maxAttempts: 3,
          delayMs: 1000,
          onRetry: (attempt) => {
            toast.loading(`Generating code (attempt ${attempt})...`);
          },
        });
      }

      // Calculate expiration
      const expiresAt = expiresInHours
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
        : null;

      // Create text transfer record with retry and timeout
      const createTextTransferRecord = async () => {
        // Build metadata object, only including language_hint if defined
        const metadata: { character_count: number; language_hint?: string } = {
          character_count: stats.characters,
        };

        // Only add language_hint if it's defined
        if (languageHint) {
          metadata.language_hint = languageHint;
        }

        return await createTransfer(
          shareCode,
          user?.uid || null,
          expiresAt,
          'text',
          text,
          metadata
        );
      };

      const transferId = await withTimeout(
        retryWithBackoff(createTextTransferRecord, {
          maxAttempts: 3,
          delayMs: 1000,
        }),
        15000,
        'Creating transfer timed out. Please try again.'
      );

      setUploadProgress(100);
      toast.success('Text shared successfully!');
      return { shareCode, transferId };
    } catch (error: any) {
      logError(error, 'uploadText');
      const friendlyMessage = getUserFriendlyErrorMessage(error);
      toast.error(friendlyMessage);
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const getTransferByShareCode = async (code: string) => {
    try {
      // Check if offline
      if (isOffline()) {
        toast.error('You are offline. Please check your internet connection.');
        return null;
      }

      // Validate code format
      const codeValidation = validateShareCode(code);
      if (!codeValidation.valid) {
        toast.error(codeValidation.error || 'Invalid code format');
        return null;
      }

      // Get transfer with retry and timeout
      const getTransfer = async () => {
        const result = await getTransferByCode(code);
        if (!result) {
          throw new Error('Invalid or expired code. Please check the code and try again.');
        }
        return result;
      };

      const result = await withTimeout(
        retryWithBackoff(getTransfer, {
          maxAttempts: 3,
          delayMs: 1000,
          onRetry: (attempt) => {
            toast.loading(`Looking for transfer (attempt ${attempt})...`);
          },
        }),
        10000,
        'Request timed out. Please try again.'
      );

      return result;
    } catch (error: any) {
      logError(error, 'getTransferByShareCode');
      const friendlyMessage = getUserFriendlyErrorMessage(error);
      toast.error(friendlyMessage);
      return null;
    }
  };

  const downloadFile = async (
    transferId: string,
    fileId: string,
    cloudinaryUrl: string,
    originalName: string
  ) => {
    try {
      // Check if offline
      if (isOffline()) {
        toast.error('You are offline. Please check your internet connection.');
        return;
      }

      toast.loading(`Downloading "${originalName}"...`);

      // Log the download with retry
      const logDownloadRecord = async () => {
        const user = getCurrentUser();
        await logDownload(transferId, fileId, user?.uid || null, navigator.userAgent);
      };

      // Don't fail download if logging fails
      try {
        await retryWithBackoff(logDownloadRecord, {
          maxAttempts: 2,
          delayMs: 500,
        });
      } catch (logError) {
        console.warn('Failed to log download:', logError);
      }

      // Use the stored Cloudinary URL directly
      const downloadUrl = cloudinaryUrl;

      // Download file
      const downloadFileData = async () => {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`Download failed with status ${response.status}`);
        }
        return await response.blob();
      };

      const blob = await withTimeout(
        retryWithBackoff(downloadFileData, {
          maxAttempts: 3,
          delayMs: 2000,
          onRetry: (attempt) => {
            toast.loading(`Retrying download (attempt ${attempt})...`);
          },
        }),
        60000, // 60 second timeout
        `Download timed out for "${originalName}". Please try again.`
      );

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded: ${originalName}`);
    } catch (error: any) {
      logError(error, 'downloadFile');
      const friendlyMessage = getUserFriendlyErrorMessage(error);
      toast.error(friendlyMessage);
    }
  };

  return {
    uploadFiles,
    uploadText,
    getTransferByShareCode,
    downloadFile,
    uploading,
    uploadProgress,
  };
};
