/**
 * Wraps an async `produce` so `deliver` sees only the result of the latest call. A call that a newer one overtook
 * is dropped when it finishes, so a slow, older read never replaces a newer one.
 */
export function latestOnly<T>(produce: () => Promise<T>, deliver: (value: T) => void): () => Promise<void> {
  let latest = 0;
  return async () => {
    const call = ++latest;
    const value = await produce();
    if (call === latest) deliver(value);
  };
}
