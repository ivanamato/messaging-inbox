/**
 * Device state management hook.
 * Manages device selection, view mode, and device configuration updates.
 *
 * Responsibilities:
 * - Track available devices
 * - Manage selected device
 * - Handle view mode (single/all)
 * - Provide device updates
 */

import { useState, useCallback, useMemo } from 'react';
import type { DeviceConfig, ViewMode } from '@/lib/providers/types';

export type DeviceStateConfig = {
  devices: DeviceConfig[];
  defaultDeviceId?: string;
};

export type DeviceState = {
  /** All available devices */
  devices: DeviceConfig[];
  /** Currently selected device */
  selectedDevice: DeviceConfig | null;
  /** Select a device by ID */
  selectDevice: (deviceId: string) => void;
  /** Current view mode */
  viewMode: ViewMode;
  /** Set view mode */
  setViewMode: (mode: ViewMode) => void;
  /** Update a device's configuration */
  updateDevice: (deviceId: string, patch: Partial<DeviceConfig>) => void;
  /** Check if current device is readonly */
  readonly: boolean;
};

/**
 * Hook to manage device state.
 * Provides device selection, view mode, and configuration updates.
 */
export function useDeviceState(config: DeviceStateConfig): DeviceState {
  const { devices: initialDevices, defaultDeviceId } = config;

  const [devices, setDevices] = useState<DeviceConfig[]>(initialDevices);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    defaultDeviceId || (initialDevices.length > 0 ? initialDevices[0].id : null)
  );
  const [viewMode, setViewMode] = useState<ViewMode>('single');

  // Find the selected device
  const selectedDevice = useMemo(() => {
    return devices.find(d => d.id === selectedDeviceId) || devices[0] || null;
  }, [devices, selectedDeviceId]);

  // Select a device
  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  // Update a device's configuration
  const updateDevice = useCallback((deviceId: string, patch: Partial<DeviceConfig>) => {
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, ...patch } : d));
  }, []);

  // Check if current device is readonly
  const readonly = selectedDevice?.readonly ?? false;

  return {
    devices,
    selectedDevice,
    selectDevice,
    viewMode,
    setViewMode,
    updateDevice,
    readonly,
  };
}
