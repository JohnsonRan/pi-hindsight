import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import {
  PI_HINDSIGHT_CLIENT_RANGE,
  PI_HINDSIGHT_USER_AGENT,
  PI_HINDSIGHT_VERSION,
} from "../extensions/version.js";

describe("runtime version metadata", () => {
  it("keeps user-agent version aligned with package.json", () => {
    expect(PI_HINDSIGHT_VERSION).toBe(packageJson.version);
    expect(PI_HINDSIGHT_USER_AGENT).toBe(`pi-hindsight/${packageJson.version}`);
  });

  it("keeps the reported client range aligned with package.json", () => {
    expect(PI_HINDSIGHT_CLIENT_RANGE).toBe(
      packageJson.dependencies["@vectorize-io/hindsight-client"],
    );
  });
});
