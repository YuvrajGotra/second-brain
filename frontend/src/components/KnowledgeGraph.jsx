import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';

const COLORS = {
  pdf: '#ef4444',
  markdown: '#0ea5e9',
  text: '#71717a',
  transcript: '#f59e0b',
  note: '#6d5dfc',
  tag: '#10b981',
};

/**
 * Force-directed view of the knowledge base. Edges between sources come from
 * centroid-embedding similarity computed on the server; tag nodes join notes.
 */
export function KnowledgeGraph({ data }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [positions, setPositions] = useState([]);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: 520 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, links } = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n, r: n.kind === 'tag' ? 6 : 7 + Math.min(14, Math.sqrt(n.size) * 2) })),
      links: data.edges.map((e) => ({ ...e })),
    }),
    [data],
  );

  useEffect(() => {
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((d) => d.id).distance((l) => (l.kind === 'tag' ? 50 : 240 - l.strength * 120)).strength(0.6))
      .force('charge', forceManyBody().strength(-420))
      .force('center', forceCenter(size.width / 2, size.height / 2))
      .force('collide', forceCollide().radius((d) => d.r + 6))
      .force('x', forceX(size.width / 2).strength(0.04))
      .force('y', forceY(size.height / 2).strength(0.06));
    sim.on('tick', () => {
      for (const n of nodes) {
        n.x = Math.max(n.r + 4, Math.min(size.width - n.r - 4, n.x));
        n.y = Math.max(n.r + 4, Math.min(size.height - n.r - 4, n.y));
      }
      setPositions(nodes.map((n) => ({ ...n })));
    });
    return () => sim.stop();
  }, [nodes, links, size.width, size.height]);

  const byId = Object.fromEntries(positions.map((p) => [p.id, p]));
  const isNeighbour = (id) =>
    hovered && (id === hovered || links.some((l) => (l.source.id === hovered && l.target.id === id) || (l.target.id === hovered && l.source.id === id)));

  const open = (node) => {
    if (node.kind === 'document') navigate(`/knowledge/${node.id}`);
    else if (node.kind === 'note') navigate(`/notes/${node.id}`);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={size.width} height={size.height} className="block">
        {links.map((l, i) => {
          const s = byId[l.source.id ?? l.source];
          const t = byId[l.target.id ?? l.target];
          if (!s || !t) return null;
          const active = hovered && (s.id === hovered || t.id === hovered);
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              strokeWidth={l.kind === 'tag' ? 1 : 1 + (l.strength ?? 0.5) * 2}
              strokeDasharray={l.kind === 'tag' ? '3 3' : undefined}
              className={active ? 'stroke-brand-500' : 'stroke-zinc-300 dark:stroke-zinc-700'}
              opacity={hovered && !active ? 0.25 : 0.9}
            />
          );
        })}
        {positions.map((n) => (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => open(n)}
            className={n.kind === 'tag' ? '' : 'cursor-pointer'}
            opacity={hovered && !isNeighbour(n.id) ? 0.3 : 1}
          >
            <circle r={n.r} fill={COLORS[n.kind === 'tag' ? 'tag' : n.fileType] ?? COLORS.text} stroke="white" strokeWidth={2} className="dark:stroke-zinc-900" />
            <text y={n.r + 13} textAnchor="middle" className="pointer-events-none fill-zinc-600 text-[11px] font-medium dark:fill-zinc-300">
              {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute top-3 left-3 flex flex-wrap gap-3 rounded-xl bg-white/90 px-3 py-2 text-xs shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/90 dark:ring-zinc-800">
        {Object.entries(COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5 capitalize">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
