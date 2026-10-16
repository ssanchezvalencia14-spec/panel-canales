import { redirect } from "next/navigation";

// Auth.js envía aquí sus errores. «AccessDenied» se trata igual que un envío
// correcto para no revelar qué correos tienen cuenta.
export default async function ErrorLogin({ searchParams }: PageProps<"/login/error">) {
  const { error } = await searchParams;
  if (error === "AccessDenied") redirect("/login/revisa-tu-correo");
  redirect(`/login?error=${typeof error === "string" ? encodeURIComponent(error) : "Default"}`);
}
