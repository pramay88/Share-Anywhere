/**
 * useNearbyDevices
 *
 * Manages Firestore-based presence discovery for the nearby devices feature.
 *
 * How it works:
 *  - On mount, registers this device in Firestore `p2p_presence/{deviceId}`
 *  - Heartbeats every 30s to keep the presence alive (TTL = 90s)
 *  - Listens to the entire `p2p_presence` collection in real-time
 *  - Filters out stale entries (> 90s old) locally — no server-side TTL needed
 *  - When this device creates a PeerJS session (as sender), updates its
 *    presence doc with { peerId, shareCode } so other devices can auto-connect
 *  - Watches its own presence doc for `incomingRequest` — written by another
 *    device that wants to send to this one
 *
 * Note on "nearby" detection:
 *  Browsers cannot access subnet/IP info, so we can't truly detect same-network.
 *  All devices with an active presence entry appear as "nearby". The UX
 *  communicates this honestly: "on this page recently".
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    collection,
    doc,
    setDoc,
    onSnapshot,
    serverTimestamp,
    deleteDoc,
    updateDoc,
    Timestamp,
    type Firestore,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NearbyDevice {
    deviceId: string;
    deviceName: string;
    avatar: string;       // emoji or first letter of name
    avatarColor: string;  // deterministic color from deviceId
    isYou: boolean;
    lastSeen: Date;
    // Set when device has created a session and is ready to receive connections
    peerId?: string;
    shareCode?: string;
}

export interface IncomingRequest {
    fromDeviceId: string;
    fromDeviceName: string;
    peerId: string;
    shareCode: string;
}

interface UseNearbyDevicesReturn {
    myDevice: NearbyDevice | null;
    nearbyDevices: NearbyDevice[];   // excludes self
    incomingRequest: IncomingRequest | null;
    deviceName: string;
    updateDeviceName: (name: string) => void;
    /** Call when this device creates a PeerJS session as sender */
    publishSession: (peerId: string, shareCode: string) => Promise<void>;
    /** Call when this device accepts or declines an incoming request */
    clearIncomingRequest: () => Promise<void>;
    /** Send a "connect to me" request to a target device */
    requestConnection: (targetDeviceId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESENCE_TTL_MS = 90_000;  // devices stale after 90s
const HEARTBEAT_MS = 30_000;  // heartbeat every 30s
const PRESENCE_COLL = 'p2p_presence';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic avatar color from deviceId */
function colorFromId(id: string): string {
    const palette = [
        '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
        '#10B981', '#EF4444', '#06B6D4', '#F97316',
        '#6366F1', '#14B8A6', '#D946EF', '#84CC16',
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
}

/** Adjective + Noun device name generator */
const ADJECTIVES = ['Swift', 'Bright', 'Calm', 'Dark', 'Fast', 'Gold', 'Iron', 'Jade',
    'Kind', 'Lone', 'Mint', 'Neon', 'Opal', 'Pale', 'Quiet', 'Ruby', 'Sage', 'Teal'];
const NOUNS = ['Hawk', 'Wolf', 'Bear', 'Deer', 'Fox', 'Lynx', 'Mink', 'Orca',
    'Puma', 'Rook', 'Seal', 'Vole', 'Wren', 'Yak', 'Ibis', 'Kite'];

function generateDeviceName(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    const adj = ADJECTIVES[Math.abs(hash) % ADJECTIVES.length];
    const noun = NOUNS[Math.abs(hash >> 4) % NOUNS.length];
    return `${adj} ${noun}`;
}

function getOrCreateDeviceId(): string {
    try {
        let id = localStorage.getItem('p2p_device_id');
        if (!id) {
            id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem('p2p_device_id', id);
        }
        return id;
    } catch {
        return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
}

function getOrCreateDeviceName(deviceId: string): string {
    try {
        return localStorage.getItem('p2p_device_name') || generateDeviceName(deviceId);
    } catch {
        return generateDeviceName(deviceId);
    }
}

function toDate(val: unknown): Date {
    if (val instanceof Timestamp) return val.toDate();
    if (val instanceof Date) return val;
    if (typeof val === 'number') return new Date(val);
    return new Date(0);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNearbyDevices(
    db: Firestore,
    /** Pass from your auth context if available */
    currentUser?: { uid: string; displayName?: string | null; photoURL?: string | null } | null
): UseNearbyDevicesReturn {
    const deviceId = useRef(currentUser?.uid || getOrCreateDeviceId()).current;
    const [deviceName, setDeviceName] = useState(() =>
        currentUser?.displayName || getOrCreateDeviceName(deviceId)
    );
    const [nearbyRaw, setNearbyRaw] = useState<NearbyDevice[]>([]);
    const [incomingRequest, setIncoming] = useState<IncomingRequest | null>(null);

    const docRef = doc(db, PRESENCE_COLL, deviceId);

    // ── Registration & heartbeat ─────────────────────────────────────────────

    const registerPresence = useCallback(async (name: string) => {
        await setDoc(docRef, {
            deviceId,
            deviceName: name,
            lastSeen: serverTimestamp(),
            peerId: null,
            shareCode: null,
            incomingRequest: null,
        }, { merge: true });
    }, [deviceId, docRef]);

    useEffect(() => {
        void registerPresence(deviceName);

        const interval = window.setInterval(() => {
            void updateDoc(docRef, { lastSeen: serverTimestamp() });
        }, HEARTBEAT_MS);

        return () => {
            window.clearInterval(interval);
            void deleteDoc(docRef);
        };
    }, [deviceName, docRef, registerPresence]);

    // ── Collection listener ──────────────────────────────────────────────────

    useEffect(() => {
        const unsub = onSnapshot(collection(db, PRESENCE_COLL), (snap) => {
            const now = Date.now();
            const devices: NearbyDevice[] = [];

            snap.forEach((d) => {
                const data = d.data();
                const lastSeen = toDate(data.lastSeen);
                if (now - lastSeen.getTime() > PRESENCE_TTL_MS) return; // stale

                const id = data.deviceId as string;
                const name = data.deviceName as string || generateDeviceName(id);

                devices.push({
                    deviceId: id,
                    deviceName: name,
                    avatar: name.charAt(0).toUpperCase(),
                    avatarColor: colorFromId(id),
                    isYou: id === deviceId,
                    lastSeen,
                    peerId: data.peerId || undefined,
                    shareCode: data.shareCode || undefined,
                });

                // Check for incoming request on our own doc
                if (id === deviceId && data.incomingRequest) {
                    const req = data.incomingRequest;
                    setIncoming({
                        fromDeviceId: req.fromDeviceId,
                        fromDeviceName: req.fromDeviceName,
                        peerId: req.peerId,
                        shareCode: req.shareCode,
                    });
                }
            });

            // Sort: others first, then self last; alphabetical within group
            devices.sort((a, b) => {
                if (a.isYou !== b.isYou) return a.isYou ? 1 : -1;
                return a.deviceName.localeCompare(b.deviceName);
            });

            setNearbyRaw(devices);
        });

        return unsub;
    }, [db, deviceId]);

    // ── Actions ──────────────────────────────────────────────────────────────

    const updateDeviceName = useCallback((name: string) => {
        const trimmed = name.trim().slice(0, 32) || generateDeviceName(deviceId);
        setDeviceName(trimmed);
        try {
            localStorage.setItem('p2p_device_name', trimmed);
        } catch {
            // Ignore storage errors; name regeneration is still available.
        }
        void updateDoc(docRef, { deviceName: trimmed });
    }, [deviceId, docRef]);

    const publishSession = useCallback(async (peerId: string, shareCode: string) => {
        await updateDoc(docRef, { peerId, shareCode });
    }, [docRef]);

    const requestConnection = useCallback(async (targetDeviceId: string) => {
        const myData = nearbyRaw.find((d) => d.isYou);
        const target = doc(db, PRESENCE_COLL, targetDeviceId);
        await updateDoc(target, {
            incomingRequest: {
                fromDeviceId: deviceId,
                fromDeviceName: myData?.deviceName || deviceName,
                peerId: myData?.peerId || null,
                shareCode: myData?.shareCode || null,
            },
        });
    }, [db, deviceId, deviceName, nearbyRaw]);

    const clearIncomingRequest = useCallback(async () => {
        setIncoming(null);
        await updateDoc(docRef, { incomingRequest: null }).catch(() => { });
    }, [docRef]);

    const myDevice = nearbyRaw.find((d) => d.isYou) ?? null;
    const nearbyDevices = nearbyRaw.filter((d) => !d.isYou);

    return {
        myDevice,
        nearbyDevices,
        incomingRequest,
        deviceName,
        updateDeviceName,
        publishSession,
        clearIncomingRequest,
        requestConnection,
    };
}