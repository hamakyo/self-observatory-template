import { useEffect, useRef } from "react";
import type { Context } from "./App";
import { query, useLoad, type Schema } from "./api";
import { Empty, NoteList, SafeMarkdown, Select, Status } from "./components";
import {
  dateTime,
  fieldLabel,
  kinds,
  noteTypeLabel,
  record,
  short,
  text,
  type Update,
} from "./state";

const diagnosticLabels: Record<string, string> = {
  missing_reference: "この時点に参照先のノートがありません",
  self_reference: "自分自身を参照しています",
  relation_cycle: "つながりが循環しています",
  supersession_status_mismatch: "置き換え関係と状態が一致しません",
  invalid_note: "形式エラーのため表示から除外",
  duplicate_id: "ID が重複しているため表示から除外",
};

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
        aria-label="ノートのつながり図。下のリストからも同じノートを開けます。"
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
                {edge.source_id} {kinds[edge.kind] || edge.kind}{" "}
                {edge.target_id}
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
              aria-label={`${node.title}の詳細を開く`}
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
                {noteTypeLabel(node.frontmatter.type)}
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
      <p className="lede">
        ノート同士の由来・関連・置き換えを図と一覧でたどります。
      </p>
      <div className="filters">
        <button
          aria-pressed={!full}
          disabled={!note}
          onClick={() => update({ graph: null, depth: "2" })}
        >
          前後2段
        </button>
        <button
          disabled={full || depth === 3}
          onClick={() => update({ depth: "3" })}
        >
          3段まで広げる
        </button>
        <button aria-pressed={full} onClick={() => update({ graph: "all" })}>
          全体を見る
        </button>
        <button onClick={() => update({ view: "diff", diff_scope: null })}>
          このノートの差分へ ↗
        </button>
      </div>
      <p className="legend">実線 → 由来　破線 — 関連　長短破線 → 置き換え</p>
      <Status load={graph}>
        {(data) => (
          <>
            {data.truncated && (
              <p className="message warning">
                件数が上限を超えたため一部のみ表示しています。
              </p>
            )}
            {!data.nodes.length ? (
              <Empty>この時点のノートは 0 件です。</Empty>
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
                    リスト表示 · {data.nodes.length} 件 / つながり{" "}
                    {data.edges.length} 件
                  </summary>
                  <NoteList
                    notes={data.nodes}
                    selected={note}
                    update={update}
                  />
                  {!data.edges.length ? (
                    <p>つながりはまだありません。</p>
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
                            {kinds[edge.kind]}
                          </span>
                          <button
                            onClick={() => update({ note: edge.target_id })}
                          >
                            {edge.target_id}
                          </button>
                          <small>根拠: {edge.evidence.join(" / ")}</small>
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
        <h2>チェック結果</h2>
        <Status load={diagnostics}>
          {(data) =>
            data.items.length ? (
              <ul className="diagnostics">
                {data.items.map((item, i) => (
                  <li key={i}>
                    <strong>{diagnosticLabels[item.code] || "注意"}</strong>
                    <small>{item.code}</small>
                    <span>{item.detail}</span>
                    <small>{item.path}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>問題はありません。</p>
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
        `${dateTime(s.committed_at)} · ${short(s.sha)} · ${s.subject}`,
      ] as [string, string],
  );
  const withUnknown = (value: string) =>
    !value
      ? [["", "読み込み中…"] as [string, string], ...options]
      : options.some(([sha]) => sha === value)
        ? options
        : [[value, `未取得 · ${short(value)}`] as [string, string], ...options];
  return (
    <>
      <p className="lede">2つの時点を並べて、本文や項目の変化を比べます。</p>
      <div className="compare-select">
        <Select
          label="比較前"
          value={from}
          options={withUnknown(from)}
          onChange={(from) => update({ from })}
        />
        <button
          aria-label="比較前と比較後を入れ替える"
          onClick={() => update({ from: to, to: from })}
        >
          ⇄ 入替
        </button>
        <Select
          label="比較後"
          value={to}
          options={withUnknown(to)}
          onChange={(to) => update({ to })}
        />
      </div>
      <div className="filters">
        <Select
          label="範囲"
          value={params.get("diff_scope") || ""}
          options={[
            ["", note ? "選択中のノート" : "すべて"],
            ["all", "すべて"],
          ]}
          onChange={(diff_scope) => update({ diff_scope })}
        />
        <label className="field">
          種類
          <input
            value={params.get("diff_type") || ""}
            placeholder="例: episode"
            onChange={(e) => update({ diff_type: e.target.value }, true)}
          />
        </label>
        <label className="field">
          変更項目
          <input
            value={params.get("field") || ""}
            placeholder="例: body / review"
            onChange={(e) => update({ field: e.target.value }, true)}
          />
        </label>
        <Select
          label="変更の種類"
          value={params.get("change") || ""}
          options={[
            ["", "すべて"],
            ...["added", "deleted", "renamed", "replaced", "modified"].map(
              (v) => [v, kinds[v]] as [string, string],
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
                {short(data.from_sha)} → {short(data.to_sha)} · {rows.length}{" "}
                件（全体 {data.total} 件）
              </p>
              {rows.length ? (
                rows.map((item) => (
                  <article className="diff-item" key={item.id}>
                    <div className="section-heading">
                      <h2>
                        {text(
                          item.after?.title || item.before?.title || item.id,
                        )}
                      </h2>
                      <span className="badge">{kinds[item.kind]}</span>
                    </div>
                    <p className="muted">
                      {item.id}
                      {item.fields?.path && " · 移動あり"}
                    </p>
                    {item.fields && (
                      <details open>
                        <summary>変更された項目</summary>
                        <dl className="field-diff">
                          {Object.entries(item.fields)
                            .filter(([key]) => key !== "body")
                            .map(([key, values]) => (
                              <div key={key}>
                                <dt>{fieldLabel(key)}</dt>
                                <dd>
                                  <span>前: {text(values[0])}</span>
                                  <span>後: {text(values[1])}</span>
                                </dd>
                              </div>
                            ))}
                        </dl>
                        {Object.hasOwn(item.fields, "body") && (
                          <p>本文に変更あり</p>
                        )}
                      </details>
                    )}
                    <div className="diff-bodies">
                      {(["before", "after"] as const).map((side, i) => (
                        <section key={side}>
                          <div className="section-heading">
                            <h3>{i === 0 ? "前" : "後"}</h3>
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
                                この時点を開く ↗
                              </button>
                              <p className="file-path">
                                {text(item[side]!.path)}
                              </p>
                              <SafeMarkdown
                                body={String(item[side]!.body || "")}
                              />
                              <details>
                                <summary>属性・出典（JSON）</summary>
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
                            <Empty>この時点にはありません。</Empty>
                          )}
                        </section>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <Empty>この条件に一致する変更はありません。</Empty>
              )}
            </>
          );
        }}
      </Status>
    </>
  );
}
