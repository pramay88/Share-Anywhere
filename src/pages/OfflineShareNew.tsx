/**
 * OfflineShare Page - Simplified version with state-based transfer flow
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Header } from '@/components/Header';
import { useDeviceDiscovery } from '../features/offline-share/hooks/useDeviceDiscovery';
import { useWebRTC } from '../features/offline-share/hooks/useWebRTC';
import { DeviceList } from '../features/offline-share/components/DeviceList';
import { IncomingTransferModal } from '../features/offline-share/components/IncomingTransferModal';
import { DeviceNameEditor } from '../features/offline-share/components/DeviceNameEditor';
import type { DataConnection } from 'peerjs';
import {
    sendFileSimple,
    listenForTransferRequest,
    acceptTransfer,
    rejectTransfer,
    receiveFileSimple,
    downloadFile,
    type PendingTransfer,
} from '../features/offline-share/services/transferServiceSimple';

const OfflineShare = () => {
    const navigate = useNavigate();

    // File selection
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Sender states
    const [senderStatus, setSenderStatus] = useState<'idle' | 'connecting' | 'waiting' | 'transferring' | 'success' | 'error'>('idle');
    const [senderError, setSenderError] = useState<string>('');
    const [senderProgress, setSenderProgress] = useState(0);
    const [senderSpeed, setSenderSpeed] = useState(0);

    // Receiver states
    const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
    const [showIncomingModal, setShowIncomingModal] = useState(false);
    const [receiverStatus, setReceiverStatus] = useState<'idle' | 'receiving' | 'success' | 'error'>('idle');
    const [receiverProgress, setReceiverProgress] = useState(0);
    const [receiverSpeed, setReceiverSpeed] = useState(0);

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

    // Set up listener for incoming transfer requests
    useEffect(() => {
        onIncomingConnection((conn) => {
            console.log('📨 Incoming connection from:', conn.peer);

            // Listen for transfer requests
            listenForTransferRequest(conn, (pending) => {
                console.log('📩 Transfer request received!');
                console.log('📩 File:', pending.metadata.name);
                console.log('📩 Size:', (pending.metadata.size / (1024 * 1024)).toFixed(2), 'MB');

                // Store pending transfer and show modal
                setPendingTransfer(pending);
                setShowIncomingModal(true);
                setStatus('busy');
            });
        });
    }, [onIncomingConnection, setStatus]);

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
            setSenderProgress(0);
            setSenderSpeed(0);

            // Step 1: Connecting
            setSenderStatus('connecting');
            await setStatus('busy');

            // Step 2: Connect to device
            const conn = await connectToDevice(deviceId);

            // Step 3: Waiting for receiver to accept
            setSenderStatus('waiting');

            // Step 4: Send file (this will wait for acceptance internally)
            setSenderStatus('transferring');
            await sendFileSimple(selectedFile, conn, (progress, speed) => {
                setSenderProgress(progress);
                setSenderSpeed(speed);
            });

            // Step 5: Success
            setSenderStatus('success');

            // Disconnect
            disconnect();

            // Reset after 3 seconds
            setTimeout(() => {
                setSelectedFile(null);
                setSenderStatus('idle');
                setSenderProgress(0);
                setSenderSpeed(0);
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
    const handleAcceptTransfer = async () => {
        if (!pendingTransfer) return;

        console.log('✅ User accepted transfer');
        setShowIncomingModal(false);
        setReceiverStatus('receiving');
        setReceiverProgress(0);
        setReceiverSpeed(0);

        try {
            // Send accept message
            acceptTransfer(pendingTransfer);

            // Start receiving file
            const blob = await receiveFileSimple(pendingTransfer, (progress, speed) => {
                setReceiverProgress(progress);
                setReceiverSpeed(speed);
            });

            // Trigger download
            downloadFile(blob, pendingTransfer.metadata.name);

            // Show success
            setReceiverStatus('success');

            // Reset after 3 seconds
            setTimeout(() => {
                setPendingTransfer(null);
                setReceiverStatus('idle');
                setReceiverProgress(0);
                setReceiverSpeed(0);
                setStatus('online');
            }, 3000);

        } catch (error) {
            console.error('Failed to receive file:', error);
            setReceiverStatus('error');

            setTimeout(() => {
                setPendingTransfer(null);
                setReceiverStatus('idle');
                setStatus('online');
            }, 3000);
        }
    };

    // Handle decline incoming transfer
    const handleDeclineTransfer = () => {
        if (!pendingTransfer) return;

        console.log('❌ User declined transfer');
        rejectTransfer(pendingTransfer);

        setShowIncomingModal(false);
        setPendingTransfer(null);
        setStatus('online');
    };

    // Loading state
    if (!isRegistered || isLoadingDevices) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin mx-auto h-8 w-8 border-2 border-primary border-t-transparent rounded-full mb-4" />
                    <p className="text-muted-foreground">Initializing Offline Share...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-4xl">
                {/* Header */}
                <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/')}
                        className="h-9 w-9 shrink-0"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Offline Share</h1>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Ultra-fast P2P file transfer • No file size limit
                        </p>
                    </div>
                    <Wifi className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                </div>

                {/* Device Name Editor */}
                {myDevice && (
                    <DeviceNameEditor
                        currentName={myDevice.name}
                        onSave={updateDeviceName}
                    />
                )}

                {/* File Selection */}
                {!selectedFile && senderStatus === 'idle' && (
                    <Card className="p-6 sm:p-8 text-center mb-4 sm:mb-6">
                        <input
                            type="file"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="offline-file-input"
                        />
                        <label htmlFor="offline-file-input">
                            <Button asChild className="w-full h-11 sm:h-12">
                                <span>Choose File</span>
                            </Button>
                        </label>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 text-center">
                            No file size limit • Ultra-fast transfer
                        </p>
                    </Card>
                )}

                {/* Selected File */}
                {selectedFile && senderStatus === 'idle' && (
                    <Card className="p-3 sm:p-4 mb-4 sm:mb-6">
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm sm:text-base truncate">{selectedFile.name}</p>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedFile(null)}
                                className="h-8 sm:h-9 shrink-0"
                            >
                                Remove
                            </Button>
                        </div>
                    </Card>
                )}

                {/* Sender Status - Connecting */}
                {senderStatus === 'connecting' && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6">
                        <div className="text-center space-y-3">
                            <div className="animate-spin mx-auto h-7 w-7 sm:h-8 sm:w-8 border-2 border-primary border-t-transparent rounded-full" />
                            <p className="font-medium text-sm sm:text-base">Connecting to device...</p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                Establishing secure connection
                            </p>
                        </div>
                    </Card>
                )}

                {/* Sender Status - Waiting for Acceptance */}
                {senderStatus === 'waiting' && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6">
                        <div className="text-center space-y-3">
                            <div className="animate-pulse mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/20 flex items-center justify-center">
                                <span className="text-xl sm:text-2xl">⏳</span>
                            </div>
                            <p className="font-medium text-sm sm:text-base">Waiting for receiver to accept...</p>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate px-2">
                                {selectedFile?.name}
                            </p>
                        </div>
                    </Card>
                )}

                {/* Sender Progress - Transferring */}
                {senderStatus === 'transferring' && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6">
                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-sm sm:text-base truncate">{selectedFile?.name}</p>
                                    <p className="text-xs sm:text-sm text-muted-foreground">Sending...</p>
                                </div>
                            </div>
                            <Progress value={senderProgress} className="w-full h-2" />
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                                <span className="text-muted-foreground">{senderProgress}%</span>
                                <span className="text-muted-foreground">
                                    {senderSpeed > 0 && `${(senderSpeed / (1024 * 1024)).toFixed(2)} MB/s`}
                                </span>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Sender Status - Success */}
                {senderStatus === 'success' && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6">
                        <div className="text-center space-y-3">
                            <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <span className="text-xl sm:text-2xl">✓</span>
                            </div>
                            <p className="font-medium text-green-600 dark:text-green-400 text-sm sm:text-base">
                                Transfer complete!
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate px-2">
                                {selectedFile?.name} sent successfully
                            </p>
                        </div>
                    </Card>
                )}

                {/* Sender Status - Error */}
                {senderStatus === 'error' && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6 border-destructive">
                        <div className="text-center space-y-3">
                            <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                                <span className="text-xl sm:text-2xl">✗</span>
                            </div>
                            <p className="font-medium text-destructive text-sm sm:text-base">
                                Transfer failed
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                {senderError || 'Please try again'}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSenderStatus('idle');
                                    setSenderError('');
                                }}
                                className="h-9 text-xs sm:text-sm"
                            >
                                Try Again
                            </Button>
                        </div>
                    </Card>
                )}

                {/* Receiver Progress - Receiving */}
                {receiverStatus === 'receiving' && pendingTransfer && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6">
                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-sm sm:text-base truncate">{pendingTransfer.metadata.name}</p>
                                    <p className="text-xs sm:text-sm text-muted-foreground">Receiving...</p>
                                </div>
                            </div>
                            <Progress value={receiverProgress} className="w-full h-2" />
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                                <span className="text-muted-foreground">{receiverProgress}%</span>
                                <span className="text-muted-foreground">
                                    {receiverSpeed > 0 && `${(receiverSpeed / (1024 * 1024)).toFixed(2)} MB/s`}
                                </span>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Receiver Status - Success */}
                {receiverStatus === 'success' && pendingTransfer && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6">
                        <div className="text-center space-y-3">
                            <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <span className="text-xl sm:text-2xl">✓</span>
                            </div>
                            <p className="font-medium text-green-600 dark:text-green-400 text-sm sm:text-base">
                                File received!
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate px-2">
                                {pendingTransfer.metadata.name} downloaded successfully
                            </p>
                        </div>
                    </Card>
                )}

                {/* Receiver Status - Error */}
                {receiverStatus === 'error' && (
                    <Card className="p-4 sm:p-6 mb-4 sm:mb-6 border-destructive">
                        <div className="text-center space-y-3">
                            <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                                <span className="text-xl sm:text-2xl">✗</span>
                            </div>
                            <p className="font-medium text-destructive text-sm sm:text-base">
                                Transfer failed
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
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
                    <Card className="p-6 sm:p-8 text-center">
                        <WifiOff className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 text-muted-foreground" />
                        <h3 className="font-semibold mb-2 text-sm sm:text-base">No devices found</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                            Make sure other devices are on the same WiFi network and have Offline Share open
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate('/send')}
                            className="h-9 text-xs sm:text-sm"
                        >
                            Use Cloud Share Instead
                        </Button>
                    </Card>
                )}
            </div>

            {/* Incoming Transfer Modal */}
            {pendingTransfer && (
                <IncomingTransferModal
                    isOpen={showIncomingModal}
                    senderName={devices.find(d => d.id === pendingTransfer.connection.peer)?.name || 'Unknown Device'}
                    fileName={pendingTransfer.metadata.name}
                    fileSize={pendingTransfer.metadata.size}
                    onAccept={handleAcceptTransfer}
                    onDecline={handleDeclineTransfer}
                />
            )}
        </div>
    );
};

export default OfflineShare;
