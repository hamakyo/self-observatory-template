import type { Context } from "./App";
import { query, useLoad, type Schema } from "./api";
import { Empty, Pager, Select, Status } from "./components";
import { formatTemporal, useI18n } from "./i18n";
import { maturityLabel, record, short, text, type Update } from "./state";

function Excluded({ count }: { count: number }) {
  const { t } = useI18n();
  return count ? (
    <p className="warning message">{t.feedback.excludedWarning(count)}</p>
  ) : null;
}

export function ReviewDecision({ data }: { data: Record<string, unknown> }) {
  const { lang, t } = useI18n();
  const choice = record(data.consolidation);
  const results = Array.isArray(data.capture_outcomes)
    ? data.capture_outcomes.map(record)
    : [];
  if (!choice.decision && !results.length) return null;
  return (
    <section>
      <h3>{t.feedback.reviewDecisionHeading}</h3>
      {!!choice.decision && (
        <p>
          {t.feedback.proposalPrefix}{" "}
          {t.feedback.decisions[String(choice.decision)] ||
            String(choice.decision)}{" "}
          · {text(choice.proposal_id, lang)}
        </p>
      )}
      {results.map((result, i) => (
        <p key={i}>
          {text(result.ref, lang)} ·{" "}
          {t.feedback.captureStates[String(result.outcome)] ||
            String(result.outcome)}
          {Array.isArray(result.note_ids) &&
            result.note_ids.length > 0 &&
            t.feedback.adoptedTargetsPrefix(result.note_ids as string[])}
        </p>
      ))}
    </section>
  );
}

export function TemporalMetadata({ data }: { data: Record<string, unknown> }) {
  const { lang, t } = useI18n();
  const temporal = record(data.temporal);
  return (
    <dl className="metadata temporal-metadata">
      {[
        [
          t.feedback.temporalExperienced,
          formatTemporal(temporal.experienced, lang),
        ],
        [t.feedback.temporalNoticed, formatTemporal(temporal.noticed, lang)],
        [t.feedback.temporalCreated, text(data.created, lang)],
        [t.feedback.temporalAdopted, formatTemporal(temporal.adopted, lang)],
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
  const { lang, t } = useI18n();
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
      <p className="lede">{t.feedback.experiencesLede}</p>
      <p className="muted">
        {t.feedback.baseCommitPrefix} <code>{short(at)}</code>
        {lang === "en" ? " " : ""}
        {t.feedback.sameGroupUnordered}
      </p>
      <div className="filters">
        <label className="field">
          {t.feedback.startDate}
          <input
            type="date"
            value={params.get("experience_start") || ""}
            onChange={(e) =>
              update({ experience_start: e.target.value, cursor: null })
            }
          />
        </label>
        <label className="field">
          {t.feedback.endDate}
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
          {t.reset}
        </button>
      </div>
      <Status load={load}>
        {(data) => (
          <>
            <Excluded count={data.excluded} />
            <p className="result-count">
              {t.feedback.experiencesCount(data.total, data.undated)}
            </p>
            {data.coverage.shallow && (
              <p className="warning message">
                {t.feedback.shallowFirstSeenWarning}
              </p>
            )}
            {!data.items.length && <Empty />}
            <ul className="feedback-list experience-list">
              {data.items.map((item) => (
                <li key={item.note.id}>
                  <p className="eyebrow">
                    {item.group === null
                      ? t.feedback.undatedGroup
                      : t.feedback.timeGroup(item.group + 1)}
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
                    {t.feedback.confirmedDatePrefix}{" "}
                    {text(
                      record(item.note.frontmatter.review).confirmed_at,
                      lang,
                    )}{" "}
                    · {t.feedback.firstSeenPrefix}{" "}
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
                      {t.feedback.temporalOrderWarning}
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
  const { t } = useI18n();
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
      <p className="lede">{t.feedback.consolidationLede}</p>
      <div className="filters">
        <Select
          label={t.feedback.consolidationStateLabel}
          value={params.get("capture_state") || ""}
          options={[["", t.all], ...Object.entries(t.feedback.captureStates)]}
          onChange={(state) => update({ capture_state: state, cursor: null })}
        />
        <button onClick={() => update({ view: "capture" })}>
          {t.feedback.viewCaptureGuide}
        </button>
      </div>
      <Status load={load}>
        {(data) => (
          <>
            <p className="capture-coverage" role="status">
              {data.external.state === "historical"
                ? t.feedback.externalHistorical
                : data.external.state === "unavailable"
                  ? t.feedback.externalUnavailable
                  : data.external.state === "invalid"
                    ? t.feedback.externalInvalid
                    : t.feedback.externalImported(
                        data.external.selected_refs.length,
                        data.external.state === "complete",
                        data.external.fetched_at || "",
                      )}
            </p>
            <Excluded count={data.excluded} />
            <p className="result-count">
              {t.feedback.consolidationCount(data.total)}
            </p>
            {!data.items.length && (
              <Empty>{t.feedback.consolidationEmpty}</Empty>
            )}
            <ul className="feedback-list capture-list">
              {data.items.map((item) => (
                <li key={item.ref}>
                  <p className="eyebrow">
                    {t.feedback.captureStates[item.state] || item.state}
                    {item.targets.some((tgt) => tgt.state === "deleted") &&
                      t.feedback.targetDeletedSuffix}
                  </p>
                  <h2>{item.title || item.ref}</h2>
                  {!!item.pending_proposal_ids?.length && (
                    <p className="warning message">
                      {t.feedback.pendingProposalWarning}
                    </p>
                  )}
                  <p>
                    <code>{item.ref}</code>
                    {item.issue_state &&
                      t.feedback.issueStateSuffix(item.issue_state)}{" "}
                    {item.created_at &&
                      t.feedback.issueCreatedSuffix(item.created_at)}
                  </p>
                  {item.decisions.map((decision, i) => (
                    <p key={`${decision.review_id}-${i}`}>
                      {t.feedback.proposalPrefix}{" "}
                      {t.feedback.decisions[decision.decision] ||
                        decision.decision}{" "}
                      ·{" "}
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
                        {t.feedback.viewDecision}
                      </button>
                    </p>
                  ))}
                  {item.targets.map((target, i) => (
                    <p key={`${target.id}-${i}`}>
                      {t.feedback.adoptedTargetPrefix}{" "}
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
                        {t.feedback.targetAtAdoption(target.id)}
                      </button>
                    </p>
                  ))}
                  {!!item.diagnostics.length && (
                    <p className="warning message">
                      {t.feedback.missingTargetWarning}
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
                      {t.feedback.openInGitHub}
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
  const { lang, t } = useI18n();
  return (
    <ul className="feedback-list application-list">
      {items.map((item) => {
        const temporal = record(item.note.frontmatter.temporal);
        const experiencedLabel = formatTemporal(temporal.experienced, lang);
        return (
          <li key={item.note.id}>
            <p className="eyebrow">
              {t.feedback.outcomes[item.outcome] || item.outcome} ·{" "}
              {experiencedLabel}
            </p>
            <button
              className="feedback-title"
              onClick={() => update({ note: item.note.id })}
            >
              {item.note.title}
            </button>
            <p>{t.feedback.usedNotesLabel}</p>
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
                    {target.state === "unknown"
                      ? t.feedback.versionUnknown
                      : t.feedback.versionUnavailable}
                  </span>
                )}
              </p>
            ))}
          </li>
        );
      })}
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
  const { lang, t } = useI18n();
  return (
    <section>
      <h3>{t.feedback.maturityHistoryHeading}</h3>
      {!changes.length ? (
        <Empty>{t.feedback.maturityHistoryEmpty}</Empty>
      ) : (
        <ul className="feedback-list">
          {changes.map((change, i) => (
            <li key={`${change.review_id}-${i}`}>
              <p>
                {change.note_id} · {maturityLabel(change.from, lang)} →{" "}
                {maturityLabel(change.to, lang)}
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
                {t.feedback.viewReviewDecision}
              </button>
              <p>{t.feedback.evidenceHeading}</p>
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
  const { t } = useI18n();
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
      <p className="lede">{t.feedback.applicationsLede}</p>
      <div className="filters">
        <label className="field">
          {t.feedback.targetNoteId}
          <input
            value={params.get("application_note") || ""}
            onChange={(e) =>
              update({ application_note: e.target.value, cursor: null })
            }
            placeholder={t.all}
          />
        </label>
        <button
          onClick={() => update({ application_note: null, cursor: null })}
        >
          {t.reset}
        </button>
      </div>
      <Status load={load}>
        {(data) => (
          <>
            <Excluded count={data.excluded} />
            <p className="result-count">
              {t.feedback.applicationsCount(data.total)}
            </p>
            {!data.items.length && (
              <Empty>{t.feedback.applicationsEmpty}</Empty>
            )}
            <ApplicationList items={data.items} update={update} />
            <Pager cursor={cursor} next={data.next_cursor} update={update} />
            <MaturityChanges changes={data.maturity_changes} update={update} />
          </>
        )}
      </Status>
      <section>
        <h2>{t.feedback.dailyReflectionHeading}</h2>
        <p>{t.feedback.dailyReflectionPrompt}</p>
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
  const { t } = useI18n();
  const load = useLoad<Schema["ApplicationsResponse"]>(
    query("applications", { at, note_id: note, limit: 20 }),
    { commit_sha: at },
  );
  return (
    <section>
      <h3>{t.feedback.noteFeedbackHeading}</h3>
      <Status load={load}>
        {(data) => (
          <>
            {!data.items.length && <p>{t.feedback.noteFeedbackEmpty}</p>}
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
              {t.feedback.viewInList}
            </button>
            <MaturityChanges changes={data.maturity_changes} update={update} />
          </>
        )}
      </Status>
    </section>
  );
}
