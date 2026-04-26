import NextAuth, { type NextAuthConfig } from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@bdu/lib';

// Auth.js v5 prefers AUTH_URL / AUTH_SECRET. Fall back to next-auth v4 names
// for compatibility with older deployments.
if (!process.env.AUTH_URL && process.env.NEXTAUTH_URL) {
  process.env.AUTH_URL = process.env.NEXTAUTH_URL;
}
if (!process.env.AUTH_SECRET && process.env.NEXTAUTH_SECRET) {
  process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
}

const ownerEmail = (process.env.OWNER_EMAIL ?? '').toLowerCase();

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM ?? 'BD updates <onboarding@resend.dev>',
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = (user.email ?? '').toLowerCase();
      if (!ownerEmail) return false;
      return email === ownerEmail;
    },
    async session({ session, user }) {
      session.user = { ...session.user, id: user.id };
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
    error: '/auth/error',
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
