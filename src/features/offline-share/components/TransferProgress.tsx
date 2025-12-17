/**
 * TransferProgress Component - Shows file transfer progress
 */

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { TransferStatus } from '../types';
import { formatSpeed, calculateETA, formatTime } from '../services/transferService';

interface TransferProgressProps {
    fileName: string;
    progress: number;
    speed: number;
    status: TransferStatus;
    onCancel: () => void;
}

export function TransferProgress({
    fileName,
    progress,
    speed,
    status,
    onCancel,
}: TransferProgressProps) {
    const isTransferring = status === 'transferring';
    const isComplete = status === 'complete';
    const isError = status === 'error';

    return (
        <Card className="p-6 mb-6">
            <div className="space-y-4">
                {/* File Info */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-semibold">{fileName}</p>
                        <p className="text-sm text-muted-foreground">
                            {isTransferring && 'Transferring...'}
                            {isComplete && 'Transfer complete!'}
                            {isError && 'Transfer failed'}
                        </p>
                    </div>
                    {isTransferring && (
                        <Button variant="ghost" size="icon" onClick={onCancel}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Progress Bar */}
                <Progress value={progress} className="w-full" />

                {/* Stats */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{progress}%</span>
                    {isTransferring && (
                        <span className="text-muted-foreground">
                            {formatSpeed(speed)}
                        </span>
                    )}
                </div>

                {/* Status Messages */}
                {isComplete && (
                    <div className="text-center py-2">
                        <p className="text-sm text-green-600 dark:text-green-400">
                            ✓ File transferred successfully
                        </p>
                    </div>
                )}

                {isError && (
                    <div className="text-center py-2">
                        <p className="text-sm text-destructive">
                            ✗ Transfer failed. Please try again.
                        </p>
                    </div>
                )}
            </div>
        </Card>
    );
}
