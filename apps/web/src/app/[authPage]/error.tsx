"use client";

export default function AuthError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="workspace-alone">
      <h1>Form unavailable</h1>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
