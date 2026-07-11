import React from "react";

type Props = {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
};

export default function Panel({ title, icon, children, bodyClassName = "" }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className={`panel-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
