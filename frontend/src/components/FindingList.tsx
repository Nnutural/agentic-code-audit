import type { Finding } from "./types";
import { orderedRiskGroups } from "./riskDomain";
import { validationTags, verificationBadgeClass, verificationStatus } from "./verificationTags";

type Props = {
  findings: Finding[];
  onSelect: (finding: Finding) => void;
};

export default function FindingList({ findings, onSelect }: Props) {
  if (!findings.length) return <div className="empty-state">暂无漏洞发现。</div>;

  return (
    <div className="finding-list">
      {orderedRiskGroups(findings).map((group) => {
        const verifiedCount = group.findings.filter((f) => ["verified", "exploitable"].includes(verificationStatus(f))).length;
        const staticOnlyCount = group.findings.filter((f) => verificationStatus(f) === "static_only").length;
        return (
          <details key={group.key} className="finding-domain-group" open={group.defaultOpen}>
            <summary className="finding-domain-header">
              <div className="finding-domain-title">
                <strong>{group.label}</strong>
                <span>{group.description}</span>
              </div>
              <div className="finding-domain-metrics">
                <span className="badge badge-type">{group.findings.length}</span>
                <span className={verifiedCount ? "badge badge-verified" : "badge badge-unverified"}>
                  {verifiedCount} verified
                </span>
                {staticOnlyCount > 0 && <span className="badge badge-static">{staticOnlyCount} static</span>}
              </div>
            </summary>
            <div className="finding-domain-items">
              {group.findings.map((f) => {
                const vs = verificationStatus(f);
                return (
                  <button
                    key={f.id}
                    onClick={() => onSelect(f)}
                    className={`finding-card sev-${f.severity || "unknown"}`}
                  >
                    <div className="finding-card-badges">
                      <span className={`badge badge-sev-${f.severity || "unknown"}`}>{f.severity || "unknown"}</span>
                      <span className="badge badge-type">{f.vulnerability_type}</span>
                      <span className="badge badge-type">{f.evidence_strength || "weak"}</span>
                      <span className={`badge ${verificationBadgeClass(vs)}`}>{vs}</span>
                    </div>
                    <div className="finding-card-tags">
                      {validationTags(f.verification).slice(0, 4).map((tag, index) => (
                        <span key={`${tag.stage}-${index}`} className={`badge ${verificationBadgeClass(String(tag.status || ""))}`}>
                          {tag.label || tag.status}
                        </span>
                      ))}
                    </div>
                    <div className="finding-card-title">{f.title}</div>
                    <div className="finding-card-meta">
                      <span>{f.cwe || "CWE n/a"}</span>
                      <span>{f.file_path}:{f.line_start || ""}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
