import React, { useState, useRef } from 'react';
import { Send, Mic, FileText, Loader2, X, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  accessToken?: string | null;
  botId?: string;
}

export default function ChatInput({ onSend, isLoading, accessToken, botId }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { isRecording, startRecording, stopRecording } = useVoiceInput(accessToken, botId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if ((message.trim() || files.length > 0) && !isLoading) {
      const messageToSend = message;
      const filesToSend = files;

      setMessage('');
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      try {
        await onSend(messageToSend, filesToSend);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    }
  };

  const handleVoiceInput = async () => {
    try {
      setError(null);
      if (isRecording) {
        const text = await stopRecording();
        if (text) {
          setMessage(text);
        }
      } else {
        await startRecording();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process voice input');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    // Validate file types and sizes
    const validFiles = selectedFiles.filter(file => {
      const isValidType = file.type.includes('pdf') || file.type.includes('image');
      const isValidSize = file.size <= 20 * 1024 * 1024; // 20MB limit
      
      if (!isValidType) {
        setError('Only PDF and image files are supported');
        return false;
      }
      if (!isValidSize) {
        setError('Files must be under 20MB');
        return false;
      }
      return true;
    });

    setFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset file input
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200); // Max height of 200px
      textareaRef.current.style.height = `${newHeight}px`;
    }
  };

  return (
    <div className="p-3 md:p-4 space-y-2 border-t border-secondary">
      {error && (
        <div className="flex items-center gap-2 text-red-500 bg-red-500/10 p-2 rounded-lg text-xs md:text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {files.map((file, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative group flex-shrink-0"
            >
              <div className="h-16 w-16 md:h-20 md:w-20 flex items-center justify-center bg-secondary rounded-lg">
                {file.type.includes('pdf') ? (
                  <FileText className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                ) : (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Upload ${index + 1}`}
                    className="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg"
                  />
                )}
              </div>
              <button
                onClick={() => removeFile(index)}
                className="absolute -top-1 -right-1 md:-top-2 md:-right-2 bg-red-500 text-white rounded-full p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity touch-manipulation"
                aria-label="Remove file"
              >
                <X className="h-3 w-3 md:h-4 md:w-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 md:gap-2">
        <motion.button
          type="button"
          onClick={handleVoiceInput}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "rounded-full p-2 md:p-2.5 transition-colors flex-shrink-0 touch-manipulation min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0",
            isRecording
              ? "bg-red-500 text-white"
              : "hover:bg-secondary text-secondary-foreground"
          )}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          <Mic className="h-5 w-5" />
        </motion.button>

        <motion.button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          whileTap={{ scale: 0.95 }}
          className="rounded-full p-2 md:p-2.5 hover:bg-secondary text-secondary-foreground transition-colors flex-shrink-0 touch-manipulation min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
          aria-label="Upload file"
        >
          <FileText className="h-5 w-5" />
        </motion.button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />

        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask something with AI..."
          rows={1}
          className="flex-1 bg-secondary/50 rounded-lg px-3 md:px-4 py-2.5 md:py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-0 min-h-[44px] md:min-h-0 resize-none overflow-hidden"
        />

        <motion.button
          type="submit"
          disabled={(!message.trim() && files.length === 0) || isLoading}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "rounded-full p-2 md:p-2.5 transition-colors flex-shrink-0 touch-manipulation min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0",
            (message.trim() || files.length > 0) && !isLoading
              ? "bg-primary hover:bg-primary-hover text-white"
              : "bg-secondary text-secondary-foreground"
          )}
          aria-label="Send message"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </motion.button>
      </form>
    </div>
  );
}