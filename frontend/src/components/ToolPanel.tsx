import type { ToolInfo } from "./types";

type Props = { tools: ToolInfo[] };

export default function ToolPanel({ tools }: Props) {
  if (!tools.length) return <div className="empty-state">暂无工具状态。</div>;

  const groups = tools.reduce<Record<string, ToolInfo[]>>((acc, t) => {
    (acc[t.capability] ||= []).push(t);
    return acc;
  }, {});
  const capabilities = Object.keys(groups).sort();

  return (
    <div>
      {capabilities.map((cap) => {
        const items = groups[cap].sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name));
        const avail = items.filter((i) => i.available).length;
        return (
          <div className="tool-capability" key={cap}>
            <div className="tool-capability-header">
              <strong>{cap}</strong>
              <span>{avail}/{items.length}</span>
            </div>
            <div className="tool-capability-items">
              {items.map((t) => (
                <div className="tool-row" key={t.name}>
                  <div className={`health-dot ${t.available ? "ok" : "missing"}`} />
                  <span className="tool-row-name">{t.name}</span>
                  <span className="tool-row-version" title={t.version}>
                    {t.available ? t.version || "available" : t.reason || "unavailable"}
                  </span>
                  <span className="tool-badge env" title={`${t.container || ""} ${t.network_policy || ""}`.trim()}>
                    {t.execution_location || "backend"}
                  </span>
                  <span className={`tool-badge ${t.required ? "req" : "opt"}`}>
                    {t.required ? "必须" : "可选"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
