import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Configuration Better Auth.
 * - database : utilise notre client Prisma (singleton) avec adaptateur Postgres
 * - emailAndPassword : active l'inscription/connexion par email + mot de passe
 *
 * Les providers OAuth (Google, GitHub) seront ajoutés à la sous-phase 3F.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
});