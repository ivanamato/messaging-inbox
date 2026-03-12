/**
 * WebSocket connection manager hook.
 * Manages WebSocket connections for devices with realtime updates enabled.
 *
 * Responsibilities:
 * - Create and track WebSocket connections per device
 * - Forward events to the event bus
 * - Track connection states
 * - Handle errors and logging
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { createRealtimeConnection } from '@/lib/providers/registry';
import { RealtimeEventBus } from '@/lib/realtime/event-bus';
import type { RealtimeConnection, RealtimeConnectionState } from '@/lib/realtime/types';
import type { DeviceConfig } from '@/lib/providers/types';
import type { DebugStore } from '@/lib/debug';

export type WebSocketManagerConfig = {
  devices: DeviceConfig[];
  eventBus: RealtimeEventBus;
  debugStore?: DebugStore | null;
  onWebSocketError?: (deviceId: string, error: string) => void;
};

export type WebSocketManagerState = {
  /** Current connection states by device ID */
  states: Record<string, RealtimeConnectionState>;
  /** Enable or disable WebSocket for a device */
  setEnabled: (deviceId: string, enabled: boolean) => void;
  /** Force reconnect for a device */
  reconnect: (deviceId: string) => void;
  /** Check if a device has an active connection */
  isConnected: (deviceId: string) => boolean;
};

/**
 * Hook to manage WebSocket connections for multiple devices.
 * Connections are automatically managed based on device configuration.
 */
export function useWebSocketManager(config: WebSocketManagerConfig): WebSocketManagerState {
  const { devices, eventBus, debugStore, onWebSocketError } = config;

  const connectionsRef = useRef<Map<string, RealtimeConnection>>(new Map());
  const [states, setStates] = useState<Record<string, RealtimeConnectionState>>({});

  // Stable key that only changes when websocket-relevant config changes
  const wsConfigKey = useMemo(() =>
    devices
      .filter(d => d.websocket?.enabled)
      .map(d => `${d.id}:${d.websocket?.url ?? ''}`)
      .join('|'),
    [devices],
  );

  // Keep devices ref for effect without causing re-runs
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // Setup and manage connections
  useEffect(() => {
    const connections = connectionsRef.current;
    const currentDevices = devicesRef.current;
    const activeDeviceIds = new Set<string>();

    // Create connections for enabled devices
    for (const device of currentDevices) {
      if (device.websocket?.enabled) {
        activeDeviceIds.add(device.id);

        if (!connections.has(device.id)) {
          const conn = createRealtimeConnection(device);

          // Forward events to event bus
          conn.onEvent((event) => {
            eventBus.emit(event);
            debugStore?.addEvent({
              type: 'message_received',
              deviceId: event.deviceId,
              summary: `[WS] ${event.type}`,
              details: event,
            });
          });

          // Track connection state
          conn.onStateChange((state) => {
            setStates(prev => ({ ...prev, [device.id]: state }));
            debugStore?.addEvent({
              type: 'connection_change',
              deviceId: device.id,
              summary: `[WS] ${state}`,
            });
          });

          // Error callback
          conn.onError((error) => {
            onWebSocketError?.(device.id, error);
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
          setStates(prev => ({ ...prev, [device.id]: conn.getState() }));
        }
      }
    }

    // Disconnect devices that are no longer active
    for (const [deviceId, conn] of connections) {
      if (!activeDeviceIds.has(deviceId)) {
        conn.disconnect();
        connections.delete(deviceId);
        setStates(prev => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
      }
    }

    // Cleanup on unmount
    return () => {
      for (const [, conn] of connections) {
        conn.disconnect();
      }
      connections.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConfigKey, eventBus, debugStore, onWebSocketError]);

  // Enable/disable a specific device's WebSocket
  const setEnabled = useCallback((deviceId: string, enabled: boolean) => {
    const connections = connectionsRef.current;
    const device = devices.find(d => d.id === deviceId);

    if (enabled) {
      if (!device) return;
      if (connections.has(deviceId)) return; // already connected

      const conn = createRealtimeConnection(device);

      conn.onEvent((event) => {
        eventBus.emit(event);
        debugStore?.addEvent({
          type: 'message_received',
          deviceId: event.deviceId,
          summary: `[WS] ${event.type}`,
          details: event,
        });
      });

      conn.onStateChange((state) => {
        setStates(prev => ({ ...prev, [deviceId]: state }));
        debugStore?.addEvent({
          type: 'connection_change',
          deviceId,
          summary: `[WS] ${state}`,
        });
      });

      conn.onError((error) => {
        onWebSocketError?.(deviceId, error);
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
      setStates(prev => ({ ...prev, [deviceId]: conn.getState() }));
    } else {
      const conn = connections.get(deviceId);
      if (conn) {
        conn.disconnect();
        connections.delete(deviceId);
        setStates(prev => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
      }
    }
  }, [devices, eventBus, debugStore, onWebSocketError]);

  // Force reconnect for a device
  const reconnect = useCallback((deviceId: string) => {
    const connections = connectionsRef.current;
    const conn = connections.get(deviceId);
    if (conn) {
      conn.disconnect();
      connections.delete(deviceId);
    }
    // setEnabled will create a new connection
    setEnabled(deviceId, true);
  }, [setEnabled]);

  // Check if connected
  const isConnected = useCallback((deviceId: string): boolean => {
    return connectionsRef.current.has(deviceId);
  }, []);

  return {
    states,
    setEnabled,
    reconnect,
    isConnected,
  };
}
