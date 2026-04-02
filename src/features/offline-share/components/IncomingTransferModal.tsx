/**
 * IncomingTransferModal Component - Modal for accepting/declining incoming transfers
 */

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface IncomingTransferModalProps {
    isOpen: boolean;
    senderName: string;
    fileName?: string;
    fileSize?: number;
    onAccept: () => void;
    onDecline: () => void;
}

export function IncomingTransferModal({
    isOpen,
    senderName,
    fileName,
    fileSize,
    onAccept,
    onDecline,
}: IncomingTransferModalProps) {
    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    return (
        <AlertDialog open={isOpen}>
            <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md mx-4 sm:mx-auto">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-base sm:text-lg">Incoming File</AlertDialogTitle>
                    <AlertDialogDescription className="text-xs sm:text-sm">
                        <span className="font-semibold">{senderName}</span> wants to send you a file.
                        {fileName && (
                            <>
                                <br />
                                <br />
                                <div className="space-y-1">
                                    <div className="font-medium text-foreground text-xs sm:text-sm truncate">{fileName}</div>
                                    {fileSize !== undefined && (
                                        <div className="text-[10px] sm:text-sm text-muted-foreground">{formatFileSize(fileSize)}</div>
                                    )}
                                </div>
                                <br />
                            </>
                        )}
                        Do you want to accept this transfer?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                    <AlertDialogCancel onClick={onDecline} className="w-full sm:w-auto h-10 sm:h-11 text-xs sm:text-sm">Decline</AlertDialogCancel>
                    <AlertDialogAction onClick={onAccept} className="w-full sm:w-auto h-10 sm:h-11 text-xs sm:text-sm">Accept</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
