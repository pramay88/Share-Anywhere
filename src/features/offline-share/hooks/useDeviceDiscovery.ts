/**
 * useDeviceDiscovery Hook
 * Manages device registration, presence, and discovery
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { Device, DeviceStatus, UseDeviceDiscoveryReturn } from '../types';
import {
    getDeviceId,
    getDeviceName,
    setDeviceName as setDeviceNameLocal,
    detectNetworkFingerprint,
    registerDevice,
    unregisterDevice,
    updateDeviceNameInFirestore,
    updateDeviceStatus,
    subscribeToDevices,
    startHeartbeat,
} from '../services/deviceService';

export function useDeviceDiscovery(): UseDeviceDiscoveryReturn {
    const [devices, setDevices] = useState<Device[]>([]);
    const [myDevice, setMyDevice] = useState<Device | null>(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Initialize device and register presence
    useEffect(() => {
        let unsubscribe: (() => void) | null = null;
        let stopHeartbeat: (() => void) | null = null;

        async function initialize() {
            try {
                setIsLoading(true);
                setError(null);

                // Get device info
                const deviceId = getDeviceId();
                const deviceName = getDeviceName();
                const networkFingerprint = await detectNetworkFingerprint();

                // Register device
                await registerDevice(deviceId, deviceName, networkFingerprint);

                // Set my device
                setMyDevice({
                    id: deviceId,
                    name: deviceName,
                    status: 'online',
                    networkFingerprint,
                    lastSeen: new Date() as any,
                });

                setIsRegistered(true);

                // Start heartbeat
                stopHeartbeat = startHeartbeat(deviceId);

                // Subscribe to device changes
                unsubscribe = subscribeToDevices(
                    networkFingerprint,
                    deviceId,
                    (discoveredDevices) => {
                        setDevices(discoveredDevices);
                    }
                );

                setIsLoading(false);
            } catch (err) {
                console.error('Failed to initialize device discovery:', err);
                setError(err as Error);
                setIsLoading(false);
                toast.error('Failed to initialize device discovery');
            }
        }

        initialize();

        // Cleanup on unmount
        return () => {
            if (unsubscribe) unsubscribe();
            if (stopHeartbeat) stopHeartbeat();

            // Unregister device
            const deviceId = getDeviceId();
            unregisterDevice(deviceId).catch((err) => {
                console.error('Failed to unregister device:', err);
            });
        };
    }, []);

    // Update device name
    const updateDeviceName = useCallback(async (name: string) => {
        if (!myDevice) return;

        try {
            await updateDeviceNameInFirestore(myDevice.id, name);
            setDeviceNameLocal(name);

            setMyDevice((prev) =>
                prev ? { ...prev, name } : null
            );

            toast.success('Device name updated');
        } catch (err) {
            console.error('Failed to update device name:', err);
            toast.error('Failed to update device name');
            throw err;
        }
    }, [myDevice]);

    // Refresh devices manually
    const refreshDevices = useCallback(async () => {
        // Devices are updated automatically via subscription
        // This is a no-op but kept for API consistency
    }, []);

    // Set device status
    const setStatus = useCallback(async (status: DeviceStatus) => {
        if (!myDevice) return;

        try {
            await updateDeviceStatus(myDevice.id, status);

            setMyDevice((prev) =>
                prev ? { ...prev, status } : null
            );
        } catch (err) {
            console.error('Failed to update device status:', err);
            toast.error('Failed to update device status');
            throw err;
        }
    }, [myDevice]);

    return {
        devices,
        myDevice,
        isRegistered,
        isLoading,
        error,
        updateDeviceName,
        refreshDevices,
        setStatus,
    };
}
