import { useEffect, useRef } from "react";
import type { Context } from "./App";
import { query, useLoad, type Schema } from "./api";
import { Empty, NoteList, SafeMarkdown, Select, Status } from "./components";
import { useI18n } from "./i18n";
import {
  dateTime,
  fieldLabel,
  kindLabel,
  noteTypeLabel,
  record,
  short,
  text,
  type Update,
} from "./state";

function Graph({
  data,
  note,
  update,
  cells,
}: {
  data: Schema["GraphResponse"];
  note: string;
  update: Update;
  cells: Map<string, number>;
}) {
  const { lang, t } = useI18n();
  // Reserve a cell for every encountered ID; changing focus or time does not move it.
  // Follow recorded edges so connected nodes precede isolated records.
  const visible = new Set(data.nodes.map((node) => node.id));
  const visited = new Set<string>();
  for (const id of [...visible].sort()) {
    const pending = [id];
    while (pending.length) {
      const next = pending.shift()!;
      if (visited.has(next) || !visible.has(next)) continue;
      visited.add(next);
      if (!cells.has(next)) cells.set(next, cells.size);
      pending.push(
        ...data.edges
          .flatMap((edge) =>
            edge.source_id === next
              ? [edge.target_id]
              : edge.target_id === next
                ? [edge.source_id]
                : [],
          )
          .sort(),
      );
    }
  }
  const positions = new Map(
    data.nodes.map((node) => {
      const cell = cells.get(node.id)!;
      return [
        node.id,
        { x: 132 + (cell % 3) * 260, y: 68 + Math.floor(cell / 3) * 132 },
      ];
    }),
  );
  const height = Math.max(240, ...[...positions.values()].map((p) => p.y + 70));
  return (
    <div className="graph-scroll">
      <svg
        className="graph"
        viewBox={`0 0 790 ${height}`}
        width="790"
        height={height}
        aria-label={t.provenance.graphAria}
        role="group"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {data.edges.map((edge) => {
          const a = positions.get(edge.source_id),
            b = positions.get(edge.target_id);
          if (!a || !b || edge.source_id === edge.target_id) return null;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const factor = Math.min(
            dx ? 113 / Math.abs(dx) : Infinity,
            dy ? 37 / Math.abs(dy) : Infinity,
          );
          return (
            <line
              key={`${edge.kind}:${edge.source_id}:${edge.target_id}`}
              className={`edge ${edge.kind}`}
              x1={a.x + dx * factor}
              y1={a.y + dy * factor}
              x2={b.x - dx * factor}
              y2={b.y - dy * factor}
              markerEnd={edge.kind === "related" ? undefined : "url(#arrow)"}
            >
              <title>
                {edge.source_id} {kindLabel(edge.kind, lang)} {edge.target_id}
              </title>
            </line>
          );
        })}
        {data.nodes.map((node) => {
          const p = positions.get(node.id)!;
          return (
            <g
              key={node.id}
              transform={`translate(${p.x},${p.y})`}
              role="button"
              tabIndex={0}
              aria-label={t.provenance.openDetailAria(node.title)}
              aria-pressed={note === node.id}
              onClick={() => update({ note: node.id })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  update({ note: node.id });
                }
              }}
              className={
                note === node.id ? "graph-node selected" : "graph-node"
              }
            >
              <title>
                {node.title} · {node.id}
              </title>
              <rect x="-112" y="-36" width="224" height="72" />
              <text x="-99" y="-13" className="graph-type">
                {noteTypeLabel(node.frontmatter.type, lang)}
              </text>
              <text x="-99" y="11">
                {node.title.length > 14
                  ? `${node.title.slice(0, 14)}…`
                  : node.title}
              </text>
              <text x="-99" y="27" className="graph-type">
                {node.id.slice(0, 30)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
export function Provenance({ at, note, update, params }: Context) {
  const { lang, t } = useI18n();
  const cells = useRef(new Map<string, number>());
  const depth = params.get("depth") === "3" ? 3 : 2;
  const full = params.get("graph") === "all" || !note;
  const graph = useLoad<Schema["GraphResponse"]>(
    query("graph", { at, focus: full ? null : note, depth, limit: 200 }),
    { commit_sha: at },
  );
  const diagnostics = useLoad<Schema["DiagnosticsResponse"]>(
    query("diagnostics", { at, limit: 100 }),
    { commit_sha: at },
    true,
  );
  return (
    <>
      <p className="lede">{t.provenance.lede}</p>
      <div className="filters">
        <button
          aria-pressed={!full}
          disabled={!note}
          onClick={() => update({ graph: null, depth: "2" })}
        >
          {t.provenance.depth2}
        </button>
        <button
          disabled={full || depth === 3}
          onClick={() => update({ depth: "3" })}
        >
          {t.provenance.depth3}
        </button>
        <button aria-pressed={full} onClick={() => update({ graph: "all" })}>
          {t.provenance.viewAll}
        </button>
        <button onClick={() => update({ view: "diff", diff_scope: null })}>
          {t.provenance.toNoteDiff}
        </button>
      </div>
      <p className="legend">{t.provenance.legend}</p>
      <Status load={graph}>
        {(data) => (
          <>
            {data.truncated && (
              <p className="message warning">{t.provenance.truncatedWarning}</p>
            )}
            {!data.nodes.length ? (
              <Empty>{t.overview.zeroNotesAtSnapshot}</Empty>
            ) : (
              <>
                <Graph
                  data={data}
                  note={note}
                  update={update}
                  cells={cells.current}
                />
                <details open>
                  <summary>
                    {t.provenance.listSummary(
                      data.nodes.length,
                      data.edges.length,
                    )}
                  </summary>
                  <NoteList
                    notes={data.nodes}
                    selected={note}
                    update={update}
                  />
                  {!data.edges.length ? (
                    <p>{t.provenance.noEdges}</p>
                  ) : (
                    <ul className="edge-list">
                      {data.edges.map((edge) => (
                        <li
                          key={`${edge.kind}:${edge.source_id}:${edge.target_id}`}
                        >
                          <button
                            onClick={() => update({ note: edge.source_id })}
                          >
                            {edge.source_id}
                          </button>
                          <span>
                            {edge.kind === "related" ? "—" : "→"}{" "}
                            {kindLabel(edge.kind, lang)}
                          </span>
                          <button
                            onClick={() => update({ note: edge.target_id })}
                          >
                            {edge.target_id}
                          </button>
                          <small>
                            {t.provenance.evidencePrefix}{" "}
                            {edge.evidence.join(" / ")}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </>
            )}
          </>
        )}
      </Status>
      <section>
        <h2>{t.provenance.diagnosticsHeading}</h2>
        <Status load={diagnostics}>
          {(data) =>
            data.items.length ? (
              <ul className="diagnostics">
                {data.items.map((item, i) => (
                  <li key={i}>
                    <strong>
                      {t.provenance.diagnostics[item.code] ||
                        t.provenance.diagnosticFallback}
                    </strong>
                    <small>{item.code}</small>
                    <span>{item.detail}</span>
                    <small>{item.path}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.provenance.noDiagnostics}</p>
            )
          }
        </Status>
      </section>
    </>
  );
}
export function Diff({
  at,
  note,
  params,
  update,
  snapshots,
  snapshotsReady,
}: Context) {
  const { lang, t } = useI18n();
  const index = snapshots.findIndex((s) => s.sha === at);
  const from =
    params.get("from") ||
    (snapshotsReady ? snapshots[Math.max(0, index - 1)]?.sha || at : "");
  const to = params.get("to") || at;
  useEffect(() => {
    if (from && (!params.get("from") || !params.get("to")))
      update({ from, to }, true);
  }, [from, to, params, update]);
  const diff = useLoad<Schema["DiffResponse"]>(
    from
      ? query("diff", {
          from,
          to,
          note: params.get("diff_scope") === "all" ? null : note,
          limit: 100,
        })
      : null,
    { from_sha: from, to_sha: to },
    true,
  );
  const options = snapshots.map(
    (s) =>
      [
        s.sha,
        `${dateTime(s.committed_at, lang)} · ${short(s.sha)} · ${s.subject}`,
      ] as [string, string],
  );
  const withUnknown = (value: string) =>
    !value
      ? [["", t.loading] as [string, string], ...options]
      : options.some(([sha]) => sha === value)
        ? options
        : [[value, t.unfetched(short(value))] as [string, string], ...options];
  return (
    <>
      <p className="lede">{t.diff.lede}</p>
      <div className="compare-select">
        <Select
          label={t.diff.from}
          value={from}
          options={withUnknown(from)}
          onChange={(from) => update({ from })}
        />
        <button
          aria-label={t.diff.swapAria}
          onClick={() => update({ from: to, to: from })}
        >
          {t.diff.swapButton}
        </button>
        <Select
          label={t.diff.to}
          value={to}
          options={withUnknown(to)}
          onChange={(to) => update({ to })}
        />
      </div>
      <div className="filters">
        <Select
          label={t.diff.scope}
          value={params.get("diff_scope") || ""}
          options={[
            ["", note ? t.diff.selectedNote : t.all],
            ["all", t.all],
          ]}
          onChange={(diff_scope) => update({ diff_scope })}
        />
        <label className="field">
          {t.diff.type}
          <input
            value={params.get("diff_type") || ""}
            placeholder={t.diff.typePlaceholder}
            onChange={(e) => update({ diff_type: e.target.value }, true)}
          />
        </label>
        <label className="field">
          {t.diff.changedField}
          <input
            value={params.get("field") || ""}
            placeholder={t.diff.fieldPlaceholder}
            onChange={(e) => update({ field: e.target.value }, true)}
          />
        </label>
        <Select
          label={t.diff.changeKind}
          value={params.get("change") || ""}
          options={[
            ["", t.all],
            ...["added", "deleted", "renamed", "replaced", "modified"].map(
              (v) => [v, kindLabel(v, lang)] as [string, string],
            ),
          ]}
          onChange={(change) => update({ change })}
        />
      </div>
      <Status load={diff}>
        {(data) => {
          const rows = data.items.filter(
            (item) =>
              (!params.get("change") || item.kind === params.get("change")) &&
              (!params.get("field") ||
                Object.hasOwn(item.fields || {}, params.get("field")!)) &&
              (!params.get("diff_type") ||
                [
                  record(item.before?.frontmatter).type,
                  record(item.after?.frontmatter).type,
                ].includes(params.get("diff_type"))),
          );
          return (
            <>
              <p className="result-count">
                {t.diff.resultCount(
                  short(data.from_sha),
                  short(data.to_sha),
                  rows.length,
                  data.total,
                )}
              </p>
              {rows.length ? (
                rows.map((item) => (
                  <article className="diff-item" key={item.id}>
                    <div className="section-heading">
                      <h2>
                        {text(
                          item.after?.title || item.before?.title || item.id,
                          lang,
                        )}
                      </h2>
                      <span className="badge">
                        {kindLabel(item.kind, lang)}
                      </span>
                    </div>
                    <p className="muted">
                      {item.id}
                      {item.fields?.path && t.diff.movedSuffix}
                    </p>
                    {item.fields && (
                      <details open>
                        <summary>{t.diff.changedFieldsSummary}</summary>
                        <dl className="field-diff">
                          {Object.entries(item.fields)
                            .filter(([key]) => key !== "body")
                            .map(([key, values]) => (
                              <div key={key}>
                                <dt>{fieldLabel(key, lang)}</dt>
                                <dd>
                                  <span>
                                    {t.diff.beforePrefix}{" "}
                                    {text(values[0], lang)}
                                  </span>
                                  <span>
                                    {t.diff.afterPrefix} {text(values[1], lang)}
                                  </span>
                                </dd>
                              </div>
                            ))}
                        </dl>
                        {Object.hasOwn(item.fields, "body") && (
                          <p>{t.diff.bodyChanged}</p>
                        )}
                      </details>
                    )}
                    <div className="diff-bodies">
                      {(["before", "after"] as const).map((side, i) => (
                        <section key={side}>
                          <div className="section-heading">
                            <h3>
                              {i === 0
                                ? t.diff.beforeHeading
                                : t.diff.afterHeading}
                            </h3>
                            <code>{short(i === 0 ? from : to)}</code>
                          </div>
                          {item[side] ? (
                            <>
                              <button
                                onClick={() =>
                                  update({
                                    view: "browse",
                                    at: i === 0 ? from : to,
                                    note: item.id,
                                    as_of: null,
                                    cursor: null,
                                  })
                                }
                              >
                                {t.diff.openSnapshot}
                              </button>
                              <p className="file-path">
                                {text(item[side]!.path, lang)}
                              </p>
                              <SafeMarkdown
                                body={String(item[side]!.body || "")}
                              />
                              <details>
                                <summary>{t.diff.frontmatterSummary}</summary>
                                <pre>
                                  {JSON.stringify(
                                    item[side]!.frontmatter,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </>
                          ) : (
                            <Empty>{t.diff.absentAtSnapshot}</Empty>
                          )}
                        </section>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <Empty>{t.diff.noMatchingChanges}</Empty>
              )}
            </>
          );
        }}
      </Status>
    </>
  );
}
