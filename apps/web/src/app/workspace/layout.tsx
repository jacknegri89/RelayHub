import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../server/auth";
import { Brand } from "../../components/brand";
import { ActionForm } from "../../components/forms";
import { PolicyLinks } from "../../components/policy-links";
import Link from "next/link";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) {
    redirect("/login");
  }
  return (
    <>
      <header className="topbar">
        <Link href="/" aria-label="RelayHub home">
          <Brand />
        </Link>
        <div className="account">
          <span>{session.user.email}</span>
          <Link href="/workspace/security">Security</Link>
          <ActionForm
            endpoint="/api/auth/sign-out"
            label="Sign out"
            nextPath="/login"
          />
        </div>
      </header>
      {children}
      <footer className="workspace-footer">
        <PolicyLinks />
      </footer>
    </>
  );
}
