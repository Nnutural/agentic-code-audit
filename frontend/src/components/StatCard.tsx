import React from "react";

type Props = {
  label: string;
  value: string;
  icon: React.ReactNode;
  color?: "default" | "primary" | "success" | "warning" | "danger";
};

const COLOR_MAP = {
  default: { bg: "#f1f5f9", fg: "#64748b" },
  primary: { bg: "#eef2ff", fg: "#6366f1" },
  success: { bg: "#ecfdf5", fg: "#10b981" },
  warning: { bg: "#fffbeb", fg: "#f59e0b" },
  danger: { bg: "#fef2f2", fg: "#ef4444" },
};

export default function StatCard({ label, value, icon, color = "default" }: Props) {
  const c = COLOR_MAP[color];
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: c.bg, color: c.fg }}>
        {icon}
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
