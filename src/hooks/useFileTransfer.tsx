'use client'

import { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { getCurrentUser } from '@/src/integrations/firebase/auth';
import {
  retryWithBackoff,
  getUserFriendlyErrorMessage,
  logError,
  withTimeout,
  isOffline,
} from '@/src/lib/errorHandling';
import {
  validateFiles,
  getValidationSummary,
  validateShareCode,
  formatFileSize,
  getTotalFileSize,
} from '@/src/lib/fileValidation';
import { validateTextContent, getTextStats } from '@/src/lib/textValidation';

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

      // Get current user for auth token
      const user = getCurrentUser();
      const authToken = user ? await user.getIdToken() : undefined;

      // Simulate progress (since we can't track actual upload progress with FormData)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      // Call API to create share
      const response = await apiClient.createShare(
        {
          contentType: 'file',
          customCode,
          expiresInHours,
        },
        files,
        authToken
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to create share');
      }

      toast.success(`Successfully uploaded ${files.length} file(s)!`);
      return {
        shareCode: response.data.shareCode,
        transferId: response.data.transferId,
      };
    } catch (error: any) {
      logError(error, 'uploadFiles');
      const friendlyMessage = getUserFriendlyErrorMessage(error);
      toast.error(friendlyMessage);
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(0);
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
      toast.info(`Sharing text (${stats.characters} characters)`);

      // Get current user for auth token
      const user = getCurrentUser();
      const authToken = user ? await user.getIdToken() : undefined;

      setUploadProgress(50);

      // Call API to create share
      const response = await apiClient.createShare(
        {
          contentType: 'text',
          customCode,
          expiresInHours,
          content: text,
          metadata: {
            characterCount: stats.characters,
          },
        },
        undefined,
        authToken
      );

      setUploadProgress(100);

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to create share');
      }

      toast.success('Text shared successfully!');
      return {
        shareCode: response.data.shareCode,
        transferId: response.data.transferId,
      };
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

      // Get current user for auth token (optional)
      const user = getCurrentUser();
      const authToken = user ? await user.getIdToken() : undefined;

      // Call API to get share
      const response = await apiClient.getShare(code, authToken);

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch share');
      }

      return response.data;
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

      // Get current user for auth token (optional)
      const user = getCurrentUser();
      const authToken = user ? await user.getIdToken() : undefined;

      // Call API to consume share (this logs the download)
      const response = await apiClient.consumeShare(
        transferId,
        { fileId },
        authToken
      );

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to download file');
      }

      // Download file from Cloudinary URL
      const downloadUrl = response.data.downloadUrl || cloudinaryUrl;

      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`Download failed with status ${fileResponse.status}`);
      }

      const blob = await fileResponse.blob();

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
