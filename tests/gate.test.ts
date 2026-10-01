// Access codes: which code opens which page.
import { describe, expect, test } from "bun:test";
import { GATES, gateHash, gateMatches, gateUnlock } from "../shared/gate.js";

describe("access gates", () => {
  test("hashes are the djb2 of the trimmed, lowercased code", () => {
    expect(gateHash("")).toBe("1505");
    expect(gateMatches("cplus", "  CPLUS26 ")).toBe(gateHash("cplus26") === GATES.cplus.hash);
  });

  test("the C+ code opens only C+; a wrong code opens nothing", () => {
    expect(gateMatches("cplus", "CPLUS26")).toBe(true);
    expect(gateMatches("team", "CPLUS26")).toBe(false);
    expect(gateUnlock(["team"], "CPLUS26")).toBeNull();
    expect(gateUnlock(["cplus", "team"], "CPLUS26")).toEqual({ name: "cplus", code: "cplus26" });
    expect(gateUnlock(["cplus", "team"], "nope")).toBeNull();
  });
});
