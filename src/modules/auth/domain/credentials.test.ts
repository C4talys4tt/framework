import { describe, expect, it } from "vitest";
import { changePasswordSchema, safeRedirectPath, signInSchema, signUpSchema } from "./credentials";

describe("safeRedirectPath", () => {
  it("allows same-origin paths", () => {
    expect(safeRedirectPath("/w/studio-abc12/overview")).toBe("/w/studio-abc12/overview");
    expect(safeRedirectPath("/w/studio/settings/profile?tab=1")).toBe("/w/studio/settings/profile?tab=1");
  });

  it.each([
    ["absolute url", "https://evil.example/phish"],
    ["protocol-relative url", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "w/studio"],
    ["control characters", "/w/\nstudio"],
    ["empty string", ""],
  ])("rejects %s", (_label, candidate) => {
    expect(safeRedirectPath(candidate)).toBe("/");
  });

  it("uses the fallback for null", () => {
    expect(safeRedirectPath(null, "/home")).toBe("/home");
  });
});

describe("signUpSchema", () => {
  it("normalises email and trims the name", () => {
    const parsed = signUpSchema.parse({ name: "  Enzo ", email: " Enzo@Example.COM ", password: "long enough pw" });
    expect(parsed).toEqual({ name: "Enzo", email: "enzo@example.com", password: "long enough pw" });
  });

  it("requires a name, a valid email and a 10 character password", () => {
    const result = signUpSchema.safeParse({ name: " ", email: "nope", password: "short" });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(new Set(paths)).toEqual(new Set(["name", "email", "password"]));
  });

  it("does not trim passwords", () => {
    expect(signUpSchema.parse({ name: "E", email: "e@example.com", password: "  spaced pw  " }).password).toBe("  spaced pw  ");
  });
});

describe("signInSchema", () => {
  it("accepts any non-empty password so old passwords still work", () => {
    expect(signInSchema.safeParse({ email: "e@example.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "e@example.com", password: "" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("rejects reusing the current password", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "same password!", newPassword: "same password!" });
    expect(result.success).toBe(false);
  });

  it("accepts a different, long enough password", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "a brand new one" }).success).toBe(true);
  });
});
