/**
 * DeviceList Component - Displays list of nearby devices
 */

import { Laptop, Smartphone, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Device } from '../types';

interface DeviceListProps {
    devices: Device[];
    onSendToDevice: (deviceId: string) => void;
    isConnecting: boolean;
}

export function DeviceList({ devices, onSendToDevice, isConnecting }: DeviceListProps) {
    const getDeviceIcon = (device: Device) => {
        // Simple heuristic based on device name
        const name = device.name.toLowerCase();
        if (name.includes('phone') || name.includes('android') || name.includes('ios')) {
            return Smartphone;
        }
        if (name.includes('laptop') || name.includes('macbook')) {
            return Laptop;
        }
        return Monitor;
    };

    if (devices.length === 0) {
        return null;
    }

    return (
        <Card className="p-4 sm:p-6">
            <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Nearby Devices ({devices.length})</h3>
            <div className="space-y-2 sm:space-y-3">
                {devices.map((device) => {
                    const Icon = getDeviceIcon(device);
                    const isBusy = device.status === 'busy';

                    return (
                        <div
                            key={device.id}
                            className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-xs sm:text-sm truncate">{device.name}</p>
                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                        <div
                                            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isBusy ? 'bg-yellow-500' : 'bg-green-500'
                                                }`}
                                        />
                                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                                            {isBusy ? 'Busy' : 'Available'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => onSendToDevice(device.id)}
                                disabled={isConnecting || isBusy}
                                className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm shrink-0"
                            >
                                {isConnecting ? 'Connecting...' : 'Send'}
                            </Button>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
