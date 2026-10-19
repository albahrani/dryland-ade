/** How many `gh` or `glab` processes run at once. */
const CONCURRENCY = 8;

/** Runs `run` over `items` with a few at a time, returning the results in the order of `items`. */
export async function mapLimit<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await run(items[i] as T);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}
