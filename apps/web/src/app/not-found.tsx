import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="workspace-alone">
      <h1>Page unavailable</h1>
      <p>Check the address or return to your organizations.</p>
      <Link href="/workspace">Open organizations</Link>
    </main>
  );
}
