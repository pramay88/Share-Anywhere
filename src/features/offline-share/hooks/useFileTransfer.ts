/**
 * useFileTransfer Hook
 * Manages file transfer orchestration
 */

import { useState, useCallback, useRef } from 'react';
import type { DataConnection } from 'peerjs';
import { toast } from 'sonner';
import type { TransferStatus, UseFileTransferReturn } from '../types';
import {
    sendFile as sendFileService,
    receiveFile as receiveFileService,
    cancelTransfer as cancelTransferService,
} from '../services/transferService';

export function useFileTransfer(): UseFileTransferReturn {
    const [progress, setProgress] = useState(0);
    const [speed, setSpeed] = useState(0);
    const [status, setStatus] = useState<TransferStatus>('idle');
    const [error, setError] = useState<Error | null>(null);

    const currentConnectionRef = useRef<DataConnection | null>(null);
    const currentTransferIdRef = useRef<string | null>(null);

    // Send file to a device
    const sendFile = useCallback(async (file: File, connection: DataConnection) => {
        setStatus('transferring');
        setProgress(0);
        setSpeed(0);
        setError(null);
        currentConnectionRef.current = connection;

        try {
            await sendFileService(connection, file, (prog, spd) => {
                setProgress(prog);
                setSpeed(spd);
            });

            setStatus('complete');
            setProgress(100);
            toast.success(`File sent successfully!`);
        } catch (err) {
            console.error('File transfer failed:', err);
            setStatus('error');
            setError(err as Error);
            toast.error('File transfer failed');
            throw err;
        } finally {
            currentConnectionRef.current = null;
        }
    }, []);

    // Receive file from a connection
    const receiveFile = useCallback(async (connection: DataConnection): Promise<Blob> => {
        setStatus('transferring');
        setProgress(0);
        setSpeed(0);
        setError(null);
        currentConnectionRef.current = connection;

        try {
            const { file, metadata } = await receiveFileService(connection, (prog, spd) => {
                setProgress(prog);
                setSpeed(spd);
            });

            setStatus('complete');
            setProgress(100);

            // Trigger download
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = metadata.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success(`File received: ${metadata.name}`);

            return file;
        } catch (err) {
            console.error('File receive failed:', err);
            setStatus('error');
            setError(err as Error);
            toast.error('File receive failed');
            throw err;
        } finally {
            currentConnectionRef.current = null;
        }
    }, []);

    // Cancel ongoing transfer
    const cancel = useCallback(() => {
        if (currentConnectionRef.current && currentTransferIdRef.current) {
            cancelTransferService(currentConnectionRef.current, currentTransferIdRef.current);
            setStatus('cancelled');
            toast.info('Transfer cancelled');
        }
    }, []);

    return {
        sendFile,
        receiveFile,
        progress,
        speed,
        status,
        error,
        cancel,
    };
}
