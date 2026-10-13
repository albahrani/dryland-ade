/** `value` trimmed, which must be one non-empty line; `what`, `flag` and `hint` name it in the error. */
export function requireOneLine(what: string, value: string, flag: string, hint = "<text>"): string {
  const text = value.trim();
  if (text === "" || /[\r\n]/.test(text)) {
    throw new DrylandError(`A ${what} must be one non-empty line.`, `Pass it as --${flag} "${hint}".`);
  }
  return text;
}

/** A failure the user or agent can act on: says what went wrong and what to do next. */
export class DrylandError extends Error {
  constructor(
    message: string,
    readonly nextAction: string,
  ) {
    super(message);
    this.name = "DrylandError";
  }
}
