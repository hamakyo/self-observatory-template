import { useState } from "react";
import {
  NoteFeedback,
  ReviewDecision,
  TemporalMetadata,
  outcomes,
} from "./feedback";
import type { Context } from "./App";
import { query, useLoad, type Schema, type Snapshot } from "./api";
import {
  Empty,
  NoteList,
  Pager,
  SafeMarkdown,
  Select,
  Status,
} from "./components";
import {
  confirmation,
  dateTime,
  fieldLabel,
  kinds,
  maturityLabel,
  noteTypeLabel,
  record,
  review,
  schedules,
  short,
  statusLabel,
  text,
} from "./state";

const noteTypes = [
  "principle",
  "playbook",
  "pattern",
  "knowledge",
  "episode",
  "influence",
  "decision",
  "review",
  "journal",
  "media",
];
export function Overview({ overview, update, at, note, snapshots }: Context) {
  const firstParent = snapshots.find((s) => s.sha === at)?.first_parent;
  const comparable = snapshots.some((s) => s.sha === firstParent);
  const recent = useLoad<Schema["DiffResponse"]>(
    comparable
      ? query("diff", {
          from: firstParent,
          to: at,
          limit: 100,
        })
      : null,
    {
      to_sha: at,
      from_sha: firstParent || "",
    },
  );
  return (
    <Status load={overview}>
      {(data) => (
        <>
          <p className="lede">選んだ時点のノート数と、確認が必要な記録です。</p>
          <div className="stats">
            <button
              onClick={() =>
                update({
                  view: "browse",
                  type: null,
                  status: null,
                  domain: null,
                  q: null,
                  cursor: null,
                })
              }
            >
              <span>すべてのノート</span>
              <strong>{data.total}</strong>
              <small>一覧を見る ↗</small>
            </button>
            <button
              onClick={() =>
                update({
                  view: "review",
                  confirmation: "unrecorded",
                  schedule: null,
                })
              }
            >
              <span>未確認</span>
              <strong>{data.review.unrecorded}</strong>
              <small>確認リストへ ↗</small>
            </button>
            <button
              onClick={() =>
                update({
                  view: "review",
                  confirmation: null,
                  schedule: "overdue",
                })
              }
            >
              <span>期限切れ</span>
              <strong>{data.review.overdue}</strong>
              <small>基準日 {data.as_of} ↗</small>
            </button>
          </div>
          {!!data.excluded && (
            <p className="warning message">
              読み込めなかった記録が {data.excluded}{" "}
              件あります（有効なノートのみ集計）。
            </p>
          )}
          <section>
            <h2>種類ごとの件数</h2>
            <div className="type-counts">
              {Object.entries(data.by_type).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() =>
                    update({
                      view: "browse",
                      type,
                      q: null,
                      status: null,
                      domain: null,
                      cursor: null,
                    })
                  }
                >
                  <span>{noteTypeLabel(type)}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
            {!data.total && <Empty>この時点のノートは 0 件です。</Empty>}
          </section>
          <section>
            <div className="section-heading">
              <h2>この時点の変更</h2>
              <button
                disabled={!comparable}
                onClick={() =>
                  update({
                    view: "diff",
                    from: firstParent || at,
                    to: at,
                    note: null,
                  })
                }
              >
                差分を見る ↗
              </button>
            </div>
            <p className="muted">直前のコミットからのノート変更</p>
            {!comparable ? (
              <p>最初のコミットのため比較対象がありません。</p>
            ) : (
              <Status load={recent}>
                {(diff) => (
                  <>
                    {diff.items.length ? (
                      <ul className="change-list">
                        {diff.items.map((item) => (
                          <li key={item.id}>
                            <span className="badge">
                              {kinds[item.kind] || item.kind}
                            </span>
                            <button
                              aria-pressed={note === item.id}
                              onClick={() => update({ note: item.id })}
                            >
                              {text(
                                item.after?.title ||
                                  item.before?.title ||
                                  item.id,
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty>直前からノートの変更はありません。</Empty>
                    )}
                    {diff.next_cursor !== null && (
                      <p>
                        一部のみ表示しています。すべて見るには「差分を見る」を開いてください。
                      </p>
                    )}
                  </>
                )}
              </Status>
            )}
          </section>
        </>
      )}
    </Status>
  );
}
export function Browse({ params, update, at, note }: Context) {
  const cursor = Math.max(0, Number(params.get("cursor")) || 0);
  const notes = useLoad<Schema["NotesResponse"]>(
    query("notes", {
      at,
      q: params.get("q"),
      type: params.get("type"),
      status: params.get("status"),
      domain: params.get("domain"),
      cursor,
      limit: 20,
    }),
    { commit_sha: at },
  );
  return (
    <>
      <div className="filters">
        <Select
          label="種類"
          value={params.get("type") || ""}
          options={[
            ["", "すべて"],
            ...noteTypes.map((v) => [v, noteTypeLabel(v)] as [string, string]),
          ]}
          onChange={(type) => update({ type, cursor: null })}
        />
        <Select
          label="状態"
          value={params.get("status") || ""}
          options={["", "active", "draft", "superseded", "archived"].map(
            (v) => [v, v ? statusLabel(v) : "すべて"],
          )}
          onChange={(status) => update({ status, cursor: null })}
        />
        <label className="field">
          領域
          <input
            aria-label="領域"
            value={params.get("domain") || ""}
            onChange={(e) =>
              update({ domain: e.target.value, cursor: null }, true)
            }
            placeholder="領域名で絞る"
          />
        </label>
        <button
          onClick={() =>
            update({
              q: null,
              type: null,
              status: null,
              domain: null,
              cursor: null,
            })
          }
        >
          リセット
        </button>
      </div>
      <Status load={notes}>
        {(data) => (
          <>
            <p className="result-count">
              {data.total} 件
              {params.get("q") && ` · 検索「${params.get("q")}」`}
            </p>
            {!!data.excluded && (
              <p className="warning message">
                読み込めなかった記録 {data.excluded} 件を除外しています。
              </p>
            )}
            <NoteList notes={data.items} selected={note} update={update} />
            {data.total > 0 && (
              <Pager cursor={cursor} next={data.next_cursor} update={update} />
            )}
          </>
        )}
      </Status>
    </>
  );
}
export function Review({ params, update, at }: Context) {
  const queue = useLoad<Schema["ReviewQueueResponse"]>(
    query("review-queue", { at, as_of: params.get("as_of") }),
    {
      commit_sha: at,
      ...(params.get("as_of") ? { as_of: params.get("as_of")! } : {}),
    },
  );
  return (
    <>
      <p className="lede">
        確認がまだのノートや、見直し時期を過ぎたノートを確認できます（期限を過ぎても内容は変わりません）。
      </p>
      <div className="filters">
        <label className="field">
          基準日
          <input
            type="date"
            value={params.get("as_of") || ""}
            onChange={(e) => update({ as_of: e.target.value })}
          />
        </label>
        <Select
          label="確認状態"
          value={params.get("confirmation") || ""}
          options={[
            ["", "すべて"],
            ["true", "確認済み"],
            ["false", "未確認（明示）"],
            ["unrecorded", "未確認（未記録）"],
          ]}
          onChange={(confirmation) => update({ confirmation })}
        />
        <Select
          label="見直し期限"
          value={params.get("schedule") || ""}
          options={[["", "すべて"], ...Object.entries(schedules)]}
          onChange={(schedule) => update({ schedule })}
        />
      </div>
      <Status load={queue}>
        {(data) => {
          const rows = data.items.filter(
            (row) =>
              (!params.get("confirmation") ||
                (row.owner_confirmed === null
                  ? "unrecorded"
                  : String(row.owner_confirmed)) ===
                  params.get("confirmation")) &&
              (!params.get("schedule") ||
                row.schedule === params.get("schedule")),
          );
          return (
            <>
              <p className="result-count">
                基準日 {data.as_of} · 確認済み {data.confirmation.true} /
                未確認（明示） {data.confirmation.false} / 未確認（未記録）{" "}
                {data.confirmation.unrecorded}
              </p>
              <p>{rows.length} 件</p>
              {!rows.length ? (
                <Empty />
              ) : (
                <ul className="review-list">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button onClick={() => update({ note: row.id })}>
                        {row.title}
                      </button>
                      <span>{confirmation(row.owner_confirmed)}</span>
                      <span className={row.overdue ? "due badge" : "badge"}>
                        {schedules[row.schedule]}
                        {row.review_after && ` · ${row.review_after}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </Status>
    </>
  );
}
function evolutionLabel(snapshot: Snapshot) {
  if (snapshot.change_basis === "unavailable") return "— 判定不可";
  if (snapshot.self_changed && snapshot.observatory_changed) return "◉ 両方";
  if (snapshot.self_changed) return "● ノート";
  if (snapshot.observatory_changed) return "○ 仕組み";
  return "· その他";
}

export function Trajectory({
  snapshots,
  snapshotsReady,
  at,
  params,
  update,
  setAt,
}: Context & { setAt: (sha: string) => void }) {
  const [on, setOn] = useState("");
  const evolution = ["all", "observatory"].includes(
    params.get("evolution") || "",
  )
    ? params.get("evolution")!
    : "self";
  const visible = snapshots.filter(
    (s) =>
      evolution === "all" ||
      (evolution === "self" ? s.self_changed : s.observatory_changed),
  );
  const current = snapshots.find((s) => s.sha === at);
  const previous = [...visible]
    .reverse()
    .find((s) => current && s.position < current.position);
  const next = visible.find((s) => current && s.position > current.position);
  const selection = useLoad<Schema["SnapshotResponse"]>(
    on ? query("snapshots", { on, evolution }) : null,
  );
  return (
    <>
      <p className="lede">
        ノートと仕組みの更新履歴を Git の採用順にたどります。
      </p>
      <div className="filters trajectory-controls">
        <Select
          label="表示する履歴"
          value={evolution}
          options={[
            ["self", "ノートのみ（両方含む）"],
            ["observatory", "仕組みのみ（両方含む）"],
            ["all", "すべて"],
          ]}
          onChange={(evolution) => update({ evolution })}
        />
        <button
          disabled={!previous}
          onClick={() => previous && setAt(previous.sha)}
        >
          前の時点
        </button>
        <button disabled={!next} onClick={() => next && setAt(next.sha)}>
          次の時点
        </button>
        <label className="field">
          日付から探す
          <input
            type="date"
            value={on}
            onChange={(e) => setOn(e.target.value)}
          />
        </label>
      </div>
      <p className="legend">● ノート　○ 仕組み　◉ 両方　· その他　— 判定不可</p>
      {current && !visible.includes(current) && (
        <p className="message">
          選択中の {short(at)}（{evolutionLabel(current)}
          ）はこの条件に含まれません。
          <button onClick={() => update({ evolution: "all" })}>
            すべて表示
          </button>
        </p>
      )}
      {!snapshotsReady ? (
        <p role="status">履歴を読み込み中…</p>
      ) : (
        !visible.length && <Empty>該当する変更履歴はありません。</Empty>
      )}
      {on && (
        <Status load={selection}>
          {(data) => (
            <>
              {data.coverage.committer_time_inversion && (
                <p className="warning message">
                  コミット日時に前後があります。条件に合う最後の時点を選びます。
                </p>
              )}
              {data.date_selection?.sha ? (
                <button onClick={() => setAt(data.date_selection!.sha!)}>
                  この日の時点へ · {short(data.date_selection.sha)}
                </button>
              ) : (
                <Empty>
                  {data.date_selection?.state === "history_unavailable"
                    ? "この日付は取得範囲外です。"
                    : "この日までに該当する変更はありません。"}
                </Empty>
              )}
            </>
          )}
        </Status>
      )}
      <ol className="timeline">
        {visible.map((snapshot) => (
          <li
            key={snapshot.sha}
            className={at === snapshot.sha ? "current" : ""}
          >
            <span className="timeline-order">
              {String(snapshot.position + 1).padStart(2, "0")}
            </span>
            <button
              aria-current={at === snapshot.sha ? "step" : undefined}
              onClick={() => setAt(snapshot.sha)}
            >
              <span>
                {dateTime(snapshot.committed_at)}{" "}
                <code>{short(snapshot.sha)}</code>
              </span>
              <strong>{snapshot.subject}</strong>
              <span className="evolution-label">
                {evolutionLabel(snapshot)}
              </span>
            </button>
            <button
              className="small"
              disabled={
                !snapshot.self_changed ||
                !snapshots.some((s) => s.sha === snapshot.first_parent)
              }
              onClick={() =>
                update({
                  view: "diff",
                  from: snapshot.first_parent,
                  to: snapshot.sha,
                  diff_scope: "all",
                })
              }
            >
              直前との差分
            </button>
            <details className="evolution-paths">
              <summary>
                変更ファイル ·{" "}
                {snapshot.change_basis === "unavailable"
                  ? "比較元なし"
                  : `ノート ${snapshot.self_change_paths.length} / 仕組み ${snapshot.observatory_change_paths.length}`}
              </summary>
              {snapshot.change_basis === "unavailable" ? (
                <p>比較元がないため判定できません。</p>
              ) : (
                <>
                  <p className="muted">
                    {snapshot.change_basis === "empty_tree"
                      ? "最初のコミット（空から追加）"
                      : `直前 ${short(snapshot.first_parent!)} との比較（パスで自動分類）`}
                  </p>
                  {(
                    [
                      ["ノート", snapshot.self_change_paths],
                      ["仕組み", snapshot.observatory_change_paths],
                    ] as const
                  ).map(
                    ([label, paths]) =>
                      paths.length > 0 && (
                        <div key={label}>
                          <strong>{label}</strong>
                          <ul>
                            {paths.map((path) => (
                              <li key={path}>
                                <code>{path}</code>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ),
                  )}
                  {!snapshot.self_changed && !snapshot.observatory_changed && (
                    <p>対象ファイルの変更はありません。</p>
                  )}
                </>
              )}
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}
export function Detail({ at, note, update }: Context) {
  const detail = useLoad<Schema["NoteDetail"]>(
    query(`notes/${encodeURIComponent(note)}`, { at }),
    { commit_sha: at },
  );
  const history = useLoad<Schema["HistoryResponse"]>(
    query(`notes/${encodeURIComponent(note)}/history`, { at, limit: 100 }),
    { commit_sha: at },
    true,
  );
  const [showMedia, setShowMedia] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  return (
    <>
      <div className="detail-top">
        <p className="eyebrow">ノート · {short(at)}</p>
        <button
          aria-label="詳細を閉じる"
          onClick={() => update({ note: null })}
        >
          閉じる ×
        </button>
      </div>
      <Status load={detail}>
        {(data) => (
          <>
            <h2>{data.title}</h2>
            <code className="note-id">{data.id}</code>
            <dl className="metadata">
              <div>
                <dt>種類</dt>
                <dd>{noteTypeLabel(data.frontmatter.type)}</dd>
              </div>
              <div>
                <dt>状態</dt>
                <dd>{statusLabel(data.frontmatter.status)}</dd>
              </div>
              <div>
                <dt>成熟度</dt>
                <dd>{maturityLabel(data.frontmatter.maturity)}</dd>
              </div>
              <div>
                <dt>確認</dt>
                <dd>
                  {confirmation(
                    review(data.frontmatter.review).owner_confirmed,
                  )}
                </dd>
              </div>
              {review(data.frontmatter.review).confirmed_at && (
                <div>
                  <dt>確認日</dt>
                  <dd>{text(review(data.frontmatter.review).confirmed_at)}</dd>
                </div>
              )}
              {review(data.frontmatter.review).review_after && (
                <div>
                  <dt>見直し日</dt>
                  <dd>{text(review(data.frontmatter.review).review_after)}</dd>
                </div>
              )}
            </dl>
            <TemporalMetadata data={data.frontmatter} />
            {data.frontmatter.application && (
              <p>
                試した結果:{" "}
                {outcomes[String(record(data.frontmatter.application).outcome)]}
              </p>
            )}
            <div className="detail-actions">
              <button
                onClick={() => update({ view: "provenance", graph: null })}
              >
                つながりを見る
              </button>
              <button onClick={() => update({ view: "diff" })}>
                差分を見る
              </button>
            </div>
            <ReviewDecision data={data.frontmatter} />
            <SafeMarkdown body={data.body} />
            <NoteFeedback at={at} note={note} update={update} />
            {data.frontmatter.type === "media" && (
              <section>
                <h3>添付画像</h3>
                {!showMedia ? (
                  <button onClick={() => setShowMedia(true)}>画像を表示</button>
                ) : mediaError ? (
                  <p role="alert">画像を表示できません。</p>
                ) : (
                  <img
                    className="approved-media"
                    src={query(`media/${encodeURIComponent(note)}`, { at })}
                    alt={data.title}
                    onError={() => setMediaError(true)}
                  />
                )}
              </section>
            )}
            <section>
              <h3>出典</h3>
              {data.frontmatter.source ? (
                <dl className="source">
                  {Object.entries(data.frontmatter.source).map(
                    ([key, value]) => (
                      <div key={key}>
                        <dt>{fieldLabel(key)}</dt>
                        <dd>
                          {typeof value === "string" &&
                          /^https?:\/\//i.test(value) ? (
                            <a
                              href={value}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {value}
                            </a>
                          ) : (
                            text(value)
                          )}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              ) : (
                <p>出典はありません。</p>
              )}
            </section>
            <section>
              <h3>つながり</h3>
              {["derived_from", "related", "supersedes", "superseded_by"].map(
                (key) => (
                  <div className="relations" key={key}>
                    <small>{kinds[key] || key}</small>
                    {Array.isArray(data.frontmatter[key]) &&
                    data.frontmatter[key].length ? (
                      data.frontmatter[key].map((id: string) => (
                        <button key={id} onClick={() => update({ note: id })}>
                          {id}
                        </button>
                      ))
                    ) : (
                      <span>なし</span>
                    )}
                  </div>
                ),
              )}
            </section>
            <section>
              <h3>更新履歴</h3>
              <Status load={history}>
                {(versions) => (
                  <ul className="history">
                    {versions.items.map((item) => (
                      <li key={item.sha}>
                        <button
                          onClick={() =>
                            update({ at: item.sha, as_of: null, cursor: null })
                          }
                        >
                          {dateTime(item.committed_at)} · {short(item.sha)}
                        </button>
                        <small>{item.path}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </Status>
            </section>
            <p className="file-path">
              {data.path}
              <br />
              blob {short(data.blob_sha)}
            </p>
          </>
        )}
      </Status>
    </>
  );
}
export function Capture({ githubUrl }: Pick<Context, "githubUrl">) {
  return (
    <div className="capture">
      <p className="lede">
        生の会話ではなく、あとから使える学びだけを残します。
      </p>
      <h2>メモを残す流れ</h2>
      <ol>
        <li>起きたこと・解釈・分からないことを分けて書きます。</li>
        <li>氏名・職場の機密・認証情報を除き、必要な意味だけ残します。</li>
        <li>無害化したメモを Capture Issue かローカルに置きます。</li>
        <li>原則・パターン・手順への反映は PR で確認します。</li>
      </ol>
      <h2>整理して、試した結果を戻す</h2>
      <ol>
        <li>関連ノートと見比べて、共通点や反例を整理します。</li>
        <li>採用・保留・破棄の判断を review に残します。</li>
        <li>実際に試したら、使った版・行動・結果を episode に記録します。</li>
        <li>結果をもとに考えを見直し、必要なら差分を PR にします。</li>
      </ol>
      <p className="muted">
        この画面は閲覧専用です。メモの作成や編集は行いません。
      </p>
      {githubUrl ? (
        <>
          <a
            href={`${githubUrl}/blob/main/docs/capture.md`}
            target="_blank"
            rel="noreferrer"
          >
            残し方の詳細（docs/capture.md） ↗
          </a>
          <br />
          <a
            href={`${githubUrl}/blob/main/DATA_POLICY.md`}
            target="_blank"
            rel="noreferrer"
          >
            データ保存ルール（DATA_POLICY.md） ↗
          </a>
        </>
      ) : (
        <p className="muted">
          詳細ドキュメント: <code>docs/capture.md</code> /{" "}
          <code>DATA_POLICY.md</code>
        </p>
      )}
    </div>
  );
}
