import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { nombrePanel } from "@/lib/panel";

async function pedirEnlace(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/login?error=EmailVacio");
  try {
    await signIn("nodemailer", { email, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      // Un correo sin cuenta ve lo mismo que uno válido: no se revela quién tiene acceso.
      if (error.type === "AccessDenied") redirect("/login/revisa-tu-correo");
      redirect(`/login?error=${error.type}`);
    }
    throw error;
  }
}

const MENSAJES: Record<string, string> = {
  EmailVacio: "Escribe tu correo.",
  AccessDenied: "Tu cuenta no tiene acceso al panel. Pide a un admin que la active.",
  Verification: "El enlace venció o ya se usó. Pide uno nuevo.",
  EmailSignInError: "No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sesion = await auth();
  if (sesion?.user) redirect("/");
  const { error } = await searchParams;
  const codigo = typeof error === "string" ? error : undefined;
  const mensaje = codigo ? (MENSAJES[codigo] ?? "No se pudo iniciar sesión.") : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-borde bg-superficie p-8">
        <p className="text-sm text-suave">{nombrePanel()}</p>
        <h1 className="mt-1 text-xl font-semibold">Entrar</h1>
        <p className="mt-2 text-sm text-suave">Te enviamos un enlace de acceso a tu correo.</p>
        {mensaje && (
          <p role="alert" className="mt-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {mensaje}
          </p>
        )}
        <form action={pedirEnlace} className="mt-6 space-y-3">
          <label htmlFor="email" className="block text-sm">Correo</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="campo w-full"
          />
          <button
            type="submit"
            className="btn-primario w-full"
          >
            Enviar enlace
          </button>
        </form>
      </div>
    </main>
  );
}
