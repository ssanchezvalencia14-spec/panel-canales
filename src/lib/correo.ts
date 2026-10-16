// Envío del enlace de acceso por correo (SMTP de Hostinger u otro).

import { createTransport } from "nodemailer";
import { nombrePanel } from "./panel";

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function configSmtp() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return {
    host,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASSWORD ?? "" },
  };
}

export function remitente(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("Falta la variable de entorno EMAIL_FROM.");
  return from;
}

export function correoDeAcceso(url: string, minutos: number) {
  const panel = nombrePanel();
  const asunto = `Tu enlace para entrar a ${panel}`;
  const texto = `Entra a ${panel} con este enlace (vence en ${minutos} minutos):\n\n${url}\n\nSi no lo pediste, ignora este correo.`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#e4e4e7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:440px;background:#18181b;border:1px solid #27272a;border-radius:12px"><tr><td style="padding:32px">
<p style="margin:0 0 8px;font-size:13px;color:#a1a1aa">${escaparHtml(panel)}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#fafafa">Entra al panel</h1>
<p style="margin:0 0 24px;font-size:14px;line-height:1.5">Pulsa el botón para iniciar sesión. El enlace vence en ${minutos} minutos y solo sirve una vez.</p>
<a href="${escaparHtml(url)}" style="display:inline-block;background:#fafafa;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:8px">Entrar</a>
<p style="margin:24px 0 0;font-size:12px;color:#71717a">Si no pediste este correo, ignóralo.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { asunto, texto, html };
}

export async function enviarEnlaceDeAcceso(params: { para: string; url: string; expira: Date }) {
  const minutos = Math.max(1, Math.round((params.expira.getTime() - Date.now()) / 60000));
  const { asunto, texto, html } = correoDeAcceso(params.url, minutos);
  const smtp = configSmtp();

  if (!smtp) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Falta configurar SMTP_HOST para enviar el enlace de acceso.");
    }
    // En desarrollo, sin SMTP, el enlace se muestra en la consola del servidor.
    console.info(`\n[correo de desarrollo] Enlace de acceso para ${params.para}:\n${params.url}\n`);
    return;
  }

  const transporte = createTransport(smtp);
  const info = await transporte.sendMail({
    to: params.para,
    from: remitente(),
    subject: asunto,
    text: texto,
    html,
  });
  const rechazados = [...(info.rejected ?? []), ...(info.pending ?? [])];
  if (rechazados.length) {
    throw new Error(`No se pudo enviar el correo a: ${rechazados.join(", ")}`);
  }
}

/** Correo simple a varios destinatarios (avisos al equipo). En desarrollo sin SMTP, a la consola. */
export async function enviarCorreo(params: { para: string[]; asunto: string; texto: string }) {
  if (params.para.length === 0) return { enviados: 0 };
  const smtp = configSmtp();
  if (!smtp) {
    if (process.env.NODE_ENV === "production") throw new Error("Falta configurar SMTP_HOST para enviar avisos.");
    console.info(`\n[correo de desarrollo] Para: ${params.para.join(", ")}\nAsunto: ${params.asunto}\n${params.texto}\n`);
    return { enviados: params.para.length };
  }
  const info = await createTransport(smtp).sendMail({
    from: remitente(),
    // Cada persona ve solo su dirección.
    to: remitente(),
    bcc: params.para,
    subject: params.asunto,
    text: params.texto,
  });
  return { enviados: params.para.length - (info.rejected?.length ?? 0) };
}
