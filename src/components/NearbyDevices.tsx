/**
 * NearbyDevices — redesigned to match the Pairdrop-style reference
 *
 * Layout:
 *  - White/surface card with concentric dashed rings
 *  - Device icons with name + "Busy" status arranged on the ring
 *  - Centre: your device icon (filled accent circle)
 *  - Below radar: "You are known as: <name> ✏" + discovery status badge
 */

import { useState, useEffect, useRef } from 'react';
import type { NearbyDevice } from '@/features/p2p-share/hooks/useNearbyDevices';

// ---------------------------------------------------------------------------
// Keyframes (injected once)
// ---------------------------------------------------------------------------
const STYLES = `
@keyframes nd-spin-slow { to { transform: rotate(360deg); } }
@keyframes nd-fadein {
    from { opacity: 0; transform: translate(-50%,-50%) scale(0.6); }
    to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
}
@keyframes nd-pulse-ring {
    0%,100% { opacity: 0.4; }
    50%      { opacity: 0.9; }
}
`;

// ---------------------------------------------------------------------------
// Device icon — SVG glyphs for phone / laptop / tablet / desktop
// ---------------------------------------------------------------------------
function DeviceIcon({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
    // Generic "phone" glyph — simple enough to not need detection
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Name editor
// ---------------------------------------------------------------------------
function NameEditor({ name, onChange }: { name: string; onChange: (n: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    useEffect(() => setDraft(name), [name]);

    const commit = () => {
        setEditing(false);
        const t = draft.trim();
        if (t && t !== name) onChange(t);
        else setDraft(name);
    };

    if (editing) return (
        <form onSubmit={e => { e.preventDefault(); commit(); }}
            className="inline-flex items-center gap-1">
            <input autoFocus value={draft} maxLength={32}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                className="font-semibold text-sm bg-transparent border-b-2 border-orange-500 outline-none w-32 text-center"
            />
        </form>
    );

    return (
        <button onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 group">
            <span className="font-semibold text-sm">{name}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                className="opacity-40 group-hover:opacity-80 transition-opacity text-foreground">
                <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    );
}

// ---------------------------------------------------------------------------
// Positions on ring
// ---------------------------------------------------------------------------
function ringPositions(n: number, rPct: number) {
    return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return { x: 50 + rPct * Math.cos(a), y: 50 + rPct * Math.sin(a) };
    });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface NearbyDevicesProps {
    myDevice: NearbyDevice | null;
    nearbyDevices: NearbyDevice[];
    deviceName: string;
    onUpdateName: (name: string) => void;
    onConnectTo: (device: NearbyDevice) => void;
    connectingToId?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function NearbyDevices({
    myDevice, nearbyDevices, deviceName,
    onUpdateName, onConnectTo, connectingToId,
}: NearbyDevicesProps) {
    const empty = nearbyDevices.length === 0;
    const positions = ringPositions(nearbyDevices.length, nearbyDevices.length <= 3 ? 33 : 36);

    return (
        <>
            <style>{STYLES}</style>

            {/* ── Main card ─────────────────────────────────────────── */}
            <div className="rounded-2xl border bg-card text-card-foreground overflow-hidden">

                {/* Header */}
                <div className="px-5 pt-5 pb-3 text-center space-y-0.5">
                    <p className="text-sm font-semibold text-primary">
                        {empty ? 'Open on other devices to share files' : `${nearbyDevices.length} device${nearbyDevices.length > 1 ? 's' : ''} nearby`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {empty ? 'Devices on the same network will appear automatically' : 'Tap a device to send files'}
                    </p>
                </div>

                {/* Radar */}
                <div
                    className="relative mx-auto"
                    style={{ width: '100%', maxWidth: 360, aspectRatio: '1/1' }}
                    role="region" aria-label="Nearby devices radar"
                >
                    {/* Concentric dashed rings */}
                    {[28, 50, 72].map((pct, i) => (
                        <div key={i} className="absolute rounded-full border border-dashed"
                            style={{
                                width: `${pct}%`, height: `${pct}%`,
                                top: '50%', left: '50%',
                                transform: 'translate(-50%,-50%)',
                                borderColor: 'hsl(var(--border))',
                                opacity: 0.5 + i * 0.15,
                            }} />
                    ))}

                    {/* Nearby devices on outer ring */}
                    {nearbyDevices.map((dev, i) => {
                        const pos = positions[i];
                        const busy = false; // extend later
                        const isConnecting = connectingToId === dev.deviceId;

                        return (
                            <button
                                key={dev.deviceId}
                                onClick={() => !isConnecting && onConnectTo(dev)}
                                className="absolute flex flex-col items-center gap-1 group"
                                style={{
                                    left: `${pos.x}%`, top: `${pos.y}%`,
                                    transform: 'translate(-50%,-50%)',
                                    animation: `nd-fadein 0.3s ease-out ${i * 60}ms both`,
                                    zIndex: 2,
                                    outline: 'none',
                                }}
                                aria-label={`Connect to ${dev.deviceName}`}
                            >
                                {/* Icon circle */}
                                <span
                                    className="flex items-center justify-center rounded-full transition-all duration-200"
                                    style={{
                                        width: 44, height: 44,
                                        background: busy
                                            ? 'hsl(var(--muted))'
                                            : 'hsl(var(--background))',
                                        border: `1.5px solid ${isConnecting ? dev.avatarColor : 'hsl(var(--border))'}`,
                                        boxShadow: isConnecting
                                            ? `0 0 0 3px ${dev.avatarColor}33`
                                            : 'none',
                                        color: busy ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                                        // Scale on hover via group
                                    }}
                                >
                                    {isConnecting
                                        ? <span className="w-4 h-4 border-2 border-transparent rounded-full"
                                            style={{
                                                borderTopColor: dev.avatarColor,
                                                animation: 'nd-spin-slow 0.7s linear infinite'
                                            }} />
                                        : <DeviceIcon size={20}
                                            color={busy ? 'hsl(var(--muted-foreground))' : dev.avatarColor} />
                                    }
                                </span>

                                {/* Name */}
                                <span className="text-[11px] font-medium leading-tight text-center max-w-[64px] truncate"
                                    style={{ color: 'hsl(var(--foreground))' }}>
                                    {dev.deviceName}
                                </span>
                                {busy && (
                                    <span className="text-[10px] text-muted-foreground -mt-0.5">Busy</span>
                                )}
                            </button>
                        );
                    })}

                    {/* Centre — you */}
                    <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
                        {myDevice ? (
                            <button
                                className="flex items-center justify-center rounded-full"
                                style={{
                                    width: 60, height: 60,
                                    background: 'hsl(var(--primary))',
                                    boxShadow: '0 0 0 4px hsl(var(--primary) / 0.15)',
                                    animation: empty ? 'nd-pulse-ring 2.5s ease-in-out infinite' : 'none',
                                    cursor: 'default',
                                }}
                                aria-label="You"
                                disabled
                            >
                                <DeviceIcon size={26} color="hsl(var(--primary-foreground))" />
                            </button>
                        ) : (
                            <div className="w-14 h-14 rounded-full animate-pulse bg-muted" />
                        )}
                    </div>
                </div>

                {/* Footer — name + discovery */}
                <div className="px-5 pb-5 pt-2 space-y-2">
                    <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                        <span>You are known as:</span>
                        <NameEditor name={deviceName} onChange={onUpdateName} />
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                        <span>You can be discovered:</span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                    style={{ background: 'hsl(var(--primary-foreground))' }} />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                    style={{ background: 'hsl(var(--primary-foreground))' }} />
                            </span>
                            on this network
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}