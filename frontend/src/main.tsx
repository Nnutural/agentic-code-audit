import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import Sidebar from "./components/Sidebar";
import Workspace from "./components/Workspace";
import type { Task, EventItem, Finding, ToolInfo, ProjectProfile, MiningDebug } from "./components/types";

const API = (import.meta as any).env?.VITE_API_BASE_URL || "";
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const PHASE_ORDER = ["InputAgent", "ReconAgent", "VulnerabilityMiningAgent", "VerificationAgent", "ReportAgent"];

function App() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [miningDebug, setMiningDebug] = useState<MiningDebug | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [report, setReport] = useState("");
  const [statusText, setStatusText] = useState("创建任务后进入历史记录，需手动点击开始。");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());

  /* ── Bootstrap ── */
  useEffect(() => {
    fetchJson("/api/health").then(setHealth).catch(() => setHealth(null));
    fetchJson("/api/tools").then(setTools).catch(() => setTools([]));
    refreshTasks();
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  /* ── SSE events ── */
  useEffect(() => {
    if (!task?.id || task.status !== "running") return;
    const stream = new EventSource(`${API}/api/tasks/${task.id}/events`);
    const append = (message: MessageEvent) => {
      const item = JSON.parse(message.data);
      if (item.sequence) {
        setEvents((prev) => (prev.some((e) => e.sequence === item.sequence) ? prev : [...prev, item]));
        setLastEventAt(Date.now());
      }
      loadTask(task.id);
      const termStatus = item.status && TERMINAL_STATUSES.has(String(item.status));
      const termEvent = ["task_completed", "task_cancelled", "error"].includes(String(item.event_type || ""));
      if (termStatus || termEvent) stream.close();
    };
    stream.onmessage = append;
    [
      "task_created", "task_started", "task_cancelled", "stage_start", "stage_done",
      "tool_start", "tool_end", "finding", "verification", "report", "error",
      "task_completed", "heartbeat",
    ].forEach((name) => stream.addEventListener(name, append));
    return () => stream.close();
  }, [task?.id, task?.status]);

  /* ── Data loading ── */
  async function refreshTasks() {
    const data = await fetchJson("/api/tasks");
    setTasks(data);
    return data;
  }

  async function loadTask(taskId: string) {
    const data = await fetchJson(`/api/tasks/${taskId}`);
    setTask(data);
    setFindings(data.findings || []);
    loadProfile(taskId);
    loadMiningDebug(taskId);
    if (data.status === "completed") {
      const text = await fetch(`${API}/api/tasks/${taskId}/report.md`).then((r) => (r.ok ? r.text() : ""));
      setReport(text);
    } else {
      setReport("");
    }
  }

  async function loadTaskWithEvents(taskId: string) {
    const [detail, eventData] = await Promise.all([
      fetchJson(`/api/tasks/${taskId}`),
      fetchJson(`/api/tasks/${taskId}/events/history`).catch(() => []),
    ]);
    setTask(detail);
    setFindings(detail.findings || []);
    setEvents(eventData);
    loadProfile(taskId);
    loadMiningDebug(taskId);
    setSelectedFinding(null);
    setLastEventAt(eventData.length ? Date.now() : null);
    if (detail.status === "completed") {
      const text = await fetch(`${API}/api/tasks/${taskId}/report.md`).then((r) => (r.ok ? r.text() : ""));
      setReport(text);
    } else {
      setReport("");
    }
  }

  async function loadProfile(taskId: string) {
    const data = await fetchJson(`/api/tasks/${taskId}/profile`).catch(() => null);
    setProfile(data);
  }

  async function loadMiningDebug(taskId: string) {
    const data = await fetchJson(`/api/tasks/${taskId}/mining-debug.json`).catch(() => null);
    setMiningDebug(data);
  }

  /* ── Actions ── */
  async function createTask(target: string, runtimeUrl: string, mode = "standard", enableNativeBuild = false) {
    setStatusText("正在创建任务...");
    const response = await fetch(`${API}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, mode, runtime_url: runtimeUrl, enable_native_build: enableNativeBuild }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "创建失败" }));
      setStatusText(String(err.detail || "创建失败"));
      return;
    }
    const data = await response.json();
    setStatusText("任务已创建，点击开始审计后运行。");
    await refreshTasks();
    await loadTaskWithEvents(data.task_id);
  }

  async function startSelectedTask() {
    if (!task) return;
    setStatusText("正在启动审计任务...");
    const response = await fetch(`${API}/api/tasks/${task.id}/start`, { method: "POST" });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "启动失败" }));
      setStatusText(String(err.detail || "启动失败"));
      return;
    }
    setEvents([]);
    setFindings([]);
    setMiningDebug(null);
    setReport("");
    setLastEventAt(Date.now());
    await refreshTasks();
    await loadTask(task.id);
  }

  async function stopSelectedTask() {
    if (!task) return;
    setStatusText("正在停止任务...");
    await fetch(`${API}/api/tasks/${task.id}/cancel`, { method: "POST" });
    await refreshTasks();
    await loadTask(task.id);
    setStatusText("任务已停止");
  }

  async function deleteHistoryTask(taskId: string, taskStatus: string) {
    if (taskStatus === "running") {
      setStatusText("运行中的任务需先停止再删除。");
      return;
    }
    if (!window.confirm("删除该历史任务？关联报告和 artifact 记录也会被清理。")) return;
    const response = await fetch(`${API}/api/tasks/${taskId}`, { method: "DELETE" });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "删除失败" }));
      setStatusText(String(err.detail || "删除失败"));
      return;
    }
    if (task?.id === taskId) {
      setTask(null); setEvents([]); setFindings([]);
      setSelectedFinding(null); setProfile(null); setMiningDebug(null); setReport("");
    }
    await refreshTasks();
    setStatusText("历史任务已删除");
  }

  async function openFindingDetail(finding: Finding) {
    if (!task) return;
    const detail = await fetchJson(`/api/tasks/${task.id}/findings/${finding.id}`);
    setSelectedFinding(detail);
  }

  /* ── Derived ── */
  const progress = useMemo(() => {
    if (!task) return { percent: 0, phase: "未选择任务", running: false, done: false, failed: false };
    if (task.status === "completed") return { percent: 100, phase: "审计完成", running: false, done: true, failed: false };
    if (task.status === "cancelled") return { percent: 0, phase: "已停止", running: false, done: false, failed: false };
    if (task.status === "failed") return { percent: 0, phase: "失败", running: false, done: false, failed: true };
    if (task.status === "queued") return { percent: 0, phase: "等待开始", running: false, done: false, failed: false };
    const latest = [...events].reverse().find((e) => PHASE_ORDER.includes(e.agent));
    const current = latest?.agent || "Orchestrator";
    const idx = Math.max(0, PHASE_ORDER.indexOf(current));
    const pct = Math.max(5, Math.round(((idx + 1) / PHASE_ORDER.length) * 100));
    return { percent: pct, phase: latest?.message || "运行中", running: true, done: false, failed: false };
  }, [task, events]);

  const liveHint = useMemo(() => {
    if (task?.status !== "running") return "";
    if (!lastEventAt) return "等待第一条事件...";
    const sec = Math.floor((clock - lastEventAt) / 1000);
    if (sec < 20) return "实时事件正常";
    return `已有 ${sec}s 无新事件，可能正在执行长耗时工具`;
  }, [task?.status, lastEventAt, clock]);

  return (
    <div className="shell">
      <Sidebar
        tasks={tasks}
        selectedTaskId={task?.id || null}
        statusText={statusText}
        onCreateTask={createTask}
        onSelectTask={loadTaskWithEvents}
        onDeleteTask={deleteHistoryTask}
      />
      <Workspace
        task={task}
        events={events}
        findings={findings}
        selectedFinding={selectedFinding}
        tools={tools}
        profile={profile}
        miningDebug={miningDebug}
        report={report}
        health={health}
        liveHint={liveHint}
        progressPercent={progress.percent}
        progressPhase={progress.phase}
        progressRunning={progress.running}
        progressDone={progress.done}
        progressFailed={progress.failed}
        onStartTask={startSelectedTask}
        onStopTask={stopSelectedTask}
        onSelectFinding={setSelectedFinding}
        onOpenFindingDetail={openFindingDetail}
      />
    </div>
  );
}

async function fetchJson(path: string) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

createRoot(document.getElementById("root")!).render(<App />);
