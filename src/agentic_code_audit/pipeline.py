from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .config import Settings
from .agents.orchestrator import OrchestratorAgent
from .models import AuditReport
from .reporting import ReportWriter


@dataclass
class AuditArtifacts:
    report: AuditReport
    json_path: Path
    markdown_path: Path
    debug_path: Path


class AuditPipeline:
    def __init__(
        self,
        settings: Settings,
        event_sink: Callable[[str, str, str, dict[str, Any]], None] | None = None,
    ):
        self.settings = settings
        self.app_root = Path.cwd()
        self.orchestrator = OrchestratorAgent(settings, self.app_root, event_sink=event_sink)
        self.report_writer = ReportWriter()

    def run(
        self,
        target: str | Path,
        output_dir: Path,
        runtime_url: str = "",
        mode: str = "standard",
        enable_native_build: bool | None = None,
    ) -> AuditArtifacts:
        report = self.orchestrator.run(
            str(target),
            output_dir,
            runtime_url,
            mode=mode,
            enable_native_build=enable_native_build,
        )
        json_path, markdown_path = self.report_writer.write(report, output_dir)
        debug_path = output_dir / "mining-debug.json"
        debug_path.write_text(json.dumps(report.mining_debug, ensure_ascii=False, indent=2), encoding="utf-8")
        return AuditArtifacts(report=report, json_path=json_path, markdown_path=markdown_path, debug_path=debug_path)
