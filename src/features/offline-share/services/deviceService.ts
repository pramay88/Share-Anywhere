/**
 * Device Service - Manages device presence, discovery, and network detection
 * Supports scalable architecture for future device grouping and filtering
 */

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    onSnapshot,
    deleteDoc,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db } from '@/integrations/firebase/config';
import type { Device, DevicePresence, DeviceStatus } from '../types';

const DEVICES_COLLECTION = 'offline_share_devices';
const DEVICE_TIMEOUT = 15000; // 15 seconds

// ============================================================================
// Device ID Management
// ============================================================================

/**
 * Get or create a unique device ID
 */
export function getDeviceId(): string {
    let deviceId = localStorage.getItem('offline_share_device_id');

    if (!deviceId) {
        deviceId = generateDeviceId();
        localStorage.setItem('offline_share_device_id', deviceId);
    }

    return deviceId;
}

/**
 * Generate a unique device ID
 */
function generateDeviceId(): string {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get device name from localStorage or generate default
 */
export function getDeviceName(): string {
    const stored = localStorage.getItem('offline_share_device_name');
    if (stored) return stored;

    // Generate default name based on browser and OS
    const browser = getBrowserName();
    const os = getOSName();
    return `${browser} on ${os}`;
}

/**
 * Set device name
 */
export function setDeviceName(name: string): void {
    localStorage.setItem('offline_share_device_name', name);
}

// ============================================================================
// Network Detection
// ============================================================================

/**
 * Detect network fingerprint to identify devices on same network
 * Returns a hash of the local IP range (e.g., "192.168.1.x")
 */
export async function detectNetworkFingerprint(): Promise<string> {
    try {
        const localIP = await getLocalIP();

        if (!localIP) {
            // Fallback: use a random fingerprint that changes per session
            return `session_${Date.now()}`;
        }

        // Extract network prefix (e.g., "192.168.1" from "192.168.1.100")
        const parts = localIP.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
        }

        return localIP;
    } catch (error) {
        console.error('Error detecting network:', error);
        return `session_${Date.now()}`;
    }
}

/**
 * Get local IP address using WebRTC
 */
async function getLocalIP(): Promise<string | null> {
    return new Promise((resolve) => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        const noop = () => { };

        pc.createDataChannel('');
        pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(noop);

        pc.onicecandidate = (ice) => {
            if (!ice || !ice.candidate || !ice.candidate.candidate) {
                pc.close();
                resolve(null);
                return;
            }

            const candidate = ice.candidate.candidate;
            const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
            const match = ipRegex.exec(candidate);

            if (match && match[1]) {
                pc.close();
                resolve(match[1]);
            }
        };

        // Timeout after 2 seconds
        setTimeout(() => {
            pc.close();
            resolve(null);
        }, 2000);
    });
}

// ============================================================================
// Device Registration & Presence
// ============================================================================

/**
 * Register device in Firestore
 */
export async function registerDevice(
    deviceId: string,
    deviceName: string,
    networkFingerprint: string,
    status: DeviceStatus = 'online'
): Promise<void> {
    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);

    const deviceData: DevicePresence = {
        deviceId,
        deviceName,
        networkFingerprint,
        status,
        lastHeartbeat: serverTimestamp() as Timestamp,
        createdAt: serverTimestamp() as Timestamp,
    };

    await setDoc(deviceRef, deviceData, { merge: true });
}

/**
 * Update device heartbeat
 */
export async function updateHeartbeat(
    deviceId: string,
    status: DeviceStatus = 'online'
): Promise<void> {
    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);

    await setDoc(
        deviceRef,
        {
            status,
            lastHeartbeat: serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Update device status
 */
export async function updateDeviceStatus(
    deviceId: string,
    status: DeviceStatus
): Promise<void> {
    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);

    await setDoc(
        deviceRef,
        {
            status,
            lastHeartbeat: serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Update device name
 */
export async function updateDeviceNameInFirestore(
    deviceId: string,
    deviceName: string
): Promise<void> {
    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);

    await setDoc(
        deviceRef,
        {
            deviceName,
            lastHeartbeat: serverTimestamp(),
        },
        { merge: true }
    );

    // Also update localStorage
    setDeviceName(deviceName);
}

/**
 * Unregister device from Firestore
 */
export async function unregisterDevice(deviceId: string): Promise<void> {
    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);
    await deleteDoc(deviceRef);
}

// ============================================================================
// Device Discovery
// ============================================================================

/**
 * Get all online devices on the same network
 */
export async function getOnlineDevices(
    networkFingerprint: string,
    excludeDeviceId?: string
): Promise<Device[]> {
    const devicesRef = collection(db, DEVICES_COLLECTION);
    const q = query(
        devicesRef,
        where('networkFingerprint', '==', networkFingerprint)
    );

    const snapshot = await getDocs(q);
    const now = Date.now();

    const devices: Device[] = [];

    snapshot.forEach((doc) => {
        const data = doc.data() as DevicePresence;

        // Skip own device
        if (data.deviceId === excludeDeviceId) return;

        // Check if device is still online (heartbeat within timeout)
        const lastHeartbeat = data.lastHeartbeat?.toMillis() || 0;
        const isOnline = now - lastHeartbeat < DEVICE_TIMEOUT;

        devices.push({
            id: data.deviceId,
            name: data.deviceName,
            status: isOnline ? data.status : 'offline',
            networkFingerprint: data.networkFingerprint,
            lastSeen: data.lastHeartbeat,
        });
    });

    // Filter out offline devices
    return devices.filter((d) => d.status !== 'offline');
}

/**
 * Subscribe to device changes on the same network
 */
export function subscribeToDevices(
    networkFingerprint: string,
    excludeDeviceId: string,
    callback: (devices: Device[]) => void
): () => void {
    const devicesRef = collection(db, DEVICES_COLLECTION);
    const q = query(
        devicesRef,
        where('networkFingerprint', '==', networkFingerprint)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const now = Date.now();
        const devices: Device[] = [];

        snapshot.forEach((doc) => {
            const data = doc.data() as DevicePresence;

            // Skip own device
            if (data.deviceId === excludeDeviceId) return;

            // Check if device is still online
            const lastHeartbeat = data.lastHeartbeat?.toMillis() || 0;
            const isOnline = now - lastHeartbeat < DEVICE_TIMEOUT;

            devices.push({
                id: data.deviceId,
                name: data.deviceName,
                status: isOnline ? data.status : 'offline',
                networkFingerprint: data.networkFingerprint,
                lastSeen: data.lastHeartbeat,
            });
        });

        // Filter out offline devices and call callback
        callback(devices.filter((d) => d.status !== 'offline'));
    });

    return unsubscribe;
}

/**
 * Get a specific device by ID
 */
export async function getDevice(deviceId: string): Promise<Device | null> {
    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);
    const snapshot = await getDoc(deviceRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data() as DevicePresence;
    const now = Date.now();
    const lastHeartbeat = data.lastHeartbeat?.toMillis() || 0;
    const isOnline = now - lastHeartbeat < DEVICE_TIMEOUT;

    return {
        id: data.deviceId,
        name: data.deviceName,
        status: isOnline ? data.status : 'offline',
        networkFingerprint: data.networkFingerprint,
        lastSeen: data.lastHeartbeat,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get browser name
 */
function getBrowserName(): string {
    const userAgent = navigator.userAgent;

    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';

    return 'Browser';
}

/**
 * Get OS name
 */
function getOSName(): string {
    const userAgent = navigator.userAgent;

    if (userAgent.includes('Win')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';

    return 'Unknown';
}

/**
 * Start heartbeat interval
 */
export function startHeartbeat(
    deviceId: string,
    intervalMs: number = 5000
): () => void {
    const interval = setInterval(() => {
        updateHeartbeat(deviceId).catch((error) => {
            console.error('Heartbeat failed:', error);
        });
    }, intervalMs);

    return () => clearInterval(interval);
}
