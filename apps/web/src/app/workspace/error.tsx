"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="workspace-alone">
      <h2>Workspace unavailable</h2>
      <p>Try loading the workspace again.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
