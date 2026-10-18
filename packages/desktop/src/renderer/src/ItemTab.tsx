import type { NextUpMarker, TicketDetail, TicketRef, TreeTicket } from "@dryland/core";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import type { ItemContent, ProjectView, ResumeMode, SessionInfo } from "../../shared/api.ts";
import { pausedBadge, type PausedSession } from "../../shared/paused-session.ts";
import { PausedBox } from "./PausedBox.tsx";
import { LiveSessions, type SessionHandlers } from "./SessionControls.tsx";
import { formatBlockers } from "../../shared/blockers.ts";
import { mapMarker, NO_NEXT_UP, type NextUp, ticketMarker, whyNotText } from "../../shared/next-up.ts";
import { NextUpExplanation, NextUpStar } from "./NextUp.tsx";
import { type DocumentRef, ticketKey } from "../../shared/tabs.ts";
import { ProgressBar } from "./ProgressBar.tsx";
import { StartWork } from "./StartWork.tsx";
import { StatusIcon } from "./status.tsx";
import { TicketActions, type TicketActionHandler } from "./TicketActions.tsx";
import type { WorkTarget } from "../../shared/work-target.ts";

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
function WhyNot({ ticket, nextUp, paused }: { ticket: TreeTicket; nextUp: NextUp; paused: string | null }) {
  const [shown, setShown] = useState(false);
  return (
    <section className="why-not" aria-label="Why not this">
      <button aria-expanded={shown} onClick={() => setShown(!shown)}>
        Why not this?
      </button>
      {shown && <p>{whyNotText(ticket, nextUp.ranked, paused)}</p>}
    </section>
  );
}

/** Why the item is next, or for a ticket that is not, the "Why not this?" button. */
function NextUpSection({
  marker,
  treeTicket,
  nextUp,
  paused = null,
}: {
  marker?: NextUpMarker;
  treeTicket?: TreeTicket;
  nextUp: NextUp;
  /** The label of the ticket's paused session, if its claim is held by one. */
  paused?: string | null;
}) {
  if (marker !== undefined) return <NextUpExplanation marker={marker} />;
  if (treeTicket !== undefined && treeTicket.status !== "done") {
    return <WhyNot ticket={treeTicket} nextUp={nextUp} paused={paused} />;
  }
  return null;
}

function TicketContent({
  ticket,
  header,
  nextUp,
  treeTicket,
  stale,
  paused,
  lastOutput,
  sessions,
  sessionHandlers,
  onStartWork,
  onResume,
  onAction,
}: {
  ticket: TicketDetail;
  /** The sessions started on the ticket. */
  sessions: SessionInfo[];
  sessionHandlers: SessionHandlers;
  header: HeaderState;
  nextUp: NextUp;
  /** The ticket's row in the tree, which "Why not this?" reads. */
  treeTicket: TreeTicket | undefined;
  /** Whether its claim is held by no live Dryland session. */
  stale: boolean;
  /** Its paused session, if its claim is held by one and no live session works on it. */
  paused: PausedSession | null;
  /** The paused session's last output line, while Dryland still holds it. */
  lastOutput: string | null;
  onStartWork: StartWorkHandler;
  onResume: ResumeHandler;
  onAction: TicketActionHandler;
}) {
  const marker = ticketMarker(nextUp, ticket.map, ticket.id);
  const [resuming, setResuming] = useState(false);
  const resume = async (mode: ResumeMode) => {
    setResuming(true);
    try {
      await onResume({ map: ticket.map, id: ticket.id }, mode);
    } finally {
      setResuming(false);
    }
  };
  const pausedLabel = paused === null ? null : pausedBadge(paused.was).label;
  return (
    <article>
      {ticket.status !== "done" && paused !== null && (
        <PausedBox
          paused={paused}
          lastOutput={lastOutput}
          busy={resuming}
          onResume={(mode) => void resume(mode)}
          onStartFresh={() =>
            void onStartWork({ kind: "ticket", ticket: { map: ticket.map, id: ticket.id } }, paused.agentId, null)
          }
        />
      )}
      {ticket.status !== "done" && paused === null && (
        <StartWork
          chooseSkill
          onStart={(agentId, skill) =>
            onStartWork({ kind: "ticket", ticket: { map: ticket.map, id: ticket.id } }, agentId, skill)
          }
        />
      )}
      <LiveSessions sessions={sessions} handlers={sessionHandlers} />
      <TicketActions ticket={ticket} stale={stale} onAction={onAction} />
      <Details
        open={header.open}
        onToggle={header.onToggle}
        title={
          <>
            {marker !== undefined && <NextUpStar marker={marker} />}
            <StatusIcon status={ticket.status} /> {ticket.map}/{ticket.id} {ticket.title}
            {paused !== null && <span className={`pill paused ${pausedBadge(paused.was).tone}`}>{pausedLabel}</span>}
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
      <NextUpSection marker={marker} treeTicket={treeTicket} nextUp={nextUp} paused={pausedLabel} />
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

export type ResumeHandler = (ticket: TicketRef, mode: ResumeMode) => Promise<void>;

/** Resumes the paused sessions of one map, hidden. */
export type ResumeAllHandler = (map: string) => Promise<void>;

export type StartWorkHandler = (target: WorkTarget, agentId: string, skill: string | null) => Promise<void>;

export function ItemTab({
  item,
  project,
  header,
  sessions,
  sessionHandlers,
  paused,
  lastOutput,
  onStartWork,
  onResume,
  onResumeAll,
  onTicketAction,
}: {
  item: DocumentRef;
  project: ProjectView;
  header: HeaderState;
  /** Every session the app started; the tab shows those on its ticket or map. */
  sessions: SessionInfo[];
  sessionHandlers: SessionHandlers;
  /** The paused sessions no live session stands in for, by ticket key. */
  paused: ReadonlyMap<string, PausedSession>;
  /** A ticket's paused session's last output line, while Dryland holds it. */
  lastOutput: (ticketKey: string) => string | null;
  onStartWork: StartWorkHandler;
  onResume: ResumeHandler;
  onResumeAll: ResumeAllHandler;
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
        paused={paused.get(ticketKey(content.ticket)) ?? null}
        lastOutput={lastOutput(ticketKey(content.ticket))}
        onResume={onResume}
        sessions={sessions.filter((s) => s.ticket !== null && ticketKey(s.ticket) === ticketKey(content.ticket))}
        sessionHandlers={sessionHandlers}
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
  const pausedOnMap = [...paused.keys()].filter((key) => key.startsWith(`${detail.name}/`)).length;
  return (
    <article>
      <StartWork
        chooseSkill
        label={(agent) => `Continue map with ${agent}`}
        onStart={(agentId, skill) => onStartWork({ kind: "map", map: detail.name }, agentId, skill)}
      />
      {pausedOnMap > 0 && (
        <p className="resume-all">
          <button onClick={() => void onResumeAll(detail.name)}>Resume all on this map</button> {pausedOnMap} paused{" "}
          {pausedOnMap === 1 ? "session" : "sessions"}, resumed hidden.
        </p>
      )}
      {/* The map's own session and those on its tickets. */}
      <LiveSessions sessions={sessions.filter((s) => s.map === detail.name)} handlers={sessionHandlers} />
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
