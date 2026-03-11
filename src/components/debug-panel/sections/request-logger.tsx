import { useState } from 'react';
import type { RequestLogEntry, HttpRequestDetail } from '@/lib/debug/debug-store';

const METHOD_COLORS: Record<string, string> = {
  findChats: '#38bdf8',
  findMessages: '#38bdf8',
  findMessagesPaginated: '#38bdf8',
  getConnectionState: '#a78bfa',
  sendText: '#22c55e',
  sendMedia: '#22c55e',
  sendButtons: '#22c55e',
  getMediaUrl: '#f59e0b',
  deleteMessage: '#ef4444',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

const STATUS_COLORS: Record<string, string> = {
  '2': '#22c55e', // 2xx
  '3': '#38bdf8', // 3xx
  '4': '#f59e0b', // 4xx
  '5': '#ef4444', // 5xx
};

function statusColor(code: number | null): string {
  if (!code) return '#ef4444';
  return STATUS_COLORS[String(code)[0]] || '#94a3b8';
}

function HttpRequestBlock({ http, index }: { http: HttpRequestDetail; index: number }) {
  const [showHeaders, setShowHeaders] = useState(false);
  const [showBody, setShowBody] = useState(false);

  // Extract pathname from URL for compact display
  let pathname = http.url;
  try { pathname = new URL(http.url).pathname; } catch { /* keep full url */ }

  return (
    <div
      className="wa:rounded wa:mb-2 wa:p-2"
      style={{ background: '#0f172a', border: '1px solid #1e293b' }}
    >
      {/* URL + method + status row */}
      <div className="wa:flex wa:items-center wa:gap-2 wa:flex-wrap">
        <span className="wa:px-1.5 wa:rounded wa:font-mono" style={{
          fontSize: 10,
          background: http.httpMethod === 'GET' ? 'rgba(56,189,248,0.15)' : 'rgba(34,197,94,0.15)',
          color: http.httpMethod === 'GET' ? '#38bdf8' : '#22c55e',
        }}>
          {http.httpMethod}
        </span>

        <span className="wa:font-mono wa:flex-1 wa:truncate" style={{ color: '#cbd5e1', fontSize: 10 }} title={http.url}>
          {pathname}
        </span>

        <span className="wa:font-mono wa:px-1.5 wa:rounded" style={{
          fontSize: 10,
          color: statusColor(http.statusCode),
          background: `${statusColor(http.statusCode)}15`,
        }}>
          {http.statusCode ?? 'ERR'}
        </span>

        <span style={{ color: '#475569', fontSize: 10 }}>
          {http.duration.toFixed(0)}ms
        </span>

        {http.responseSize != null && (
          <span style={{ color: '#475569', fontSize: 10 }}>
            {http.responseSize > 1024 ? `${(http.responseSize / 1024).toFixed(1)}KB` : `${http.responseSize}B`}
          </span>
        )}
      </div>

      {http.error && (
        <div style={{ color: '#ef4444', fontSize: 10, marginTop: 4 }}>
          {http.error}
        </div>
      )}

      {/* Toggle buttons */}
      <div className="wa:flex wa:gap-3 wa:mt-2" style={{ fontSize: 10 }}>
        <button
          onClick={() => setShowHeaders(!showHeaders)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
        >
          {showHeaders ? '▾' : '▸'} Headers
        </button>
        {http.requestBody && (
          <button
            onClick={() => setShowBody(!showBody)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
          >
            {showBody ? '▾' : '▸'} Request Body
          </button>
        )}
      </div>

      {/* Headers */}
      {showHeaders && (
        <div style={{ marginTop: 4 }}>
          <div style={{ color: '#475569', fontSize: 10, marginBottom: 2 }}>Request Headers:</div>
          <pre className="wa:p-1.5 wa:rounded wa:overflow-auto" style={{ background: '#020617', color: '#94a3b8', maxHeight: 80, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
            {Object.entries(http.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)'}
          </pre>
          {Object.keys(http.responseHeaders).length > 0 && (
            <>
              <div style={{ color: '#475569', fontSize: 10, marginBottom: 2, marginTop: 4 }}>Response Headers:</div>
              <pre className="wa:p-1.5 wa:rounded wa:overflow-auto" style={{ background: '#020617', color: '#94a3b8', maxHeight: 80, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
                {Object.entries(http.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}
              </pre>
            </>
          )}
        </div>
      )}

      {/* Request body */}
      {showBody && http.requestBody && (
        <div style={{ marginTop: 4 }}>
          <pre className="wa:p-1.5 wa:rounded wa:overflow-auto" style={{ background: '#020617', color: '#94a3b8', maxHeight: 100, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
            {typeof http.requestBody === 'string' ? http.requestBody : JSON.stringify(http.requestBody, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function RequestRow({ entry }: { entry: RequestLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div data-testid="debug-request-row" style={{ borderBottom: '1px solid #1e293b' }}>
      <button
        className="wa:w-full wa:flex wa:items-center wa:gap-2 wa:py-1.5 wa:px-2 wa:border-none wa:cursor-pointer wa:text-left"
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'transparent', color: '#e2e8f0', fontSize: 11 }}
      >
        {/* Status dot */}
        <span
          className="wa:w-1.5 wa:h-1.5 wa:rounded-full wa:flex-shrink-0"
          style={{ background: entry.success ? '#22c55e' : '#ef4444' }}
        />

        {/* Time */}
        <span style={{ color: '#64748b', width: 85, flexShrink: 0 }}>
          {formatTime(entry.timestamp)}
        </span>

        {/* Method */}
        <span
          className="wa:px-1.5 wa:rounded wa:font-mono"
          style={{
            background: `${METHOD_COLORS[entry.method] || '#64748b'}20`,
            color: METHOD_COLORS[entry.method] || '#94a3b8',
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          {entry.method}
        </span>

        {/* Device */}
        <span style={{ color: '#475569', fontSize: 10, flexShrink: 0 }}>
          {entry.deviceId}
        </span>

        {/* Summary */}
        <span className="wa:flex-1 wa:truncate" style={{ color: '#94a3b8' }}>
          {entry.responseSummary}
        </span>

        {/* Duration */}
        <span style={{ color: entry.duration > 1000 ? '#f59e0b' : '#475569', flexShrink: 0 }}>
          {entry.duration.toFixed(0)}ms
        </span>

        {/* Validation badge */}
        {entry.validationIssues.length > 0 && (
          <span
            className="wa:px-1 wa:rounded"
            style={{
              fontSize: 9,
              background: entry.validationIssues.some(i => i.severity === 'error') ? '#ef4444' : '#f59e0b',
              color: '#fff',
            }}
          >
            {entry.validationIssues.length}
          </span>
        )}

        {/* Expand arrow */}
        <span style={{ color: '#475569' }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="wa:px-4 wa:pb-3 wa:pt-1" style={{ fontSize: 11 }}>
          {/* HTTP Requests */}
          {entry.httpRequests && entry.httpRequests.length > 0 && (
            <div className="wa:mb-3">
              <div style={{ color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                HTTP Requests ({entry.httpRequests.length})
              </div>
              {entry.httpRequests.map((http, i) => (
                <HttpRequestBlock key={i} http={http} index={i} />
              ))}
            </div>
          )}

          {/* Provider params */}
          <div className="wa:mb-2">
            <div style={{ color: '#64748b', marginBottom: 2 }}>Provider Params:</div>
            <pre className="wa:p-2 wa:rounded wa:overflow-auto" style={{ background: '#0f172a', color: '#94a3b8', maxHeight: 100, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(entry.params, null, 2)}
            </pre>
          </div>

          {/* Normalized response */}
          <div className="wa:mb-2">
            <div style={{ color: '#64748b', marginBottom: 2 }}>Normalized Response:</div>
            <pre className="wa:p-2 wa:rounded wa:overflow-auto" style={{ background: '#0f172a', color: '#94a3b8', maxHeight: 150, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {entry.error ? entry.error : JSON.stringify(entry.responseRaw, null, 2)}
            </pre>
          </div>

          {/* Validation issues */}
          {entry.validationIssues.length > 0 && (
            <div>
              <div style={{ color: '#64748b', marginBottom: 2 }}>Validation:</div>
              {entry.validationIssues.map((issue, i) => (
                <div
                  key={i}
                  className="wa:px-2 wa:py-1 wa:rounded wa:mb-1"
                  style={{
                    background: issue.severity === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                    color: issue.severity === 'error' ? '#ef4444' : '#f59e0b',
                  }}
                >
                  {issue.severity === 'error' ? '✗' : '⚠'} {issue.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RequestLoggerSection({ requests }: { requests: RequestLogEntry[] }) {
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? requests.filter(r => r.method.toLowerCase().includes(filter.toLowerCase()) || r.deviceId.toLowerCase().includes(filter.toLowerCase()))
    : requests;

  return (
    <div className="wa:flex wa:flex-col wa:h-full">
      {/* Filter */}
      <div className="wa:mb-2">
        <input
          data-testid="debug-request-filter"
          type="text"
          placeholder="Filter by method or device…"
          value={filter}
          onChange={e => setFilter((e.target as HTMLInputElement).value)}
          className="wa:w-full wa:px-2 wa:py-1 wa:rounded wa:border-none wa:outline-none"
          style={{ background: '#1e293b', color: '#e2e8f0', fontSize: 11 }}
        />
      </div>

      {/* List */}
      <div className="wa:flex-1 wa:overflow-auto">
        {filtered.length === 0 ? (
          <div className="wa:text-center wa:py-8" style={{ color: '#475569' }}>
            {requests.length === 0 ? 'No requests logged yet' : 'No matching requests'}
          </div>
        ) : (
          filtered.map(entry => <RequestRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
