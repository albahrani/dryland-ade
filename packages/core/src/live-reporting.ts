import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";

/** The states a hook reports; the app marks a session it just spawned `launched` itself, before any report. */
export const REPORTED_STATES = ["running", "waiting", "idle", "ended"] as const;

export type ReportedState = (typeof REPORTED_STATES)[number];

export const isReportedState = (value: unknown): value is ReportedState =>
  REPORTED_STATES.includes(value as ReportedState);

/** What a hook tells the running app through `dryland`: a session state report, shown live and never stored (ADR 0015). */
export interface LiveEvent {
  /** `DRYLAND_SESSION_ID` of the session it came from; empty from a terminal outside any session. */
  session_id: string;
  state: ReportedState;
  /** ISO timestamp of when the state was reported. */
  timestamp: string;
  /** The Agent CLI's own id of the session it came from, when the CLI set one for its hooks (ADR 0010). */
  agent_session_id?: string;
}

type Env = Record<string, string | undefined>;

/** The event `value` describes, or `null` when it is not a well-formed live event. */
export function parseLiveEvent(value: unknown): LiveEvent | null {
  if (value === null || typeof value !== "object") return null;
  const { session_id, state, timestamp, agent_session_id } = value as Record<string, unknown>;
  if (typeof session_id !== "string" || typeof timestamp !== "string") return null;
  if (!/^\d{4}-\d\d-\d\dT/.test(timestamp) || Number.isNaN(Date.parse(timestamp))) return null;
  if (!isReportedState(state)) return null;
  if (agent_session_id !== undefined && typeof agent_session_id !== "string") return null;
  const event: LiveEvent = { session_id, state, timestamp };
  if (agent_session_id) event.agent_session_id = agent_session_id as string;
  return event;
}

interface Endpoint {
  port: number;
  token: string;
}

export interface LiveListener extends Endpoint {
  host: string;
  /** Stops listening. */
  close(): Promise<void>;
}

export interface LiveListenerOptions {
  onEvent(event: LiveEvent): void;
}

const HOST = "127.0.0.1";
/** Events are small; anything bigger is not from `dryland`. */
const MAX_BODY_BYTES = 64 * 1024;

/** Listens on `127.0.0.1` on a random port; the port and a fresh token reach terminals through their env. */
export async function startLiveListener({ onEvent }: LiveListenerOptions): Promise<LiveListener> {
  const token = randomUUID();
  const expected = Buffer.from(`Bearer ${token}`);
  const authorized = (header: string | undefined) => {
    const given = Buffer.from(header ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/events" || !authorized(req.headers.authorization)) {
      res.writeHead(req.method === "POST" && req.url === "/events" ? 401 : 404).end();
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        res.writeHead(413).end();
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      let event: LiveEvent | null = null;
      try {
        event = parseLiveEvent(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        // Not JSON: rejected below like any other malformed event.
      }
      if (event === null) {
        res.writeHead(400).end();
        return;
      }
      res.writeHead(204).end();
      onEvent(event);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    host: HOST,
    port,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** The app that spawned this terminal, as it set `DRYLAND_PORT` and `DRYLAND_TOKEN`. */
function endpointFromEnv(env: Env): Endpoint | null {
  const port = Number(env["DRYLAND_PORT"]);
  const token = env["DRYLAND_TOKEN"];
  return Number.isInteger(port) && port > 0 && token ? { port, token } : null;
}

export interface SendOptions {
  env?: Env;
  /** How long to wait for the app before giving up. */
  timeoutMs?: number;
}

/**
 * Sends `event` to the app that spawned this terminal, which set `DRYLAND_PORT` and `DRYLAND_TOKEN` in its env.
 * Resolves `false`, never rejects, when it cannot be delivered, so a terminal outside the app reports nothing.
 */
export async function sendLiveEvent(
  event: LiveEvent,
  { env = process.env, timeoutMs = 300 }: SendOptions = {},
): Promise<boolean> {
  const endpoint = endpointFromEnv(env);
  return endpoint === null ? false : post(endpoint, JSON.stringify(event), timeoutMs);
}

function post(endpoint: Endpoint, body: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = request(
      {
        host: HOST,
        port: endpoint.port,
        method: "POST",
        path: "/events",
        headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json", connection: "close" },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 204);
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end(body);
  });
}
