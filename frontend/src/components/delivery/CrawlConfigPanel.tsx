interface Props {
  seedUrls: string[]
  includePatterns: string[]
  excludePatterns: string[]
  maxDepth: number
  maxPages: number
  renderJs: boolean
  customHeaders: Record<string, string>
  editable: boolean
  onChange: (field: string, value: unknown) => void
}

function TextareaList({
  label, hint, value, disabled, placeholder, onChange,
}: {
  label: string; hint?: string; value: string[]; disabled: boolean
  placeholder: string; onChange: (v: string[]) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <textarea
        value={value.join('\n')}
        disabled={disabled}
        onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        rows={3}
        placeholder={placeholder}
        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 disabled:opacity-50 resize-none"
      />
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

export function CrawlConfigPanel({
  seedUrls, includePatterns, excludePatterns, maxDepth, maxPages, renderJs,
  customHeaders, editable, onChange,
}: Props) {
  const headerLines = Object.entries(customHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')

  const parseHeaders = (raw: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const idx = line.indexOf(':')
      if (idx > 0) {
        result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
    }
    return result
  }

  return (
    <div className="space-y-5">
      <TextareaList
        label="Seed URLs (one per line)"
        hint="Starting URLs for the crawler. Defaults to the target domain root."
        value={seedUrls}
        disabled={!editable}
        placeholder="https://target.com/&#10;https://target.com/app/"
        onChange={v => onChange('seed_urls', v)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TextareaList
          label="Include Patterns (regex)"
          hint="Only crawl URLs matching any pattern. Leave empty to include all."
          value={includePatterns}
          disabled={!editable}
          placeholder="^https://target\.com/app/.*"
          onChange={v => onChange('include_patterns', v)}
        />
        <TextareaList
          label="Exclude Patterns (regex)"
          hint="Skip URLs matching any pattern."
          value={excludePatterns}
          disabled={!editable}
          placeholder="logout|\.pdf$|\.zip$"
          onChange={v => onChange('exclude_patterns', v)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Max Depth</label>
          <input
            type="number" min={1} max={20}
            value={maxDepth}
            disabled={!editable}
            onChange={e => onChange('max_depth', parseInt(e.target.value, 10) || 5)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Max Pages</label>
          <input
            type="number" min={10} max={5000}
            value={maxPages}
            disabled={!editable}
            onChange={e => onChange('max_pages', parseInt(e.target.value, 10) || 500)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Options</label>
          <label className={`flex items-center gap-2 cursor-pointer ${!editable ? 'opacity-50 cursor-default' : ''}`}>
            <div
              onClick={() => editable && onChange('render_js', !renderJs)}
              className={`w-9 h-5 rounded-full transition-colors relative ${renderJs ? 'bg-cyan-600' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${renderJs ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-slate-300">JS Rendering</span>
          </label>
          <p className="text-xs text-slate-500 mt-1">Uses Katana/Playwright (slower)</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
          Custom Headers (one per line, format: Name: Value)
        </label>
        <textarea
          value={headerLines}
          disabled={!editable}
          onChange={e => onChange('custom_headers', parseHeaders(e.target.value))}
          rows={3}
          placeholder="X-Forwarded-For: 127.0.0.1&#10;X-Custom-Token: abc123"
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-600 disabled:opacity-50 resize-none"
        />
      </div>
    </div>
  )
}
