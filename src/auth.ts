// Auth.js con enlace por correo. Solo pueden entrar usuarios ya dados de alta
// (el panel no permite registro libre): la cuenta la crea un admin o el script
// `npm run usuario:crear`.

import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { configSmtp, enviarEnlaceDeAcceso } from "@/lib/correo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [
    Nodemailer({
      // Auth.js exige `server`; el envío real lo hace sendVerificationRequest.
      server: configSmtp() ?? { jsonTransport: true },
      from: process.env.EMAIL_FROM ?? "no-configurado@localhost",
      maxAge: 15 * 60,
      async sendVerificationRequest({ identifier, url, expires }) {
        await enviarEnlaceDeAcceso({ para: identifier, url, expira: expires });
      },
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/revisa-tu-correo",
    error: "/login/error",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase().trim();
      if (!email) return false;
      const existente = await prisma.user.findUnique({
        where: { email },
        select: { activo: true },
      });
      // Sin cuenta o desactivado: no se envía enlace ni se crea usuario.
      return Boolean(existente?.activo);
    },
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
