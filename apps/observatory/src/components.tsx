import type { ReactNode } from "react";
import Markdown from "react-markdown";
import { type Load, type Note } from "./api";
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
  if (load.status === "loading")
    return (
      <p className="message" role="status">
        読み込み中…
      </p>
    );
  if (load.status === "error")
    return (
      <div className="message warning" role="alert">
        <p>{load.error.message}</p>
        <button onClick={() => window.location.reload()}>再読み込み</button>
      </div>
    );
  return children(load.data);
}
export function Empty({
  children = "該当するノートはありません。",
}: {
  children?: ReactNode;
}) {
  return <p className="message">{children}</p>;
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
                {noteTypeLabel(note.frontmatter.type)} ·{" "}
                {statusLabel(note.frontmatter.status)}
              </span>
              <strong>{note.title}</strong>
              <small>{note.id}</small>
            </span>
            <span className="note-tail">
              {confirmation(review(note.frontmatter.review).owner_confirmed)}
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
  return (
    <div className="pager">
      <button
        disabled={cursor === 0}
        onClick={() => update({ cursor: Math.max(0, cursor - 20) })}
      >
        前の20件
      </button>
      <span>{cursor + 1}件目〜</span>
      <button disabled={next === null} onClick={() => update({ cursor: next })}>
        次の20件
      </button>
    </div>
  );
}
export function SafeMarkdown({ body }: { body: string }) {
  return (
    <div className="markdown">
      <Markdown
        skipHtml
        components={{
          img: ({ alt }) => (
            <span className="media-placeholder">
              画像: {alt || "説明なし"}（自動読込なし）
            </span>
          ),
          a: ({ href, children }) =>
            /^https?:\/\//i.test(href || "") ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children} ↗
              </a>
            ) : (
              <span>
                {children} <small>({href || "リンクなし"})</small>
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
