// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  normalizeVersionTag,
  resolveVersionFromTag,
  updateCargoTomlContent,
  updatePackageJsonContent,
} from "./sync-version-from-tag.mjs"

describe("sync-version-from-tag", () => {
  it("normalizes tags with or without a leading v", () => {
    expect(normalizeVersionTag("v1.2.3")).toBe("1.2.3")
    expect(normalizeVersionTag("1.2.3")).toBe("1.2.3")
    expect(normalizeVersionTag("v1.2.3-beta.1")).toBe("1.2.3-beta.1")
  })

  it("rejects invalid version tags", () => {
    expect(() => normalizeVersionTag("release-1")).toThrow("Invalid version tag")
  })

  it("prefers GITHUB_REF_NAME over local git lookup", () => {
    const exec = () => {
      throw new Error("exec should not be called when env tag is present")
    }

    expect(resolveVersionFromTag({ env: { GITHUB_REF_NAME: "v2.0.0" }, exec })).toBe("2.0.0")
  })

  it("updates package.json content", () => {
    const next = updatePackageJsonContent(
      JSON.stringify({ name: "moss-writer", version: "0.1.0" }),
      "3.4.5"
    )

    expect(JSON.parse(next)).toEqual({
      name: "moss-writer",
      version: "3.4.5",
    })
  })

  it("updates Cargo.toml package version", () => {
    const next = updateCargoTomlContent(
      `[package]
name = "moss-writer"
version = "0.1.0"

[dependencies]
tauri = "2"
`,
      "4.5.6"
    )

    expect(next).toContain('version = "4.5.6"')
    expect(next).not.toContain('version = "0.1.0"')
  })
})
