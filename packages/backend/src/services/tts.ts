import { AzureOpenAI } from 'openai';
import { loadBackendEnv } from '../lib/env.js';

loadBackendEnv();

const ttsEndpoint = process.env.AZURE_OPENAI_TTS_ENDPOINT ?? process.env.AZURE_OPENAI_ENDPOINT;
const ttsApiKey = process.env.AZURE_OPENAI_TTS_API_KEY ?? process.env.AZURE_OPENAI_API_KEY;
const ttsApiVersion =
  process.env.AZURE_OPENAI_TTS_API_VERSION ??
  process.env.AZURE_OPENAI_API_VERSION ??
  '2024-12-01-preview';

const openai = new AzureOpenAI({
  endpoint: ttsEndpoint,
  apiKey: ttsApiKey,
  apiVersion: ttsApiVersion,
});

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: process.env.AZURE_OPENAI_TTS_DEPLOYMENT ?? 'tts',
    voice: 'alloy',
    input: text,
    response_format: 'opus',
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
