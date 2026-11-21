import { useEffect, useState } from "react";
import { query, useLoad, type Schema, type Snapshot } from "./api";
import { Status } from "./components";
import {
  dateTime,
  short,
  useUrl,
  views,
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
  const repository = useLoad<Schema["RepositoryResponse"]>(query("repository"));
  const snapshots = useLoad<Schema["SnapshotResponse"]>(
    query("snapshots", { limit: 100 }),
    {},
    true,
  );
  const at = params.get("at") || "";
  const note = params.get("note") || "";
  const view = (params.get("view") || "overview") as View;
  const activeView = view in views ? view : "overview";
  const showDetail = note && activeView !== "volume";
  const heading =
    activeView === "trajectory"
      ? params.get("evolution") === "observatory"
        ? "仕組みの変更履歴"
        : params.get("evolution") === "all"
          ? "すべての変更履歴"
          : "ノートの変更履歴"
      : views[activeView][0];
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
    <>
      <a href="#main" className="skip">
        本文へ移動
      </a>
      <header className="topbar">
        <a
          href="?view=overview"
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
            ノートを検索
          </label>
          <input
            id="search"
            type="search"
            value={search}
            placeholder="キーワードで探す"
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">検索</button>
        </form>
        <div className="repository">
          <span>
            {repository.status === "ready"
              ? repository.data.repository_name
              : "読み込み中…"}
          </span>
          <small>ローカル · 閲覧専用</small>
        </div>
      </header>
      {__FIXTURE__ && (
        <p className="banner warning">
          開発用のサンプルデータを表示しています。
        </p>
      )}
      {repository.status === "error" && (
        <Status load={repository}>{() => null}</Status>
      )}
      {repository.status === "ready" &&
        repository.data.index_state !== "ready" && (
          <p className="banner warning" role="status">
            新しい更新があります。現在は {short(repository.data.indexed_sha)}{" "}
            時点を表示中です（CLI で索引を更新すると反映されます）。
          </p>
        )}
      {snapshots.status === "error" && (
        <Status load={snapshots}>{() => null}</Status>
      )}
      {snapshots.status === "ready" && snapshots.data.coverage.shallow && (
        <p className="banner warning">
          履歴の一部だけ取得されています。これより前の記録は表示できません。
        </p>
      )}
      <div
        className={`workspace ${showDetail ? "has-detail" : ""} ${showDetail && params.get("pane") !== "main" ? "show-detail" : ""}`}
      >
        <nav className="sidebar" aria-label="メインナビゲーション">
          <p className="eyebrow">メニュー</p>
          {Object.entries(views).map(([key, value], i) => (
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
          ))}
          <p className="sidebar-foot">
            Markdown + Git
            <br />
            閲覧専用（編集不可）
          </p>
        </nav>
        <div className="center">
          <section className="timebar" aria-label="選択時点">
            <label className="field">
              見る時点
              <select
                aria-label="見る時点"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              >
                {!current && (
                  <option value={at}>
                    {at ? `未取得 · ${short(at)}` : "読み込み中…"}
                  </option>
                )}
                {history.map((s) => (
                  <option key={s.sha} value={s.sha}>
                    {dateTime(s.committed_at)} · {short(s.sha)} · {s.subject}
                  </option>
                ))}
              </select>
            </label>
            <span className="time-stamp" title={at}>
              {current ? dateTime(current.committed_at) : "日時不明"}
              <code>{at ? short(at) : "SHA未取得"}</code>
            </span>
          </section>
          <main id="main" tabIndex={-1}>
            <div className="page-heading">
              <p className="eyebrow">{views[activeView][1]}</p>
              <h1>{heading}</h1>
            </div>
            {!at ? (
              <p role="status">読み込み中…</p>
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
          <aside className="detail" aria-label="ノート詳細">
            <Detail key={`${at}:${note}`} {...context} />
          </aside>
        )}
      </div>
      <footer>
        SELF OBSERVATORY <span>表示は Git の採用履歴にもとづきます</span>
      </footer>
    </>
  );
}
