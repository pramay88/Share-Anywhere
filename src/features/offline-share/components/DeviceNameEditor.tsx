/**
 * DeviceNameEditor Component - Edit device name
 */

import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DeviceNameEditorProps {
    currentName: string;
    onUpdate: (name: string) => Promise<void>;
}

export function DeviceNameEditor({ currentName, onUpdate }: DeviceNameEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(currentName);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleSave = async () => {
        if (name.trim() === '' || name === currentName) {
            setIsEditing(false);
            setName(currentName);
            return;
        }

        setIsUpdating(true);
        try {
            await onUpdate(name.trim());
            setIsEditing(false);
        } catch (error) {
            setName(currentName);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleCancel = () => {
        setName(currentName);
        setIsEditing(false);
    };

    if (!isEditing) {
        return (
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
            >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Name
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Device name"
                className="h-8"
                disabled={isUpdating}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') handleCancel();
                }}
                autoFocus
            />
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleSave}
                disabled={isUpdating}
            >
                <Check className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCancel}
                disabled={isUpdating}
            >
                <X className="h-4 w-4" />
            </Button>
        </div>
    );
}
