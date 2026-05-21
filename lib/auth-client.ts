import { createAuthClient } from "better-auth/react";

/**
 * Client Better Auth côté navigateur.
 *
 * `createAuthClient` infère les types depuis notre serveur Better Auth :
 * les méthodes disponibles (signUp, signIn, signOut, useSession...) sont
 * automatiquement typées selon notre configuration côté serveur.
 *
 * Pas besoin de spécifier baseURL : par défaut, le client appelle
 * la même origine que la page courante (donc /api/auth/* sur localhost:3000).
 */
export const authClient = createAuthClient();

/**
 * Hooks et fonctions exportés pour usage direct dans les composants.
 * On les ré-exporte ici pour simplifier les imports ailleurs.
 */
export const { signIn, signUp, signOut, useSession } = authClient;