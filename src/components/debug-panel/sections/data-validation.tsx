import type { RequestLogEntry } from '@/lib/debug/debug-store';

export function DataValidationSection({ requests }: { requests: RequestLogEntry[] }) {
  // Collect all validation issues from all requests
  const allIssues = requests.flatMap(r =>
    r.validationIssues.map(issue => ({
      ...issue,
      timestamp: r.timestamp,
      requestMethod: r.method,
      requestId: r.id,
    }))
  );

  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  return (
    <div data-testid="debug-validation-section" className="wa:space-y-3">
      {/* Summary */}
      <div className="wa:flex wa:gap-4 wa:px-2 wa:py-2">
        <div className="wa:flex wa:items-center wa:gap-1.5">
          <span className="wa:w-2 wa:h-2 wa:rounded-full" style={{ background: errors.length > 0 ? '#ef4444' : '#22c55e' }} />
          <span style={{ color: '#e2e8f0' }}>{errors.length} errors</span>
        </div>
        <div className="wa:flex wa:items-center wa:gap-1.5">
          <span className="wa:w-2 wa:h-2 wa:rounded-full" style={{ background: warnings.length > 0 ? '#f59e0b' : '#22c55e' }} />
          <span style={{ color: '#e2e8f0' }}>{warnings.length} warnings</span>
        </div>
      </div>

      {allIssues.length === 0 ? (
        <div className="wa:text-center wa:py-8" style={{ color: '#475569' }}>
          All responses pass validation checks
        </div>
      ) : (
        <div className="wa:space-y-1">
          {allIssues.map((issue, i) => (
            <div
              key={i}
              data-testid="debug-validation-issue"
              className="wa:px-3 wa:py-2 wa:rounded wa:flex wa:items-start wa:gap-2"
              style={{
                background: issue.severity === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              }}
            >
              <span style={{ color: issue.severity === 'error' ? '#ef4444' : '#f59e0b', flexShrink: 0 }}>
                {issue.severity === 'error' ? '✗' : '⚠'}
              </span>
              <div className="wa:flex-1">
                <div style={{ color: issue.severity === 'error' ? '#fca5a5' : '#fcd34d' }}>
                  {issue.message}
                </div>
                <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                  {issue.method} · {issue.deviceId} · {new Date(issue.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
