/**
 * OfflineShare Page - Main component for offline/nearby file sharing
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
        setShowIncomingModal(true);
    });

    // Handle file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            setSelectedFile(files[0]);
        }
    };

    // Handle send to device
    const handleSendToDevice = async (deviceId: string) => {
        if (!selectedFile) return;

        try {
            // Set status to busy
            await setStatus('busy');

            // Connect to device
            const conn = await connectToDevice(deviceId);

            // Send file
            await sendFile(selectedFile, conn);

            // Disconnect
            disconnect();

            // Reset
            setSelectedFile(null);
            await setStatus('online');
        } catch (error) {
            console.error('Failed to send file:', error);
            await setStatus('online');
        }
    };

    // Handle accept incoming transfer
    const handleAcceptTransfer = async () => {
        if (!incomingConnection) return;

        setShowIncomingModal(false);

        try {
            // Set status to busy
            await setStatus('busy');

            // Receive file
            await receiveFile(incomingConnection);

            // Reset status
            await setStatus('online');
        } catch (error) {
            console.error('Failed to receive file:', error);
            await setStatus('online');
        }
    };

    // Handle decline incoming transfer
    const handleDeclineTransfer = () => {
        if (incomingConnection) {
            incomingConnection.close();
        }
        setShowIncomingModal(false);
        setIncomingConnection(null);
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
                    {selectedFile && transferStatus === 'idle' && (
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

                    {/* Transfer Progress */}
                    {transferStatus !== 'idle' && (
                        <TransferProgress
                            fileName={selectedFile?.name || 'File'}
                            progress={progress}
                            speed={speed}
                            status={transferStatus}
                            onCancel={cancel}
                        />
                    )}

                    {/* Device List */}
                    {selectedFile && transferStatus === 'idle' && (
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
                onAccept={handleAcceptTransfer}
                onDecline={handleDeclineTransfer}
            />
        </div>
    );
};

export default OfflineShare;
