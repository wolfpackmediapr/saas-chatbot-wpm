import React from 'react';
import { Search, MessageCircle, Mail, Ticket, ThumbsUp, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import HelpSection from '../components/help/HelpSection';
import SearchBar from '../components/help/SearchBar';
import ContactSupport from '../components/help/ContactSupport';
import FeedbackSection from '../components/help/FeedbackSection';

export default function Help() {
  const sections = [
    {
      title: 'Getting Started',
      description: 'Set up your account and launch your first WolfPack Media AI chatbot test with ease.',
      links: [
        { text: 'Get Started Now', href: '#' },
        { text: 'Quick Start Guide', href: '#' }
      ]
    },
    {
      title: 'Platform Features',
      description: "Discover WolfPack Media AI's powerful tools, including chatbot training, seamless integrations, and detailed performance analytics.",
      links: [
        { text: 'Learn How', href: '#' },
        { text: 'View Integration Guides', href: '#' },
        { text: 'Explore Features', href: '#' }
      ]
    },
    {
      title: 'User Management',
      description: 'Streamline collaboration with your team using role management and shared workflows.',
      links: [
        { text: 'Learn More', href: '#' },
        { text: 'Explore Options', href: '#' }
      ]
    },
    {
      title: 'Performance Monitoring',
      description: "Track and optimize your chatbot's performance with real-time analytics, engagement metrics, and actionable insights.",
      links: [
        { text: 'Dashboard Overview', href: '#' },
        { text: 'Feedback Tools', href: '#' }
      ]
    },
    {
      title: 'Technical Support',
      description: 'Resolve issues quickly with our comprehensive FAQs and step-by-step troubleshooting guides.',
      links: [
        { text: 'Browse FAQs', href: '#' },
        { text: 'Troubleshoot Now', href: '#' }
      ]
    }
  ];

  const additionalResources = [
    {
      title: 'Best Practices',
      description: "Optimize your chatbot strategies with WolfPack Media AI's best practices and compliance guidelines.",
      links: [
        { text: 'Best Practices Guide', href: '#' },
        { text: 'Read Policy', href: '#' }
      ]
    },
    {
      title: 'Tutorials and Documentation',
      description: 'Learn with video tutorials, in-depth guides, and API references tailored for WolfPack Media AI users.',
      links: [
        { text: 'View Tutorials', href: '#' },
        { text: 'Open Docs', href: '#' },
        { text: 'API Docs', href: '#' }
      ]
    },
    {
      title: 'Community and Feedback',
      description: 'Join the WolfPack Media AI community forum, connect with other users, and share your insights.',
      links: [
        { text: 'Visit Forum', href: '#' },
        { text: 'Request Features', href: '#' }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 md:mb-12"
        >
          <h1 className="text-2xl md:text-4xl font-bold mb-3 md:mb-4">WolfPack Media AI Help Center</h1>
          <p className="text-sm md:text-xl text-secondary-foreground px-2">
            Your go-to resource for mastering WolfPack Media AI—empowering you to test, refine, and deploy AI Chatbots seamlessly on Facebook and Instagram.
          </p>
        </motion.div>

        <SearchBar />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-12">
          {sections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <HelpSection {...section} />
            </motion.div>
          ))}
        </div>

        <div className="mb-8 md:mb-12">
          <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Additional Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {additionalResources.map((resource, index) => (
              <motion.div
                key={resource.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <HelpSection {...resource} />
              </motion.div>
            ))}
          </div>
        </div>

        <ContactSupport />
        <FeedbackSection />
      </div>
    </div>
  );
}