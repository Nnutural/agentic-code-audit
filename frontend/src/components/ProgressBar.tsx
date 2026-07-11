import { Loader2 } from "lucide-react";

type Props = {
  percent: number;
  phase: string;
  hint: string;
  isRunning: boolean;
  isDone: boolean;
  isFailed: boolean;
};

export default function ProgressBar({ percent, phase, hint, isRunning, isDone, isFailed }: Props) {
  let fillClass = "";
  if (isFailed) fillClass = "failed";
  else if (isDone) fillClass = "done";
  else if (isRunning) fillClass = "running";

  return (
    <div className="progress-section">
      <div className="progress-card">
        <div className="progress-header">
          <div className="progress-phase">{phase}</div>
          <div className="progress-hint">
            {isRunning && <Loader2 size={14} className="spin" />}
            {hint}
          </div>
        </div>
        <div className="progress-track">
          <div className={`progress-fill ${fillClass}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
