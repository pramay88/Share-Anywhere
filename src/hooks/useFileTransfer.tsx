import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TransferFile {
  id?: string;
  name: string;
  size: number;
  file?: File;
}

export const useFileTransfer = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFiles = async (
    files: File[],
    customCode?: string,
    expiresInHours?: number
  ): Promise<{ shareCode: string; transferId: string } | null> => {
    try {
      setUploading(true);
      setUploadProgress(0);

      // Get user if authenticated (optional)
      const { data: { user } } = await supabase.auth.getUser();

      // Generate or use custom code
      let shareCode: string;
      if (customCode && customCode.length >= 6) {
        // Validate custom code is unique
        const { data: existing } = await supabase
          .from("transfers")
          .select("id")
          .eq("share_code", customCode)
          .single();
        
        if (existing) {
          throw new Error("This code is already in use. Please choose another.");
        }
        shareCode = customCode.toUpperCase();
      } else {
        const { data, error } = await supabase.rpc("generate_share_code");
        if (error) throw error;
        shareCode = (data as string)?.toUpperCase();
        if (!shareCode) throw new Error("Failed to generate share code");
      }

      // Calculate expiration
      const expiresAt = expiresInHours
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
        : null;

      // Create transfer record (owner_id is now optional)
      const { data: transfer, error: transferError } = await supabase
        .from("transfers")
        .insert({
          owner_id: user?.id || null,
          share_code: shareCode,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (transferError) throw transferError;

      // Upload files
      const totalFiles = files.length;
      const uploadedFiles = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split(".").pop();
        const fileName = `anonymous/${transfer.id}/${Date.now()}-${Math.random()
          .toString(36)
          .substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("shared-files")
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Create file record
        const { error: fileError } = await supabase.from("transfer_files").insert({
          transfer_id: transfer.id,
          storage_path: fileName,
          original_name: file.name,
          file_size: file.size,
          mime_type: file.type || "application/octet-stream",
        });

        if (fileError) throw fileError;

        uploadedFiles.push(fileName);
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      toast.success("Files uploaded successfully!");
      return { shareCode, transferId: transfer.id };
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload files");
      return null;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const getTransferByCode = async (code: string) => {
    try {
      const { data: transfer, error: transferError } = await supabase
        .from("transfers")
        .select("*, transfer_files(*)")
        .eq("share_code", code.toUpperCase())
        .single();

      if (transferError) throw transferError;

      // Check expiration
      if (transfer.expires_at && new Date(transfer.expires_at) < new Date()) {
        throw new Error("This transfer has expired");
      }

      return transfer;
    } catch (error: any) {
      console.error("Get transfer error:", error);
      toast.error(error.message || "Invalid or expired code");
      return null;
    }
  };

  const downloadFile = async (
    transferId: string,
    fileId: string,
    storagePath: string,
    originalName: string
  ) => {
    try {
      // Log the download
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from("download_logs").insert({
        transfer_id: transferId,
        file_id: fileId,
        downloaded_by: user?.id || null,
        user_agent: navigator.userAgent,
      });

      // Download file
      const { data, error } = await supabase.storage
        .from("shared-files")
        .download(storagePath);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded: ${originalName}`);
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error(error.message || "Failed to download file");
    }
  };

  return {
    uploadFiles,
    getTransferByCode,
    downloadFile,
    uploading,
    uploadProgress,
  };
};
