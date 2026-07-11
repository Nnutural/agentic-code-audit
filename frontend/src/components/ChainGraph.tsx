import React from "react";
import type { ChainGraph as ChainGraphType } from "./types";

type Props = { graph?: ChainGraphType };

export default function ChainGraphView({ graph }: Props) {
  if (!graph?.nodes?.length) return <div className="empty-state">暂无链路图。</div>;

  return (
    <div className="chain-graph">
      {graph.nodes.map((node, i) => (
        <React.Fragment key={node.id}>
          {i > 0 && <div className="chain-node-arrow">→</div>}
          <div className={`chain-node ${node.type}`}>
            <div className="chain-node-label">{node.label}</div>
            <div className="chain-node-type">{node.type}</div>
            {node.detail && <div className="chain-node-file" title={node.detail}>{node.detail}</div>}
            <div className="chain-node-file">{node.file_path}:{node.line || ""}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
