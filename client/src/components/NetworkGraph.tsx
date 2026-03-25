import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { TransactionGraph } from '@/lib/api';
import { getRiskColorHex } from '@/lib/utils';
import { Maximize2, RotateCcw } from 'lucide-react';

interface NetworkGraphProps {
  data: TransactionGraph;
  selectedGstin: string | null;
  onNodeClick: (gstin: string) => void;
  highlightRingIds: string[] | null;
}

// Compute node radius based on total transaction value
function nodeRadius(d: any): number {
  const base = Math.max(7, Math.min(22, Math.log10(d.totalValue || 1000) * 1.5));
  return d.isInFraudRing ? base + 5 : base;
}

export function NetworkGraph({ data, selectedGstin, onNodeClick, highlightRingIds }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const resetView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const w = containerRef.current?.clientWidth ?? 800;
    const h = containerRef.current?.clientHeight ?? 600;
    d3.select(svgRef.current)
      .transition().duration(600)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(w / 2, h / 2).scale(0.75).translate(-w / 2, -h / 2));
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    // Glow filter for fraud ring nodes
    const glowFilter = defs.append("filter")
      .attr("id", "fraud-glow")
      .attr("x", "-60%").attr("y", "-60%")
      .attr("width", "220%").attr("height", "220%");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "coloredBlur");
    const feMerge = glowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Arrow markers
    const makeArrow = (id: string, color: string) => {
      defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -4 8 8")
        .attr("refX", 8)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4Z")
        .attr("fill", color);
    };
    makeArrow("arrow-normal", "#475569");
    makeArrow("arrow-ring", "#e11d48");
    makeArrow("arrow-highlight", "#fb7185");

    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on("zoom", (event) => { g.attr("transform", event.transform); });
    svg.call(zoom);
    zoomRef.current = zoom;

    // Deep copy data
    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.edges.map(d => ({ ...d, source: d.source, target: d.target }));

    // Categorise links for visual weight
    const isHighlighted = (d: any) => highlightRingIds && highlightRingIds.includes(d.id);

    // Force simulation — conservative charge so no nodes fly off the canvas
    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id)
        .distance((d: any) => d.isInFraudRing ? 75 : 50)
        .strength((d: any) => d.isInFraudRing ? 0.6 : 0.15))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(width / 2, height / 2))
      // Weak restoring forces that gently pull every node back toward the viewport centre
      .force("x", d3.forceX(width / 2).strength(0.06))
      .force("y", d3.forceY(height / 2).strength(0.06))
      .force("collide", d3.forceCollide().radius((d: any) => nodeRadius(d) + 5))
      .alphaDecay(0.025);

    // ── Draw layers in z-order: links → nodes → labels ──

    // Non-ring links (drawn first, very faint)
    const linkNormal = g.append("g")
      .attr("class", "links-normal")
      .selectAll("line")
      .data(links.filter((d: any) => !d.isInFraudRing))
      .join("line")
      .attr("stroke", "#334155")
      .attr("stroke-opacity", 0.18)
      .attr("stroke-width", 0.7)
      .attr("marker-end", "url(#arrow-normal)");

    // Fraud-ring links (drawn on top, vivid red)
    const linkRing = g.append("g")
      .attr("class", "links-ring")
      .selectAll("line")
      .data(links.filter((d: any) => d.isInFraudRing))
      .join("line")
      .attr("stroke", (d: any) => isHighlighted(d) ? "#fb7185" : "#e11d48")
      .attr("stroke-opacity", 1)
      .attr("stroke-width", (d: any) => isHighlighted(d) ? 3.5 : 2.5)
      .attr("marker-end", (d: any) => isHighlighted(d) ? "url(#arrow-highlight)" : "url(#arrow-ring)");

    // Nodes
    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => nodeRadius(d))
      .attr("fill", (d: any) => d.isInFraudRing ? "#e11d48" : getRiskColorHex(d.riskLevel))
      .attr("stroke", (d: any) => {
        if (d.id === selectedGstin) return "#ffffff";
        if (d.isInFraudRing) return "#fb7185";
        return "#1e293b";
      })
      .attr("stroke-width", (d: any) => d.id === selectedGstin ? 3.5 : (d.isInFraudRing ? 2 : 1.5))
      .attr("filter", (d: any) => d.isInFraudRing ? "url(#fraud-glow)" : null)
      .attr("cursor", "pointer")
      .attr("data-gstin", (d: any) => d.id)
      .attr("data-risk", (d: any) => d.riskLevel)
      .call(drag(simulation) as any);

    // Permanent labels for fraud ring nodes
    const ringLabel = g.append("g")
      .attr("class", "labels-ring")
      .selectAll("text")
      .data(nodes.filter((d: any) => d.isInFraudRing))
      .join("text")
      .text((d: any) => (d.label as string).split(' ')[0])
      .attr("font-size", "9px")
      .attr("fill", "#fda4af")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")
      .attr("dy", (d: any) => -(nodeRadius(d) + 4));

    // Tooltip div
    const tooltip = d3.select(tooltipRef.current);

    // Hover on normal nodes: show tooltip, dim unrelated
    node.on("mouseover", (event, d: any) => {
      tooltip.transition().duration(150).style("opacity", 1);
      tooltip.html(`
        <div style="font-weight:700;margin-bottom:4px">${d.label}</div>
        <div style="font-size:11px;color:#94a3b8">GSTIN: <span style="color:#e2e8f0;font-family:monospace">${d.id}</span></div>
        <div style="font-size:11px;color:#94a3b8">Fraud Score: <span style="font-weight:700;color:${getRiskColorHex(d.riskLevel)}">${d.fraudScore}</span></div>
        <div style="font-size:11px;color:#94a3b8">Risk: <span style="color:#e2e8f0">${d.riskLevel}</span>${d.isInFraudRing ? ' <span style="color:#e11d48">⬡ In Fraud Ring</span>' : ''}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">Txn Value: ₹${(d.totalValue/1e5).toFixed(1)}L</div>
      `)
        .style("left", (event.pageX + 12) + "px")
        .style("top", (event.pageY - 36) + "px");

      if (!highlightRingIds?.length) {
        linkNormal.style("stroke-opacity", (l: any) =>
          (l.source.id === d.id || l.target.id === d.id) ? 0.6 : 0.05);
        linkRing.style("stroke-opacity", (l: any) =>
          (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.3);
        node.style("opacity", (n: any) => {
          const isConn = links.some((l: any) =>
            (l.source.id === d.id && l.target.id === n.id) ||
            (l.target.id === d.id && l.source.id === n.id));
          return (n.id === d.id || isConn) ? 1 : 0.25;
        });
      }
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 12) + "px")
        .style("top", (event.pageY - 36) + "px");
    })
    .on("mouseout", () => {
      tooltip.transition().duration(300).style("opacity", 0);
      if (!highlightRingIds?.length) {
        linkNormal.style("stroke-opacity", 0.18);
        linkRing.style("stroke-opacity", 1);
        node.style("opacity", 1);
      }
    });

    node.on("click", (event, d: any) => {
      onNodeClick(d.id);
      event.stopPropagation();
    });

    svg.on("click", () => { onNodeClick(""); });

    // ── Simulation tick: offset endpoints so arrowheads sit at node edges ──
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const updatePositions = (sel: any) => {
      sel
        .attr("x1", (d: any) => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = nodeRadius(d.source);
          return clamp(d.source.x + (dx / dist) * r, 8, width - 8);
        })
        .attr("y1", (d: any) => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = nodeRadius(d.source);
          return clamp(d.source.y + (dy / dist) * r, 8, height - 8);
        })
        .attr("x2", (d: any) => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = nodeRadius(d.target) + 9;
          return clamp(d.target.x - (dx / dist) * r, 8, width - 8);
        })
        .attr("y2", (d: any) => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = nodeRadius(d.target) + 9;
          return clamp(d.target.y - (dy / dist) * r, 8, height - 8);
        });
    };

    simulation.on("tick", () => {
      // Clamp the simulation's own x/y so runaway nodes are pulled back every tick
      for (const d of nodes as any[]) {
        d.x = clamp(d.x ?? width / 2, 15, width - 15);
        d.y = clamp(d.y ?? height / 2, 15, height - 15);
      }
      updatePositions(linkNormal);
      updatePositions(linkRing);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      ringLabel.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });

    // Apply ring highlight dimming after initial render.
    // Extract ring node IDs from edge IDs (format: "GSTIN1-GSTIN2").
    // GSTINs are 15-char alphanumeric strings with no hyphens.
    if (highlightRingIds && highlightRingIds.length > 0) {
      const ringNodeIds = new Set<string>();
      for (const edgeId of highlightRingIds) {
        const i = edgeId.indexOf('-');
        if (i > 0) { ringNodeIds.add(edgeId.slice(0, i)); ringNodeIds.add(edgeId.slice(i + 1)); }
      }
      node.style("opacity", (d: any) => ringNodeIds.has(d.id) ? 1 : 0.15);
      linkNormal.style("stroke-opacity", 0.06);
      linkRing.style("stroke-opacity", (d: any) => highlightRingIds.includes(d.id) ? 1 : 0.25);
    }

    // Zoom-to-ring after simulation has run
    let zoomTimer: ReturnType<typeof setTimeout> | null = null;
    if (highlightRingIds && highlightRingIds.length > 0) {
      zoomTimer = setTimeout(() => {
        const ringNodeIds = new Set<string>();
        for (const l of links as any[]) {
          if (highlightRingIds.includes(l.id)) {
            ringNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
            ringNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
          }
        }
        const rn = (nodes as any[]).filter(n => ringNodeIds.has(n.id));
        if (rn.length < 2) return;

        const xs = rn.map((n: any) => n.x ?? 0);
        const ys = rn.map((n: any) => n.y ?? 0);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        const y0 = Math.min(...ys), y1 = Math.max(...ys);
        const pad = 100;
        const scale = Math.min(4, 0.85 / Math.max((x1 - x0 + pad * 2) / width, (y1 - y0 + pad * 2) / height));
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        svg.transition().duration(800).call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy)
        );
      }, 800);
    }

    return () => {
      if (zoomTimer) clearTimeout(zoomTimer);
      simulation.stop();
    };

    function drag(sim: any) {
      return d3.drag()
        .on("start", (event: any, d: any) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event: any, d: any) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event: any, d: any) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        });
    }
  }, [data, selectedGstin, highlightRingIds, onNodeClick]);

  return (
    <div className="relative w-full h-full bg-background/50 rounded-xl overflow-hidden border border-border/50" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full" />
      <div ref={tooltipRef} className="d3-tooltip" style={{ pointerEvents: 'none', zIndex: 50 }} />

      {/* Controls: Reset View */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        <button
          onClick={resetView}
          title="Reset view"
          className="bg-card/80 backdrop-blur border border-border hover:bg-secondary/60 text-muted-foreground hover:text-foreground p-1.5 rounded-lg shadow transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            if (!svgRef.current || !zoomRef.current || !containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            d3.select(svgRef.current)
              .transition().duration(600)
              .call(zoomRef.current.transform, d3.zoomIdentity.translate(w / 2, h / 2).scale(1).translate(-w / 2, -h / 2));
          }}
          title="Fit to screen"
          className="bg-card/80 backdrop-blur border border-border hover:bg-secondary/60 text-muted-foreground hover:text-foreground p-1.5 rounded-lg shadow transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Graph Legend */}
      <div className="absolute bottom-4 left-4 bg-card/85 backdrop-blur border border-border p-3 rounded-lg flex flex-col gap-1.5 shadow-lg text-xs">
        <h4 className="font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Legend</h4>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Low Risk</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Medium Risk</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div> High Risk</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.6)]"></div> Fraud Ring Node</div>
        <div className="flex items-center gap-2 mt-0.5">
          <svg width="24" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#e11d48" strokeWidth="2" markerEnd="url(#arrow-ring-legend)"/><defs><marker id="arrow-ring-legend" viewBox="0 -4 8 8" refX="8" refY="0" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,-4L8,0L0,4Z" fill="#e11d48"/></marker></defs></svg>
          Suspicious flow
        </div>
        <div className="flex items-center gap-2">
          <svg width="24" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#334155" strokeWidth="1" opacity="0.5"/></svg>
          Normal txn
        </div>
      </div>
    </div>
  );
}
