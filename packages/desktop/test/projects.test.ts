import { describe, expect, it } from "vitest";
import {
  addProject,
  closeProject,
  liveSessionCount,
  parseProjects,
  projectSessions,
  removeProject,
} from "../src/shared/projects.ts";

describe("the list of open projects", () => {
  it("adds a project once, at the end", () => {
    expect(addProject(["/a"], "/b")).toEqual(["/a", "/b"]);
    expect(addProject(["/a", "/b"], "/a")).toEqual(["/a", "/b"]);
  });

  it("removes a project", () => {
    expect(removeProject(["/a", "/b"], "/a")).toEqual(["/b"]);
    expect(removeProject(["/a"], "/zzz")).toEqual(["/a"]);
  });

  it("reads a saved list defensively, dropping anything that is not a path and repeats", () => {
    expect(parseProjects(["/a", 3, "", "/b", "/a"])).toEqual(["/a", "/b"]);
    expect(parseProjects("nope")).toEqual([]);
    expect(parseProjects(undefined)).toEqual([]);
  });
});

describe("closing a project", () => {
  it("moves to the right neighbour when the current project closes, else the left one", () => {
    expect(closeProject(["/a", "/b", "/c"], "/b", "/b")).toEqual({ open: ["/a", "/c"], current: "/c" });
    expect(closeProject(["/a", "/b"], "/b", "/b")).toEqual({ open: ["/a"], current: "/a" });
  });

  it("keeps the current project when another one closes", () => {
    expect(closeProject(["/a", "/b", "/c"], "/a", "/c")).toEqual({ open: ["/b", "/c"], current: "/c" });
  });

  it("leaves no current project when the last one closes", () => {
    expect(closeProject(["/a"], "/a", "/a")).toEqual({ open: [], current: null });
  });

  it("changes nothing for a project that is not open", () => {
    expect(closeProject(["/a"], "/zzz", "/a")).toEqual({ open: ["/a"], current: "/a" });
  });
});

describe("a project's sessions", () => {
  const sessions = [
    { id: "1", project: "/a" },
    { id: "2", project: "/b" },
    { id: "3", project: "/a" },
  ];

  it("picks the sessions of one project", () => {
    expect(projectSessions(sessions, "/a").map((s) => s.id)).toEqual(["1", "3"]);
    expect(projectSessions(sessions, null)).toEqual([]);
  });

  it("counts those not ended as live", () => {
    expect(liveSessionCount(sessions, { "1": "running", "3": "ended" }, "/a")).toBe(1);
    // A session whose state is not known yet has just launched.
    expect(liveSessionCount(sessions, {}, "/a")).toBe(2);
  });
});
