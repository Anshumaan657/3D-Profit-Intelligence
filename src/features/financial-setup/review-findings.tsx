import { useState } from "react";
import type { SetupIssue } from "@/core/financial/validation";

export function ReviewFindings({ issues, onSelect }: { issues: SetupIssue[]; onSelect: (issue: SetupIssue) => void }) {
  const [requestedPage, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(issues.length / 100));
  const page = Math.min(requestedPage, pageCount - 1);
  const sorted = [...issues].sort((a, b) => ["error", "missing", "warning"].indexOf(a.level) - ["error", "missing", "warning"].indexOf(b.level));
  return <details className="mt-5">
    <summary className="cursor-pointer text-sm font-semibold">All review findings ({issues.length})</summary>
    <ul className="mt-3 max-h-96 space-y-2 overflow-auto">
      {sorted.slice(page * 100, (page + 1) * 100).map((issue, index) => <li key={`${page}-${index}`}>
        <button className="setup-findings w-full text-left" onClick={() => onSelect(issue)}><span className="font-semibold capitalize">{issue.level} · {issue.section}</span><br />{issue.message}</button>
      </li>)}
    </ul>
    <div className="mt-3 flex items-center gap-3 text-xs">
      <button className="setup-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous findings</button>
      <span>Page {page + 1} of {pageCount}</span>
      <button className="setup-secondary" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next findings</button>
    </div>
  </details>;
}
