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
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Incoming File</AlertDialogTitle>
                    <AlertDialogDescription>
                        <span className="font-semibold">{senderName}</span> wants to send you a file.
                        {fileName && (
                            <>
                                <br />
                                <br />
                                <div className="space-y-1">
                                    <div className="font-medium text-foreground">{fileName}</div>
                                    {fileSize !== undefined && (
                                        <div className="text-sm text-muted-foreground">{formatFileSize(fileSize)}</div>
                                    )}
                                </div>
                                <br />
                            </>
                        )}
                        Do you want to accept this transfer?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onDecline}>Decline</AlertDialogCancel>
                    <AlertDialogAction onClick={onAccept}>Accept</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
