import type { EventItem } from "./types";

type Props = { events: EventItem[] };

export default function EventLog({ events }: Props) {
  if (!events.length) return <div className="empty-state">暂无事件。创建任务后点击开始审计。</div>;

  return (
    <div className="event-list">
      {events.map((item) => (
        <div className={`event-item event-${item.event_type}`} key={`${item.sequence}-${item.created_at}`}>
          <span className="event-seq">#{item.sequence}</span>
          <div className="event-content">
            <span className="event-agent">{item.agent}</span>
            <span className="event-msg" title={item.message}>{item.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
