import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { pin?: string };
}) {
  return <LoginClient forcePin={searchParams?.pin === "1"} />;
}
