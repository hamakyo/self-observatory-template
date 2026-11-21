import type { ReactNode } from "react";
import Markdown from "react-markdown";
import { ApiError, type Load, type Note } from "./api";
import { useI18n } from "./i18n";
import {
  confirmation,
  noteTypeLabel,
  review,
  statusLabel,
  type Update,
} from "./state";

export function Status<T>({
  load,
  children,
}: {
  load: Load<T>;
  children: (data: T) => ReactNode;
}) {
  const { t } = useI18n();
  if (load.status === "loading")
    return (
      <p className="message" role="status">
        {t.loading}
      </p>
    );
  if (load.status === "error") {
    const message =
      load.error instanceof ApiError
        ? t.errors[load.error.code] || t.errors.default
        : load.error.message || t.errors.default;
    return (
      <div className="message warning" role="alert">
        <p>{message}</p>
        <button onClick={() => window.location.reload()}>{t.reload}</button>
      </div>
    );
  }
  return children(load.data);
}
export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <p className="message">{children ?? t.emptyDefault}</p>;
}
export function NoteList({
  notes,
  selected,
  update,
}: {
  notes: Note[];
  selected: string;
  update: Update;
}) {
  const { lang } = useI18n();
  if (!notes.length) return <Empty />;
  return (
    <ul className="note-list">
      {notes.map((note) => (
        <li key={note.id}>
          <button
            className={`note-row ${selected === note.id ? "selected" : ""}`}
            aria-pressed={selected === note.id}
            onClick={() => update({ note: note.id })}
          >
            <span>
              <span className="eyebrow">
                {noteTypeLabel(note.frontmatter.type, lang)} ·{" "}
                {statusLabel(note.frontmatter.status, lang)}
              </span>
              <strong>{note.title}</strong>
              <small>{note.id}</small>
            </span>
            <span className="note-tail">
              {confirmation(
                review(note.frontmatter.review).owner_confirmed,
                lang,
              )}
              <span aria-hidden="true">↗</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
export function Pager({
  cursor,
  next,
  update,
}: {
  cursor: number;
  next: number | null;
  update: Update;
}) {
  const { t } = useI18n();
  return (
    <div className="pager">
      <button
        disabled={cursor === 0}
        onClick={() => update({ cursor: Math.max(0, cursor - 20) })}
      >
        {t.prevPage}
      </button>
      <span>{t.fromItem(cursor + 1)}</span>
      <button disabled={next === null} onClick={() => update({ cursor: next })}>
        {t.nextPage}
      </button>
    </div>
  );
}
export function SafeMarkdown({ body }: { body: string }) {
  const { t } = useI18n();
  return (
    <div className="markdown">
      <Markdown
        skipHtml
        components={{
          img: ({ alt }) => (
            <span className="media-placeholder">
              {t.imagePlaceholder(alt || "")}
            </span>
          ),
          a: ({ href, children }) =>
            /^https?:\/\//i.test(href || "") ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children} ↗
              </a>
            ) : (
              <span>
                {children} <small>({href || t.noLink})</small>
              </span>
            ),
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
