/**
 * OfflineShare Page - Main component for offline/nearby file sharing
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Header } from '@/components/Header';
import { useDeviceDiscovery } from '../features/offline-share/hooks/useDeviceDiscovery';
import { useWebRTC } from '../features/offline-share/hooks/useWebRTC';
import { useFileTransfer } from '../features/offline-share/hooks/useFileTransfer';
import { DeviceList } from '../features/offline-share/components/DeviceList';
import { TransferProgress } from '../features/offline-share/components/TransferProgress';
import { IncomingTransferModal } from '../features/offline-share/components/IncomingTransferModal';
import { DeviceNameEditor } from '../features/offline-share/components/DeviceNameEditor';
import type { DataConnection } from 'peerjs';

const OfflineShare = () => {
    const navigate = useNavigate();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [showIncomingModal, setShowIncomingModal] = useState(false);
    const [incomingConnection, setIncomingConnection] = useState<DataConnection | null>(null);
    const [incomingSenderName, setIncomingSenderName] = useState('');
    const [incomingFileName, setIncomingFileName] = useState('');
    const [incomingFileSize, setIncomingFileSize] = useState<number>(0);
    const [isReceiving, setIsReceiving] = useState(false);
    const [senderStatus, setSenderStatus] = useState<'idle' | 'connecting' | 'waiting' | 'transferring' | 'success' | 'error'>('idle');
    const [senderError, setSenderError] = useState<string>('');
    const [receiverProgress, setReceiverProgress] = useState(0);
    const [receiverSpeed, setReceiverSpeed] = useState(0);
    const [receiverStatus, setReceiverStatus] = useState<'idle' | 'waiting' | 'receiving' | 'success' | 'error'>('idle');

    // Hooks
    const {
        devices,
        myDevice,
        isRegistered,
        isLoading: isLoadingDevices,
        updateDeviceName,
        setStatus,
    } = useDeviceDiscovery();

    const {
        peer,
        connection,
        isConnected,
        isConnecting,
        connectToDevice,
        disconnect,
        onIncomingConnection,
    } = useWebRTC(myDevice?.id || null);

    const {
        sendFile,
        receiveFile,
        progress,
        speed,
        status: transferStatus,
        cancel,
    } = useFileTransfer();

    // Handle incoming connection
    onIncomingConnection((conn) => {
        const senderDevice = devices.find((d) => d.id === conn.peer);
        setIncomingConnection(conn);
        setIncomingSenderName(senderDevice?.name || conn.peer);
        setIsReceiving(true);
        setReceiverStatus('waiting');

        // Start listening for transfer request
        receiveFile(
            conn,
            // onRequest callback - called when transfer request arrives
            (metadata, accept, reject) => {
                // Store file metadata
                setIncomingFileName(metadata.name);
                setIncomingFileSize(metadata.size);

                // Show modal with file info
                setShowIncomingModal(true);
                setStatus('busy');

                // Store accept/reject callbacks for modal buttons
                (window as any).__pendingTransferAccept = async () => {
                    accept();
                    setReceiverStatus('receiving');
                    // Small delay to ensure accept message is sent before chunks start
                    await new Promise(resolve => setTimeout(resolve, 300));
                };
                (window as any).__pendingTransferReject = () => {
                    reject();
                    setReceiverStatus('idle');
                    setIsReceiving(false);
                };
            },
            // onProgress callback
            (prog, spd) => {
                // Update receiver progress
                console.log(`📥 Receiving: ${prog}% at ${spd} bytes/sec`);
                setReceiverProgress(prog);
                setReceiverSpeed(spd);
            }
        )
            .then(({ file, metadata }) => {
                console.log('✅ File received, triggering download:', metadata.name);

                // File received successfully - trigger download
                try {
                    const url = URL.createObjectURL(file);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = metadata.name;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();

                    // Clean up after a short delay
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 100);

                    setReceiverStatus('success');

                    // Auto-reset after 3 seconds
                    setTimeout(() => {
                        setIncomingConnection(null);
                        setShowIncomingModal(false);
                        setStatus('online');
                        setIsReceiving(false);
                        setReceiverStatus('idle');
                        setReceiverProgress(0);
                        setReceiverSpeed(0);
                        delete (window as any).__pendingTransferAccept;
                        delete (window as any).__pendingTransferReject;
                    }, 3000);
                } catch (downloadError) {
                    console.error('Download error:', downloadError);
                    setReceiverStatus('error');
                }
            })
            .catch((error) => {
                console.error('Failed to receive file:', error);
                setReceiverStatus('error');
                setIncomingConnection(null);
                setShowIncomingModal(false);
                setStatus('online');
                setIsReceiving(false);
                setReceiverProgress(0);
                setReceiverSpeed(0);
                delete (window as any).__pendingTransferAccept;
                delete (window as any).__pendingTransferReject;
            });
    });

    // Handle file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            setSelectedFile(files[0]);
            setSenderStatus('idle');
            setSenderError('');
        }
    };

    // Handle send to device
    const handleSendToDevice = async (deviceId: string) => {
        if (!selectedFile) return;

        try {
            // Reset states
            setSenderError('');

            // Step 1: Connecting
            setSenderStatus('connecting');
            await setStatus('busy');

            // Step 2: Connect to device
            const conn = await connectToDevice(deviceId);

            // Step 3: Waiting for receiver to accept
            setSenderStatus('waiting');

            // Step 4: Send file (this will wait for acceptance internally)
            setSenderStatus('transferring');
            await sendFile(selectedFile, conn);

            // Step 5: Success
            setSenderStatus('success');

            // Disconnect
            disconnect();

            // Reset after 3 seconds
            setTimeout(() => {
                setSelectedFile(null);
                setSenderStatus('idle');
                setStatus('online');
            }, 3000);

        } catch (error) {
            console.error('Failed to send file:', error);
            setSenderStatus('error');
            setSenderError(error instanceof Error ? error.message : 'Transfer failed');
            await setStatus('online');

            // Reset error after 5 seconds
            setTimeout(() => {
                setSenderStatus('idle');
                setSenderError('');
            }, 5000);
        }
    };

    // Handle accept incoming transfer
    const handleAcceptTransfer = () => {
        // Call the stored accept callback
        if ((window as any).__pendingTransferAccept) {
            (window as any).__pendingTransferAccept();
        }
        // Keep modal open to show progress
    };

    // Handle decline incoming transfer
    const handleDeclineTransfer = () => {
        // Call the stored reject callback
        if ((window as any).__pendingTransferReject) {
            (window as any).__pendingTransferReject();
        }

        if (incomingConnection) {
            incomingConnection.close();
        }
        setShowIncomingModal(false);
        setIncomingConnection(null);
        setStatus('online');
        delete (window as any).__pendingTransferAccept;
        delete (window as any).__pendingTransferReject;
    };

    // Loading state
    if (isLoadingDevices || !isRegistered) {
        return (
            <div className="min-h-screen flex flex-col">
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin mx-auto mb-4 h-8 w-8 border-2 border-foreground border-t-transparent rounded-full" />
                        <p className="text-muted-foreground">Initializing offline share...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-2xl">
                    {/* Header */}
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/send')}
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <h1 className="text-3xl font-bold tracking-tight">Offline Share</h1>
                        </div>
                        <p className="text-muted-foreground ml-12">
                            Share files instantly with nearby devices on the same WiFi
                        </p>
                    </div>

                    {/* My Device Card */}
                    <Card className="p-4 mb-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Wifi className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Your device</p>
                                    <p className="font-semibold">{myDevice?.name}</p>
                                </div>
                            </div>
                            <DeviceNameEditor
                                currentName={myDevice?.name || ''}
                                onUpdate={updateDeviceName}
                            />
                        </div>
                    </Card>

                    {/* File Selection */}
                    {!selectedFile && transferStatus === 'idle' && (
                        <Card className="p-6 mb-6">
                            <h3 className="font-semibold mb-3">Select a file to share</h3>
                            <input
                                type="file"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="offline-file-input"
                            />
                            <label htmlFor="offline-file-input">
                                <Button asChild className="w-full">
                                    <span>Choose File</span>
                                </Button>
                            </label>
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                No file size limit • Ultra-fast transfer
                            </p>
                        </Card>
                    )}

                    {/* Selected File */}
                    {selectedFile && senderStatus === 'idle' && (
                        <Card className="p-4 mb-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold">{selectedFile.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedFile(null)}
                                >
                                    Remove
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Sender Status - Connecting */}
                    {senderStatus === 'connecting' && (
                        <Card className="p-6 mb-6">
                            <div className="text-center space-y-3">
                                <div className="animate-spin mx-auto h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                                <p className="font-medium">Connecting to device...</p>
                                <p className="text-sm text-muted-foreground">
                                    Establishing secure connection
                                </p>
                            </div>
                        </Card>
                    )}

                    {/* Sender Status - Waiting for Acceptance */}
                    {senderStatus === 'waiting' && (
                        <Card className="p-6 mb-6">
                            <div className="text-center space-y-3">
                                <div className="animate-pulse mx-auto h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                                    <span className="text-2xl">⏳</span>
                                </div>
                                <p className="font-medium">Waiting for receiver to accept...</p>
                                <p className="text-sm text-muted-foreground">
                                    {selectedFile?.name}
                                </p>
                            </div>
                        </Card>
                    )}

                    {/* Transfer Progress - Transferring */}
                    {senderStatus === 'transferring' && !isReceiving && (
                        <TransferProgress
                            fileName={selectedFile?.name || 'File'}
                            progress={progress}
                            speed={speed}
                            status={transferStatus}
                            onCancel={cancel}
                        />
                    )}

                    {/* Sender Status - Success */}
                    {senderStatus === 'success' && (
                        <Card className="p-6 mb-6">
                            <div className="text-center space-y-3">
                                <div className="mx-auto h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <span className="text-2xl">✓</span>
                                </div>
                                <p className="font-medium text-green-600 dark:text-green-400">
                                    Transfer complete!
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {selectedFile?.name} sent successfully
                                </p>
                            </div>
                        </Card>
                    )}

                    {/* Sender Status - Error */}
                    {senderStatus === 'error' && (
                        <Card className="p-6 mb-6 border-destructive">
                            <div className="text-center space-y-3">
                                <div className="mx-auto h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                                    <span className="text-2xl">✗</span>
                                </div>
                                <p className="font-medium text-destructive">
                                    Transfer failed
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {senderError || 'Please try again'}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSenderStatus('idle');
                                        setSenderError('');
                                    }}
                                >
                                    Try Again
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Receiver Progress - Receiving */}
                    {receiverStatus === 'receiving' && (
                        <Card className="p-6 mb-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold">{incomingFileName}</p>
                                        <p className="text-sm text-muted-foreground">Receiving...</p>
                                    </div>
                                </div>
                                <Progress value={receiverProgress} className="w-full" />
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{receiverProgress}%</span>
                                    <span className="text-muted-foreground">
                                        {receiverSpeed > 0 && `${(receiverSpeed / (1024 * 1024)).toFixed(2)} MB/s`}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Receiver Status - Success */}
                    {receiverStatus === 'success' && (
                        <Card className="p-6 mb-6">
                            <div className="text-center space-y-3">
                                <div className="mx-auto h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <span className="text-2xl">✓</span>
                                </div>
                                <p className="font-medium text-green-600 dark:text-green-400">
                                    File received!
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {incomingFileName} downloaded successfully
                                </p>
                            </div>
                        </Card>
                    )}

                    {/* Receiver Status - Error */}
                    {receiverStatus === 'error' && (
                        <Card className="p-6 mb-6 border-destructive">
                            <div className="text-center space-y-3">
                                <div className="mx-auto h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                                    <span className="text-2xl">✗</span>
                                </div>
                                <p className="font-medium text-destructive">
                                    Transfer failed
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Could not receive file
                                </p>
                            </div>
                        </Card>
                    )}

                    {/* Device List */}
                    {selectedFile && senderStatus === 'idle' && (
                        <DeviceList
                            devices={devices}
                            onSendToDevice={handleSendToDevice}
                            isConnecting={isConnecting}
                        />
                    )}

                    {/* No Devices Found */}
                    {devices.length === 0 && !isLoadingDevices && (
                        <Card className="p-8 text-center">
                            <WifiOff className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                            <h3 className="font-semibold mb-2">No devices found</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Make sure other devices are on the same WiFi network and have Offline Share open
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/send')}
                            >
                                Use Cloud Share Instead
                            </Button>
                        </Card>
                    )}
                </div>
            </div>

            {/* Incoming Transfer Modal */}
            <IncomingTransferModal
                isOpen={showIncomingModal}
                senderName={incomingSenderName}
                fileName={incomingFileName}
                fileSize={incomingFileSize}
                onAccept={handleAcceptTransfer}
                onDecline={handleDeclineTransfer}
            />
        </div>
    );
};

export default OfflineShare;
