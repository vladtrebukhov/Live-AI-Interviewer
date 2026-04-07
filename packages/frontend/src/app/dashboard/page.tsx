'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { Question } from '@live-interviewer/shared';

const difficultyColors: Record<string, string> = {
  easy: 'bg-accent-muted text-accent',
  medium: 'bg-yellow-900/30 text-warning',
  hard: 'bg-red-900/30 text-danger',
};

export default function Dashboard() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchQuestions() {
      try {
        const data = await apiFetch<Question[]>('/api/questions');
        setQuestions(data);
      } catch (err) {
        console.error('Failed to fetch questions:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-background">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-6 text-foreground">Select a Challenge</h1>
          <p className="text-text-muted">Loading questions...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-8 w-8 rounded-md bg-accent flex items-center justify-center">
            <span className="text-sm font-bold text-background">{'</>'}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Challenges</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {questions.map((q) => (
            <div
              key={q.id}
              className="border border-border rounded-lg p-5 bg-surface hover:border-accent/40 transition-colors cursor-pointer group"
              onClick={() => router.push(`/interview/${q.id}`)}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                  {q.title}
                </h2>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${difficultyColors[q.difficulty] ?? ''}`}
                >
                  {q.difficulty}
                </span>
              </div>
              <p className="text-text-secondary text-xs mb-4 line-clamp-3 leading-relaxed">
                {q.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {q.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-surface-alt text-text-muted px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
