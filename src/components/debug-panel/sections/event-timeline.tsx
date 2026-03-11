import type { TimelineEvent, TimelineEventType } from '@/lib/debug/debug-store';

const EVENT_STYLES: Record<TimelineEventType, { color: string; icon: string }> = {
  connection_change: { color: '#a78bfa', icon: '🔌' },
  chat_refresh: { color: '#38bdf8', icon: '↻' },
  message_sent: { color: '#22c55e', icon: '↑' },
  message_received: { color: '#22c55e', icon: '↓' },
  error: { color: '#ef4444', icon: '✗' },
  optimistic_confirm: { color: '#94a3b8', icon: '✓' },
  provider_call: { color: '#64748b', icon: '→' },
  ws_connected: { color: '#10b981', icon: '⚡' },
  ws_disconnected: { color: '#f97316', icon: '⚡' },
  ws_event: { color: '#6366f1', icon: '⚡' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function EventTimelineSection({ events }: { events: TimelineEvent[] }) {
  return (
    <div data-testid="debug-timeline-section">
      {events.length === 0 ? (
        <div className="wa:text-center wa:py-8" style={{ color: '#475569' }}>
          No events recorded yet
        </div>
      ) : (
        <div className="wa:space-y-0">
          {events.map(event => {
            const style = EVENT_STYLES[event.type] || EVENT_STYLES.provider_call;
            return (
              <div
                key={event.id}
                data-testid="debug-timeline-event"
                className="wa:flex wa:items-start wa:gap-2 wa:py-1.5 wa:px-2"
                style={{ borderBottom: '1px solid #1e293b' }}
              >
                {/* Icon */}
                <span style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>
                  {style.icon}
                </span>

                {/* Time */}
                <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0, width: 85 }}>
                  {formatTime(event.timestamp)}
                </span>

                {/* Device */}
                <span
                  className="wa:px-1 wa:rounded"
                  style={{ background: '#334155', color: '#64748b', fontSize: 9, flexShrink: 0 }}
                >
                  {event.deviceId}
                </span>

                {/* Summary */}
                <span className="wa:flex-1" style={{ color: style.color }}>
                  {event.summary}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
