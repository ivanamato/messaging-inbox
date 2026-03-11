import { useState } from 'react';
import type { WsLogEntry } from '@/lib/debug/debug-store';

const EVENT_COLORS: Record<string, string> = {
  'messages.upsert': '#22c55e',
  'messages.update': '#38bdf8',
  'messages.delete': '#ef4444',
  'chats.upsert': '#a78bfa',
  'chats.update': '#818cf8',
  'connection.update': '#f59e0b',
  'contacts.update': '#64748b',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export function WsLogsSection({ wsLogs }: { wsLogs: WsLogEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? wsLogs.filter(l => l.eventName.toLowerCase().includes(filter.toLowerCase()) || l.deviceId.toLowerCase().includes(filter.toLowerCase()))
    : wsLogs;

  return (
    <div data-testid="debug-ws-logs-section">
      {/* Filter */}
      <div className="wa:mb-2 wa:px-1">
        <input
          type="text"
          placeholder="Filter events..."
          value={filter}
          onChange={e => setFilter((e.target as HTMLInputElement).value)}
          className="wa:w-full wa:px-2 wa:py-1 wa:rounded wa:border-none wa:outline-none"
          style={{ background: '#1e293b', color: '#e2e8f0', fontSize: 11 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="wa:text-center wa:py-8" style={{ color: '#475569' }}>
          {wsLogs.length === 0 ? 'No WebSocket events yet' : 'No matching events'}
        </div>
      ) : (
        <div className="wa:space-y-0">
          {filtered.map(entry => {
            const color = EVENT_COLORS[entry.eventName] || '#94a3b8';
            const isExpanded = expandedId === entry.id;
            const payloadStr = entry.payload != null ? JSON.stringify(entry.payload) : '';

            return (
              <div
                key={entry.id}
                data-testid="debug-ws-log-entry"
                className="wa:cursor-pointer"
                style={{ borderBottom: '1px solid #1e293b' }}
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                {/* Summary row */}
                <div className="wa:flex wa:items-center wa:gap-2 wa:py-1.5 wa:px-2">
                  {/* Direction arrow */}
                  <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0, width: 12 }}>
                    {entry.direction === 'in' ? '↓' : '↑'}
                  </span>

                  {/* Time */}
                  <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0, width: 85 }}>
                    {formatTime(entry.timestamp)}
                  </span>

                  {/* Device */}
                  <span
                    className="wa:px-1 wa:rounded"
                    style={{ background: '#334155', color: '#64748b', fontSize: 9, flexShrink: 0 }}
                  >
                    {entry.deviceId}
                  </span>

                  {/* Event name */}
                  <span style={{ color, fontWeight: 500, fontSize: 11, flexShrink: 0 }}>
                    {entry.eventName}
                  </span>

                  {/* Payload preview */}
                  {payloadStr && !isExpanded && (
                    <span className="wa:flex-1 wa:truncate" style={{ color: '#475569', fontSize: 10 }}>
                      {truncate(payloadStr, 120)}
                    </span>
                  )}
                </div>

                {/* Expanded payload */}
                {isExpanded && payloadStr && (
                  <pre
                    className="wa:px-3 wa:pb-2 wa:overflow-auto wa:whitespace-pre-wrap wa:break-all"
                    style={{
                      color: '#94a3b8',
                      fontSize: 10,
                      margin: 0,
                      maxHeight: 200,
                      background: '#0c1222',
                      borderRadius: 4,
                      marginLeft: 8,
                      marginRight: 8,
                      marginBottom: 4,
                      padding: 8,
                    }}
                  >
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
