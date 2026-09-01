// src/pages/p2pshare.tsx
/**
 * P2P Share Page
 * Code-based peer-to-peer file sharing — no size limits
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Download, Copy, Check, Wifi, FolderUp, FileIcon, X, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Header } from '@/components/Header';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api/client';
import { useP2PSession } from '@/features/p2p-share/hooks/useP2PSession';
import {
    filesToEntries,
    sendBatch,
    listenForBatchRequest,
    rejectBatchTransfer,
    acceptAndReceive,          // ← replaces the broken acceptBatchTransfer + receiveBatch pair
    downloadAllFiles,
    formatBytes,
    type FileEntry,
    type TransferProgress,
    type PendingBatchTransfer,
} from '@/features/p2p-share/services/p2pTransferService';

type Mode = 'choose' | 'send' | 'receive';
type TransferState = 'idle' | 'selecting' | 'sharing' | 'transferring' | 'success' | 'error';

const P2PShare = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [mode, setMode] = useState<Mode>('choose');
    const [transferState, setTransferState] = useState<TransferState>('idle');
    const [copied, setCopied] = useState(false);
    const [receiveCode, setReceiveCode] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<FileEntry[]>([]);
    const [progress, setProgress] = useState<TransferProgress | null>(null);
    const [pendingTransfer, setPendingTransfer] = useState<PendingBatchTransfer | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const cleanupListenerRef = useRef<(() => void) | null>(null);
    // AbortController so the user can cancel an in-progress transfer
    const transferAbortRef = useRef<AbortController | null>(null);
    const queryJoinAttemptedRef = useRef(false);
    const queryJoinRetryCountRef = useRef(0);
    const queryJoinRetryTimerRef = useRef<number | null>(null);

    const {
        role,
        status,
        shareCode,
        connection,
        error: sessionError,
        createSession,
        joinSession,
        disconnect,
    } = useP2PSession();

    const trackEvent = useCallback((event: Record<string, string | number | boolean | null | undefined>) => {
        const payload: Record<string, string | number | boolean | null | undefined> = {
            ...event,
            transferType: 'p2p',
            is_ephemeral: event.is_ephemeral === true,
            clientTimestamp: new Date().toISOString(),
        };

        const request = user?.uid
            ? apiClient.trackTransferEvent(user.uid, payload)
            : apiClient.trackAnonymousTransferEvent(payload);

        void request.catch(() => {
            // Intentionally ignored to avoid affecting transfer path.
        });
    }, [user?.uid]);

    // Listen for incoming batch requests when connected as receiver
    useEffect(() => {
        if (connection && mode === 'receive') {
            const cleanup = listenForBatchRequest(connection, (pending) => {
                setPendingTransfer(pending);
            });
            cleanupListenerRef.current = cleanup;
            return cleanup;
        }
    }, [connection, mode]);

    // ========================================================================
    // SEND FLOW
    // ========================================================================

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const entries = filesToEntries(files);
        setSelectedFiles((prev) => [...prev, ...entries]);
        setTransferState('selecting');
        e.target.value = '';
    };

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const entries = filesToEntries(files);
        setSelectedFiles((prev) => [...prev, ...entries]);
        setTransferState('selecting');
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
        if (selectedFiles.length <= 1) setTransferState('idle');
    };

    const startSharing = async () => {
        if (selectedFiles.length === 0) return;
        setTransferState('sharing');
        const code = await createSession();
        if (!code) {
            setTransferState('error');
            setErrorMessage(sessionError || 'Failed to create session');
            trackEvent({
                direction: 'send',
                status: 'failed',
                error: sessionError || 'Failed to create session',
            });
        } else {
            trackEvent({
                direction: 'send',
                status: 'active',
                shareCode: code,
                fileName: `${selectedFiles.length} files`,
                totalBytes: selectedFiles.reduce((sum, entry) => sum + entry.file.size, 0),
            });
        }
    };

    // Auto-send when receiver connects (sender side)
    const handleSend = useCallback(async () => {
        if (!connection || selectedFiles.length === 0) return;

        const startedAt = Date.now();
        // Generate a unique transferId for this P2P send session
        const transferId = `p2p_${shareCode}_${Date.now()}`;
        const ac = new AbortController();
        transferAbortRef.current = ac;
        setTransferState('transferring');

        try {
            await sendBatch(selectedFiles, connection, (p) => setProgress(p), ac.signal);
            setTransferState('success');
            toast.success('All files sent successfully!');

            const totalBytes = progress?.totalBytes || selectedFiles.reduce((sum, entry) => sum + entry.file.size, 0);
            const durationMs = Date.now() - startedAt;
            const speedBytesPerSec = durationMs > 0 ? Math.round(totalBytes / (durationMs / 1000)) : 0;
            trackEvent({
                transferId,
                shareCode,
                direction: 'send',
                status: 'success',
                fileName: selectedFiles.length === 1 ? selectedFiles[0].file.name : `${selectedFiles.length} files`,
                fileType: selectedFiles.length === 1 ? (selectedFiles[0].file.type || 'application/octet-stream') : 'application/octet-stream',
                fileSize: totalBytes,
                totalBytes,
                durationMs,
                speedBytesPerSec,
                retries: 0,
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.error('Send failed:', err);
            const message = err instanceof Error ? err.message : 'Transfer failed';
            setTransferState('error');
            setErrorMessage(message);
            toast.error(message);
            trackEvent({
                transferId,
                shareCode,
                direction: 'send',
                status: 'failed',
                error: message,
                durationMs: Date.now() - startedAt,
            });
        } finally {
            transferAbortRef.current = null;
        }
    }, [connection, progress, selectedFiles, shareCode, trackEvent]);

    useEffect(() => {
        if (connection && mode === 'send' && transferState === 'sharing' && selectedFiles.length > 0) {
            void handleSend();
        }
    }, [connection, handleSend, mode, selectedFiles.length, transferState]);

    // ========================================================================
    // RECEIVE FLOW
    // ========================================================================

    const handleJoin = useCallback(async (showErrorToast = true): Promise<boolean> => {
        const normalizedCode = receiveCode.trim().toUpperCase();
        if (normalizedCode.length !== 6) {
            if (showErrorToast) toast.error('Please enter a 6-character share code');
            return false;
        }
        const success = await joinSession(normalizedCode);
        if (!success && showErrorToast) {
            toast.error(sessionError || 'Failed to join session');
        }
        return success;
    }, [receiveCode, joinSession, sessionError]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const codeFromQuery = (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (codeFromQuery.length === 6) {
            setMode('receive');
            setReceiveCode(codeFromQuery);
        }

        return () => {
            if (queryJoinRetryTimerRef.current !== null) {
                window.clearTimeout(queryJoinRetryTimerRef.current);
                queryJoinRetryTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (mode !== 'receive') return;
        if (status !== 'idle') return;
        if (receiveCode.length !== 6) return;
        if (queryJoinAttemptedRef.current) return;

        const params = new URLSearchParams(window.location.search);
        const codeFromQuery = (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (codeFromQuery !== receiveCode) return;

        queryJoinAttemptedRef.current = true;
        void (async () => {
            const maxRetries = 4;
            const retryDelayMs = 1500;

            const firstAttemptOk = await handleJoin(false);
            if (firstAttemptOk) return;

            // Production race guard: if receiver opens a just-created link,
            // Firestore write may not be visible immediately. Retry briefly.
            while (queryJoinRetryCountRef.current < maxRetries) {
                queryJoinRetryCountRef.current += 1;
                await new Promise<void>((resolve) => {
                    queryJoinRetryTimerRef.current = window.setTimeout(() => resolve(), retryDelayMs);
                });

                if (status !== 'idle') return;

                const ok = await handleJoin(false);
                if (ok) return;
            }

            toast.error(sessionError || 'Session not found or expired. Ask sender to regenerate code.');
        })();
    }, [mode, receiveCode, status, handleJoin, sessionError]);

    const handleAccept = async () => {
        if (!pendingTransfer) return;

        const startedAt = Date.now();
        const acceptedTransfer = pendingTransfer;
        const ac = new AbortController();
        transferAbortRef.current = ac;
        setTransferState('transferring');
        setPendingTransfer(null); // clear the accept/decline UI immediately

        try {
            // acceptAndReceive wires the data listener BEFORE sending 'accept',
            // eliminating the race where chunks arrive before receiveBatch is listening.
            const results = await acceptAndReceive(pendingTransfer, (p) => setProgress(p), ac.signal);
            setTransferState('success');
            toast.success(`Received ${results.length} file(s)!`);
            downloadAllFiles(results);

            const totalBytes = progress?.totalBytes || results.reduce((sum, result) => sum + result.metadata.size, 0);
            const durationMs = Date.now() - startedAt;
            const speedBytesPerSec = durationMs > 0 ? Math.round(totalBytes / (durationMs / 1000)) : 0;

            trackEvent({
                shareCode,
                transferId: acceptedTransfer.transferId,
                direction: 'receive',
                status: 'success',
                fileName: results.length === 1 ? results[0].metadata.name : `${results.length} files`,
                fileType: results.length === 1 ? results[0].metadata.type : 'application/octet-stream',
                fileSize: totalBytes,
                totalBytes,
                durationMs,
                speedBytesPerSec,
                retries: 0,
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.error('Receive failed:', err);
            const message = err instanceof Error ? err.message : 'Receive failed';
            setTransferState('error');
            setErrorMessage(message);
            toast.error(message);
            trackEvent({
                shareCode,
                transferId: acceptedTransfer.transferId,
                direction: 'receive',
                status: 'failed',
                error: message,
                durationMs: Date.now() - startedAt,
            });
        } finally {
            transferAbortRef.current = null;
        }
    };

    const handleDecline = () => {
        if (pendingTransfer) {
            rejectBatchTransfer(pendingTransfer);
            setPendingTransfer(null);
            toast.info('Transfer declined');
        }
    };

    const handleCancel = () => {
        trackEvent({
            shareCode,
            direction: role === 'receiver' ? 'receive' : 'send',
            status: 'cancelled',
            totalBytes: progress?.bytesTransferred || 0,
            durationMs: 0,
        });
        transferAbortRef.current?.abort();
        transferAbortRef.current = null;
        setTransferState('idle');
        setProgress(null);
    };

    // ========================================================================
    // HELPERS
    // ========================================================================

    const copyCode = async () => {
        if (!shareCode) return;
        try {
            await navigator.clipboard.writeText(shareCode);
            setCopied(true);
            toast.success('Code copied!');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const reset = () => {
        transferAbortRef.current?.abort();
        transferAbortRef.current = null;
        disconnect();
        setMode('choose');
        setTransferState('idle');
        setSelectedFiles([]);
        setProgress(null);
        setPendingTransfer(null);
        setReceiveCode('');
        setErrorMessage('');
        if (cleanupListenerRef.current) {
            cleanupListenerRef.current();
            cleanupListenerRef.current = null;
        }
    };

    const totalSize = selectedFiles.reduce((sum, f) => sum + f.file.size, 0);
    const p2pJoinUrl = shareCode ? `${window.location.origin}/p2p?code=${encodeURIComponent(shareCode)}` : '';

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <div className="container mx-auto px-4 py-6 sm:py-8 max-w-2xl">
                {/* Page Header */}
                <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => mode === 'choose' ? navigate('/') : reset()}
                        className="h-9 w-9 shrink-0"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold">P2P Share</h1>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Direct peer-to-peer transfer • No size limits
                        </p>
                    </div>
                    <Wifi className="h-5 w-5 text-primary shrink-0" />
                </div>

                {/* ============================================================ */}
                {/* MODE CHOOSER */}
                {/* ============================================================ */}
                {mode === 'choose' && (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <Card
                            className="p-6 sm:p-8 text-center cursor-pointer hover:border-primary transition-colors"
                            onClick={() => setMode('send')}
                        >
                            <Upload className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-2 sm:mb-3 text-primary" />
                            <h3 className="font-semibold text-base sm:text-lg">Send</h3>
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Share files & folders</p>
                        </Card>

                        <Card
                            className="p-6 sm:p-8 text-center cursor-pointer hover:border-primary transition-colors"
                            onClick={() => setMode('receive')}
                        >
                            <Download className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-2 sm:mb-3 text-primary" />
                            <h3 className="font-semibold text-base sm:text-lg">Receive</h3>
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Enter a share code</p>
                        </Card>
                    </div>
                )}

                {/* ============================================================ */}
                {/* SEND MODE */}
                {/* ============================================================ */}
                {mode === 'send' && (
                    <div className="space-y-4">
                        {/* File selection */}
                        {(transferState === 'idle' || transferState === 'selecting') && (
                            <>
                                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
                                <input
                                    ref={folderInputRef}
                                    type="file"
                                    onChange={handleFolderSelect}
                                    className="hidden"
                                    {...({ webkitdirectory: '', directory: '' } as const)}
                                />

                                <Card className="p-4 sm:p-6 border-dashed border-2 text-center">
                                    <div className="space-y-3">
                                        <Upload className="h-7 w-7 sm:h-8 sm:w-8 mx-auto text-muted-foreground" />
                                        <p className="text-xs sm:text-sm text-muted-foreground">Select files or folders to share</p>
                                        <div className="flex gap-2 justify-center">
                                            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-9 sm:h-10">
                                                <FileIcon className="h-4 w-4 mr-1" />Files
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()} className="h-9 sm:h-10">
                                                <FolderUp className="h-4 w-4 mr-1" />Folder
                                            </Button>
                                        </div>
                                    </div>
                                </Card>

                                {selectedFiles.length > 0 && (
                                    <Card className="divide-y">
                                        <div className="max-h-48 overflow-y-auto divide-y">
                                            {selectedFiles.map((entry, idx) => (
                                                <div key={idx} className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs sm:text-sm font-medium truncate">{entry.relativePath}</p>
                                                        <p className="text-[10px] sm:text-xs text-muted-foreground">{formatBytes(entry.file.size)}</p>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile(idx)}>
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between bg-muted/50 gap-2">
                                            <span className="text-[10px] sm:text-xs text-muted-foreground">
                                                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} • {formatBytes(totalSize)}
                                            </span>
                                            <Button size="sm" onClick={startSharing} disabled={selectedFiles.length === 0} className="h-8 sm:h-9">
                                                Start Sharing
                                            </Button>
                                        </div>
                                    </Card>
                                )}
                            </>
                        )}

                        {/* Waiting for receiver */}
                        {transferState === 'sharing' && shareCode && !connection && (
                            <Card className="p-4 sm:p-6 text-center space-y-4">
                                <p className="text-xs sm:text-sm text-muted-foreground">Share this code with the receiver</p>
                                <div className="flex justify-center gap-1 sm:gap-1.5">
                                    {shareCode.split('').map((char, i) => (
                                        <div key={i} className="w-9 h-11 sm:w-11 sm:h-14 bg-muted rounded-lg flex items-center justify-center text-xl sm:text-2xl font-bold font-mono">
                                            {char}
                                        </div>
                                    ))}
                                </div>
                                <Button variant="outline" size="sm" onClick={copyCode} className="gap-1.5 h-9">
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? 'Copied!' : 'Copy Code'}
                                </Button>
                                {p2pJoinUrl && (
                                    <div className="pt-2">
                                        <p className="text-[10px] sm:text-xs text-muted-foreground mb-2">Or scan QR to join instantly</p>
                                        <div className="inline-flex bg-white p-2 rounded-lg border shadow-sm">
                                            <QRCodeSVG value={p2pJoinUrl} size={100} level="M" className="sm:w-[132px] sm:h-[132px]" />
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Waiting for receiver to connect...</span>
                                </div>
                                <p className="text-[10px] sm:text-xs text-muted-foreground">
                                    {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} • {formatBytes(totalSize)}
                                </p>
                            </Card>
                        )}

                        {/* Transferring */}
                        {transferState === 'transferring' && (
                            <Card className="p-4 sm:p-6 space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-xs sm:text-sm">Sending files...</p>
                                        {progress && (
                                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                                {progress.currentFileName} ({progress.completedFiles + 1}/{progress.totalFiles})
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-xs sm:text-sm font-mono shrink-0">{progress?.overallProgress ?? 0}%</span>
                                </div>
                                <Progress value={progress?.overallProgress ?? 0} className="w-full" />
                                {progress && (
                                    <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                                        <span>{formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}</span>
                                        <span>{formatBytes(progress.speed)}/s</span>
                                    </div>
                                )}
                                <Button variant="outline" size="sm" onClick={handleCancel} className="w-full h-9 sm:h-10">
                                    Cancel
                                </Button>
                            </Card>
                        )}

                        {/* Success */}
                        {transferState === 'success' && (
                            <Card className="p-4 sm:p-6 text-center space-y-3">
                                <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Check className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                                </div>
                                <p className="font-medium text-sm sm:text-base text-green-600 dark:text-green-400">Transfer complete!</p>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                    {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} sent successfully
                                </p>
                                <Button variant="outline" size="sm" onClick={reset} className="h-9">Share More</Button>
                            </Card>
                        )}

                        {/* Error */}
                        {transferState === 'error' && (
                            <Card className="p-4 sm:p-6 text-center space-y-3 border-destructive">
                                <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                                    <X className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />
                                </div>
                                <p className="font-medium text-sm sm:text-base text-destructive">Transfer failed</p>
                                <p className="text-xs sm:text-sm text-muted-foreground">{errorMessage || 'Please try again'}</p>
                                <Button variant="outline" size="sm" onClick={reset} className="h-9">Try Again</Button>
                            </Card>
                        )}
                    </div>
                )}

                {/* ============================================================ */}
                {/* RECEIVE MODE */}
                {/* ============================================================ */}
                {mode === 'receive' && (
                    <div className="space-y-4">
                        {/* Enter code */}
                        {status !== 'connected' && transferState !== 'transferring' && transferState !== 'success' && transferState !== 'error' && (
                            <Card className="p-4 sm:p-6 text-center space-y-4">
                                <p className="text-xs sm:text-sm text-muted-foreground">Enter the share code from the sender</p>
                                <div className="flex justify-center">
                                    <InputOTP
                                        maxLength={6}
                                        value={receiveCode}
                                        autoFocus
                                        inputMode="text"
                                        onChange={(value) => {
                                            const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                                            setReceiveCode(normalized);
                                        }}
                                        onComplete={() => {
                                            if (status !== 'joining' && status !== 'connecting') {
                                                void handleJoin();
                                            }
                                        }}
                                    >
                                        <InputOTPGroup>
                                            <InputOTPSlot index={0} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                                            <InputOTPSlot index={1} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                                            <InputOTPSlot index={2} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                                            <InputOTPSlot index={3} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                                            <InputOTPSlot index={4} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                                            <InputOTPSlot index={5} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                                <Button
                                    onClick={handleJoin}
                                    disabled={receiveCode.length < 6 || status === 'joining' || status === 'connecting'}
                                    className="gap-1.5 h-10 sm:h-11"
                                >
                                    {(status === 'joining' || status === 'connecting') && (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    )}
                                    {status === 'joining' ? 'Joining...' : status === 'connecting' ? 'Connecting...' : 'Connect'}
                                </Button>
                                {sessionError && <p className="text-xs sm:text-sm text-destructive">{sessionError}</p>}
                            </Card>
                        )}

                        {/* Pending transfer — accept/decline */}
                        {pendingTransfer && transferState !== 'transferring' && transferState !== 'success' && (
                            <Card className="p-4 sm:p-6 space-y-4">
                                <h3 className="font-semibold text-center text-sm sm:text-base">Incoming Transfer</h3>
                                <div className="bg-muted rounded-lg p-2.5 sm:p-3 space-y-1.5 max-h-40 overflow-y-auto">
                                    {pendingTransfer.metadata.files.map((f, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs sm:text-sm gap-2">
                                            <span className="truncate flex-1 min-w-0">{f.relativePath || f.name}</span>
                                            <span className="text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-center text-xs sm:text-sm text-muted-foreground">
                                    {pendingTransfer.metadata.totalFiles} file{pendingTransfer.metadata.totalFiles > 1 ? 's' : ''} • {formatBytes(pendingTransfer.metadata.totalSize)}
                                </p>
                                <div className="flex gap-2 justify-center">
                                    <Button variant="outline" onClick={handleDecline} className="h-9 sm:h-10">Decline</Button>
                                    <Button onClick={handleAccept} className="h-9 sm:h-10">Accept & Download</Button>
                                </div>
                            </Card>
                        )}

                        {/* Connected, waiting for files */}
                        {connection && !pendingTransfer && transferState !== 'transferring' && transferState !== 'success' && transferState !== 'error' && (
                            <Card className="p-4 sm:p-6 text-center space-y-3">
                                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 mx-auto animate-spin text-primary" />
                                <p className="text-xs sm:text-sm text-muted-foreground">Connected! Waiting for sender to start transfer...</p>
                            </Card>
                        )}

                        {/* Receiving progress */}
                        {transferState === 'transferring' && (
                            <Card className="p-4 sm:p-6 space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-xs sm:text-sm">Receiving files...</p>
                                        {progress && (
                                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                                {progress.currentFileName} ({progress.completedFiles + 1}/{progress.totalFiles})
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-xs sm:text-sm font-mono shrink-0">{progress?.overallProgress ?? 0}%</span>
                                </div>
                                <Progress value={progress?.overallProgress ?? 0} className="w-full" />
                                {progress && (
                                    <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                                        <span>{formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}</span>
                                        <span>{formatBytes(progress.speed)}/s</span>
                                    </div>
                                )}
                                <Button variant="outline" size="sm" onClick={handleCancel} className="w-full h-9 sm:h-10">
                                    Cancel
                                </Button>
                            </Card>
                        )}

                        {/* Success */}
                        {transferState === 'success' && (
                            <Card className="p-4 sm:p-6 text-center space-y-3">
                                <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Check className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                                </div>
                                <p className="font-medium text-sm sm:text-base text-green-600 dark:text-green-400">Files received!</p>
                                <p className="text-xs sm:text-sm text-muted-foreground">Downloads should start automatically</p>
                                <Button variant="outline" size="sm" onClick={reset} className="h-9">Receive More</Button>
                            </Card>
                        )}

                        {/* Error */}
                        {transferState === 'error' && (
                            <Card className="p-4 sm:p-6 text-center space-y-3 border-destructive">
                                <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                                    <X className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />
                                </div>
                                <p className="font-medium text-sm sm:text-base text-destructive">Transfer failed</p>
                                <p className="text-xs sm:text-sm text-muted-foreground">{errorMessage || 'Please try again'}</p>
                                <Button variant="outline" size="sm" onClick={reset} className="h-9">Try Again</Button>
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default P2PShare;