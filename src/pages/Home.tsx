import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="relative h-32 w-32 rounded-full bg-primary/20 p-6">
          <Bot className="h-full w-full text-primary" />
          <div className="absolute -bottom-2 -right-2 rounded-full bg-primary p-2">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              👋
            </motion.div>
          </div>
        </div>
      </motion.div>

      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-4 text-4xl font-bold"
      >
        Empowering Your Productivity with AI
      </motion.h1>

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mb-8 max-w-md text-secondary-foreground"
      >
        Your personal AI assistant is ready to help you with writing, research, and more.
        Start a conversation and experience the future of productivity.
      </motion.p>

      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        onClick={() => navigate('/chat/new')}
        className="group relative inline-flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary to-accent px-8 py-3 font-medium text-white transition-all hover:scale-105"
      >
        <span className="relative">Start a New Conversation</span>
      </motion.button>
    </div>
  );
}