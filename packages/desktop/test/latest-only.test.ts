import { describe, expect, it } from "vitest";
import { latestOnly } from "../src/main/latest-only.ts";

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("latestOnly", () => {
  it("delivers only the result of the latest call when an earlier one finishes last", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const pending = [slow, fast];
    const delivered: string[] = [];
    const run = latestOnly(
      () => pending.shift()!.promise,
      (value) => delivered.push(value),
    );

    const first = run();
    const second = run();
    fast.resolve("new");
    await second;
    slow.resolve("old");
    await first;

    expect(delivered).toEqual(["new"]);
  });

  it("delivers every result of calls that do not overlap", async () => {
    const delivered: number[] = [];
    let n = 0;
    const run = latestOnly(
      async () => ++n,
      (value) => delivered.push(value),
    );

    await run();
    await run();

    expect(delivered).toEqual([1, 2]);
  });
});
