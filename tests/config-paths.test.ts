import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import {
  globalConfigBasePath,
  projectConfigBasePath,
  projectStateDir,
  resolveAgentDir,
} from "../extensions/config/paths.js";

describe("config paths", () => {
  const originalHome = process.env.HOME;
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  });

  it("resolves injected envs from their own variables only", () => {
    expect(resolveAgentDir({ PI_CODING_AGENT_DIR: "/agent" })).toBe("/agent");
    expect(resolveAgentDir({ HOME: "/home/u" })).toBe(join("/home/u", ".pi", "agent"));
    expect(resolveAgentDir({})).toBeUndefined();
    expect(globalConfigBasePath({})).toBeUndefined();
    expect(globalConfigBasePath({ HOME: "/home/u" })).toBe(
      join("/home/u", ".pi", "agent", "hindsight"),
    );
  });

  it("uses the host agent dir for the live process env even without HOME", () => {
    delete process.env.HOME;
    delete process.env.PI_CODING_AGENT_DIR;
    expect(resolveAgentDir()).toBe(getAgentDir());
    expect(globalConfigBasePath()).toBe(join(getAgentDir(), "hindsight"));
  });

  it("keeps project paths under the host config dir", () => {
    expect(projectConfigBasePath("/repo")).toBe(join("/repo", ".pi", "hindsight"));
    expect(projectStateDir("/repo")).toBe(join("/repo", ".pi", "hindsight"));
  });
});
