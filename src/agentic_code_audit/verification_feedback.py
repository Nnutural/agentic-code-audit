"""Verification feedback store — persist verification results per-target
so MiningDirector can adjust strategy on re-audits.

Stored as a simple JSON file: data/verification_feedback.json
"""

from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class VerificationFeedback:
    """One feedback record for a single finding."""

    finding_id: str = ""
    vulnerability_type: str = ""
    file_path: str = ""
    status: str = ""  # verified | partially_verified | not_reproducible | blocked | false_positive | uncertain
    verification_method: str = ""
    strategy: str = ""
    blocked_reason: str = ""
    runtime_type: str = ""
    environment_gaps: list[str] = field(default_factory=list)
    task_id: str = ""
    created_at: str = ""


class VerificationFeedbackStore:
    """JSON-file-based persistence of verification feedback, keyed by repo slug."""

    def __init__(self, data_dir: Path | None = None):
        if data_dir is None:
            self.data_dir = (Path.cwd() / "data").resolve()
        elif isinstance(data_dir, Path):
            self.data_dir = data_dir.resolve()
        else:
            self.data_dir = Path(data_dir).resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._path = self.data_dir / "verification_feedback.json"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load_for_target(self, target: str) -> list[dict[str, Any]]:
        """Return all historical feedback records for *target*."""
        key = self._repo_key(target)
        all_data = self._read_all()
        return all_data.get(key, [])

    def save_from_results(
        self,
        target: str,
        task_id: str,
        results: list[Any],  # list[VerificationResult]
    ) -> None:
        """Append feedback records derived from a finished verification run."""
        new_records: list[dict[str, Any]] = []
        for r in results:
            record = {
                "finding_id": getattr(r, "finding_id", ""),
                "vulnerability_type": getattr(r, "status", ""),  # stub — type comes from parent finding
                "file_path": "",
                "status": getattr(r, "status", "uncertain"),
                "verification_method": getattr(r, "verification_method", "") or getattr(r, "method", ""),
                "strategy": getattr(r, "strategy", ""),
                "blocked_reason": _blocked_reason(r),
                "runtime_type": getattr(r, "runtime_type", ""),
                "environment_gaps": list(getattr(r, "environment_gaps", []) or []),
                "task_id": task_id,
                "created_at": getattr(r, "created_at", "") or "",
            }
            new_records.append(record)
        if not new_records:
            return
        key = self._repo_key(target)
        all_data = self._read_all()
        existing = all_data.get(key, [])
        # Keep last 50 records per repo to avoid unbounded growth
        existing = (existing + new_records)[-50:]
        all_data[key] = existing
        self._write_all(all_data)

    def summary_for_target(self, target: str) -> dict[str, Any]:
        """Return a compact summary useful for MiningDirector prompt."""
        records = self.load_for_target(target)
        if not records:
            return {"has_history": False}
        status_counts: dict[str, int] = {}
        blocked_reasons: list[str] = []
        for r in records:
            st = r.get("status", "uncertain")
            status_counts[st] = status_counts.get(st, 0) + 1
            if r.get("blocked_reason"):
                blocked_reasons.append(r["blocked_reason"])
        return {
            "has_history": True,
            "total_runs": len({r.get("task_id") for r in records if r.get("task_id")}),
            "total_findings": len(records),
            "status_counts": status_counts,
            "top_blocked_reasons": list(dict.fromkeys(blocked_reasons))[:5],
            "last_run": records[-1] if records else None,
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _repo_key(target: str) -> str:
        """Derive a stable key from the target identifier."""
        normalized = target.strip().lower().rstrip("/")
        # For git URLs, use the repo name
        if "github.com" in normalized or normalized.count("/") >= 1 and not Path(target).exists():
            parts = normalized.replace("https://", "").replace("http://", "").replace("git@", "").split("/")
            if len(parts) >= 2:
                return f"{parts[-2]}/{parts[-1].replace('.git', '')}"
        return hashlib.sha256(normalized.encode()).hexdigest()[:12]

    def _read_all(self) -> dict[str, Any]:
        if not self._path.exists():
            return {}
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def _write_all(self, data: dict[str, Any]) -> None:
        self._path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _blocked_reason(result: Any) -> str:
    """Extract a human-readable blocked reason from a VerificationResult."""
    status = getattr(result, "status", "")
    if status != "blocked":
        return ""
    # Try environment gaps first
    gaps = getattr(result, "environment_gaps", None) or []
    if gaps:
        return f"environment_gaps: {', '.join(str(g) for g in gaps[:3])}"
    # Try checker summary
    summary = getattr(result, "checker_summary", "") or getattr(result, "summary", "")
    if summary:
        return str(summary)[:200]
    return status
