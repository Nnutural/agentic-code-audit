import type { ProjectProfile, ProfileEntry } from "./types";

type Props = { profile: ProjectProfile | null };

export default function ProfilePanel({ profile }: Props) {
  if (!profile) return <div className="empty-state">画像将在 ReconAgent 完成后生成。</div>;

  const langs = Object.entries(profile.languages || {})
    .map(([k, v]) => `${k}:${v}`)
    .join(", ") || "unknown";

  return (
    <div className="profile-grid">
      <div className="profile-row"><span>项目类型</span><span>{profile.project_type || "unknown"}</span></div>
      <div className="profile-row"><span>语言</span><span>{langs}</span></div>
      <div className="profile-row"><span>框架</span><span>{(profile.frameworks || []).join(", ") || "none"}</span></div>

      <EntrySection title="构建入口" entries={profile.build_entries || []} />
      <EntrySection title="运行入口" entries={profile.runtime_entries || []} />
      <EntrySection title="测试入口" entries={profile.test_entries || []} />
      <EntrySection title="验证入口" entries={profile.verification_entries || []} />

      <TagSection title="弱化验证策略" tags={profile.weak_verification_strategies || []} />
      <TagSection title="不可运行原因" tags={profile.non_runnable_reasons || []} />
      <TagSection title="攻击优先级" tags={profile.attack_priorities || []} />
      <TagSection title="验证提示" tags={profile.verification_hints || []} />

      <RecommendedTools details={profile.recommended_tool_details || []} />
      <DepFindings items={profile.dependency_findings_summary || []} />
    </div>
  );
}

function EntrySection({ title, entries }: { title: string; entries: ProfileEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="profile-section">
      <h4>{title}</h4>
      {entries.slice(0, 5).map((e, i) => (
        <div className="profile-entry" key={`${title}-${i}`}>
          <strong>{e.kind}</strong>
          <span>{e.file}</span>
          {e.command && <code>{e.command}</code>}
        </div>
      ))}
    </div>
  );
}

function TagSection({ title, tags }: { title: string; tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="profile-section">
      <h4>{title}</h4>
      <div className="profile-tags">
        {tags.map((t) => <span key={t} className="profile-tag">{t}</span>)}
      </div>
    </div>
  );
}

function RecommendedTools({ details }: { details: Array<Record<string, unknown>> }) {
  if (!details.length) return null;
  return (
    <div className="profile-section">
      <h4>推荐工具</h4>
      {details.slice(0, 8).map((item, i) => (
        <div className="profile-entry" key={`rt-${i}`}>
          <strong>{String(item.name || "?")}</strong>
          <span>{String(item.reason || item.capability || "")}</span>
          <code>{String(item.intended_phase || "")} · {String(item.available ?? "?")}</code>
        </div>
      ))}
    </div>
  );
}

function DepFindings({ items }: { items: Array<Record<string, unknown>> }) {
  if (!items.length) return null;
  return (
    <div className="profile-section">
      <h4>依赖风险摘要</h4>
      {items.slice(0, 6).map((item, i) => (
        <div className="profile-entry" key={`dep-${i}`}>
          <strong>{String(item.package || item.id || item.name || `#${i + 1}`)}</strong>
          <span>{String(item.summary || item.reason || item.status || "")}</span>
        </div>
      ))}
    </div>
  );
}
