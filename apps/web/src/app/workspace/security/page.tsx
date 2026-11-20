import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../server/auth";
import { AccountSecurity } from "../../../components/account-security";
import { PageHeading } from "../../../components/page-heading";

export const metadata = { title: "Account security" };

export default async function SecurityPage() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  return (
    <main id="main" className="security-page">
      <PageHeading title="Account security" />
      <AccountSecurity enabled={Boolean(session.user.twoFactorEnabled)} />
    </main>
  );
}
