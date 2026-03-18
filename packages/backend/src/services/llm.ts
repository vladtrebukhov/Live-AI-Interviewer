import { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { loadBackendEnv } from '../lib/env.js';

loadBackendEnv();

const openai = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview',
});

interface FeedbackInput {
  questionTitle: string;
  questionDescription: string;
  currentCode: string;
  recentTranscript: string;
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

interface FeedbackOutput {
  content: string;
  type: 'clarification' | 'hint' | 'feedback' | 'confirmation' | 'follow-up';
}

const SYSTEM_PROMPT = `You are an experienced technical interviewer conducting a low-level design (LLD) coding interview. Your role is to:
1. Guide the candidate through the design process without giving direct answers
2. Ask clarifying questions about their approach
3. Point out potential issues in their code or design
4. Confirm good decisions and approaches
5. Provide hints when the candidate is stuck
6. Evaluate their communication and thought process

Be concise. Respond in 2-3 sentences unless more detail is needed.
Always respond with valid JSON: { "content": "your response", "type": "clarification|hint|feedback|confirmation|follow-up" }`;

export async function generateFeedback(input: FeedbackInput): Promise<FeedbackOutput> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Question: ${input.questionTitle}\n\n${input.questionDescription}` },
  ];

  const recentHistory = input.conversationHistory.slice(-20);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role === 'system' ? 'user' : msg.role, content: msg.content });
  }

  const contextMessage = [
    `Current code:\n\`\`\`\n${input.currentCode}\n\`\`\``,
    input.recentTranscript ? `Candidate just said: "${input.recentTranscript}"` : '',
  ].filter(Boolean).join('\n\n');

  messages.push({ role: 'user', content: contextMessage });

  const completion = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT ?? 'gpt-4o',
    messages,
    temperature: 0.7,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(responseText) as FeedbackOutput;
    return { content: parsed.content ?? 'Could not generate feedback.', type: parsed.type ?? 'feedback' };
  } catch {
    return { content: responseText, type: 'feedback' };
  }
}
