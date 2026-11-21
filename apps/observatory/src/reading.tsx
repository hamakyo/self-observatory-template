import { useState } from "react";
import { NoteFeedback, ReviewDecision, TemporalMetadata } from "./feedback";
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
import { useI18n, type Dictionary } from "./i18n";
import {
  confirmation,
  dateTime,
  fieldLabel,
  kindLabel,
  maturityLabel,
  noteTypeLabel,
  record,
  review,
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
  const { lang, t } = useI18n();
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
          <p className="lede">{t.overview.lede}</p>
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
              <span>{t.overview.allNotes}</span>
              <strong>{data.total}</strong>
              <small>{t.overview.openList}</small>
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
              <span>{t.overview.unconfirmed}</span>
              <strong>{data.review.unrecorded}</strong>
              <small>{t.overview.openReview}</small>
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
              <span>{t.overview.overdue}</span>
              <strong>{data.review.overdue}</strong>
              <small>{t.overview.asOfDate(data.as_of)}</small>
            </button>
          </div>
          {!!data.excluded && (
            <p className="warning message">
              {t.overview.excludedWarning(data.excluded)}
            </p>
          )}
          <section>
            <h2>{t.overview.countsByType}</h2>
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
                  <span>{noteTypeLabel(type, lang)}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
            {!data.total && <Empty>{t.overview.zeroNotesAtSnapshot}</Empty>}
          </section>
          <section>
            <div className="section-heading">
              <h2>{t.overview.changesAtSnapshot}</h2>
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
                {t.overview.viewDiff}
              </button>
            </div>
            <p className="muted">{t.overview.changesSubtitle}</p>
            {!comparable ? (
              <p>{t.overview.firstCommitNoParent}</p>
            ) : (
              <Status load={recent}>
                {(diff) => (
                  <>
                    {diff.items.length ? (
                      <ul className="change-list">
                        {diff.items.map((item) => (
                          <li key={item.id}>
                            <span className="badge">
                              {kindLabel(item.kind, lang)}
                            </span>
                            <button
                              aria-pressed={note === item.id}
                              onClick={() => update({ note: item.id })}
                            >
                              {text(
                                item.after?.title ||
                                  item.before?.title ||
                                  item.id,
                                lang,
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty>{t.overview.noChangesSinceParent}</Empty>
                    )}
                    {diff.next_cursor !== null && (
                      <p>{t.overview.partialDiffNotice}</p>
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
  const { lang, t } = useI18n();
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
          label={t.browse.type}
          value={params.get("type") || ""}
          options={[
            ["", t.all],
            ...noteTypes.map(
              (v) => [v, noteTypeLabel(v, lang)] as [string, string],
            ),
          ]}
          onChange={(type) => update({ type, cursor: null })}
        />
        <Select
          label={t.browse.status}
          value={params.get("status") || ""}
          options={["", "active", "draft", "superseded", "archived"].map(
            (v) => [v, v ? statusLabel(v, lang) : t.all],
          )}
          onChange={(status) => update({ status, cursor: null })}
        />
        <label className="field">
          {t.browse.domain}
          <input
            aria-label={t.browse.domain}
            value={params.get("domain") || ""}
            onChange={(e) =>
              update({ domain: e.target.value, cursor: null }, true)
            }
            placeholder={t.browse.domainPlaceholder}
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
          {t.reset}
        </button>
      </div>
      <Status load={notes}>
        {(data) => (
          <>
            <p className="result-count">
              {t.countItems(data.total)}
              {params.get("q") && t.browse.searchSuffix(params.get("q")!)}
            </p>
            {!!data.excluded && (
              <p className="warning message">
                {t.browse.excludedNotice(data.excluded)}
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
  const { lang, t } = useI18n();
  const queue = useLoad<Schema["ReviewQueueResponse"]>(
    query("review-queue", { at, as_of: params.get("as_of") }),
    {
      commit_sha: at,
      ...(params.get("as_of") ? { as_of: params.get("as_of")! } : {}),
    },
  );
  return (
    <>
      <p className="lede">{t.review.lede}</p>
      <div className="filters">
        <label className="field">
          {t.review.asOf}
          <input
            type="date"
            value={params.get("as_of") || ""}
            onChange={(e) => update({ as_of: e.target.value })}
          />
        </label>
        <Select
          label={t.review.confirmationState}
          value={params.get("confirmation") || ""}
          options={[
            ["", t.all],
            ["true", t.confirmation.true],
            ["false", t.confirmation.false],
            ["unrecorded", t.confirmation.unrecordedExplicit],
          ]}
          onChange={(confirmation) => update({ confirmation })}
        />
        <Select
          label={t.review.schedule}
          value={params.get("schedule") || ""}
          options={[["", t.all], ...Object.entries(t.schedules)]}
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
                {t.review.summary(
                  data.as_of,
                  data.confirmation.true,
                  data.confirmation.false,
                  data.confirmation.unrecorded,
                )}
              </p>
              <p>{t.countItems(rows.length)}</p>
              {!rows.length ? (
                <Empty />
              ) : (
                <ul className="review-list">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button onClick={() => update({ note: row.id })}>
                        {row.title}
                      </button>
                      <span>{confirmation(row.owner_confirmed, lang)}</span>
                      <span className={row.overdue ? "due badge" : "badge"}>
                        {t.schedules[row.schedule] || row.schedule}
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
function evolutionLabel(snapshot: Snapshot, t: Dictionary) {
  if (snapshot.change_basis === "unavailable")
    return t.trajectory.evoUnavailable;
  if (snapshot.self_changed && snapshot.observatory_changed)
    return t.trajectory.evoBoth;
  if (snapshot.self_changed) return t.trajectory.evoSelf;
  if (snapshot.observatory_changed) return t.trajectory.evoObservatory;
  return t.trajectory.evoOther;
}

export function Trajectory({
  snapshots,
  snapshotsReady,
  at,
  params,
  update,
  setAt,
}: Context & { setAt: (sha: string) => void }) {
  const { lang, t } = useI18n();
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
      <p className="lede">{t.trajectory.lede}</p>
      <div className="filters trajectory-controls">
        <Select
          label={t.trajectory.filterLabel}
          value={evolution}
          options={[
            ["self", t.trajectory.filterSelf],
            ["observatory", t.trajectory.filterObservatory],
            ["all", t.all],
          ]}
          onChange={(evolution) => update({ evolution })}
        />
        <button
          disabled={!previous}
          onClick={() => previous && setAt(previous.sha)}
        >
          {t.trajectory.prevSnapshot}
        </button>
        <button disabled={!next} onClick={() => next && setAt(next.sha)}>
          {t.trajectory.nextSnapshot}
        </button>
        <label className="field">
          {t.trajectory.findByDate}
          <input
            type="date"
            value={on}
            onChange={(e) => setOn(e.target.value)}
          />
        </label>
      </div>
      <p className="legend">{t.trajectory.legend}</p>
      {current && !visible.includes(current) && (
        <p className="message">
          {t.trajectory.excludedFromFilter(
            short(at),
            evolutionLabel(current, t),
          )}
          <button onClick={() => update({ evolution: "all" })}>
            {t.trajectory.showAll}
          </button>
        </p>
      )}
      {!snapshotsReady ? (
        <p role="status">{t.trajectory.loadingHistory}</p>
      ) : (
        !visible.length && <Empty>{t.trajectory.emptyHistory}</Empty>
      )}
      {on && (
        <Status load={selection}>
          {(data) => (
            <>
              {data.coverage.committer_time_inversion && (
                <p className="warning message">
                  {t.trajectory.timeInversionWarning}
                </p>
              )}
              {data.date_selection?.sha ? (
                <button onClick={() => setAt(data.date_selection!.sha!)}>
                  {t.trajectory.jumpToDateSnapshot(
                    short(data.date_selection.sha),
                  )}
                </button>
              ) : (
                <Empty>
                  {data.date_selection?.state === "history_unavailable"
                    ? t.trajectory.dateOutOfRange
                    : t.trajectory.noChangesByDate}
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
                {dateTime(snapshot.committed_at, lang)}{" "}
                <code>{short(snapshot.sha)}</code>
              </span>
              <strong>{snapshot.subject}</strong>
              <span className="evolution-label">
                {evolutionLabel(snapshot, t)}
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
              {t.trajectory.diffFromParent}
            </button>
            <details className="evolution-paths">
              <summary>
                {snapshot.change_basis === "unavailable"
                  ? t.trajectory.changedFilesUnavailable
                  : t.trajectory.changedFilesCounts(
                      snapshot.self_change_paths.length,
                      snapshot.observatory_change_paths.length,
                    )}
              </summary>
              {snapshot.change_basis === "unavailable" ? (
                <p>{t.trajectory.cannotClassify}</p>
              ) : (
                <>
                  <p className="muted">
                    {snapshot.change_basis === "empty_tree"
                      ? t.trajectory.initialCommitBasis
                      : t.trajectory.parentCommitBasis(
                          short(snapshot.first_parent!),
                        )}
                  </p>
                  {(
                    [
                      [t.trajectory.selfGroup, snapshot.self_change_paths],
                      [
                        t.trajectory.observatoryGroup,
                        snapshot.observatory_change_paths,
                      ],
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
                    <p>{t.trajectory.noTargetFileChanges}</p>
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
  const { lang, t } = useI18n();
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
        <p className="eyebrow">{t.detail.eyebrow(short(at))}</p>
        <button
          aria-label={t.detail.closeAria}
          onClick={() => update({ note: null })}
        >
          {t.detail.closeButton}
        </button>
      </div>
      <Status load={detail}>
        {(data) => (
          <>
            <h2>{data.title}</h2>
            <code className="note-id">{data.id}</code>
            <dl className="metadata">
              <div>
                <dt>{t.fields.type}</dt>
                <dd>{noteTypeLabel(data.frontmatter.type, lang)}</dd>
              </div>
              <div>
                <dt>{t.fields.status}</dt>
                <dd>{statusLabel(data.frontmatter.status, lang)}</dd>
              </div>
              <div>
                <dt>{t.fields.maturity}</dt>
                <dd>{maturityLabel(data.frontmatter.maturity, lang)}</dd>
              </div>
              <div>
                <dt>{t.fields.review}</dt>
                <dd>
                  {confirmation(
                    review(data.frontmatter.review).owner_confirmed,
                    lang,
                  )}
                </dd>
              </div>
              {review(data.frontmatter.review).confirmed_at && (
                <div>
                  <dt>{t.detail.confirmedAt}</dt>
                  <dd>
                    {text(review(data.frontmatter.review).confirmed_at, lang)}
                  </dd>
                </div>
              )}
              {review(data.frontmatter.review).review_after && (
                <div>
                  <dt>{t.detail.reviewAfter}</dt>
                  <dd>
                    {text(review(data.frontmatter.review).review_after, lang)}
                  </dd>
                </div>
              )}
            </dl>
            <TemporalMetadata data={data.frontmatter} />
            {data.frontmatter.application && (
              <p>
                {t.detail.applicationOutcome}{" "}
                {t.feedback.outcomes[
                  String(record(data.frontmatter.application).outcome)
                ] || String(record(data.frontmatter.application).outcome)}
              </p>
            )}
            <div className="detail-actions">
              <button
                onClick={() => update({ view: "provenance", graph: null })}
              >
                {t.detail.viewProvenance}
              </button>
              <button onClick={() => update({ view: "diff" })}>
                {t.detail.viewDiff}
              </button>
            </div>
            <ReviewDecision data={data.frontmatter} />
            <SafeMarkdown body={data.body} />
            <NoteFeedback at={at} note={note} update={update} />
            {data.frontmatter.type === "media" && (
              <section>
                <h3>{t.detail.attachedMedia}</h3>
                {!showMedia ? (
                  <button onClick={() => setShowMedia(true)}>
                    {t.detail.showImage}
                  </button>
                ) : mediaError ? (
                  <p role="alert">{t.detail.mediaError}</p>
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
              <h3>{t.detail.source}</h3>
              {data.frontmatter.source ? (
                <dl className="source">
                  {Object.entries(data.frontmatter.source).map(
                    ([key, value]) => (
                      <div key={key}>
                        <dt>{fieldLabel(key, lang)}</dt>
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
                            text(value, lang)
                          )}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              ) : (
                <p>{t.detail.noSource}</p>
              )}
            </section>
            <section>
              <h3>{t.detail.relations}</h3>
              {["derived_from", "related", "supersedes", "superseded_by"].map(
                (key) => (
                  <div className="relations" key={key}>
                    <small>{kindLabel(key, lang)}</small>
                    {Array.isArray(data.frontmatter[key]) &&
                    data.frontmatter[key].length ? (
                      data.frontmatter[key].map((id: string) => (
                        <button key={id} onClick={() => update({ note: id })}>
                          {id}
                        </button>
                      ))
                    ) : (
                      <span>{t.none}</span>
                    )}
                  </div>
                ),
              )}
            </section>
            <section>
              <h3>{t.detail.updateHistory}</h3>
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
                          {dateTime(item.committed_at, lang)} ·{" "}
                          {short(item.sha)}
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
  const { t } = useI18n();
  return (
    <div className="capture">
      <p className="lede">{t.capture.lede}</p>
      <h2>{t.capture.flowHeading}</h2>
      <ol>
        {t.capture.flowSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h2>{t.capture.consolidateHeading}</h2>
      <ol>
        {t.capture.consolidateSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="muted">{t.capture.readOnlyNote}</p>
      {githubUrl ? (
        <>
          <a
            href={`${githubUrl}/blob/main/${t.capture.captureDocPath}`}
            target="_blank"
            rel="noreferrer"
          >
            {t.capture.captureDocLink}
          </a>
          <br />
          <a
            href={`${githubUrl}/blob/main/DATA_POLICY.md`}
            target="_blank"
            rel="noreferrer"
          >
            {t.capture.policyDocLink}
          </a>
        </>
      ) : (
        <p className="muted">
          {t.capture.docsPrefix} <code>{t.capture.captureDocPath}</code> /{" "}
          <code>DATA_POLICY.md</code>
        </p>
      )}
    </div>
  );
}
