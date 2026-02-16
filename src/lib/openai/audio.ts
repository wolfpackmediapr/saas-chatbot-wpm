import { openai } from './client';

export async function transcribeAudio(audioBlob: Blob) {
  try {
    const response = await openai.audio.transcriptions.create({
      file: audioBlob,
      model: 'whisper-1',
    });
    return response.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new Error('Failed to transcribe audio. Please check your API configuration.');
  }
}