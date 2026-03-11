import { useState, useCallback, useEffect } from 'react';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { useRealtimeEvents } from '@/hooks/use-realtime-events';
import { useDeviceContext } from '@/lib/provider-context';

export type DeviceStatus = 'open' | 'close' | 'connecting' | 'loading';

export function useDeviceStatus() {
  const { devices, selectedDevice, selectDevice, getProviderForDevice, eventBus, realtimeStates } = useDeviceContext();
  const [statuses, setStatuses] = useState<Record<string, DeviceStatus>>({});
  const [initialLoad, setInitialLoad] = useState(true);

  const pollStatuses = useCallback(async () => {
    const results: Record<string, DeviceStatus> = {};
    await Promise.all(
      devices.map(async device => {
        try {
          const p = getProviderForDevice(device);
          results[device.id] = await p.getConnectionState(device.instanceName);
        } catch {
          results[device.id] = 'close';
        }
      }),
    );
    setStatuses(results);
    setInitialLoad(false);
  }, [devices, getProviderForDevice]);

  useEffect(() => {
    pollStatuses();
  }, [pollStatuses]);

  // Disable polling when all devices have WS connected
  const allWsConnected = devices.every(d => realtimeStates[d.id] === 'connected');

  useAutoPolling({ interval: 30000, enabled: !allWsConnected, onPoll: pollStatuses });

  // Realtime: update device status directly from WS connection.changed events
  useRealtimeEvents(eventBus, { type: 'connection.changed' }, useCallback((event) => {
    if (event.type !== 'connection.changed') return;
    const { state } = event.payload;
    setStatuses(prev => ({ ...prev, [event.deviceId]: state }));
    setInitialLoad(false);
  }, []));

  // Auto-select first connected device if the current one is disconnected
  useEffect(() => {
    if (!initialLoad && selectedDevice && statuses[selectedDevice.id] !== 'open') {
      const connected = devices.find(d => statuses[d.id] === 'open');
      if (connected && connected.id !== selectedDevice.id) {
        selectDevice(connected.id);
      }
    }
  }, [initialLoad, statuses, devices, selectedDevice, selectDevice]);

  return {
    statuses,
    initialLoad,
    connectedCount: devices.filter(d => statuses[d.id] === 'open').length,
  };
}
