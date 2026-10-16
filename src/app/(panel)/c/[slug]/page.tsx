import { redirect } from "next/navigation";

export default async function InicioCanal({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  redirect(`/c/${encodeURIComponent(slug)}/calendario`);
}
