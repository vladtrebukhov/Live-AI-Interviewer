import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
          <span className="text-xl font-bold text-background">{'</>'}</span>
        </div>
        <span className="text-sm font-semibold uppercase tracking-widest text-accent">
          Live Interviewer
        </span>
      </div>
      <h1 className="text-4xl font-bold mb-3 text-foreground">Practice Coding Interviews</h1>
      <p className="text-text-secondary text-lg mb-10 max-w-md text-center">
        Real-time AI feedback. Write code, speak your thought process, and sharpen your skills.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md bg-accent px-8 py-3 text-sm font-semibold text-background hover:bg-accent-hover transition-colors"
      >
        Get Started
      </Link>
    </main>
  );
}
