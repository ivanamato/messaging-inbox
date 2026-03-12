import { useState, useCallback, useEffect, useRef } from 'react';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { useRealtimeEvents } from '@/hooks/use-realtime-events';
import { useDeviceContext } from '@/lib/provider-context';

export type DeviceStatus = 'open' | 'close' | 'connecting' | 'loading';

export function useDeviceStatus() {
  const { devices, selectedDevice, selectDevice, getProviderForDevice, eventBus, realtimeStates } = useDeviceContext();
  const [statuses, setStatuses] = useState<Record<string, DeviceStatus>>({});
  const [initialLoad, setInitialLoad] = useState(true);

  // Use refs so pollStatuses doesn't recreate on every devices/provider change
  // (e.g. config patches from updateDevice). Only device list composition matters.
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const getProviderRef = useRef(getProviderForDevice);
  getProviderRef.current = getProviderForDevice;

  // Track device IDs to detect actual device additions/removals (not config patches)
  const deviceIds = devices.map(d => d.id).join(',');

  const pollStatuses = useCallback(async () => {
    const currentDevices = devicesRef.current;
    const getProvider = getProviderRef.current;
    const results: Record<string, DeviceStatus> = {};
    await Promise.all(
      currentDevices.map(async device => {
        try {
          const p = getProvider(device);
          results[device.id] = await p.getConnectionState(device.instanceName);
        } catch {
          results[device.id] = 'close';
        }
      }),
    );
    setStatuses(results);
    setInitialLoad(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIds]);

  useEffect(() => {
    pollStatuses();
  }, [pollStatuses]);

  // Disable polling when all devices have WS connected
  const allWsConnected = devices.every(d => realtimeStates[d.id] === 'connected');

  useAutoPolling({ interval: 30000, enabled: !allWsConnected, onPoll: pollStatuses });

  // Realtime: update device status directly from WS connection.changed events.
  // Do NOT clear initialLoad here — only the HTTP poll should do that, since it
  // fetches all devices at once. A single WS event would leave other devices unknown.
  useRealtimeEvents(eventBus, { type: 'connection.changed' }, useCallback((event) => {
    if (event.type !== 'connection.changed') return;
    const { state } = event.payload;
    setStatuses(prev => ({ ...prev, [event.deviceId]: state }));
  }, []));

  // Auto-select first connected device if the current one is disconnected.
  // Only react to status changes — not device config patches (which change the devices reference).
  useEffect(() => {
    if (!initialLoad && selectedDevice && statuses[selectedDevice.id] !== 'open') {
      const connected = devices.find(d => statuses[d.id] === 'open');
      if (connected && connected.id !== selectedDevice.id) {
        selectDevice(connected.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoad, statuses]);

  return {
    statuses,
    initialLoad,
    connectedCount: devices.filter(d => statuses[d.id] === 'open').length,
  };
}
