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
    onAccept: () => void;
    onDecline: () => void;
}

export function IncomingTransferModal({
    isOpen,
    senderName,
    onAccept,
    onDecline,
}: IncomingTransferModalProps) {
    return (
        <AlertDialog open={isOpen} onOpenChange={(open) => !open && onDecline()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Incoming File</AlertDialogTitle>
                    <AlertDialogDescription>
                        <span className="font-semibold">{senderName}</span> wants to send you a file.
                        <br />
                        <br />
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
