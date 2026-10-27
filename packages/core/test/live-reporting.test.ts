import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { type LiveEvent, type LiveListener, sendLiveEvent, startLiveListener } from "../src/index.ts";

const EVENT: LiveEvent = {
  session_id: "session-a",
  state: "running",
  timestamp: "2026-10-15T10:00:00.000Z",
};

const listeners: LiveListener[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((listener) => listener.close()));
});

async function listen(): Promise<{ listener: LiveListener; received: LiveEvent[]; env: Record<string, string> }> {
  const received: LiveEvent[] = [];
  const listener = await startLiveListener({ onEvent: (e) => received.push(e) });
  listeners.push(listener);
  return { listener, received, env: { DRYLAND_PORT: String(listener.port), DRYLAND_TOKEN: listener.token } };
}

describe("live reporting", () => {
  it("reaches the app through DRYLAND_PORT and DRYLAND_TOKEN, as a Dryland terminal sets them", async () => {
    const { received, env } = await listen();

    await expect(sendLiveEvent(EVENT, { env })).resolves.toBe(true);
    expect(received).toEqual([EVENT]);
  });

  it("rejects a request without the listener's token and does not pass it on", async () => {
    const { listener, received } = await listen();

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

  it("gives each launch its own token", async () => {
    const { listener: first } = await listen();
    await first.close();

    const { listener: second } = await listen();

    expect(second.token).not.toBe(first.token);
  });

  it("rejects a malformed event and does not pass it on", async () => {
    const { listener, received } = await listen();
    const post = (body: unknown) =>
      fetch(`http://127.0.0.1:${listener.port}/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${listener.token}` },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

    expect((await post("{not json")).status).toBe(400);
    expect((await post({ ...EVENT, state: "exploded" })).status).toBe(400);
    expect((await post({ ...EVENT, session_id: 7 })).status).toBe(400);
    expect((await post({ ...EVENT, timestamp: "" })).status).toBe(400);
    expect((await post({ ...EVENT, timestamp: "yesterday" })).status).toBe(400);
    expect((await post({ state: "running" })).status).toBe(400);
    expect((await post({ ...EVENT, agent_session_id: 7 })).status).toBe(400);
    expect(received).toEqual([]);
  });

  it("carries the Agent CLI's session id when the event has one", async () => {
    const { received, env } = await listen();
    const event: LiveEvent = { ...EVENT, state: "idle", agent_session_id: "cli-session-1" };

    await sendLiveEvent(event, { env });

    expect(received).toEqual([event]);
  });

  it("listens on the loopback address only", async () => {
    const { listener } = await listen();
    const external = Object.values(networkInterfaces())
      .flat()
      .find((address) => address !== undefined && address.family === "IPv4" && !address.internal);

    expect(listener.host).toBe("127.0.0.1");
    if (external !== undefined) {
      await expect(fetch(`http://${external.address}:${listener.port}/events`, { method: "POST" })).rejects.toThrow();
    }
  });

  it("resolves false without throwing when the env names no app", async () => {
    await expect(sendLiveEvent(EVENT, { env: {} })).resolves.toBe(false);
  });

  it("resolves false without throwing when the env names an app that has gone", async () => {
    const { listener, env } = await listen();
    await listener.close();

    await expect(sendLiveEvent(EVENT, { env })).resolves.toBe(false);
  });
});
