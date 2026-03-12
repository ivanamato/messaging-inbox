import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef, type PropsWithChildren } from 'react';
import { EvolutionProvider } from './providers/evolution';
import { GenericServerProvider } from './providers/generic-server';
import { createRealtimeConnection } from './providers/index';
import { RealtimeEventBus } from './realtime/event-bus';
import type { RealtimeConnection, RealtimeConnectionState } from './realtime/types';
import type { MessagingProvider, DeviceConfig, WhatsAppMultiDeviceConfig, ViewMode } from './providers/types';
import { TranslationsProvider } from './i18n';
import { DebugStore, DebugProviderProxy, DebugProvider } from './debug';

// --- Provider registry: one provider per unique device (keyed by device.id to avoid token exposure) ---

function createProviderInstance(device: DeviceConfig): MessagingProvider {
  const type = device.providerType || 'evolution';
  if (type === 'evolution') {
    return new EvolutionProvider(device.apiUrl, device.instanceToken, device.capabilities);
  }
  if (type === 'generic-server') {
    return new GenericServerProvider(device.apiUrl, device.instanceToken, device.capabilities, device.endpoints);
  }
  throw new Error(`Unknown provider type: ${type}`);
}

function buildProviderRegistry(devices: DeviceConfig[], debugStore?: DebugStore): Map<string, MessagingProvider> {
  const registry = new Map<string, MessagingProvider>();
  for (const device of devices) {
    const key = `${device.id}|${device.providerType || 'evolution'}`;
    if (!registry.has(key)) {
      let provider = createProviderInstance(device);
      if (debugStore) {
        provider = new DebugProviderProxy(provider, debugStore, device.id);
      }
      registry.set(key, provider);
    }
  }
  return registry;
}

function getProviderForDevice(device: DeviceConfig, registry: Map<string, MessagingProvider>): MessagingProvider {
  const type = device.providerType || 'evolution';
  const key = `${device.id}|${type}`;
  return registry.get(key)!;
}

// --- Device context ---

export type DeviceContextValue = {
  devices: DeviceConfig[];
  selectedDevice: DeviceConfig | null;
  selectDevice: (deviceId: string) => void;
  getProviderForDevice: (device: DeviceConfig) => MessagingProvider;
  readonly: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  eventBus: RealtimeEventBus | null;
  realtimeStates: Record<string, RealtimeConnectionState>;
  setWebSocketEnabled: (deviceId: string, enabled: boolean) => void;
  updateDevice: (deviceId: string, patch: Partial<DeviceConfig>) => void;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);
const ProviderContext = createContext<MessagingProvider | null>(null);

export function ProviderProvider({ config, children }: PropsWithChildren<{ config: WhatsAppMultiDeviceConfig }>) {
  const [devices, setDevices] = useState<DeviceConfig[]>(config.devices);

  const debugStore = useMemo(
    () => config.debug ? new DebugStore() : null,
    [config.debug],
  );

  const registry = useMemo(() => buildProviderRegistry(devices, debugStore ?? undefined), [devices, debugStore]);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    config.defaultDeviceId || (devices.length > 0 ? devices[0].id : null)
  );

  const [viewMode, setViewMode] = useState<ViewMode>('single');

  const selectedDevice = useMemo(() => {
    return devices.find(d => d.id === selectedDeviceId) || devices[0] || null;
  }, [devices, selectedDeviceId]);

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  const getProviderForDeviceFn = useCallback((device: DeviceConfig) => {
    return getProviderForDevice(device, registry);
  }, [registry]);

  const activeProvider = useMemo(() => {
    if (selectedDevice) {
      return getProviderForDevice(selectedDevice, registry);
    }
    return null;
  }, [selectedDevice, registry]);

  const isReadonly = selectedDevice?.readonly ?? false;

  // --- Realtime (WebSocket) ---

  const eventBusRef = useRef<RealtimeEventBus | null>(null);
  if (!eventBusRef.current) {
    eventBusRef.current = new RealtimeEventBus();
  }
  const eventBus = eventBusRef.current;

  const connectionsRef = useRef<Map<string, RealtimeConnection>>(new Map());
  const [realtimeStates, setRealtimeStates] = useState<Record<string, RealtimeConnectionState>>({});

  // Stable key: only changes when device IDs or websocket config change (not on config patches like autoRead).
  // This prevents tearing down and reconnecting all WS connections on every config update.
  const wsDeviceKey = useMemo(() =>
    devices
      .filter(d => d.websocket?.enabled)
      .map(d => `${d.id}:${d.websocket?.url ?? ''}`)
      .join('|'),
    [devices],
  );

  // Use a ref for devices so the WS setup effect can read the latest list without depending on it.
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // Initialize connections for devices with websocket.enabled
  useEffect(() => {
    const connections = connectionsRef.current;
    const currentDevices = devicesRef.current;
    const activeDeviceIds = new Set<string>();

    for (const device of currentDevices) {
      if (device.websocket?.enabled) {
        activeDeviceIds.add(device.id);
        if (!connections.has(device.id)) {
          const conn = createRealtimeConnection(device);

          // Forward events to event bus
          conn.onEvent((event) => {
            eventBus.emit(event);
            if (debugStore) {
              debugStore.addEvent({
                type: 'message_received',
                deviceId: event.deviceId,
                summary: `[WS] ${event.type}`,
                details: event,
              });
            }
          });

          // Track connection state
          conn.onStateChange((state) => {
            setRealtimeStates(prev => ({ ...prev, [device.id]: state }));
            if (debugStore) {
              debugStore.addEvent({
                type: 'connection_change',
                deviceId: device.id,
                summary: `[WS] ${state}`,
              });
            }
          });

          // Error callback
          conn.onError((error) => {
            config.onWebSocketError?.(device.id, error);
          });

          // Raw WS logging for debug panel
          if (debugStore && conn.setRawLogger) {
            conn.setRawLogger((eventName, payload) => {
              debugStore.addWsLog({
                deviceId: device.id,
                eventName,
                direction: 'in',
                payload,
              });
            });
          }

          conn.connect();
          connections.set(device.id, conn);
          setRealtimeStates(prev => ({ ...prev, [device.id]: conn.getState() }));
        }
      }
    }

    // Disconnect connections for devices that are no longer active
    for (const [deviceId, conn] of connections) {
      if (!activeDeviceIds.has(deviceId)) {
        conn.disconnect();
        connections.delete(deviceId);
        setRealtimeStates(prev => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
      }
    }

    return () => {
      // Cleanup all connections on unmount
      for (const [, conn] of connections) {
        conn.disconnect();
      }
      connections.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsDeviceKey, eventBus, debugStore]);

  const setWebSocketEnabled = useCallback((deviceId: string, enabled: boolean) => {
    const connections = connectionsRef.current;
    const device = devices.find(d => d.id === deviceId);

    if (enabled) {
      if (!device) return;
      if (connections.has(deviceId)) return; // already connected

      const conn = createRealtimeConnection(device);

      conn.onEvent((event) => {
        eventBus.emit(event);
        if (debugStore) {
          debugStore.addEvent({
            type: 'message_received',
            deviceId: event.deviceId,
            summary: `[WS] ${event.type}`,
            details: event,
          });
        }
      });

      conn.onStateChange((state) => {
        setRealtimeStates(prev => ({ ...prev, [deviceId]: state }));
        if (debugStore) {
          debugStore.addEvent({
            type: 'connection_change',
            deviceId,
            summary: `[WS] ${state}`,
          });
        }
      });

      conn.onError((error) => {
        config.onWebSocketError?.(deviceId, error);
      });

      if (debugStore && conn.setRawLogger) {
        conn.setRawLogger((eventName, payload) => {
          debugStore.addWsLog({
            deviceId,
            eventName,
            direction: 'in',
            payload,
          });
        });
      }

      conn.connect();
      connections.set(deviceId, conn);
      setRealtimeStates(prev => ({ ...prev, [deviceId]: conn.getState() }));
    } else {
      const conn = connections.get(deviceId);
      if (conn) {
        conn.disconnect();
        connections.delete(deviceId);
        setRealtimeStates(prev => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
      }
    }
  }, [devices, eventBus, debugStore]);

  const updateDevice = useCallback((deviceId: string, patch: Partial<DeviceConfig>) => {
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, ...patch } : d));
  }, []);

  const deviceContextValue = useMemo<DeviceContextValue>(() => ({
    devices,
    selectedDevice,
    selectDevice,
    getProviderForDevice: getProviderForDeviceFn,
    readonly: isReadonly,
    viewMode,
    setViewMode,
    eventBus,
    realtimeStates,
    setWebSocketEnabled,
    updateDevice,
  }), [devices, selectedDevice, selectDevice, getProviderForDeviceFn, isReadonly, viewMode, eventBus, realtimeStates, setWebSocketEnabled, updateDevice]);

  return (
    <TranslationsProvider translations={config.translations}>
      <DebugProvider store={debugStore}>
        <DeviceContext.Provider value={deviceContextValue}>
          <ProviderContext.Provider value={activeProvider}>
            {children}
          </ProviderContext.Provider>
        </DeviceContext.Provider>
      </DebugProvider>
    </TranslationsProvider>
  );
}

export function useProvider(): MessagingProvider {
  const provider = useContext(ProviderContext);
  if (!provider) {
    throw new Error('useProvider must be used within a ProviderProvider');
  }
  return provider;
}

export function useDeviceContext(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error('useDeviceContext must be used within a ProviderProvider');
  }
  return ctx;
}
