import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    authProvider?: string;
  }

  interface Session {
    user: {
      id: string;
      authProvider?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authProvider?: string;
  }
}
