import { useDeviceContext } from '@/lib/provider-context';
import { useDeviceStatus } from '@/use-cases/use-device-status';

const STATUS_COLORS: Record<string, string> = {
  open: '#22c55e',
  close: '#ef4444',
  connecting: '#f59e0b',
  loading: '#64748b',
};

const CAPABILITY_LABELS: [string, string][] = [
  ['templates', 'Templates'],
  ['messagingWindow24h', '24h Window'],
  ['pushToTalk', 'Push to Talk'],
  ['interactiveButtons', 'Buttons'],
  ['deleteForEveryone', 'Delete'],
];

export function DeviceHealthSection() {
  const { devices } = useDeviceContext();
  const { statuses } = useDeviceStatus();

  return (
    <div className="wa:space-y-3">
      {devices.map(device => {
        const status = statuses[device.id] || 'loading';
        const caps = device.capabilities ?? {};
        const providerType = device.providerType || 'evolution';

        return (
          <div
            key={device.id}
            data-testid="debug-device-card"
            className="wa:rounded wa:p-3"
            style={{ background: '#1e293b' }}
          >
            {/* Header row */}
            <div className="wa:flex wa:items-center wa:gap-2 wa:mb-2">
              <span
                className="wa:w-2 wa:h-2 wa:rounded-full wa:inline-block wa:flex-shrink-0"
                data-testid="debug-device-status"
                data-status={status}
                style={{ background: STATUS_COLORS[status] || '#64748b' }}
              />
              <span className="wa:font-semibold" style={{ color: '#f1f5f9' }}>
                {device.label || device.id}
              </span>
              <span className="wa:px-1.5 wa:rounded" style={{ background: '#334155', color: '#94a3b8', fontSize: 10 }}>
                {providerType}
              </span>
              <span style={{ color: '#64748b', fontSize: 10 }}>
                {status}
              </span>
            </div>

            {/* Details */}
            <div className="wa:grid wa:gap-1" style={{ fontSize: 11, color: '#94a3b8' }}>
              <div>
                <span style={{ color: '#64748b' }}>ID: </span>{device.id}
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Instance: </span>{device.instanceName}
              </div>
              <div>
                <span style={{ color: '#64748b' }}>API: </span>{device.apiUrl}
              </div>
              {device.readonly && (
                <div style={{ color: '#f59e0b' }}>Read-only mode</div>
              )}
            </div>

            {/* Capabilities */}
            <div className="wa:flex wa:flex-wrap wa:gap-1 wa:mt-2">
              {CAPABILITY_LABELS.map(([key, label]) => {
                const enabled = !!(caps as Record<string, unknown>)[key];
                return (
                  <span
                    key={key}
                    className="wa:px-1.5 wa:py-0.5 wa:rounded"
                    style={{
                      fontSize: 10,
                      background: enabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)',
                      color: enabled ? '#22c55e' : '#64748b',
                    }}
                  >
                    {enabled ? '✓' : '✗'} {label}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
