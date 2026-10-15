import type { NextUpMarker, TicketDetail, TicketRef, TreeTicket } from "@dryland/core";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import type { ItemContent, ProjectView } from "../../shared/api.ts";
import { formatBlockers } from "../../shared/blockers.ts";
import { mapMarker, NO_NEXT_UP, type NextUp, ticketMarker, whyNotText } from "../../shared/next-up.ts";
import { NextUpExplanation, NextUpStar } from "./NextUp.tsx";
import { type DocumentRef, ticketKey } from "../../shared/tabs.ts";
import { ProgressBar } from "./ProgressBar.tsx";
import { StartWork } from "./StartWork.tsx";
import { StatusIcon } from "./status.tsx";
import { TicketActions, type TicketActionHandler } from "./TicketActions.tsx";

/** Re-reads the item whenever the project view changes, so open tabs follow the files on disk. */
function useItem(ref: DocumentRef, project: ProjectView): ItemContent | null {
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

/** "Why not this?" on a ticket without a marker: the answer shows on request. */
function WhyNot({ ticket, nextUp }: { ticket: TreeTicket; nextUp: NextUp }) {
  const [shown, setShown] = useState(false);
  return (
    <section className="why-not" aria-label="Why not this">
      <button aria-expanded={shown} onClick={() => setShown(!shown)}>
        Why not this?
      </button>
      {shown && <p>{whyNotText(ticket, nextUp.ranked)}</p>}
    </section>
  );
}

/** Why the item is next, or for a ticket that is not, the "Why not this?" button. */
function NextUpSection({
  marker,
  treeTicket,
  nextUp,
}: {
  marker?: NextUpMarker;
  treeTicket?: TreeTicket;
  nextUp: NextUp;
}) {
  if (marker !== undefined) return <NextUpExplanation marker={marker} />;
  if (treeTicket !== undefined && treeTicket.status !== "done") return <WhyNot ticket={treeTicket} nextUp={nextUp} />;
  return null;
}

function TicketContent({
  ticket,
  header,
  nextUp,
  treeTicket,
  stale,
  onStartWork,
  onAction,
}: {
  ticket: TicketDetail;
  header: HeaderState;
  nextUp: NextUp;
  /** The ticket's row in the tree, which "Why not this?" reads. */
  treeTicket: TreeTicket | undefined;
  /** Whether its claim is held by no live Dryland session. */
  stale: boolean;
  onStartWork: StartWorkHandler;
  onAction: TicketActionHandler;
}) {
  const marker = ticketMarker(nextUp, ticket.map, ticket.id);
  return (
    <article>
      {ticket.status !== "done" && (
        <StartWork onStart={(agentId) => onStartWork({ map: ticket.map, id: ticket.id }, agentId)} />
      )}
      <TicketActions ticket={ticket} stale={stale} onAction={onAction} />
      <Details
        open={header.open}
        onToggle={header.onToggle}
        title={
          <>
            {marker !== undefined && <NextUpStar marker={marker} />}
            <StatusIcon status={ticket.status} /> {ticket.map}/{ticket.id} {ticket.title}
          </>
        }
      >
        <Field name="Status">{ticket.status}</Field>
        <Field name="Type">{ticket.type}</Field>
        <Field name="Claimant">
          {ticket.claimant ?? (ticket.status === "in-progress" ? "unknown" : "none")}
          {stale && " (possibly stale)"}
        </Field>
        <Field name="Blocked by">{formatBlockers(ticket.blockers) ?? "none"}</Field>
        <Field name="Map">{ticket.mapTitle}</Field>
      </Details>
      <NextUpSection marker={marker} treeTicket={treeTicket} nextUp={nextUp} />
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

export type StartWorkHandler = (ticket: TicketRef, agentId: string) => Promise<void>;

export function ItemTab({
  item,
  project,
  header,
  onStartWork,
  onTicketAction,
}: {
  item: DocumentRef;
  project: ProjectView;
  header: HeaderState;
  onStartWork: StartWorkHandler;
  onTicketAction: TicketActionHandler;
}) {
  const content = useItem(item, project);
  if (content === null) return null;
  const tree = project.tree.ok ? project.tree.tree : null;
  const nextUp = project.tree.ok ? project.tree.nextUp : NO_NEXT_UP;
  const treeMap = item.kind === "map" ? tree?.maps.find((m) => m.name === item.name) : undefined;
  if (content.kind === "ticket") {
    const { map, id } = content.ticket;
    const own = tree?.maps.find((m) => m.name === map);
    const treeTicket = own && [...own.planning, ...own.implementation, ...own.done].find((t) => t.id === id);
    return (
      <TicketContent
        ticket={content.ticket}
        header={header}
        nextUp={nextUp}
        treeTicket={treeTicket}
        stale={project.tree.ok && project.tree.staleClaims.includes(ticketKey(content.ticket))}
        onStartWork={onStartWork}
        onAction={onTicketAction}
      />
    );
  }
  // A map known only through its tickets has no map.md: its details still show.
  if (content.kind === "missing" && treeMap === undefined) {
    return <p className="empty">This {item.kind} no longer exists. Close the tab.</p>;
  }
  const map = treeMap;
  const detail =
    content.kind === "map" ? content.map : { name: map?.name ?? "", title: map?.title ?? "", markdown: "" };
  const marker = mapMarker(nextUp, detail.name);
  return (
    <article>
      <Details
        title={
          <>
            {marker !== undefined && <NextUpStar marker={marker} />} Map: {detail.title}
          </>
        }
        open={header.open}
        onToggle={header.onToggle}
      >
        <Field name="Directory">.scratch/{detail.name}</Field>
        {map !== undefined && (
          <Field name="Progress">
            <ProgressBar map={map} />
          </Field>
        )}
      </Details>
      <NextUpSection marker={marker} nextUp={nextUp} />
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
