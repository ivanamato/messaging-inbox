import { useState, useSyncExternalStore } from 'react';
import { useDebugStore } from '@/lib/debug/debug-context';
import { DeviceHealthSection } from './sections/device-health';
import { RequestLoggerSection } from './sections/request-logger';
import { DataValidationSection } from './sections/data-validation';
import { ProviderComparisonSection } from './sections/provider-comparison';
import { EventTimelineSection } from './sections/event-timeline';
import { WsLogsSection } from './sections/ws-logs';

// Stable references to avoid infinite re-render when store is null
const NOOP_SUBSCRIBE = (_cb: () => void) => () => {};
const EMPTY_SNAPSHOT = { requests: [] as never[], events: [] as never[], wsLogs: [] as never[] };
const GET_EMPTY_SNAPSHOT = () => EMPTY_SNAPSHOT;

const TABS = [
  { id: 'health', label: 'Devices' },
  { id: 'requests', label: 'Requests' },
  { id: 'websocket', label: 'WebSocket' },
  { id: 'validation', label: 'Validation' },
  { id: 'compare', label: 'Compare' },
  { id: 'timeline', label: 'Timeline' },
] as const;

type TabId = typeof TABS[number]['id'];

export function DebugPanel() {
  const store = useDebugStore();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('requests');

  const snapshot = useSyncExternalStore(
    store?.subscribe ?? NOOP_SUBSCRIBE,
    store?.getSnapshot ?? GET_EMPTY_SNAPSHOT,
  );

  if (!store) return null;

  const errorCount = snapshot.requests.filter(r => !r.success).length;
  const validationCount = snapshot.requests.reduce((acc, r) => acc + r.validationIssues.length, 0);

  const handleExport = () => {
    const json = store.exportAsJson();
    navigator.clipboard.writeText(json).then(() => {
      // brief visual feedback could be added
    });
  };

  return (
    <>
      {/* Toggle button */}
      <button
        data-testid="debug-toggle"
        onClick={() => setOpen(!open)}
        className="wa:absolute wa:bottom-3 wa:right-3 wa:z-50 wa:w-10 wa:h-10 wa:rounded-full wa:flex wa:items-center wa:justify-center wa:shadow-lg wa:border-none wa:cursor-pointer wa:text-sm wa:transition-colors"
        style={{
          background: errorCount > 0 ? '#ef4444' : '#1e293b',
          color: '#fff',
        }}
        title={`Debug panel${errorCount > 0 ? ` (${errorCount} errors)` : ''}`}
      >
        {errorCount > 0 ? (
          <span>{errorCount}</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v1h16V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3z"/>
            <path d="M4 10v5a8 8 0 0 0 16 0v-5"/>
            <path d="M9 16h6"/>
            <path d="M12 12v8"/>
          </svg>
        )}
      </button>

      {/* Panel drawer */}
      {open && (
        <div
          data-testid="debug-panel"
          className="wa:absolute wa:bottom-0 wa:left-0 wa:right-0 wa:z-40 wa:flex wa:flex-col wa:overflow-hidden wa:border-t"
          style={{
            height: 320,
            background: '#0f172a',
            color: '#e2e8f0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 12,
            borderColor: '#334155',
          }}
        >
          {/* Tab bar */}
          <div className="wa:flex wa:items-center wa:gap-4 wa:border-b wa:flex-shrink-0 wa:pl-3" style={{ borderColor: '#334155' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                data-testid={`debug-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="wa:px-6 wa:py-2 wa:border-none wa:cursor-pointer wa:transition-colors wa:relative"
                style={{
                  background: activeTab === tab.id ? '#1e293b' : 'transparent',
                  color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
                  borderBottom: activeTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {tab.label}
                {tab.id === 'validation' && validationCount > 0 && (
                  <span className="wa:px-1 wa:rounded wa:text-white" style={{ background: '#ef4444', fontSize: 9, marginLeft: 8 }}>
                    {validationCount}
                  </span>
                )}
                {tab.id === 'requests' && (
                  <span style={{ color: '#64748b', marginLeft: 8 }}>
                    {snapshot.requests.length}
                  </span>
                )}
                {tab.id === 'websocket' && snapshot.wsLogs.length > 0 && (
                  <span style={{ color: '#64748b', marginLeft: 8 }}>
                    {snapshot.wsLogs.length}
                  </span>
                )}
              </button>
            ))}

            <div className="wa:flex-1" />

            {/* Export button */}
            <button
              data-testid="debug-export"
              onClick={handleExport}
              className="wa:px-3 wa:py-1 wa:border wa:rounded wa:cursor-pointer wa:mr-1 wa:transition-colors"
              style={{
                background: 'transparent',
                color: '#94a3b8',
                borderColor: '#475569',
                fontSize: 11,
              }}
            >
              Copy log
            </button>

            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="wa:px-3 wa:py-2 wa:border-none wa:cursor-pointer"
              style={{ background: 'transparent', color: '#94a3b8', fontSize: 14 }}
            >
              ×
            </button>
          </div>

          {/* Tab content */}
          <div className="wa:flex-1 wa:overflow-auto wa:p-2">
            {activeTab === 'health' && <DeviceHealthSection />}
            {activeTab === 'requests' && <RequestLoggerSection requests={snapshot.requests} />}
            {activeTab === 'websocket' && <WsLogsSection wsLogs={snapshot.wsLogs} />}
            {activeTab === 'validation' && <DataValidationSection requests={snapshot.requests} />}
            {activeTab === 'compare' && <ProviderComparisonSection requests={snapshot.requests} />}
            {activeTab === 'timeline' && <EventTimelineSection events={snapshot.events} />}
          </div>
        </div>
      )}
    </>
  );
}
