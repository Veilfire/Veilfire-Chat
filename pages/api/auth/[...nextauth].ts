import NextAuth, { type NextAuthOptions } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import CredentialsProvider from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb";
import bcrypt from "bcryptjs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const email = credentials.email.trim();
        if (!EMAIL_REGEX.test(email)) {
          return null;
        }

        const adapter = authOptions.adapter as Adapter;
        if (!adapter || !adapter.getUserByEmail) {
          throw new Error("Auth adapter not configured");
        }

        const user = (await adapter.getUserByEmail(
          email
        )) as AdapterUser | (AdapterUser & { password?: string | null }) | null;
        if (!user || !("password" in user) || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          (user as { password: string }).password
        );
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name ?? "",
          email: user.email ?? "",
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
