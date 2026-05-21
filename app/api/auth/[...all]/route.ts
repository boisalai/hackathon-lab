import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Route handler catch-all pour Better Auth.
 * Toutes les requêtes vers /api/auth/* sont déléguées à Better Auth :
 * - /api/auth/sign-up/email
 * - /api/auth/sign-in/email
 * - /api/auth/sign-out
 * - /api/auth/get-session
 * - /api/auth/callback/google (sous-phase 3F)
 * - ...etc.
 *
 * toNextJsHandler produit automatiquement les exports GET et POST
 * compatibles avec Next.js App Router.
 */
export const { POST, GET } = toNextJsHandler(auth);