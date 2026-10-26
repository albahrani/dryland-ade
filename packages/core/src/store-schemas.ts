import type { Schema } from "./documents.ts";
import { TICKET_TYPES, TRIAGE_ROLES } from "./ticket.ts";

const triageValues = ["", ...TRIAGE_ROLES];

/** The document `ticket create` reads. A read of a ticket returns the same fields plus the ones the store derives. */
export const TICKET_INPUT: Schema = {
  id: "dryland/ticket@1",
  fields: {
    effort: { type: "string", description: "The effort slug the ticket belongs to, e.g. shop.", example: "shop" },
    title: { type: "string", description: "One line.", example: "Pick a cart library", oneLine: true },
    type: { type: "enum", values: TICKET_TYPES, description: "How the ticket is worked.", example: "task" },
    report: {
      type: "string",
      description: "What the ticket asks for, in prose.",
      example: "Compare two libraries and pick one.",
      optional: true,
    },
    criteria: {
      type: "array",
      description: "Acceptance criteria.",
      example: [{ text: "The cart survives a reload", done: false }],
      optional: true,
      items: {
        type: "object",
        description: "One criterion.",
        fields: {
          text: { type: "string", description: "What must hold.", example: "The cart survives a reload" },
          done: { type: "boolean", description: "Whether it already holds.", example: false },
        },
      },
    },
    spec: {
      type: "string",
      description: "Path of the effort's spec file, relative to the repo root.",
      example: ".scratch/shop/spec.md",
      optional: true,
    },
    blockedBy: {
      type: "array",
      description: "Tickets of the same effort that must resolve first, as effort/NN.",
      example: ["shop/01"],
      optional: true,
      items: { type: "string", description: "A ticket reference.", example: "shop/01" },
    },
    triageRole: {
      type: "enum",
      values: triageValues,
      description: "The triage role to start in; empty for none.",
      example: "ready-for-agent",
      optional: true,
    },
    hitl: {
      type: "boolean",
      description: "Whether a human must be in the loop while it is worked.",
      example: false,
      optional: true,
    },
  },
};

/** The document `map create` reads. */
export const MAP_INPUT: Schema = {
  id: "dryland/map@1",
  fields: {
    effort: { type: "string", description: "The effort slug the map belongs to.", example: "shop" },
    title: { type: "string", description: "One line.", example: "Shop", oneLine: true },
    destination: {
      type: "string",
      description: "Where the effort is going; reached when this holds.",
      example: "A shop that sells things.",
      optional: true,
    },
    notes: {
      type: "string",
      description: "Standing context for the effort.",
      example: "Carts are server side.",
      optional: true,
    },
    fog: {
      type: "array",
      description: "Not-yet-specified items.",
      example: ["Payment providers"],
      optional: true,
      items: { type: "string", description: "One item.", example: "Payment providers" },
    },
    outOfScope: {
      type: "array",
      description: "What the map leaves out.",
      example: ["Marketplace sellers"],
      optional: true,
      items: { type: "string", description: "One item.", example: "Marketplace sellers" },
    },
  },
};

/** `$schema` ids of what the read commands return. */
export const READ_SCHEMAS = {
  ticket: "dryland/ticket@1",
  tickets: "dryland/ticket-list@1",
  map: "dryland/map-view@1",
  frontier: "dryland/frontier@1",
} as const;
