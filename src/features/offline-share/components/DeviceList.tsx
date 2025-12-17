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
        <Card className="p-6">
            <h3 className="font-semibold mb-4">Nearby Devices ({devices.length})</h3>
            <div className="space-y-3">
                {devices.map((device) => {
                    const Icon = getDeviceIcon(device);
                    const isBusy = device.status === 'busy';

                    return (
                        <div
                            key={device.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Icon className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-medium">{device.name}</p>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`w-2 h-2 rounded-full ${isBusy ? 'bg-yellow-500' : 'bg-green-500'
                                                }`}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {isBusy ? 'Busy' : 'Available'} • Same network
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => onSendToDevice(device.id)}
                                disabled={isConnecting || isBusy}
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
