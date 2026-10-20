import { redirect } from "next/navigation";

export default async function CalendarioCanal({ params, searchParams }: PageProps<"/c/[slug]/calendario">) {
  const { slug } = await params;
  const { mes } = await searchParams;
  const extra = typeof mes === "string" ? `&mes=${encodeURIComponent(mes)}` : "";
  redirect(`/calendario?canal=${encodeURIComponent(slug)}${extra}`);
}
