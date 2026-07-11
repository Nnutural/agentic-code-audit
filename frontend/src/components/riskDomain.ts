import type { Finding } from "./types";

export type RiskDomainKey =
  | "source_code"
  | "supply_chain_config"
  | "dependency"
  | "secret"
  | "environment"
  | "weak_static"
  | "other";

export type RiskDomainGroup = {
  key: RiskDomainKey;
  label: string;
  description: string;
  defaultOpen: boolean;
  order: number;
};

const GROUPS: Record<RiskDomainKey, RiskDomainGroup> = {
  source_code: {
    key: "source_code",
    label: "Source Code Vulnerabilities",
    description: "与运行时相关的代码路径、解析流程、sink 以及 source-to-sink 证据。",
    defaultOpen: true,
    order: 0,
  },
  supply_chain_config: {
    key: "supply_chain_config",
    label: "Supply Chain Configuration",
    description: "CI、GitHub Actions、发布流程和仓库策略相关发现。",
    defaultOpen: false,
    order: 1,
  },
  dependency: {
    key: "dependency",
    label: "Dependency Risks",
    description: "包、版本、公告和依赖扫描器发现。",
    defaultOpen: false,
    order: 2,
  },
  secret: {
    key: "secret",
    label: "Secrets",
    description: "需要轮换或吊销的凭证、token 暴露发现。",
    defaultOpen: false,
    order: 3,
  },
  environment: {
    key: "environment",
    label: "Environment / Static Signals",
    description: "环境层风险和不适合作为动态 PoC 目标的弱静态信号。",
    defaultOpen: false,
    order: 4,
  },
  weak_static: {
    key: "weak_static",
    label: "Weak Static Leads",
    description: "保留供人工复核、但不提升到动态执行的低置信静态线索。",
    defaultOpen: false,
    order: 5,
  },
  other: {
    key: "other",
    label: "Other",
    description: "未能明确映射到更强风险域的发现。",
    defaultOpen: false,
    order: 6,
  },
};

export function riskDomainOf(finding: Finding): RiskDomainKey {
  const explicit = String(finding.risk_domain || "").toLowerCase();
  if (explicit in GROUPS) return explicit as RiskDomainKey;

  const type = String(finding.vulnerability_type || "").toLowerCase();
  const file = String(finding.file_path || "").replace(/\\/g, "/").toLowerCase();
  if (type.includes("supply_chain") || file.includes(".github/") || file.includes("dependabot")) {
    return "supply_chain_config";
  }
  if (type.includes("dependency") || type.includes("cve")) return "dependency";
  if (type.includes("secret") || type.includes("credential") || type.includes("token")) return "secret";
  if (type.includes("environment")) return "environment";
  if (finding.evidence_strength === "weak" && !finding.should_verify) return "weak_static";
  if (/\.(c|cc|cpp|cxx|h|hh|hpp|hxx|py|js|jsx|ts|tsx|go|rs|java|php|rb)$/.test(file)) {
    return "source_code";
  }
  return "other";
}

export function riskDomainGroup(key: RiskDomainKey): RiskDomainGroup {
  return GROUPS[key] || GROUPS.other;
}

export function orderedRiskGroups(findings: Finding[]): Array<RiskDomainGroup & { findings: Finding[] }> {
  const buckets = new Map<RiskDomainKey, Finding[]>();
  for (const finding of findings) {
    const key = riskDomainOf(finding);
    buckets.set(key, [...(buckets.get(key) || []), finding]);
  }
  return [...buckets.entries()]
    .map(([key, items]) => ({ ...riskDomainGroup(key), findings: items }))
    .sort((a, b) => a.order - b.order);
}
