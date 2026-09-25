"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";

import { users } from "@/db/schema";
import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

export type AuthFormState = {
  error?: string;
  success?: boolean;
};

export async function registerWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please check the form fields and try again." };
  }

  const { firstName, lastName, email, password } = parsed.data;
  const passwordHash = await hash(password, 12);

  // Atomic insert: the unique constraint decides, so two concurrent requests
  // can never create duplicate accounts (no check-then-insert race).
  const [created] = await db
    .insert(users)
    .values({
      name: `${firstName} ${lastName}`,
      email,
      passwordHash,
      authProvider: "email",
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  if (!created) {
    return { error: "Unable to create an account with this email. Try signing in instead." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Please try signing in." };
    }
    // Next.js redirects are thrown as errors and must propagate.
    throw error;
  }

  return { success: true };
}

export async function loginWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  return { success: true };
}

export async function loginWithGoogle() {
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function loginWithGithub() {
  await signIn("github", { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
