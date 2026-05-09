import type { CveReport, CveEntry } from '@/api/weaponization'

interface Props {
  report: CveReport
}

const SEV_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-900/20 border border-red-800',
  high:     'text-orange-400 bg-orange-900/20 border border-orange-800',
  medium:   'text-yellow-400 bg-yellow-900/20 border border-yellow-800',
  low:      'text-slate-400 bg-slate-800 border border-slate-700',
  unknown:  'text-slate-500 bg-slate-800 border border-slate-700',
}

function CveCard({ cve }: { cve: CveEntry }) {
  return (
    <div className="bg-slate-800 rounded border border-slate-700 p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-cyan-400">{cve.cve_id}</span>
        <div className="flex items-center gap-2">
          {cve.cvss_score != null && (
            <span className="text-xs text-slate-300 font-mono">CVSS {cve.cvss_score}</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded font-medium uppercase ${SEV_COLORS[cve.severity] ?? SEV_COLORS.unknown}`}>
            {cve.severity}
          </span>
        </div>
      </div>
      <p className="text-sm text-slate-300 leading-snug">{cve.description}</p>
      <p className="text-xs text-slate-500">{cve.published}</p>
    </div>
  )
}

export function CVEReport({ report }: Props) {
  const techEntries = Object.entries(report.by_technology).filter(([, cves]) => cves.length > 0)

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total CVEs',    value: report.total_cves,    color: 'text-white' },
          { label: 'Critical',      value: report.critical_count, color: 'text-red-400' },
          { label: 'High',          value: report.high_count,     color: 'text-orange-400' },
          { label: 'Technologies',  value: techEntries.length,    color: 'text-slate-300' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded border border-slate-700 p-3 text-center">
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Per-technology CVE lists */}
      {techEntries.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">No CVEs found for the detected tech stack.</p>
      ) : (
        techEntries.map(([tech, cves]) => (
          <div key={tech}>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2 flex items-center gap-2">
              <span>{tech}</span>
              <span className="text-xs text-slate-500 normal-case font-normal">{cves.length} CVE{cves.length !== 1 ? 's' : ''}</span>
            </h3>
            <div className="space-y-2">
              {cves.map(cve => <CveCard key={cve.cve_id} cve={cve} />)}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
