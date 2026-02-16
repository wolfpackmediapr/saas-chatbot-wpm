import React from 'react';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SearchBar() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-12"
    >
      <div className="relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-secondary-foreground w-5 h-5" />
        <input
          type="text"
          placeholder="How can WolfPack Media AI help you today?"
          className="w-full pl-12 pr-4 py-3 bg-secondary/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder-secondary-foreground"
        />
      </div>
    </motion.div>
  );
}