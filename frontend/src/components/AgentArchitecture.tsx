import { Boxes, FileSearch, GitBranch, ScanSearch, ShieldCheck } from "lucide-react";

const AGENTS = [
  { name: "InputAgent", icon: FileSearch, color: "input", desc: "目标解析" },
  { name: "ReconAgent", icon: ScanSearch, color: "recon", desc: "项目画像" },
  { name: "MiningAgent", icon: Boxes, color: "mining", desc: "漏洞挖掘", substeps: true },
  { name: "VerifyAgent", icon: ShieldCheck, color: "verify", desc: "验证&PoC" },
  { name: "ReportAgent", icon: GitBranch, color: "report", desc: "报告生成" },
];

const MINING_STEPS = [
  "工具调用", "危险函数定位", "切片分析",
  "候选生成", "线索汇聚", "类型判定",
];

export default function AgentArchitecture() {
  return (
    <div className="agent-pipeline">
      {AGENTS.map((agent, i) => (
        <React.Fragment key={agent.name}>
          {i > 0 && <div className="agent-arrow">→</div>}
          <div className="agent-node">
            <div className={`icon-circle ${agent.color}`}>
              <agent.icon size={16} />
            </div>
            <div className="agent-node-name">{agent.name}</div>
            <div className="agent-node-desc">{agent.desc}</div>
            {agent.substeps && (
              <div className="mining-substeps">
                {MINING_STEPS.map((s) => (
                  <span key={s} className="mining-substep">{s}</span>
                ))}
              </div>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

import React from "react";
