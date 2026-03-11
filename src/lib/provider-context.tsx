import { createContext, useContext, useMemo, useState, useCallback, type PropsWithChildren } from 'react';
import { EvolutionProvider } from './providers/evolution';
import { GenericServerProvider } from './providers/generic-server';
import type { MessagingProvider, DeviceConfig, WhatsAppMultiDeviceConfig, ViewMode } from './providers/types';
import { TranslationsProvider } from './i18n';
import { DebugStore, DebugProviderProxy, DebugProvider } from './debug';

// --- Provider registry: one provider per unique device (keyed by device.id to avoid token exposure) ---

function createProviderInstance(device: DeviceConfig): MessagingProvider {
  const type = device.providerType || 'evolution';
  if (type === 'evolution') {
    return new EvolutionProvider(device.apiUrl, device.instanceToken);
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
};

const DeviceContext = createContext<DeviceContextValue | null>(null);
const ProviderContext = createContext<MessagingProvider | null>(null);

export function ProviderProvider({ config, children }: PropsWithChildren<{ config: WhatsAppMultiDeviceConfig }>) {
  const { devices } = config;

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

  const deviceContextValue = useMemo<DeviceContextValue>(() => ({
    devices,
    selectedDevice,
    selectDevice,
    getProviderForDevice: getProviderForDeviceFn,
    readonly: isReadonly,
    viewMode,
    setViewMode,
  }), [devices, selectedDevice, selectDevice, getProviderForDeviceFn, isReadonly, viewMode]);

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
