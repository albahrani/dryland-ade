import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/** Every kind of live event: a session's state changes, and `ticket.changed` for any Dryland write. */
export const LIVE_EVENT_KINDS = [
  "session.started",
  "session.running",
  "session.waiting",
  "session.idle",
  "session.ended",
  "ticket.changed",
] as const;

export type LiveEventKind = (typeof LIVE_EVENT_KINDS)[number];

export const isLiveEventKind = (value: unknown): value is LiveEventKind =>
  LIVE_EVENT_KINDS.includes(value as LiveEventKind);

/** What `dryland` tells the running app; shown live and never stored (ADR 0008). */
export interface LiveEvent {
  /** `DRYLAND_SESSION_ID` of the session it came from; empty from a terminal outside any session. */
  session_id: string;
  kind: LiveEventKind;
  /** ISO timestamp of when the event happened. */
  timestamp: string;
  payload?: unknown;
}

/** The payload of `ticket.changed`: the command that wrote, and the ticket (`map/id`) or map it changed. */
export interface TicketChangedPayload {
  command: string;
  ticket?: string;
  map?: string;
}

type Env = Record<string, string | undefined>;

/** Where the running app writes its port and token, read by `dryland` to reach it. */
export function liveLockFile(
  env: Env = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  return join(env["DRYLAND_APP_DIR"] || appDir(env, platform, home), "live.json");
}

function appDir(env: Env, platform: NodeJS.Platform, home: string): string {
  if (platform === "win32") return join(env["LOCALAPPDATA"] || join(home, "AppData", "Local"), "Dryland");
  if (platform === "darwin") return join(home, "Library", "Application Support", "Dryland");
  return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dryland");
}

/** The event `value` describes, or `null` when it is not a well-formed live event. */
export function parseLiveEvent(value: unknown): LiveEvent | null {
  if (value === null || typeof value !== "object") return null;
  const { session_id, kind, timestamp, payload } = value as Record<string, unknown>;
  if (typeof session_id !== "string" || typeof timestamp !== "string") return null;
  if (!isLiveEventKind(kind)) return null;
  const event: LiveEvent = { session_id, kind, timestamp };
  return payload === undefined ? event : { ...event, payload };
}

interface Endpoint {
  port: number;
  token: string;
}

export interface LiveListener extends Endpoint {
  host: string;
  /** Stops listening and removes the lock file, unless a newer listener has replaced it. */
  close(): Promise<void>;
}

export interface LiveListenerOptions {
  lockFile: string;
  onEvent(event: LiveEvent): void;
}

const HOST = "127.0.0.1";
/** Events are small; anything bigger is not from `dryland`. */
const MAX_BODY_BYTES = 64 * 1024;

function readEndpoint(lockFile: string): Endpoint | null {
  try {
    const { port, token } = JSON.parse(readFileSync(lockFile, "utf8")) as Partial<Endpoint>;
    if (typeof port === "number" && typeof token === "string") return { port, token };
  } catch {
    // No app running, or a lock file nobody can read: there is nobody to tell.
  }
  return null;
}

/** Listens on `127.0.0.1` on a random port and writes the port and a fresh token to `lockFile`. */
export async function startLiveListener({ lockFile, onEvent }: LiveListenerOptions): Promise<LiveListener> {
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
  await mkdir(dirname(lockFile), { recursive: true });
  // Renamed into place, so `dryland` never reads half a lock file.
  const temp = `${lockFile}.${token}.tmp`;
  await writeFile(temp, JSON.stringify({ port, token } satisfies Endpoint));
  // Windows refuses to replace a file `dryland` has open for a moment; retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temp, lockFile);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 20 || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) {
        server.close();
        await rm(temp, { force: true });
        throw error;
      }
      await sleep(25);
    }
  }
  return {
    host: HOST,
    port,
    token,
    close: () => {
      // Synchronous, so the lock file is gone even when the app quits without waiting for this promise.
      if (readEndpoint(lockFile)?.token === token) rmSync(lockFile, { force: true });
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
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
 * Sends `event` to the running app: the one that spawned this terminal, else the one the lock file names.
 * Resolves `false`, never rejects, when it cannot be delivered.
 */
export async function sendLiveEvent(
  event: LiveEvent,
  { env = process.env, timeoutMs = 300 }: SendOptions = {},
): Promise<boolean> {
  const body = JSON.stringify(event);
  const fromEnv = endpointFromEnv(env);
  if (fromEnv !== null && (await post(fromEnv, body, timeoutMs))) return true;
  // A terminal can outlive the app that set its env; the lock file names the app running now.
  const fromLock = readEndpoint(liveLockFile(env));
  if (fromLock === null || (fromLock.port === fromEnv?.port && fromLock.token === fromEnv.token)) return false;
  return post(fromLock, body, timeoutMs);
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
