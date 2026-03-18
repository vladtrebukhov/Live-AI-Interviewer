import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-5xl font-bold mb-4">Live Interviewer</h1>
      <p className="text-xl text-gray-600 mb-8">Live Coding Interview Simulator</p>
      <p className="text-gray-500 mb-12 max-w-lg text-center">
        Practice low-level design interviews with real-time AI feedback.
        Write code, speak your thought process, and get instant guidance.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
      >
        Get Started
      </Link>
    </main>
  );
}
