"use client";
export default function ErrorView({ reset }: { reset: () => void }) {
  return (
    <main className="hw-main">
      <h1>Workspace unavailable</h1>
      <p>We couldn’t load the founder workspace.</p>
      <button className="hw-quiet" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
