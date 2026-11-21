import { useMemo, useRef, useState } from "react";
import type { Context } from "./App";
import { query, useLoad, type Schema } from "./api";
import { Empty, Select, Status } from "./components";
import { useI18n } from "./i18n";
import {
  dateTime,
  kindLabel,
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
  const { lang, t } = useI18n();
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
          {t.volume.yaw(Math.round(yaw))}
          <input
            aria-label={t.volume.yawAria}
            type="range"
            min="-180"
            max="180"
            value={yaw}
            onChange={(e) => setYaw(Number(e.target.value))}
          />
        </label>
        <label className="field">
          {t.volume.tilt(Math.round(tilt))}
          <input
            aria-label={t.volume.tiltAria}
            type="range"
            min="10"
            max="75"
            value={tilt}
            onChange={(e) => setTilt(Number(e.target.value))}
          />
        </label>
        <label className="field">
          {t.volume.zoom(zoom)}
          <input
            aria-label={t.volume.zoomAria}
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
          {t.volume.resetCamera}
        </button>
      </div>
      <svg
        className="time-volume"
        viewBox="0 0 900 600"
        role="group"
        aria-label={t.volume.sceneAria}
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
          {t.volume.axisOrder}
        </text>
        <text x="22" y="575" className="volume-axis-label">
          {t.volume.axisLayout}
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
                aria-label={t.volume.sliceAria(short(s.snapshot.sha))}
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
                    {kindLabel(e.kind, lang)}: {e.source_id} → {e.target_id} ·{" "}
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
                  aria-label={t.volume.obsChangeAria(short(s.snapshot.sha))}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => choose(s.snapshot.sha)}
                >
                  <circle r="5" />
                  {i === rail.length - 1 && (
                    <text x="12" y="4">
                      {t.volume.obsRailLabel}
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
            aria-label={`${point.title} · ${t.volume.states[point.state] || point.state} · ${short(slice.snapshot.sha)}`}
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
              {point.title} · {point.id} ·{" "}
              {t.volume.states[point.state] || point.state} ·{" "}
              {statusLabel(point.status, lang)}
            </title>
            <Mark state={point.state} />
          </g>
        ))}
      </svg>
      <p className="legend">{t.volume.legend}</p>
      <p className="muted">{t.volume.axisHint}</p>
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
  const { lang, t } = useI18n();
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
        {t.volume.coverage(
          c.returned_snapshots,
          c.requested_snapshots,
          c.returned_notes,
          c.total_notes,
          data.layout_version,
          data.parser_version,
        )}
      </p>
      {truncated && (
        <p className="message warning">
          {t.volume.truncatedWarning(
            c.requested_snapshots - c.returned_snapshots,
            c.total_notes - c.returned_notes,
            c.omitted_edges,
          )}
        </p>
      )}
      {c.excluded_notes > 0 && (
        <p className="message warning">
          {t.volume.excludedWarning(c.excluded_notes)}
        </p>
      )}
      <div className="filters volume-filters">
        <Select
          label={t.volume.layerLabel}
          value={evolution}
          options={[
            ["all", t.all],
            ["self", t.volume.layerSelf],
            ["observatory", t.volume.layerObservatory],
          ]}
          onChange={(volume_layer) => update({ volume_layer })}
        />
        <Select
          label={t.volume.relationLabel}
          value={relation}
          options={[
            ["all", t.all],
            ["derived_from", kindLabel("derived_from", lang)],
            ["related", kindLabel("related", lang)],
            ["supersedes", kindLabel("supersedes", lang)],
            ["none", t.volume.relationHide],
          ]}
          onChange={(volume_relation) => update({ volume_relation })}
        />
        <Select
          label={t.volume.focusNoteLabel}
          value={id}
          options={[
            ["", t.volume.noSelection],
            ...(!ids.has(id) && id
              ? [[id, t.volume.outOfRangeNote(id)] as [string, string]]
              : []),
            ...[...ids].map(
              ([key, title]) => [key, `${title} · ${key}`] as [string, string],
            ),
          ]}
          onChange={(volume_note) => update({ volume_note, note: null })}
        />
      </div>
      {!selected ? (
        <Empty>{t.volume.emptyRange}</Empty>
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
            <h2>{t.volume.selectedSnapshotHeading}</h2>
            <div className="filters">
              <button
                disabled={index <= 0}
                onClick={() => choose(visible[index - 1].snapshot.sha)}
              >
                {t.volume.prev}
              </button>
              <button
                disabled={index >= visible.length - 1}
                onClick={() => choose(visible[index + 1].snapshot.sha)}
              >
                {t.volume.next}
              </button>
              <label className="field">
                {t.volume.timeSlider}
                <input
                  aria-label={t.volume.timeSliderAria}
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
                label={t.volume.chooseSnapshot}
                value={selected.snapshot.sha}
                options={visible.map((s) => [
                  s.snapshot.sha,
                  `${dateTime(s.snapshot.committed_at, lang)} · ${short(s.snapshot.sha)}`,
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
                {t.volume.browseAtSnapshot}
              </button>
              <button
                disabled={!point?.read_sha}
                onClick={() => open("browse")}
              >
                {point?.present === false
                  ? t.volume.readPreviousBody
                  : t.volume.readThisNote}
              </button>
              <button
                disabled={!point?.read_sha}
                onClick={() => open("provenance")}
              >
                {t.detail.viewProvenance}
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
                {t.trajectory.diffFromParent}
              </button>
            </div>
            {selected.snapshot.observatory_changed && evolution !== "self" && (
              <details className="volume-observatory-paths">
                <summary>
                  {t.volume.obsChangedFiles(
                    selected.snapshot.observatory_change_paths.length,
                  )}
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
              <p className="message">{t.volume.unavailableBasis}</p>
            )}
            {evolution !== "observatory" && (
              <details>
                <summary>{t.volume.notesAtSnapshot}</summary>
                {selected.points.length === 0 ? (
                  <Empty>{t.volume.noNotesAtSnapshot}</Empty>
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
                          {t.volume.states[p.state] || p.state} ·{" "}
                          {noteTypeLabel(p.type, lang)} ·{" "}
                          {statusLabel(p.status, lang)}
                          {p.maturity
                            ? ` · ${maturityLabel(p.maturity, lang)}`
                            : ""}
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
                        {e.target_id} · {kindLabel(e.kind, lang)}
                        <small>
                          {t.provenance.evidencePrefix} {e.evidence.join(" / ")}
                        </small>
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
          <h2>{t.volume.noteHistoryHeading(id)}</h2>
          {!events.length ? (
            <Empty>{t.volume.noNoteHistory}</Empty>
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
                    {dateTime(slice.snapshot.committed_at, lang)} ·{" "}
                    {short(slice.snapshot.sha)}
                  </button>
                  <span>
                    {t.volume.states[p.state] || p.state} ·{" "}
                    {statusLabel(p.status, lang)}
                    {p.maturity ? ` · ${maturityLabel(p.maturity, lang)}` : ""}
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
  const { lang, t } = useI18n();
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
      [s.sha, `${dateTime(s.committed_at, lang)} · ${short(s.sha)}`] as [
        string,
        string,
      ],
  );
  const toOptions = options.some(([sha]) => sha === to)
    ? options
    : [[to, t.unfetched(short(to))] as [string, string], ...options];
  return (
    <>
      <p className="lede">{t.volume.lede}</p>
      <div className="filters volume-range">
        <Select
          label={t.volume.startSnapshot}
          value={from}
          options={[["", t.volume.latest24], ...options]}
          onChange={(volume_from) => update({ volume_from, volume_at: null })}
        />
        <Select
          label={t.volume.endSnapshot}
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
            {t.volume.specifyNoteId}
            <input
              aria-label={t.volume.specifyNoteIdAria}
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder={t.volume.specifyNotePlaceholder}
            />
          </label>
          <button type="submit">{t.volume.findButton}</button>
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
      <p className="muted">{t.volume.footerNote}</p>
    </>
  );
}
