'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { Question } from '@live-interviewer/shared';

const difficultyColors = {
  easy: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  hard: 'bg-red-100 text-red-800',
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
      <main className="min-h-screen p-8">
        <h1 className="text-3xl font-bold mb-6">Select a Question</h1>
        <p className="text-gray-500">Loading questions...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Select a Question</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {questions.map((q) => (
          <div
            key={q.id}
            className="border rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => router.push(`/interview/${q.id}`)}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{q.title}</h2>
              <span className={`text-xs font-medium px-2 py-1 rounded ${difficultyColors[q.difficulty]}`}>
                {q.difficulty}
              </span>
            </div>
            <p className="text-gray-600 text-sm mb-4 line-clamp-3">{q.description}</p>
            <div className="flex flex-wrap gap-2">
              {q.tags.map((tag) => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
