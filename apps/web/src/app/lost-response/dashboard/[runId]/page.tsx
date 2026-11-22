import { notFound } from "next/navigation";
import { LostResponseDashboard } from "../../../../components/lost-response-dashboard";
import { getLocale } from "../../../../server/locale";
import { runIdentifier } from "../../../../server/lost-response";

export async function generateMetadata() {
  const { t } = await getLocale();
  return {
    title: t(
      "Event details · Test dashboard",
      "Dettaglio evento · Dashboard della prova",
    ),
    robots: { index: false, follow: false },
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  if (!runIdentifier.safeParse(runId).success) {
    notFound();
  }
  // Only the browser has the key to read this run. The page itself contains no event data.
  return <LostResponseDashboard key={runId} runId={runId} />;
}
