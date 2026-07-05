import { redirect } from "next/navigation";

export default function LegacyNewVehiclePage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const qs = searchParams.id ? `?id=${searchParams.id}` : "";
  redirect(`/vehicules/nouveau${qs}`);
}
