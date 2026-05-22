import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

/**
 * Configuration Better Auth.
 *
 * - database : utilise notre client Prisma (singleton) avec adaptateur Postgres
 * - emailAndPassword : inscription/connexion par email + mot de passe
 * - socialProviders : authentification OAuth via Google et GitHub
 *
 * Better Auth lit automatiquement les variables d'environnement :
 * - BETTER_AUTH_SECRET, BETTER_AUTH_URL
 * - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});