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
