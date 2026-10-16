// Auth.js con enlace por correo. Solo pueden entrar usuarios ya dados de alta
// (el panel no permite registro libre): la cuenta la crea un admin o el script
// `npm run usuario:crear`.

import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma-global";
import { configSmtp, enviarEnlaceDeAcceso } from "@/lib/correo";

const base = PrismaAdapter(prisma);

/**
 * Borrar una sesión que ya no existe no es un error: pasa si la cookie quedó
 * en el navegador tras cerrar sesión en otro dispositivo o limpiar sesiones.
 * Sin esto, volver a entrar con ese navegador termina en «Configuration».
 */
const adapter: Adapter = {
  ...base,
  async deleteSession(token) {
    try {
      await base.deleteSession!(token);
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")) throw e;
    }
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
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
