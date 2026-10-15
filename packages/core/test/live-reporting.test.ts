import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { liveLockFile, type LiveEvent, type LiveListener, sendLiveEvent, startLiveListener } from "../src/index.ts";

const appDir = () => mkdtempSync(join(tmpdir(), "dryland-live-"));

const EVENT: LiveEvent = {
  session_id: "session-a",
  kind: "ticket.changed",
  timestamp: "2026-10-15T10:00:00.000Z",
  payload: { command: "ticket claim", ticket: "shop/01" },
};

const listeners: LiveListener[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

async function listen(dir: string): Promise<{ listener: LiveListener; received: LiveEvent[] }> {
  const received: LiveEvent[] = [];
  const listener = await startLiveListener({
    lockFile: liveLockFile({ DRYLAND_APP_DIR: dir }),
    onEvent: (e) => received.push(e),
  });
  listeners.push(listener);
  return { listener, received };
}

describe("live reporting", () => {
  it("delivers an event sent through the lock file to the running listener", async () => {
    const dir = appDir();
    const { received } = await listen(dir);

    const sent = await sendLiveEvent(EVENT, { env: { DRYLAND_APP_DIR: dir } });

    expect(sent).toBe(true);
    expect(received).toEqual([EVENT]);
  });

  it("reaches the app through DRYLAND_PORT and DRYLAND_TOKEN, as a Dryland terminal sets them", async () => {
    const { listener, received } = await listen(appDir());
    const env = { DRYLAND_APP_DIR: appDir(), DRYLAND_PORT: String(listener.port), DRYLAND_TOKEN: listener.token };

    await expect(sendLiveEvent(EVENT, { env })).resolves.toBe(true);
    expect(received).toEqual([EVENT]);
  });

  it("falls back to the lock file when DRYLAND_PORT points at an app that has gone", async () => {
    const dir = appDir();
    const { listener: gone } = await listen(appDir());
    await gone.close();
    const { received } = await listen(dir);
    const env = { DRYLAND_APP_DIR: dir, DRYLAND_PORT: String(gone.port), DRYLAND_TOKEN: gone.token };

    await expect(sendLiveEvent(EVENT, { env })).resolves.toBe(true);
    expect(received).toEqual([EVENT]);
  });

  it("rejects a request without the listener's token and does not pass it on", async () => {
    const { listener, received } = await listen(appDir());

    const wrongToken = await fetch(`http://127.0.0.1:${listener.port}/events`, {
      method: "POST",
      headers: { authorization: "Bearer not-the-token" },
      body: JSON.stringify(EVENT),
    });
    const noToken = await fetch(`http://127.0.0.1:${listener.port}/events`, {
      method: "POST",
      body: JSON.stringify(EVENT),
    });

    expect(wrongToken.status).toBe(401);
    expect(noToken.status).toBe(401);
    expect(received).toEqual([]);
  });

  it("removes the lock file on close, and the next launch writes a new port and token", async () => {
    const dir = appDir();
    const lockFile = liveLockFile({ DRYLAND_APP_DIR: dir });
    const { listener: first } = await listen(dir);
    expect(JSON.parse(readFileSync(lockFile, "utf8"))).toEqual({ port: first.port, token: first.token });

    await first.close();
    expect(existsSync(lockFile)).toBe(false);

    const { listener: second } = await listen(dir);
    expect(second.token).not.toBe(first.token);
    expect(JSON.parse(readFileSync(lockFile, "utf8"))).toEqual({ port: second.port, token: second.token });
  });

  it("leaves a newer listener's lock file in place when an older one closes", async () => {
    const dir = appDir();
    const { listener: older } = await listen(dir);
    const { listener: newer, received } = await listen(dir);

    await older.close();

    await expect(sendLiveEvent(EVENT, { env: { DRYLAND_APP_DIR: dir } })).resolves.toBe(true);
    expect(received).toEqual([EVENT]);
    expect(newer.port).not.toBe(older.port);
  });

  it("rejects a malformed event and does not pass it on", async () => {
    const { listener, received } = await listen(appDir());
    const post = (body: unknown) =>
      fetch(`http://127.0.0.1:${listener.port}/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${listener.token}` },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

    expect((await post("{not json")).status).toBe(400);
    expect((await post({ ...EVENT, kind: "session.exploded" })).status).toBe(400);
    expect((await post({ ...EVENT, session_id: 7 })).status).toBe(400);
    expect((await post({ kind: "ticket.changed" })).status).toBe(400);
    expect(received).toEqual([]);
  });

  it("listens on the loopback address only", async () => {
    const { listener } = await listen(appDir());
    const external = Object.values(networkInterfaces())
      .flat()
      .find((address) => address !== undefined && address.family === "IPv4" && !address.internal);

    expect(listener.host).toBe("127.0.0.1");
    if (external !== undefined) {
      await expect(fetch(`http://${external.address}:${listener.port}/events`, { method: "POST" })).rejects.toThrow();
    }
  });

  it("resolves false without throwing when there is no lock file", async () => {
    await expect(sendLiveEvent(EVENT, { env: { DRYLAND_APP_DIR: appDir() } })).resolves.toBe(false);
  });

  it("resolves false without throwing when the lock file is left from a closed app", async () => {
    const dir = appDir();
    const { listener } = await listen(dir);
    const lock = readFileSync(liveLockFile({ DRYLAND_APP_DIR: dir }), "utf8");
    await listener.close();
    // A crash leaves the lock file behind with a port nothing listens on any more.
    writeFileSync(liveLockFile({ DRYLAND_APP_DIR: dir }), lock);

    await expect(sendLiveEvent(EVENT, { env: { DRYLAND_APP_DIR: dir } })).resolves.toBe(false);
  });

  it("resolves false without throwing when the lock file is unreadable", async () => {
    const dir = appDir();
    writeFileSync(liveLockFile({ DRYLAND_APP_DIR: dir }), "{not json");

    await expect(sendLiveEvent(EVENT, { env: { DRYLAND_APP_DIR: dir } })).resolves.toBe(false);
  });
});
