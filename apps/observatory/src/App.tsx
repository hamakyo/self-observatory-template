import { useEffect, useState } from "react";
import { query, useLoad, type Schema, type Snapshot } from "./api";
import { Status } from "./components";
import { detectLang, dictionaries, LangContext } from "./i18n";
import {
  dateTime,
  short,
  useUrl,
  viewOrder,
  type Update,
  type View,
} from "./state";
import {
  Browse,
  Overview,
  Review,
  Trajectory,
  Capture,
  Detail,
} from "./reading";
import { Provenance, Diff } from "./exploration";
import { TimeVolume } from "./volume";
import { Applications, Consolidation, Experiences } from "./feedback";

declare const __FIXTURE__: boolean;
export type Context = {
  params: URLSearchParams;
  update: Update;
  at: string;
  note: string;
  snapshots: Snapshot[];
  snapshotsReady: boolean;
  overview: ReturnType<typeof useLoad<Schema["OverviewResponse"]>>;
  githubUrl: string | null;
};
export function App() {
  const [params, update] = useUrl();
  const lang = detectLang(params);
  const t = dictionaries[lang];
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const repository = useLoad<Schema["RepositoryResponse"]>(query("repository"));
  const snapshots = useLoad<Schema["SnapshotResponse"]>(
    query("snapshots", { limit: 100 }),
    {},
    true,
  );
  const at = params.get("at") || "";
  const note = params.get("note") || "";
  const view = (params.get("view") || "overview") as View;
  const activeView: View = (viewOrder as readonly string[]).includes(view)
    ? view
    : "overview";
  const showDetail = note && activeView !== "volume";
  const heading =
    activeView === "trajectory"
      ? params.get("evolution") === "observatory"
        ? t.trajectoryHeadings.observatory
        : params.get("evolution") === "all"
          ? t.trajectoryHeadings.all
          : t.trajectoryHeadings.self
      : t.views[activeView][0];
  const overview = useLoad<Schema["OverviewResponse"]>(
    at ? query("overview", { at, as_of: params.get("as_of") }) : null,
    { commit_sha: at },
  );
  const [search, setSearch] = useState(params.get("q") || "");
  useEffect(() => setSearch(params.get("q") || ""), [params.get("q")]);
  useEffect(() => {
    if (!at && repository.status === "ready")
      update({ at: repository.data.indexed_sha }, true);
  }, [at, repository, update]);
  useEffect(() => {
    if (overview.status === "ready" && !params.get("as_of"))
      update({ as_of: overview.data.as_of }, true);
  }, [overview, params, update]);
  const history = snapshots.status === "ready" ? snapshots.data.items : [];
  const current = history.find((s) => s.sha === at);
  const context: Context = {
    params,
    update,
    at,
    note,
    snapshots: history,
    snapshotsReady: snapshots.status === "ready",
    overview,
    githubUrl:
      repository.status === "ready"
        ? (repository.data.github_url ?? null)
        : null,
  };
  const setAt = (sha: string) => update({ at: sha, as_of: null, cursor: null });
  return (
    <LangContext.Provider value={lang}>
      <a href="#main" className="skip">
        {t.skipToMain}
      </a>
      <header className="topbar">
        <a
          href={`?view=overview${params.get("lang") ? `&lang=${lang}` : ""}`}
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            update({ view: "overview" });
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            ◉
          </span>
          <span>
            Self Observatory<small>PERSONAL ARCHIVE</small>
          </span>
        </a>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ view: "browse", q: search, cursor: null });
          }}
        >
          <label className="sr-only" htmlFor="search">
            {t.searchLabel}
          </label>
          <input
            id="search"
            type="search"
            value={search}
            placeholder={t.searchPlaceholder}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">{t.searchButton}</button>
        </form>
        <div className="lang-switch" role="group" aria-label={t.languageSwitch}>
          <button
            type="button"
            aria-pressed={lang === "en"}
            onClick={() => update({ lang: "en" })}
          >
            EN
          </button>
          <button
            type="button"
            aria-pressed={lang === "ja"}
            onClick={() => update({ lang: "ja" })}
          >
            日本語
          </button>
        </div>
        <div className="repository">
          <span>
            {repository.status === "ready"
              ? repository.data.repository_name
              : t.loading}
          </span>
          <small>{t.localReadOnly}</small>
        </div>
      </header>
      {__FIXTURE__ && <p className="banner warning">{t.fixtureBanner}</p>}
      {repository.status === "error" && (
        <Status load={repository}>{() => null}</Status>
      )}
      {repository.status === "ready" &&
        repository.data.index_state !== "ready" && (
          <p className="banner warning" role="status">
            {t.staleIndexBanner(short(repository.data.indexed_sha))}
          </p>
        )}
      {snapshots.status === "error" && (
        <Status load={snapshots}>{() => null}</Status>
      )}
      {snapshots.status === "ready" && snapshots.data.coverage.shallow && (
        <p className="banner warning">{t.shallowBanner}</p>
      )}
      <div
        className={`workspace ${showDetail ? "has-detail" : ""} ${showDetail && params.get("pane") !== "main" ? "show-detail" : ""}`}
      >
        <nav className="sidebar" aria-label={t.mainNavLabel}>
          <p className="eyebrow">{t.menuEyebrow}</p>
          {viewOrder.map((key, i) => {
            const value = t.views[key];
            return (
              <button
                key={key}
                aria-current={activeView === key ? "page" : undefined}
                onClick={() => update({ view: key, cursor: null })}
              >
                <span className="nav-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  {value[0]}
                  <small>{value[1]}</small>
                </span>
              </button>
            );
          })}
          <p className="sidebar-foot">
            Markdown + Git
            <br />
            {t.sidebarReadOnly}
          </p>
        </nav>
        <div className="center">
          <section className="timebar" aria-label={t.selectedSnapshotLabel}>
            <label className="field">
              {t.viewingSnapshot}
              <select
                aria-label={t.viewingSnapshot}
                value={at}
                onChange={(e) => setAt(e.target.value)}
              >
                {!current && (
                  <option value={at}>
                    {at ? t.unfetched(short(at)) : t.loading}
                  </option>
                )}
                {history.map((s) => (
                  <option key={s.sha} value={s.sha}>
                    {dateTime(s.committed_at, lang)} · {short(s.sha)} ·{" "}
                    {s.subject}
                  </option>
                ))}
              </select>
            </label>
            <span className="time-stamp" title={at}>
              {current ? dateTime(current.committed_at, lang) : t.dateUnknown}
              <code>{at ? short(at) : t.shaUnavailable}</code>
            </span>
          </section>
          <main id="main" tabIndex={-1}>
            <div className="page-heading">
              <p className="eyebrow">{t.views[activeView][1]}</p>
              <h1>{heading}</h1>
            </div>
            {!at ? (
              <p role="status">{t.loading}</p>
            ) : activeView === "overview" ? (
              <Overview {...context} />
            ) : activeView === "browse" ? (
              <Browse {...context} />
            ) : activeView === "review" ? (
              <Review {...context} />
            ) : activeView === "trajectory" ? (
              <Trajectory {...context} setAt={setAt} />
            ) : activeView === "volume" ? (
              <TimeVolume {...context} />
            ) : activeView === "provenance" ? (
              <Provenance {...context} />
            ) : activeView === "diff" ? (
              <Diff {...context} />
            ) : activeView === "experiences" ? (
              <Experiences {...context} />
            ) : activeView === "consolidation" ? (
              <Consolidation {...context} />
            ) : activeView === "applications" ? (
              <Applications {...context} />
            ) : (
              <Capture githubUrl={context.githubUrl} />
            )}
          </main>
        </div>
        {showDetail && at && (
          <aside className="detail" aria-label={t.noteDetailLabel}>
            <Detail key={`${at}:${note}`} {...context} />
          </aside>
        )}
      </div>
      <footer>
        SELF OBSERVATORY <span>{t.footerCaption}</span>
      </footer>
    </LangContext.Provider>
  );
}
