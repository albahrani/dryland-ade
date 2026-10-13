import type { TicketDetail } from "@dryland/core";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import type { ItemContent, ProjectView } from "../../shared/api.ts";
import { formatBlockers } from "../../shared/blockers.ts";
import type { ItemRef } from "../../shared/tabs.ts";
import { ProgressBar } from "./ProgressBar.tsx";
import { StatusIcon } from "./status.tsx";

/** Re-reads the item whenever the project view changes, so open tabs follow the files on disk. */
function useItem(ref: ItemRef, project: ProjectView): ItemContent | null {
  const [content, setContent] = useState<ItemContent | null>(null);
  useEffect(() => {
    let current = true;
    void window.dryland
      .readItem(ref)
      .catch((): ItemContent => ({ kind: "missing" }))
      .then((next) => current && setContent(next));
    return () => {
      current = false;
    };
  }, [ref, project]);
  return content;
}

function Details({
  title,
  open,
  onToggle,
  children,
}: {
  title: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <header className="details">
      <button className="details-toggle" aria-expanded={open} onClick={onToggle}>
        {open ? "▾" : "▸"} {title}
      </button>
      {open && <dl className="details-body">{children}</dl>}
    </header>
  );
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export interface HeaderState {
  /** Whether the details header is expanded. */
  open: boolean;
  onToggle: () => void;
}

function TicketContent({ ticket, header }: { ticket: TicketDetail; header: HeaderState }) {
  return (
    <article>
      <Details
        open={header.open}
        onToggle={header.onToggle}
        title={
          <>
            <StatusIcon status={ticket.status} /> {ticket.map}/{ticket.id} {ticket.title}
          </>
        }
      >
        <Field name="Status">{ticket.status}</Field>
        <Field name="Type">{ticket.type}</Field>
        <Field name="Claimant">{ticket.claimant ?? "none"}</Field>
        <Field name="Blocked by">{formatBlockers(ticket.blockers) ?? "none"}</Field>
        <Field name="Map">{ticket.mapTitle}</Field>
      </Details>
      <div className="content">
        <Markdown>{ticket.body}</Markdown>
        {ticket.answer !== null && (
          <section aria-label="Answer">
            <h2>Answer</h2>
            <Markdown>{ticket.answer}</Markdown>
          </section>
        )}
        {ticket.comments.length > 0 && (
          <section aria-label="Comments">
            <h2>Comments</h2>
            {ticket.comments.map((comment, i) => (
              <blockquote key={i}>
                <Markdown>{comment}</Markdown>
              </blockquote>
            ))}
          </section>
        )}
      </div>
    </article>
  );
}

export function ItemTab({ item, project, header }: { item: ItemRef; project: ProjectView; header: HeaderState }) {
  const content = useItem(item, project);
  if (content === null) return null;
  const treeMap =
    item.kind === "map" && project.tree.ok ? project.tree.tree.maps.find((m) => m.name === item.name) : undefined;
  if (content.kind === "ticket") return <TicketContent ticket={content.ticket} header={header} />;
  // A map known only through its tickets has no map.md: its details still show.
  if (content.kind === "missing" && treeMap === undefined) {
    return <p className="empty">This {item.kind} no longer exists. Close the tab.</p>;
  }
  const map = treeMap;
  const detail =
    content.kind === "map" ? content.map : { name: map?.name ?? "", title: map?.title ?? "", markdown: "" };
  return (
    <article>
      <Details title={`Map: ${detail.title}`} open={header.open} onToggle={header.onToggle}>
        <Field name="Directory">.scratch/{detail.name}</Field>
        {map !== undefined && (
          <Field name="Progress">
            <ProgressBar map={map} />
          </Field>
        )}
      </Details>
      <div className="content">
        {detail.markdown === "" ? (
          <p className="empty">This map has no map.md yet.</p>
        ) : (
          <Markdown>{detail.markdown}</Markdown>
        )}
      </div>
    </article>
  );
}
