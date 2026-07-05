import { useState, useCallback, useRef } from 'react';
import { transcribeAudio } from '../lib/openai';

export function useVoiceInput(accessToken?: string | null, botId?: string) {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw new Error('Failed to start recording. Please check microphone permissions.');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorder || !isRecording) {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          if (!accessToken) {
            throw new Error('You must be signed in to use voice input');
          }
          const text = await transcribeAudio(audioBlob, accessToken, botId);
          resolve(text);
        } catch (error) {
          console.error('Transcription failed:', error);
          resolve(null);
        } finally {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          chunksRef.current = [];
        }
      };

      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    });
  }, [mediaRecorder, isRecording, accessToken, botId]);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}