import { describe, expect, it } from "vitest";

import {
  emailSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
} from "@/lib/validations/auth";

describe("emailSchema", () => {
  it("trims and lowercases before validating", () => {
    expect(emailSchema.parse("  User@Example.COM ")).toBe("user@example.com");
  });

  it("rejects invalid or oversized emails", () => {
    const tooLong = `${"a".repeat(64)}@${"b".repeat(186)}.com`; // 255 chars
    for (const value of ["", "user", "user@", "@example.com", tooLong]) {
      expect(emailSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("passwordSchema", () => {
  it("requires at least 8 characters", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
  });

  it("caps at 72 bytes, the bcrypt limit", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });

  it("counts bytes, not characters", () => {
    // "é" is 2 bytes in UTF-8: 36 chars = 72 bytes, 37 chars = 74 bytes.
    expect(passwordSchema.safeParse("é".repeat(36)).success).toBe(true);
    expect(passwordSchema.safeParse("é".repeat(37)).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normalizes the email and keeps the password as typed", () => {
    expect(
      loginSchema.parse({ email: " A@B.co ", password: " pass word " }),
    ).toEqual({ email: "a@b.co", password: " pass word " });
  });
});

describe("registerSchema", () => {
  const valid = {
    firstName: "Ana",
    lastName: "Silva",
    email: "ana@example.com",
    password: "12345678",
  };

  it("accepts a valid registration and trims names", () => {
    expect(
      registerSchema.parse({ ...valid, firstName: "  Ana  " }).firstName,
    ).toBe("Ana");
  });

  it("rejects blank or oversized names", () => {
    for (const firstName of ["", "   ", "a".repeat(41)]) {
      expect(registerSchema.safeParse({ ...valid, firstName }).success).toBe(
        false,
      );
    }
  });

  it("rejects missing fields", () => {
    expect(
      registerSchema.safeParse({ ...valid, lastName: undefined }).success,
    ).toBe(false);
  });
});
