import { useDeviceContext } from '@/lib/provider-context';
import type { RequestLogEntry } from '@/lib/debug/debug-store';

const CAPABILITY_KEYS = ['templates', 'messagingWindow24h', 'pushToTalk', 'interactiveButtons', 'deleteForEveryone'] as const;

export function ProviderComparisonSection({ requests }: { requests: RequestLogEntry[] }) {
  const { devices } = useDeviceContext();

  if (devices.length < 2) {
    return (
      <div className="wa:text-center wa:py-8" style={{ color: '#475569' }}>
        Comparison requires 2+ devices
      </div>
    );
  }

  // Get latest findChats result per device
  const latestChats = new Map<string, RequestLogEntry>();
  for (const r of requests) {
    if (r.method === 'findChats' && r.success && !latestChats.has(r.deviceId)) {
      latestChats.set(r.deviceId, r);
    }
  }

  return (
    <div data-testid="debug-comparison-section" className="wa:space-y-4">
      {/* Capabilities comparison */}
      <div>
        <div className="wa:px-2 wa:py-1 wa:mb-2" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
          Capabilities
        </div>
        <table className="wa:w-full" style={{ fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="wa:text-left wa:px-2 wa:py-1" style={{ color: '#64748b', fontWeight: 500 }}>Feature</th>
              {devices.map(d => (
                <th key={d.id} className="wa:text-center wa:px-2 wa:py-1" style={{ color: '#94a3b8', fontWeight: 500 }}>
                  {d.label || d.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITY_KEYS.map(key => {
              const values = devices.map(d => !!(d.capabilities as Record<string, unknown> | undefined)?.[key]);
              const allSame = values.every(v => v === values[0]);
              return (
                <tr key={key} style={{ borderTop: '1px solid #1e293b' }}>
                  <td className="wa:px-2 wa:py-1" style={{ color: '#94a3b8' }}>{key}</td>
                  {values.map((v, i) => (
                    <td
                      key={i}
                      className="wa:text-center wa:px-2 wa:py-1"
                      style={{ color: !allSame ? (v ? '#22c55e' : '#ef4444') : (v ? '#22c55e' : '#475569') }}
                    >
                      {v ? '✓' : '✗'}
                    </td>
                  ))}
                </tr>
              );
            })}
            {/* Provider type */}
            <tr style={{ borderTop: '1px solid #1e293b' }}>
              <td className="wa:px-2 wa:py-1" style={{ color: '#94a3b8' }}>providerType</td>
              {devices.map(d => (
                <td key={d.id} className="wa:text-center wa:px-2 wa:py-1" style={{ color: '#94a3b8' }}>
                  {d.providerType || 'evolution'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Response shape comparison */}
      <div>
        <div className="wa:px-2 wa:py-1 wa:mb-2" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
          Latest findChats response
        </div>
        <div className="wa:flex wa:gap-2">
          {devices.map(d => {
            const entry = latestChats.get(d.id);
            return (
              <div key={d.id} className="wa:flex-1 wa:rounded wa:p-2" style={{ background: '#1e293b' }}>
                <div className="wa:mb-1" style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>
                  {d.label || d.id}
                </div>
                {entry ? (
                  <div style={{ color: '#64748b', fontSize: 10 }}>
                    <div>{entry.responseSummary}</div>
                    <div>{entry.duration.toFixed(0)}ms</div>
                    <div>{entry.validationIssues.length} issues</div>
                  </div>
                ) : (
                  <div style={{ color: '#475569', fontSize: 10 }}>No data yet</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
