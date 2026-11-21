import type { Context } from "./App";
import { query, useLoad, type Schema } from "./api";
import { Empty, Pager, Select, Status } from "./components";
import { maturityLabel, record, short, text, type Update } from "./state";

export const outcomes: Record<string, string> = {
  success: "成功",
  failure: "失敗",
  no_effect: "効果なし",
  inconclusive: "判断不能",
  pending: "結果待ち",
};
const captureStates: Record<string, string> = {
  unprocessed: "未整理",
  canonicalized: "正本化",
  deferred: "保留",
  discarded: "破棄",
  needs_review: "要確認",
};
const decisions: Record<string, string> = {
  accept: "採用",
  reject: "却下",
  defer: "保留",
};

function temporalText(value: unknown): string {
  const data = record(value);
  if (!data.precision) return "未記録";
  if (data.precision === "unknown") return "時期不明";
  if (data.precision === "range")
    return `${temporalText(data.start)}〜${temporalText(data.end)}`;
  return typeof data.value === "string"
    ? data.value
        .split("-")
        .map((p, i) => `${Number(p)}${["年", "月", "日"][i]}`)
        .join("")
    : "未記録";
}

function Excluded({ count }: { count: number }) {
  return count ? (
    <p className="warning message">
      読み込めなかったノートが {count} 件あります（有効な記録のみ表示）。
    </p>
  ) : null;
}

export function ReviewDecision({ data }: { data: Record<string, unknown> }) {
  const choice = record(data.consolidation);
  const results = Array.isArray(data.capture_outcomes)
    ? data.capture_outcomes.map(record)
    : [];
  if (!choice.decision && !results.length) return null;
  return (
    <section>
      <h3>この振り返りの判断</h3>
      {!!choice.decision && (
        <p>
          提案: {decisions[String(choice.decision)]} ·{" "}
          {text(choice.proposal_id)}
        </p>
      )}
      {results.map((result, i) => (
        <p key={i}>
          {text(result.ref)} · {captureStates[String(result.outcome)]}
          {Array.isArray(result.note_ids) &&
            result.note_ids.length > 0 &&
            ` · 採用先: ${result.note_ids.join("、")}`}
        </p>
      ))}
    </section>
  );
}

export function TemporalMetadata({ data }: { data: Record<string, unknown> }) {
  const temporal = record(data.temporal);
  return (
    <dl className="metadata temporal-metadata">
      {[
        ["体験した時期", temporalText(temporal.experienced)],
        ["気づいた時期", temporalText(temporal.noticed)],
        ["記録した日", text(data.created)],
        ["採用した時期", temporalText(temporal.adopted)],
      ].map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Experiences({ at, params, update, note }: Context) {
  const cursor = Number(params.get("cursor")) || 0;
  const load = useLoad<Schema["ExperienceResponse"]>(
    query("experiences", {
      at,
      start: params.get("experience_start"),
      end: params.get("experience_end"),
      cursor,
      limit: 20,
    }),
    { commit_sha: at },
  );
  return (
    <>
      <p className="lede">ノートに書かれた「体験した時期」順に並べます。</p>
      <p className="muted">
        基準コミット: <code>{short(at)}</code>（同じ時期グループ内は順不同）
      </p>
      <div className="filters">
        <label className="field">
          開始日
          <input
            type="date"
            value={params.get("experience_start") || ""}
            onChange={(e) =>
              update({ experience_start: e.target.value, cursor: null })
            }
          />
        </label>
        <label className="field">
          終了日
          <input
            type="date"
            value={params.get("experience_end") || ""}
            onChange={(e) =>
              update({ experience_end: e.target.value, cursor: null })
            }
          />
        </label>
        <button
          onClick={() =>
            update({
              experience_start: null,
              experience_end: null,
              cursor: null,
            })
          }
        >
          リセット
        </button>
      </div>
      <Status load={load}>
        {(data) => (
          <>
            <Excluded count={data.excluded} />
            <p className="result-count">
              {data.total} 件（時期不明・未記録 {data.undated} 件を含む）
            </p>
            {data.coverage.shallow && (
              <p className="warning message">
                Git 初出は取得済みの履歴内での結果です。
              </p>
            )}
            {!data.items.length && <Empty />}
            <ul className="feedback-list experience-list">
              {data.items.map((item) => (
                <li key={item.note.id}>
                  <p className="eyebrow">
                    {item.group === null
                      ? "時期不明・未記録"
                      : `時期グループ ${item.group + 1}`}
                  </p>
                  <button
                    className="feedback-title"
                    aria-pressed={note === item.note.id}
                    onClick={() => update({ note: item.note.id })}
                  >
                    {item.note.title}
                  </button>
                  <TemporalMetadata data={item.note.frontmatter} />
                  <p>
                    確認日:{" "}
                    {text(record(item.note.frontmatter.review).confirmed_at)} ·
                    初出:{" "}
                    {item.first_seen_sha && (
                      <button
                        onClick={() =>
                          update({
                            at: item.first_seen_sha!,
                            note: item.note.id,
                            as_of: null,
                            cursor: null,
                          })
                        }
                      >
                        {short(item.first_seen_sha)}
                      </button>
                    )}
                  </p>
                  {!!item.warnings.length && (
                    <p className="warning message">
                      体験・気づき・採用の時期の順序を確認してください。
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <Pager cursor={cursor} next={data.next_cursor} update={update} />
          </>
        )}
      </Status>
    </>
  );
}

export function Consolidation({ at, params, update, githubUrl }: Context) {
  const cursor = Number(params.get("cursor")) || 0;
  const load = useLoad<Schema["CapturesResponse"]>(
    query("captures", {
      at,
      state: params.get("capture_state"),
      cursor,
      limit: 20,
    }),
    { commit_sha: at },
  );
  return (
    <>
      <p className="lede">
        メモ（Capture）の整理状況と、採用・保留の判断を確認します。
      </p>
      <div className="filters">
        <Select
          label="整理状況"
          value={params.get("capture_state") || ""}
          options={[["", "すべて"], ...Object.entries(captureStates)]}
          onChange={(state) => update({ capture_state: state, cursor: null })}
        />
        <button onClick={() => update({ view: "capture" })}>
          整理の手順を見る
        </button>
      </div>
      <Status load={load}>
        {(data) => (
          <>
            <p className="capture-coverage" role="status">
              {data.external.state === "historical"
                ? "過去時点の整理記録を表示しています（現在の GitHub 状態は含みません）。"
                : data.external.state === "unavailable"
                  ? "外部メモは未取り込みのため、Git 上の記録のみ表示しています。"
                  : data.external.state === "invalid"
                    ? "取り込みデータを読み込めません。再取得してください。"
                    : `取り込み済み ${data.external.selected_refs.length} 件（${data.external.state === "complete" ? "完了" : "一部"} · 取得 ${data.external.fetched_at}）`}
            </p>
            <Excluded count={data.excluded} />
            <p className="result-count">整理記録 {data.total} 件</p>
            {!data.items.length && <Empty>整理記録はまだありません。</Empty>}
            <ul className="feedback-list capture-list">
              {data.items.map((item) => (
                <li key={item.ref}>
                  <p className="eyebrow">
                    {captureStates[item.state]}
                    {item.targets.some((t) => t.state === "deleted") &&
                      "（採用先削除）"}
                  </p>
                  <h2>{item.title || item.ref}</h2>
                  {!!item.pending_proposal_ids?.length && (
                    <p className="warning message">
                      反映待ちの整理案があります（まだ正本には入っていません）。
                    </p>
                  )}
                  <p>
                    <code>{item.ref}</code>
                    {item.issue_state && ` · 状態: ${item.issue_state}`}{" "}
                    {item.created_at && ` · 作成: ${item.created_at}`}
                  </p>
                  {item.decisions.map((decision, i) => (
                    <p key={`${decision.review_id}-${i}`}>
                      提案: {decisions[decision.decision]} ·{" "}
                      <button
                        onClick={() =>
                          update({
                            at: decision.at,
                            note: decision.review_id,
                            as_of: null,
                            cursor: null,
                          })
                        }
                      >
                        判断を見る
                      </button>
                    </p>
                  ))}
                  {item.targets.map((target, i) => (
                    <p key={`${target.id}-${i}`}>
                      採用先:{" "}
                      <button
                        disabled={target.state === "invalid"}
                        onClick={() =>
                          update({
                            at: target.at,
                            note: target.id,
                            as_of: null,
                            cursor: null,
                          })
                        }
                      >
                        {target.id}（採用時）
                      </button>
                    </p>
                  ))}
                  {!!item.diagnostics.length && (
                    <p className="warning message">
                      採用先の参照が見つかりません。判断記録を確認してください。
                    </p>
                  )}
                  {item.review_ids.length > 0 && (
                    <div className="detail-actions">
                      {item.review_ids.map((id) => (
                        <button key={id} onClick={() => update({ note: id })}>
                          {id}
                        </button>
                      ))}
                    </div>
                  )}
                  {githubUrl && /^github-issue-\d+$/.test(item.ref) && (
                    <a
                      href={`${githubUrl}/issues/${item.ref.split("-").at(-1)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      GitHub で開く ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <Pager cursor={cursor} next={data.next_cursor} update={update} />
          </>
        )}
      </Status>
    </>
  );
}

function ApplicationList({
  items,
  update,
}: {
  items: Schema["ApplicationEntry"][];
  update: Update;
}) {
  return (
    <ul className="feedback-list application-list">
      {items.map((item) => (
        <li key={item.note.id}>
          <p className="eyebrow">
            {outcomes[item.outcome]} · {item.experienced}
          </p>
          <button
            className="feedback-title"
            onClick={() => update({ note: item.note.id })}
          >
            {item.note.title}
          </button>
          <p>使ったノート</p>
          {item.targets.map((target, i) => (
            <p key={`${target.note_id}-${i}`}>
              <button
                disabled={target.state !== "available"}
                onClick={() =>
                  update({
                    at: target.at,
                    note: target.note_id,
                    as_of: null,
                    cursor: null,
                  })
                }
              >
                {target.note_id}
                {target.at && ` · ${short(target.at)}`}
              </button>
              {target.state !== "available" && (
                <span>
                  {" "}
                  ·{" "}
                  {target.state === "unknown" ? "版不明" : "版を取得できません"}
                </span>
              )}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

function MaturityChanges({
  changes,
  update,
}: {
  changes: Schema["MaturityChange"][];
  update: Update;
}) {
  return (
    <section>
      <h3>成熟度の変更履歴</h3>
      {!changes.length ? (
        <Empty>成熟度の変更履歴はまだありません。</Empty>
      ) : (
        <ul className="feedback-list">
          {changes.map((change, i) => (
            <li key={`${change.review_id}-${i}`}>
              <p>
                {change.note_id} · {maturityLabel(change.from)} →{" "}
                {maturityLabel(change.to)}
              </p>
              <button
                onClick={() =>
                  update({
                    at: change.at,
                    note: change.review_id,
                    as_of: null,
                    cursor: null,
                  })
                }
              >
                判断した振り返りを見る
              </button>
              <p>根拠になった記録:</p>
              <div className="detail-actions">
                {change.evidence_ids.map((id) => (
                  <button
                    key={id}
                    onClick={() =>
                      update({
                        at: change.at,
                        note: id,
                        as_of: null,
                        cursor: null,
                      })
                    }
                  >
                    {id}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Applications({ at, params, update }: Context) {
  const cursor = Number(params.get("cursor")) || 0;
  const load = useLoad<Schema["ApplicationsResponse"]>(
    query("applications", {
      at,
      note_id: params.get("application_note"),
      cursor,
      limit: 20,
    }),
    { commit_sha: at },
  );
  return (
    <>
      <p className="lede">
        原則や手順を実際に試した記録と、その結果を確認します。
      </p>
      <div className="filters">
        <label className="field">
          対象ノート ID
          <input
            value={params.get("application_note") || ""}
            onChange={(e) =>
              update({ application_note: e.target.value, cursor: null })
            }
            placeholder="すべて"
          />
        </label>
        <button
          onClick={() => update({ application_note: null, cursor: null })}
        >
          リセット
        </button>
      </div>
      <Status load={load}>
        {(data) => (
          <>
            <Excluded count={data.excluded} />
            <p className="result-count">試した記録 {data.total} 件</p>
            {!data.items.length && <Empty>試した記録はまだありません。</Empty>}
            <ApplicationList items={data.items} update={update} />
            <Pager cursor={cursor} next={data.next_cursor} update={update} />
            <MaturityChanges changes={data.maturity_changes} update={update} />
          </>
        )}
      </Status>
      <section>
        <h2>今日の振り返り</h2>
        <p>
          今日、現実から Yes / No
          が返ってくる行動をしましたか？観察した反応と分からないことを分けて残しましょう。
        </p>
      </section>
    </>
  );
}

export function NoteFeedback({
  at,
  note,
  update,
}: {
  at: string;
  note: string;
  update: Update;
}) {
  const load = useLoad<Schema["ApplicationsResponse"]>(
    query("applications", { at, note_id: note, limit: 20 }),
    { commit_sha: at },
  );
  return (
    <section>
      <h3>試した記録</h3>
      <Status load={load}>
        {(data) => (
          <>
            {!data.items.length && (
              <p>このノートを使った記録はまだありません。</p>
            )}
            <ApplicationList items={data.items} update={update} />
            <button
              onClick={() =>
                update({
                  view: "applications",
                  application_note: note,
                  cursor: null,
                })
              }
            >
              一覧で見る
            </button>
            <MaturityChanges changes={data.maturity_changes} update={update} />
          </>
        )}
      </Status>
    </section>
  );
}
