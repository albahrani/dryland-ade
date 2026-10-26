import { DrylandError } from "./errors.ts";

/** One field of a document. The description and example feed the command help, so help cannot drift from the schema. */
export type Field = { description: string; optional?: true } & (
  | { type: "string"; example: string; oneLine?: true }
  | { type: "boolean"; example: boolean }
  | { type: "enum"; values: readonly string[]; example: string }
  | { type: "array"; items: Field; example: unknown[] }
  | { type: "object"; fields: Record<string, Field> }
);

export interface Schema {
  /** The `$schema` id a document of this shape carries. */
  id: string;
  fields: Record<string, Field>;
}

/** One problem, printed as one line: where, which rule, what was wrong and the fix. */
export interface Diagnostic {
  path: string;
  rule: string;
  problem: string;
  fix: string;
}

export const formatDiagnostic = (d: Diagnostic): string => `${d.path}: ${d.rule}: ${d.problem} Fix: ${d.fix}`;

/** The steps of a write; the exit code of a failed command says which one failed. */
export const WRITE_EXIT = { parse: 3, check: 4, apply: 5 } as const;

/** A write that stopped at `step` with the diagnostics to print, one per line. */
export class WriteFailure extends DrylandError {
  constructor(
    readonly step: keyof typeof WRITE_EXIT,
    readonly diagnostics: Diagnostic[],
  ) {
    super(`The document failed the ${step} step.`, "Fix the lines above and run the command again.");
    this.name = "WriteFailure";
  }
  get exitCode(): number {
    return WRITE_EXIT[this.step];
  }
}

const kindOf = (value: unknown): string =>
  value === null
    ? "null"
    : Array.isArray(value)
      ? "an array"
      : typeof value === "object"
        ? "an object"
        : `a ${typeof value}`;

function parseField(field: Field, value: unknown, path: string, out: Diagnostic[]): unknown {
  const wrong = (expected: string, fix = `Write ${path} as ${expected}.`) => {
    out.push({ path, rule: "wrong-type", problem: `Expected ${expected}, got ${kindOf(value)}.`, fix });
    return undefined;
  };
  switch (field.type) {
    case "string":
      return typeof value === "string" ? value : wrong("a string");
    case "boolean":
      return typeof value === "boolean" ? value : wrong("true or false");
    case "enum":
      if (typeof value === "string" && field.values.includes(value)) return value;
      out.push({
        path,
        rule: "bad-value",
        problem: `${JSON.stringify(value)} is not one of the allowed values.`,
        fix: `Use one of: ${field.values.join(", ")}.`,
      });
      return undefined;
    case "array": {
      if (!Array.isArray(value)) return wrong("an array");
      return value.map((item, i) => parseField(field.items, item, `${path}[${i}]`, out));
    }
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value)
        ? parseObject(field.fields, value as Record<string, unknown>, path, out)
        : wrong("an object");
  }
}

function parseObject(
  fields: Record<string, Field>,
  object: Record<string, unknown>,
  prefix: string,
  out: Diagnostic[],
): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  const at = (name: string) => (prefix === "" ? name : `${prefix}.${name}`);
  for (const name of Object.keys(object)) {
    if (fields[name] === undefined) {
      out.push({
        path: at(name),
        rule: "unknown-field",
        problem: "The schema has no such field.",
        fix: `Remove it; the fields are: ${Object.keys(fields).join(", ")}.`,
      });
    }
  }
  for (const [name, field] of Object.entries(fields)) {
    const value = object[name];
    if (value === undefined) {
      if (field.optional !== true) {
        out.push({
          path: at(name),
          rule: "missing-field",
          problem: "The field is required.",
          fix: `Add ${name}: ${field.description}`,
        });
      }
      continue;
    }
    parsed[name] = parseField(field, value, at(name), out);
  }
  return parsed;
}

/** The document in `text`, or a `parse` failure listing every syntax and shape problem at once. */
export function parseDocument<T>(schema: Schema, text: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\u{FEFF}/u, ""));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const empty = text.trim() === "";
    throw new WriteFailure("parse", [
      {
        path: "$",
        rule: "invalid-json",
        problem: empty ? "Nothing arrived on stdin." : `The input is not JSON (${reason}).`,
        fix: "Pipe one JSON document to the command; run it with --help for an example.",
      },
    ]);
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new WriteFailure("parse", [
      {
        path: "$",
        rule: "wrong-type",
        problem: `Expected an object, got ${kindOf(json)}.`,
        fix: "Write one JSON object.",
      },
    ]);
  }
  const out: Diagnostic[] = [];
  const parsed = parseObject(schema.fields, json as Record<string, unknown>, "", out);
  if (out.length > 0) throw new WriteFailure("parse", out);
  return parsed as T;
}

function exampleOf(field: Field): unknown {
  return field.type === "object"
    ? Object.fromEntries(Object.entries(field.fields).map(([name, f]) => [name, exampleOf(f)]))
    : field.example;
}

function describeFields(fields: Record<string, Field>, indent: string): string[] {
  return Object.entries(fields).flatMap(([name, field]) => {
    const type = field.type === "enum" ? field.values.join(" | ") : field.type;
    const lines = [`${indent}${name}${field.optional ? " (optional)" : ""}: ${type}. ${field.description}`];
    const inner = field.type === "array" ? field.items : field;
    if (inner.type === "object") lines.push(...describeFields(inner.fields, `${indent}  `));
    return lines;
  });
}

/** Help text for a write command: what each field means and a valid example, both generated from the schema. */
export function documentHelp(usage: string, schema: Schema): string {
  const example = exampleOf({ type: "object", description: "", fields: schema.fields });
  return [
    `Usage: ${usage}`,
    "",
    "Reads one JSON document from stdin. Fields:",
    ...describeFields(schema.fields, "  "),
    "",
    "Example:",
    JSON.stringify(example, null, 2),
    "",
    "--check runs the parse and check steps and writes nothing.",
    `Exit codes: ${WRITE_EXIT.parse} the document does not match the schema, ${WRITE_EXIT.check} it breaks a content rule, ${WRITE_EXIT.apply} the write could not be applied.`,
    "",
  ].join("\n");
}

/** `value` with the `$schema` id of `schema` in front, the shape every read returns. */
export const withSchema = <T extends object>(schema: Pick<Schema, "id">, value: T): { $schema: string } & T => ({
  $schema: schema.id,
  ...value,
});
