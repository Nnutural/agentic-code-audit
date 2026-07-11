import type { Finding, ValidationTag, VerificationInfo } from "./types";

export function verificationStatus(finding: Finding): string {
  return String(finding.verification?.status || "not_verified");
}

export function verificationBadgeClass(status: string): string {
  if (["verified", "exploitable"].includes(status)) return "badge-verified";
  if (["harness_reproduced", "partial_dynamic_proof", "partially_verified"].includes(status)) return "badge-partial";
  if (status === "blocked") return "badge-blocked";
  if (["not_reproducible", "false_positive", "rejected"].includes(status)) return "badge-false";
  if (status === "static_only") return "badge-static";
  return "badge-unverified";
}

export function validationTags(verification?: VerificationInfo | null): ValidationTag[] {
  if (!verification) return [{ stage: "dynamic", status: "not_run", label: "未验证" }];
  const explicit = verification.validation_tags || [];
  if (explicit.length) return explicit.map((tag) => ({ ...tag, label: tag.label || tag.status || "unknown" }));

  const tags: ValidationTag[] = [];
  const staticStage = (verification.static_verification || {}) as Record<string, unknown>;
  const dynamicStage = (verification.dynamic_verification || {}) as Record<string, unknown>;
  const checkerStage = (verification.checker_verdict || verification.checker_details || {}) as Record<string, unknown>;
  const staticStatus = String(staticStage.static_status || verification.analysis_verdict || "unknown");
  if (staticStatus === "plausible") tags.push({ stage: "static", status: "passed", label: "静态通过" });
  else if (staticStatus === "weak_static_proof") tags.push({ stage: "static", status: "weak", label: "静态较弱" });
  else tags.push({ stage: "static", status: staticStatus, label: `静态: ${staticStatus}` });

  const status = String(verification.status || "not_verified");
  const blocked = String(verification.blocked_reason || dynamicStage.blocked_reason || checkerStage.blocked_reason || "");
  if (status === "verified") tags.push({ stage: "dynamic", status, label: "动态: verified" });
  else if (status === "harness_reproduced") tags.push({ stage: "dynamic", status, label: "动态: harness reproduced" });
  else if (status === "partial_dynamic_proof") tags.push({ stage: "dynamic", status, label: "局部 proof" });
  else if (blocked) tags.push({ stage: "dynamic", status: "blocked", label: blocked.includes("build") ? "构建失败" : `动态阻塞: ${blocked}`, reason: blocked });
  else tags.push({ stage: "dynamic", status: verification.dynamic_attempted ? "attempted" : "not_run", label: verification.dynamic_attempted ? "动态已执行" : "动态未执行" });

  const checker = String((checkerStage.details as Record<string, unknown> | undefined)?.checker || checkerStage.checker || verification.checker_details?.checker || "Checker");
  if (["verified", "harness_reproduced", "partial_dynamic_proof", "partially_verified"].includes(status)) {
    tags.push({ stage: "checker", status: "passed", label: "Checker 命中", checker });
  } else if (status === "blocked") {
    tags.push({ stage: "checker", status: "blocked", label: "Checker 阻塞", checker });
  } else {
    tags.push({ stage: "checker", status: "unknown", label: "Checker 未运行", checker });
  }
  return tags;
}
