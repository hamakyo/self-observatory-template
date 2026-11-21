import { useMemo, useRef, useState } from "react";
import type { Context } from "./App";
import { query, useLoad, type Schema } from "./api";
import { Empty, Select, Status } from "./components";
import {
  dateTime,
  kinds,
  maturityLabel,
  noteTypeLabel,
  short,
  statusLabel,
} from "./state";

type Volume = Schema["TimeVolumeResponse"];
type Slice = Schema["VolumeSlice"];
type Point = Schema["VolumePoint"];
type Event = { slice: Slice; point: Point };
type Camera = { yaw: number; tilt: number; zoom: number };
const states: Record<Point["state"], string> = {
  added: "追加",
  modified: "更新・移動",
  superseded: "置き換え",
  deleted: "削除",
  unchanged: "継続",
  unavailable: "読込エラー",
};

// Form runs before filtering so hidden slices cannot reconnect deleted records.
function worldlines(slices: Slice[]) {
  const result: { id: string; events: Event[] }[] = [];
  const active = new Map<string, Event[]>();
  for (const slice of slices) {
    const ids = new Set(slice.points.map((point) => point.id));
    for (const id of active.keys()) if (!ids.has(id)) active.delete(id);
    for (const point of slice.points) {
      if (!active.has(point.id) || point.state === "added") {
        const events: Event[] = [];
        active.set(point.id, events);
        result.push({ id: point.id, events });
      }
      active.get(point.id)!.push({ slice, point });
      if (!point.present) active.delete(point.id);
    }
  }
  return result;
}

function Mark({ state }: { state: Point["state"] }) {
  if (state === "deleted") return <path d="M-5 -5 5 5 M-5 5 5 -5" />;
  if (state === "unavailable")
    return (
      <text textAnchor="middle" y="4">
        ?
      </text>
    );
  if (state === "modified") return <path d="M0 -6 6 0 0 6 -6 0Z" />;
  if (state === "superseded") return <path d="M0 -6 6 5 -6 5Z" />;
  return <circle r={state === "added" ? 4.5 : 3} />;
}

function Scene({
  data,
  slices,
  selected,
  selectedSha,
  relation,
  choose,
  camera,
  setCamera,
}: {
  data: Volume;
  slices: Slice[];
  selected: string;
  selectedSha: string;
  relation: string;
  choose: (sha: string, id?: string) => void;
  camera: Camera;
  setCamera: (value: Partial<Camera>) => void;
}) {
  const { yaw, tilt, zoom } = camera;
  const setYaw = (yaw: number) => setCamera({ yaw });
  const setTilt = (tilt: number) => setCamera({ tilt });
  const setZoom = (zoom: number) => setCamera({ zoom });
  const drag = useRef<{
    x: number;
    y: number;
    yaw: number;
    tilt: number;
  } | null>(null);
  const lines = useMemo(() => worldlines(data.slices), [data]);
  const showSelf = slices.some((s) => s.points.length > 0);
  const positions = new Map(data.layout.map((p) => [p.id, p]));
  const visible = new Set(slices.map((s) => s.snapshot.sha));
  const { min_x, max_x, min_y, max_y } = data.bounds;
  const cx = (min_x + max_x) / 2,
    cy = (min_y + max_y) / 2;
  const width = Math.max(2, max_x - min_x + 2) * 32;
  const height = Math.max(2, max_y - min_y + 2) * 32;
  const first = data.slices[0].snapshot.position,
    last = data.slices.at(-1)!.snapshot.position;
  const depth = Math.max(1, last - first) * 34;
  const scale =
    ((225 / Math.hypot(width / 2 + 70, height / 2, depth / 2)) * zoom) / 100;
  const angle = (yaw * Math.PI) / 180,
    elevation = (tilt * Math.PI) / 180;
  function project(x: number, y: number, position: number) {
    const z = (position - (first + last) / 2) * 34;
    const a = x * Math.cos(angle) - y * Math.sin(angle);
    const b = x * Math.sin(angle) + y * Math.cos(angle);
    return {
      x: 450 + a * scale,
      y: 300 + (b * Math.sin(elevation) - z * Math.cos(elevation)) * scale,
      depth: b * Math.cos(elevation) + z * Math.sin(elevation),
    };
  }
  function pointAt(id: string, position: number) {
    const p = positions.get(id)!;
    return project((p.x - cx) * 32, (p.y - cy) * 32, position);
  }
  const xy = (p: { x: number; y: number }) => `${p.x},${p.y}`;
  const nodes = slices
    .flatMap((slice) =>
      slice.points.map((point) => ({
        slice,
        point,
        location: pointAt(point.id, slice.snapshot.position),
      })),
    )
    .sort((a, b) => a.location.depth - b.location.depth);
  const rail = slices.filter((s) => s.snapshot.observatory_changed);
  return (
    <>
      <div className="volume-camera">
        <label className="field">
          回転 {Math.round(yaw)}°
          <input
            aria-label="空間の回転"
            type="range"
            min="-180"
            max="180"
            value={yaw}
            onChange={(e) => setYaw(Number(e.target.value))}
          />
        </label>
        <label className="field">
          傾き {Math.round(tilt)}°
          <input
            aria-label="空間の傾き"
            type="range"
            min="10"
            max="75"
            value={tilt}
            onChange={(e) => setTilt(Number(e.target.value))}
          />
        </label>
        <label className="field">
          拡大 {zoom}%
          <input
            aria-label="空間の倍率"
            type="range"
            min="60"
            max="160"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() => {
            setYaw(-25);
            setTilt(35);
            setZoom(100);
          }}
        >
          視点を戻す
        </button>
      </div>
      <svg
        className="time-volume"
        viewBox="0 0 900 600"
        role="group"
        aria-label="立体履歴ビュー。下の時点・ノート一覧からも同じ操作ができます。"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, yaw, tilt };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setYaw(
            Math.max(
              -180,
              Math.min(
                180,
                drag.current.yaw + (e.clientX - drag.current.x) / 2,
              ),
            ),
          );
          setTilt(
            Math.max(
              10,
              Math.min(
                75,
                drag.current.tilt + (e.clientY - drag.current.y) / 3,
              ),
            ),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <defs>
          <marker
            id="volume-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0 10 5 0 10Z" fill="var(--charcoal)" />
          </marker>
        </defs>
        <text x="22" y="30" className="volume-axis-label">
          更新順 ↑
        </text>
        <text x="22" y="575" className="volume-axis-label">
          ノート配置（固定）
        </text>
        {slices.map((s) => {
          const p = s.snapshot.position;
          const corners = [
            [-width / 2, -height / 2],
            [width / 2, -height / 2],
            [width / 2, height / 2],
            [-width / 2, height / 2],
          ].map(([x, y]) => project(x, y, p));
          const label = project(-width / 2 - 15, height / 2, p);
          return (
            <g
              key={s.snapshot.sha}
              className={
                s.snapshot.sha === selectedSha
                  ? "volume-plane selected"
                  : "volume-plane"
              }
            >
              <polygon points={corners.map(xy).join(" ")} />
              <g
                className="volume-slice-label"
                role="button"
                tabIndex={-1}
                aria-label={`${short(s.snapshot.sha)}の時点を表示`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => choose(s.snapshot.sha)}
              >
                <text x={label.x} y={label.y} textAnchor="end">
                  {String(p + 1).padStart(2, "0")} · {short(s.snapshot.sha)}
                </text>
              </g>
            </g>
          );
        })}
        {showSelf &&
          lines.map((line, i) => {
            const events = line.events.filter((e) =>
              visible.has(e.slice.snapshot.sha),
            );
            return (
              <polyline
                key={`${line.id}:${i}`}
                data-note-id={line.id}
                className={`volume-worldline ${selected === line.id ? "selected" : selected ? "dimmed" : ""}`}
                points={events
                  .map(({ slice }) =>
                    xy(pointAt(line.id, slice.snapshot.position)),
                  )
                  .join(" ")}
              />
            );
          })}
        {slices.flatMap((s) =>
          s.edges
            .filter((e) => relation === "all" || e.kind === relation)
            .map((e) => {
              const a = pointAt(e.source_id, s.snapshot.position),
                b = pointAt(e.target_id, s.snapshot.position);
              return (
                <line
                  key={`${s.snapshot.sha}:${e.kind}:${e.source_id}:${e.target_id}`}
                  className={`volume-relation ${e.kind} ${selected && ![e.source_id, e.target_id].includes(selected) ? "dimmed" : ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  markerEnd={
                    e.kind === "related" ? undefined : "url(#volume-arrow)"
                  }
                >
                  <title>
                    {kinds[e.kind]}: {e.source_id} → {e.target_id} ·{" "}
                    {e.evidence.join(", ")}
                  </title>
                </line>
              );
            }),
        )}
        {rail.length > 0 && (
          <g className="volume-observatory">
            <polyline
              points={rail
                .map((s) =>
                  xy(project(width / 2 + 65, -height / 2, s.snapshot.position)),
                )
                .join(" ")}
            />
            {rail.map((s, i) => {
              const p = project(
                width / 2 + 65,
                -height / 2,
                s.snapshot.position,
              );
              return (
                <g
                  key={s.snapshot.sha}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  tabIndex={-1}
                  aria-label={`${short(s.snapshot.sha)}の仕組み変更`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => choose(s.snapshot.sha)}
                >
                  <circle r="5" />
                  {i === rail.length - 1 && (
                    <text x="12" y="4">
                      仕組み
                    </text>
                  )}
                  <title>
                    {s.snapshot.subject} ·{" "}
                    {s.snapshot.observatory_change_paths.join(", ")}
                  </title>
                </g>
              );
            })}
          </g>
        )}
        {nodes.map(({ slice, point, location }) => (
          <g
            key={`${slice.snapshot.sha}:${point.id}`}
            transform={`translate(${location.x} ${location.y})`}
            data-note-id={point.id}
            data-sha={slice.snapshot.sha}
            data-state={point.state}
            className={`volume-point state-${point.state} ${selected === point.id ? "selected" : selected ? "dimmed" : ""}`}
            role="button"
            tabIndex={slice.snapshot.sha === selectedSha ? 0 : -1}
            aria-label={`${point.title} · ${states[point.state]} · ${short(slice.snapshot.sha)}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => choose(slice.snapshot.sha, point.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(slice.snapshot.sha, point.id);
              }
            }}
          >
            <title>
              {point.title} · {point.id} · {states[point.state]} ·{" "}
              {statusLabel(point.status)}
            </title>
            <Mark state={point.state} />
          </g>
        ))}
      </svg>
      <p className="legend">
        ● 追加　◆ 更新・移動　△ 置き換え　× 削除　○ 継続　? 読込エラー
      </p>
      <p className="muted">
        縦の線は同じノートのつながり、平面の線は関連を示します。
      </p>
    </>
  );
}

function VolumeContent({
  data,
  context,
  camera,
  setCamera,
}: {
  data: Volume;
  context: Context;
  camera: Camera;
  setCamera: (value: Partial<Camera>) => void;
}) {
  const { params, update, snapshots } = context;
  const evolution = ["self", "observatory"].includes(
    params.get("volume_layer") || "",
  )
    ? params.get("volume_layer")!
    : "all";
  const relation = params.get("volume_relation") || "all";
  const id = params.get("volume_note") || context.note;
  const visible = data.slices.filter(
    (s) =>
      evolution === "all" ||
      (evolution === "self"
        ? s.snapshot.self_changed
        : s.snapshot.observatory_changed),
  );
  const selected =
    visible.find((s) => s.snapshot.sha === params.get("volume_at")) ||
    visible.at(-1);
  const index = visible.findIndex((s) => s === selected);
  const point = selected?.points.find((p) => p.id === id);
  const ids = new Map(
    data.slices.flatMap((s) => s.points.map((p) => [p.id, p.title] as const)),
  );
  const events = data.slices.flatMap((slice) =>
    slice.points.filter((p) => p.id === id).map((point) => ({ slice, point })),
  );
  const choose = (sha: string, chosenId?: string) =>
    update({ volume_at: sha, ...(chosenId ? { volume_note: chosenId } : {}) });
  const c = data.coverage;
  const truncated =
    c.requested_snapshots > c.returned_snapshots ||
    c.total_notes > c.returned_notes ||
    c.omitted_edges > 0;
  const open = (
    view: string,
    eventPoint = point,
    sha = selected?.snapshot.sha,
  ) => {
    if (!sha) return;
    const readSha = eventPoint?.read_sha || sha;
    update({
      view,
      at: readSha,
      note: eventPoint?.id || null,
      as_of: null,
      cursor: null,
    });
  };
  return (
    <>
      <p className="volume-coverage">
        {c.returned_snapshots} / {c.requested_snapshots} 時点 ·{" "}
        {c.returned_notes} / {c.total_notes} ノート · 配置 v
        {data.layout_version} / 解析 v{data.parser_version}
      </p>
      {truncated && (
        <p className="message warning">
          件数が多いため一部を省略しています（
          {c.requested_snapshots - c.returned_snapshots} 時点 /{" "}
          {c.total_notes - c.returned_notes} ノート / つながり {c.omitted_edges}{" "}
          件）。範囲を絞るか ID を指定してください。
        </p>
      )}
      {c.excluded_notes > 0 && (
        <p className="message warning">
          読み込めなかった記録が延べ {c.excluded_notes} 件あります。
        </p>
      )}
      <div className="filters volume-filters">
        <Select
          label="表示する層"
          value={evolution}
          options={[
            ["all", "すべて"],
            ["self", "ノートのみ"],
            ["observatory", "仕組みのみ"],
          ]}
          onChange={(volume_layer) => update({ volume_layer })}
        />
        <Select
          label="つながり"
          value={relation}
          options={[
            ["all", "すべて"],
            ["derived_from", "由来"],
            ["related", "関連"],
            ["supersedes", "置き換え"],
            ["none", "表示しない"],
          ]}
          onChange={(volume_relation) => update({ volume_relation })}
        />
        <Select
          label="注目するノート"
          value={id}
          options={[
            ["", "選択なし"],
            ...(!ids.has(id) && id
              ? [[id, `${id}（この範囲になし）`] as [string, string]]
              : []),
            ...[...ids].map(
              ([key, title]) => [key, `${title} · ${key}`] as [string, string],
            ),
          ]}
          onChange={(volume_note) => update({ volume_note, note: null })}
        />
      </div>
      {!selected ? (
        <Empty>この範囲に該当する変更はありません。</Empty>
      ) : (
        <>
          <Scene
            data={data}
            slices={visible.map((s) =>
              evolution === "observatory"
                ? { ...s, points: [], edges: [] }
                : evolution === "self"
                  ? {
                      ...s,
                      snapshot: { ...s.snapshot, observatory_changed: false },
                    }
                  : s,
            )}
            selected={id}
            selectedSha={selected.snapshot.sha}
            relation={relation}
            choose={choose}
            camera={camera}
            setCamera={setCamera}
          />
          <section className="volume-selection">
            <h2>選択中の時点</h2>
            <div className="filters">
              <button
                disabled={index <= 0}
                onClick={() => choose(visible[index - 1].snapshot.sha)}
              >
                前へ
              </button>
              <button
                disabled={index >= visible.length - 1}
                onClick={() => choose(visible[index + 1].snapshot.sha)}
              >
                次へ
              </button>
              <label className="field">
                時間スライダー
                <input
                  aria-label="時間軸の時点"
                  type="range"
                  min="0"
                  max={visible.length - 1}
                  value={index}
                  onChange={(e) =>
                    choose(visible[Number(e.target.value)].snapshot.sha)
                  }
                />
              </label>
              <Select
                label="時点を選ぶ"
                value={selected.snapshot.sha}
                options={visible.map((s) => [
                  s.snapshot.sha,
                  `${dateTime(s.snapshot.committed_at)} · ${short(s.snapshot.sha)}`,
                ])}
                onChange={(sha) => choose(sha)}
              />
            </div>
            <p>
              <code>{short(selected.snapshot.sha)}</code> ·{" "}
              {selected.snapshot.subject}
            </p>
            <div className="filters">
              <button
                onClick={() =>
                  update({
                    view: "browse",
                    at: selected.snapshot.sha,
                    note: null,
                    as_of: null,
                    cursor: null,
                  })
                }
              >
                この時点の一覧へ
              </button>
              <button
                disabled={!point?.read_sha}
                onClick={() => open("browse")}
              >
                {point?.present === false
                  ? "直前の本文を読む"
                  : "このノートを読む"}
              </button>
              <button
                disabled={!point?.read_sha}
                onClick={() => open("provenance")}
              >
                つながりを見る
              </button>
              <button
                disabled={
                  !selected.snapshot.first_parent ||
                  !snapshots.some(
                    (s) => s.sha === selected.snapshot.first_parent,
                  )
                }
                onClick={() =>
                  update({
                    view: "diff",
                    at: selected.snapshot.sha,
                    from: selected.snapshot.first_parent,
                    to: selected.snapshot.sha,
                    note: id || null,
                    diff_scope: id ? null : "all",
                    as_of: null,
                  })
                }
              >
                直前との差分
              </button>
            </div>
            {selected.snapshot.observatory_changed && evolution !== "self" && (
              <details className="volume-observatory-paths">
                <summary>
                  仕組みの変更ファイル ·{" "}
                  {selected.snapshot.observatory_change_paths.length} 件
                </summary>
                <ul>
                  {selected.snapshot.observatory_change_paths.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {selected.snapshot.change_basis === "unavailable" && (
              <p className="message">
                比較元がないため、この時点の変更は判定できません。
              </p>
            )}
            {evolution !== "observatory" && (
              <details>
                <summary>この時点のノート一覧</summary>
                {selected.points.length === 0 ? (
                  <Empty>この時点に表示できるノートはありません。</Empty>
                ) : (
                  <ul className="volume-note-list">
                    {selected.points.map((p) => (
                      <li key={p.id}>
                        <button
                          aria-pressed={id === p.id}
                          onClick={() => choose(selected.snapshot.sha, p.id)}
                        >
                          {p.title}
                        </button>
                        <span>
                          {states[p.state]} · {noteTypeLabel(p.type)} ·{" "}
                          {statusLabel(p.status)}
                          {p.maturity ? ` · ${maturityLabel(p.maturity)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="volume-edge-list">
                  {selected.edges
                    .filter((e) => relation === "all" || e.kind === relation)
                    .map((e) => (
                      <li key={`${e.kind}:${e.source_id}:${e.target_id}`}>
                        {e.source_id} {e.kind === "related" ? "—" : "→"}{" "}
                        {e.target_id} · {kinds[e.kind]}
                        <small>根拠: {e.evidence.join(" / ")}</small>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}
      {id && evolution !== "observatory" && (
        <section className="volume-history">
          <h2>ノートの履歴 · {id}</h2>
          {!events.length ? (
            <Empty>この範囲にこのノートの記録はありません。</Empty>
          ) : (
            <ol>
              {events.map(({ slice, point: p }) => (
                <li key={slice.snapshot.sha}>
                  <button
                    onClick={() =>
                      update({
                        volume_layer: "all",
                        volume_at: slice.snapshot.sha,
                      })
                    }
                  >
                    {dateTime(slice.snapshot.committed_at)} ·{" "}
                    {short(slice.snapshot.sha)}
                  </button>
                  <span>
                    {states[p.state]} · {statusLabel(p.status)}
                    {p.maturity ? ` · ${maturityLabel(p.maturity)}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}

export function TimeVolume(context: Context) {
  const { params, update, at, snapshots } = context;
  const from = params.get("volume_from") || "",
    to = params.get("volume_to") || at;
  const [initialFocus] = useState(params.get("volume_note") || context.note);
  const focus = params.get("volume_focus") || initialFocus;
  const [camera, setCamera] = useState<Camera>({
    yaw: -25,
    tilt: 35,
    zoom: 100,
  });
  const volume = useLoad<Volume>(query("time-volume", { from, to, focus }), {
    to_sha: to,
    ...(from ? { from_sha: from } : {}),
  });
  const [inputId, setInputId] = useState(focus);
  const options = snapshots.map(
    (s) =>
      [s.sha, `${dateTime(s.committed_at)} · ${short(s.sha)}`] as [
        string,
        string,
      ],
  );
  const toOptions = options.some(([sha]) => sha === to)
    ? options
    : [[to, `未取得 · ${short(to)}`] as [string, string], ...options];
  return (
    <>
      <p className="lede">
        ノートの変化を時系列に重ねて見る試作ビューです（奥行きが更新順）。
      </p>
      <div className="filters volume-range">
        <Select
          label="開始時点"
          value={from}
          options={[["", "最新24時点"], ...options]}
          onChange={(volume_from) => update({ volume_from, volume_at: null })}
        />
        <Select
          label="終了時点"
          value={to}
          options={toOptions}
          onChange={(volume_to) => update({ volume_to, volume_at: null })}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({
              volume_note: inputId.trim(),
              volume_focus: inputId.trim(),
              note: null,
            });
          }}
        >
          <label className="field">
            ノート ID を指定
            <input
              aria-label="空間で探すID"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="表示上限外も指定可"
            />
          </label>
          <button type="submit">探す</button>
        </form>
      </div>
      <Status load={volume}>
        {(data) => (
          <VolumeContent
            data={data}
            context={context}
            camera={camera}
            setCamera={(patch) => setCamera((c) => ({ ...c, ...patch }))}
          />
        )}
      </Status>
      <p className="muted">仕組みの更新はノート内容の変化とは別です。</p>
    </>
  );
}
