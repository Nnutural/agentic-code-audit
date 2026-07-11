"""Mining debug report generator — produces mining-debug.json from MiningResult."""

from __future__ import annotations

from collections import Counter
from typing import Any


def generate_mining_debug(mining_result: Any) -> dict[str, Any]:
    """Build a comprehensive debug report from a MiningResult."""

    # --- tool anchors ---
    tool_anchor_count: dict[str, int] = Counter()
    anchor_domain_count: dict[str, int] = Counter()
    for df in (mining_result.dangerous_functions or []):
        tool_anchor_count[str(getattr(df, "tool", "unknown"))] += 1
        anchor_domain_count[str(getattr(df, "risk_domain", "") or getattr(df, "anchor_category", "") or "unknown")] += 1

    # --- dangerous function kinds ---
    kind_count: dict[str, int] = Counter()
    for df in (mining_result.dangerous_functions or []):
        kind_count[str(getattr(df, "kind", "unknown"))] += 1

    # --- slice counts by language ---
    slice_lang_count: dict[str, int] = Counter()
    for sl in (mining_result.program_slices or []):
        fp = str(getattr(sl, "file_path", ""))
        suffix = fp.rsplit(".", 1)[-1] if "." in fp else "unknown"
        lang = {
            "py": "Python", "js": "JavaScript", "jsx": "JavaScript",
            "ts": "TypeScript", "tsx": "TypeScript",
            "c": "C", "cc": "C++", "cpp": "C++", "cxx": "C++",
            "h": "C/C++", "hpp": "C/C++", "go": "Go", "rs": "Rust",
        }.get(suffix.lower(), suffix)
        slice_lang_count[lang] += 1

    # --- candidate validity ---
    valid_count = 0
    invalid_count = 0
    invalid_reasons: dict[str, int] = Counter()
    candidate_source_count: dict[str, int] = Counter()
    candidate_domain_count: dict[str, int] = Counter()
    for c in (mining_result.candidates or []):
        if getattr(c, "valid", True) and getattr(c, "validity", "valid") == "valid":
            valid_count += 1
        else:
            invalid_count += 1
            reason = getattr(c, "invalid_reason", "") or getattr(c, "validity", "")
            if reason:
                for part in reason.split(";"):
                    part = part.strip()
                    if part:
                        invalid_reasons[part] += 1
        src = getattr(c, "candidate_source", "unknown")
        candidate_source_count[src] += 1
        domain = getattr(c, "risk_domain", "") or "unknown"
        candidate_domain_count[str(domain)] += 1

    # --- finding distribution ---
    finding_type_count: dict[str, int] = Counter()
    finding_domain_count: dict[str, int] = Counter()
    finding_severity_count: dict[str, int] = Counter()
    verification_queue = 0
    for f in (mining_result.findings or []):
        t = str(getattr(f, "vulnerability_type", "unknown"))
        finding_type_count[t] += 1
        d = str(getattr(f, "risk_domain", "unknown"))
        finding_domain_count[d] += 1
        s = str(getattr(f, "severity", "unknown"))
        finding_severity_count[s] += 1
        if getattr(f, "should_verify", False):
            verification_queue += 1

    # --- strategy ---
    strategy_data = mining_result.strategy if hasattr(mining_result, "strategy") else None
    strategy_data = strategy_data or {}
    exploration_log = strategy_data.get("exploration_log", []) if isinstance(strategy_data, dict) else []
    strategy_effects = getattr(mining_result, "strategy_effects", {}) or (
        strategy_data.get("strategy_effects", {}) if isinstance(strategy_data, dict) else {}
    )

    return {
        "tool_anchor_count_by_tool": dict(tool_anchor_count.most_common()),
        "anchor_count_by_risk_domain": dict(anchor_domain_count.most_common()),
        "dangerous_function_count_by_kind": dict(kind_count.most_common()),
        "slice_count_by_language": dict(slice_lang_count.most_common()),
        "candidate_validity_breakdown": {
            "total": valid_count + invalid_count,
            "valid": valid_count,
            "invalid": invalid_count,
        },
        "invalid_candidate_reasons": dict(invalid_reasons.most_common()),
        "candidate_source_distribution": dict(candidate_source_count.most_common()),
        "candidate_count_by_risk_domain": dict(candidate_domain_count.most_common()),
        "aggregation_input_count": len(mining_result.candidates or []),
        "aggregation_output_count": len(mining_result.aggregated_candidates or []),
        "finding_count_by_type": dict(finding_type_count.most_common()),
        "finding_count_by_risk_domain": dict(finding_domain_count.most_common()),
        "finding_severity_distribution": dict(finding_severity_count.most_common()),
        "verification_queue_count": verification_queue,
        "mining_director_strategy": strategy_data,
        "initial_strategy": strategy_data.get("initial_strategy", {}) if isinstance(strategy_data, dict) else {},
        "validated_strategy": strategy_data if isinstance(strategy_data, dict) else {},
        "rejected_strategy_items": strategy_data.get("rejected_strategy_items", []) if isinstance(strategy_data, dict) else [],
        "strategy_effects": strategy_effects,
        "exploration_log_summary": [
            {
                "tool": item.get("tool", ""),
                "success": item.get("success", False),
                "summary": item.get("summary", ""),
            }
            for item in exploration_log[:20]
            if isinstance(item, dict)
        ],
        "feedback_used": strategy_data.get("feedback_used", []) if isinstance(strategy_data, dict) else [],
        "budget": getattr(mining_result, "budget", {}) or {},
        "budget_usage": getattr(mining_result, "budget_usage", {}) or {},
    }
