import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, X, Check, Loader2,
  RefreshCw, Image, Send,
  CheckCircle2, Trash2, Bot, User as UserIcon
} from 'lucide-react';
import { PageBlock, getBlockTypeInfo, BlockType, createBlock } from './types';
import {
  useBusinessProfile,
  useGenerateImage,
  BusinessProfile,
} from '../../lib/hooks/useAI';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';

interface AgenticPageBuilderProps {
  onGenerate: (blocks: PageBlock[]) => void;
  onClose: () => void;
  pageId?: string;
}

// Chat message types
interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  options?: ChatOption[];
  selectedOption?: string;
  timestamp: Date;
}

interface ChatOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

interface PageConfig {
  purpose: string;
  audience: string;
  style: 'professional' | 'bold' | 'minimal' | 'playful';
  includeForm: boolean;
  includeChat: boolean;
  additionalInfo: string;
}

interface GeneratedBlock extends PageBlock {
  status: 'pending' | 'generating' | 'done' | 'error';
  imageStatus?: 'pending' | 'generating' | 'done' | 'error';
}

type ConversationPhase = 'greeting' | 'purpose' | 'audience' | 'style' | 'extras' | 'confirm' | 'building' | 'review';

const PURPOSE_OPTIONS: ChatOption[] = [
  { value: 'lead-capture', label: '📥 Capture Leads', description: 'Get visitors to fill out a form' },
  { value: 'portfolio', label: '💼 Showcase Work', description: 'Display projects and experience' },
  { value: 'product', label: '🛒 Sell Product/Service', description: 'Convert visitors to customers' },
  { value: 'coming-soon', label: '🚀 Coming Soon', description: 'Build anticipation for a launch' },
  { value: 'about', label: '👋 About/Bio', description: 'Tell your story' },
];

const AUDIENCE_OPTIONS: ChatOption[] = [
  { value: 'businesses', label: '🏢 Businesses (B2B)', description: 'Companies and decision makers' },
  { value: 'consumers', label: '🛍️ Consumers (B2C)', description: 'Individual customers' },
  { value: 'recruiters', label: '👔 Recruiters', description: 'People looking to hire' },
  { value: 'investors', label: '💰 Investors', description: 'People looking to fund' },
  { value: 'general', label: '🌍 General Public', description: 'Anyone and everyone' },
];

const STYLE_OPTIONS: ChatOption[] = [
  { value: 'professional', label: '💼 Professional', description: 'Clean and corporate' },
  { value: 'bold', label: '🔥 Bold', description: 'Vibrant and eye-catching' },
  { value: 'minimal', label: '✨ Minimal', description: 'Simple and elegant' },
  { value: 'playful', label: '🎨 Playful', description: 'Fun and creative' },
];

export default function AgenticPageBuilder({
  onGenerate,
  onClose,
  pageId,
}: AgenticPageBuilderProps) {
  const { workspaceId } = useCurrentWorkspace();
  const { data: profile, isLoading: profileLoading } = useBusinessProfile(workspaceId, pageId);
  const generateImage = useGenerateImage(workspaceId || '');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [phase, setPhase] = useState<ConversationPhase>('greeting');
  const [isTyping, setIsTyping] = useState(false);
  const [config, setConfig] = useState<PageConfig>({
    purpose: '',
    audience: '',
    style: 'professional',
    includeForm: true,
    includeChat: true,
    additionalInfo: '',
  });

  // Building state
  const [generatedBlocks, setGeneratedBlocks] = useState<GeneratedBlock[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Generate unique ID
  const genId = () => Math.random().toString(36).substring(2, 10);

  // Add assistant message with typing effect
  const addAssistantMessage = useCallback(async (content: string, options?: ChatOption[], delay = 500) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, delay));
    setIsTyping(false);

    const msg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      content,
      options,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
    return msg.id;
  }, []);

  // Add user message
  const addUserMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  // Add system message (for build progress)
  const addSystemMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: genId(),
      role: 'system',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  // Start the conversation
  useEffect(() => {
    if (profileLoading) return;
    if (messages.length > 0) return; // Already started

    const startConversation = async () => {
      const hasProfile = !!profile?.business_name;

      if (hasProfile) {
        await addAssistantMessage(
          `Hey! I see you're building a page for **${profile.business_name}**${profile.tagline ? ` - "${profile.tagline}"` : ''}. I'll use your AI profile to personalize everything. Let's make this page amazing! 🚀`,
          undefined,
          300
        );
      } else {
        await addAssistantMessage(
          `Hey there! 👋 I'm your AI page builder. I'll walk you through creating a beautiful landing page step by step. Let's do this!`,
          undefined,
          300
        );
      }

      await addAssistantMessage(
        `What's the main goal for this page?`,
        PURPOSE_OPTIONS,
        800
      );
      setPhase('purpose');
    };

    startConversation();
  }, [profileLoading, profile, messages.length, addAssistantMessage]);

  // Handle option selection
  const handleOptionSelect = async (option: ChatOption) => {
    addUserMessage(option.label);

    switch (phase) {
      case 'purpose':
        setConfig(prev => ({ ...prev, purpose: option.value }));
        await addAssistantMessage(
          `${option.label.split(' ')[0]} Got it! Who's the target audience?`,
          AUDIENCE_OPTIONS,
          600
        );
        setPhase('audience');
        break;

      case 'audience':
        setConfig(prev => ({ ...prev, audience: option.value }));
        await addAssistantMessage(
          `Perfect! What visual style fits best?`,
          STYLE_OPTIONS,
          600
        );
        setPhase('style');
        break;

      case 'style':
        setConfig(prev => ({ ...prev, style: option.value as PageConfig['style'] }));
        await addAssistantMessage(
          `Love it! A few quick options:`,
          [
            { value: 'both', label: '✅ Form + Chat', description: 'Contact form and AI chat widget' },
            { value: 'form-only', label: '📝 Form only', description: 'Just a contact form' },
            { value: 'chat-only', label: '💬 Chat only', description: 'Just AI chat widget' },
            { value: 'neither', label: '⏭️ Skip both', description: 'No form or chat' },
          ],
          600
        );
        setPhase('extras');
        break;

      case 'extras':
        const includeForm = option.value === 'both' || option.value === 'form-only';
        const includeChat = option.value === 'both' || option.value === 'chat-only';
        setConfig(prev => ({ ...prev, includeForm, includeChat }));

        // Show summary and ask for confirmation
        const purposeLabel = PURPOSE_OPTIONS.find(p => p.value === config.purpose)?.label || config.purpose;
        const audienceLabel = AUDIENCE_OPTIONS.find(a => a.value === config.audience)?.label || config.audience;
        const styleLabel = STYLE_OPTIONS.find(s => s.value === config.style)?.label || config.style;

        await addAssistantMessage(
          `Here's what I'll build:\n\n` +
          `📌 **Goal:** ${purposeLabel}\n` +
          `👥 **Audience:** ${audienceLabel}\n` +
          `🎨 **Style:** ${styleLabel}\n` +
          `${includeForm ? '📝 Contact form\n' : ''}` +
          `${includeChat ? '💬 AI chat widget\n' : ''}\n` +
          `I'll also generate a custom hero image. Anything else you want to add? (or just say "let's go!")`,
          undefined,
          800
        );
        setPhase('confirm');
        break;

      case 'confirm':
        if (option.value === 'go') {
          startBuilding();
        }
        break;

      default:
        break;
    }
  };

  // Handle text input
  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text) return;

    setInputValue('');
    addUserMessage(text);

    if (phase === 'confirm') {
      const lowerText = text.toLowerCase();
      if (lowerText.includes('go') || lowerText.includes('yes') || lowerText.includes('build') || lowerText.includes('start') || lowerText.includes('let\'s')) {
        startBuilding();
      } else {
        // Save additional info and ask if ready
        setConfig(prev => ({ ...prev, additionalInfo: text }));
        await addAssistantMessage(
          `Got it, I'll keep that in mind! Ready to build?`,
          [
            { value: 'go', label: '🚀 Let\'s build!', description: 'Start generating the page' },
            { value: 'more', label: '➕ Add more details', description: 'Tell me more' },
          ],
          600
        );
      }
    } else if (phase === 'review') {
      // Handle refinement requests in review phase
      await addAssistantMessage(
        `I'll refine that for you. Click on any block in the preview to regenerate it, or hit "Apply to Page" when you're happy!`,
        undefined,
        600
      );
    }
  };

  // Handle keyboard enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Start building the page
  const startBuilding = async () => {
    setPhase('building');
    setIsBuilding(true);

    await addAssistantMessage(`🚀 Starting to build your page...`, undefined, 300);

    // Determine which blocks to create based on config
    const blocksToCreate: BlockType[] = ['hero', 'features'];

    if (config.purpose === 'portfolio' || config.purpose === 'about') {
      blocksToCreate.push('stats');
    }
    if (config.purpose === 'product' || config.purpose === 'lead-capture') {
      blocksToCreate.push('testimonials');
    }
    if (config.purpose === 'product') {
      blocksToCreate.push('faq');
    }
    if (config.includeForm) {
      blocksToCreate.push('form');
    }
    if (config.includeChat) {
      blocksToCreate.push('chat');
    }
    blocksToCreate.push('cta');

    // Initialize blocks
    const initialBlocks: GeneratedBlock[] = blocksToCreate.map((type, i) => ({
      id: genId(),
      type,
      order: i,
      width: 4,
      config: {},
      status: 'pending',
      imageStatus: type === 'hero' ? 'pending' : undefined,
    }));
    setGeneratedBlocks(initialBlocks);

    // Build each block with chat updates
    for (let i = 0; i < blocksToCreate.length; i++) {
      const type = blocksToCreate[i];
      const blockInfo = getBlockTypeInfo(type);

      // Update status
      setGeneratedBlocks(prev => prev.map((b, idx) =>
        idx === i ? { ...b, status: 'generating' } : b
      ));

      addSystemMessage(`📦 Building ${blockInfo?.label || type}...`);

      await new Promise(r => setTimeout(r, 400));

      // Generate block content
      const blockConfig = generateBlockContent(type, profile, config);

      // Update with config
      setGeneratedBlocks(prev => prev.map((b, idx) =>
        idx === i ? { ...b, config: blockConfig, status: 'done' } : b
      ));

      // Generate hero image
      if (type === 'hero') {
        addSystemMessage(`🎨 Generating hero image...`);

        setGeneratedBlocks(prev => prev.map((b, idx) =>
          idx === i ? { ...b, imageStatus: 'generating' } : b
        ));

        try {
          const imagePrompt = buildImagePrompt(profile, config);
          const imageResult = await generateImage.mutateAsync({
            prompt: imagePrompt,
            context: profile?.description || config.purpose,
            style: config.style,
          });

          if (imageResult?.url) {
            addSystemMessage(`✅ Hero image ready!`);
            setGeneratedBlocks(prev => prev.map((b, idx) =>
              idx === i ? {
                ...b,
                config: { ...b.config, backgroundImage: imageResult.url, backgroundType: 'image' },
                imageStatus: 'done'
              } : b
            ));
          }
        } catch (err) {
          console.error('Image generation failed:', err);
          addSystemMessage(`⚠️ Using gradient background instead`);
          setGeneratedBlocks(prev => prev.map((b, idx) =>
            idx === i ? { ...b, imageStatus: 'error' } : b
          ));
        }
      }

      await new Promise(r => setTimeout(r, 200));
    }

    setIsBuilding(false);
    setPhase('review');

    await addAssistantMessage(
      `🎉 Done! I've built ${blocksToCreate.length} sections for your page. Check out the preview on the right!\n\n` +
      `You can **regenerate** any block or **remove** ones you don't want. When you're happy, hit **Apply to Page**!`,
      undefined,
      600
    );
  };

  // Generate block content based on type and config
  const generateBlockContent = (
    type: BlockType,
    profile: BusinessProfile | undefined,
    config: PageConfig
  ): Record<string, unknown> => {
    const name = profile?.business_name || 'Your Business';
    const tagline = profile?.tagline || '';
    const description = profile?.description || '';

    const styleColors: Record<string, { primary: string; gradient: [string, string] }> = {
      professional: { primary: '#4f46e5', gradient: ['#1e1b4b', '#312e81'] },
      bold: { primary: '#dc2626', gradient: ['#0f0f0f', '#1f1f1f'] },
      minimal: { primary: '#171717', gradient: ['#fafafa', '#f5f5f5'] },
      playful: { primary: '#ec4899', gradient: ['#831843', '#701a75'] },
    };
    const colors = styleColors[config.style] || styleColors.professional;

    switch (type) {
      case 'hero':
        return {
          headline: tagline || `Welcome to ${name}`,
          subheadline: description?.substring(0, 150) || 'We help you achieve your goals.',
          buttonText: config.purpose === 'lead-capture' ? 'Get Started' :
                      config.purpose === 'portfolio' ? 'View Work' :
                      config.purpose === 'product' ? 'Learn More' : 'Get in Touch',
          buttonLink: '#contact',
          backgroundType: 'gradient',
          gradientFrom: colors.gradient[0],
          gradientTo: colors.gradient[1],
          textAlign: 'center',
          showButton: true,
        };

      case 'features':
        const features = profile?.key_benefits?.slice(0, 3).map((benefit, i) => ({
          icon: ['zap', 'shield', 'star', 'heart', 'target', 'rocket'][i % 6],
          title: benefit.split(':')[0] || benefit.substring(0, 30),
          description: benefit,
        })) || [
          { icon: 'zap', title: 'Fast & Efficient', description: 'Get results quickly without compromising quality.' },
          { icon: 'shield', title: 'Reliable', description: 'Dependable solutions you can count on.' },
          { icon: 'star', title: 'Expert Quality', description: 'Professional results every time.' },
        ];
        return {
          title: config.purpose === 'portfolio' ? 'What I Do' : 'Why Choose Us',
          subtitle: profile?.unique_value_proposition || 'Here\'s what sets us apart',
          columns: Math.min(features.length, 3) as 2 | 3 | 4,
          items: features,
        };

      case 'stats':
        const stats = [
          { value: '100%', label: 'Satisfaction' },
          { value: '24/7', label: 'Support' },
          { value: '5+', label: 'Years Experience' },
          { value: '50+', label: 'Projects' },
        ];
        return { title: '', items: stats.slice(0, 4) };

      case 'testimonials':
        const testimonials = profile?.testimonials?.slice(0, 2).map(t => ({
          quote: t.quote,
          author: t.author_name,
          company: t.company || '',
          avatar: t.image_url || '',
        })) || [
          { quote: `Working with ${name} exceeded all expectations. Highly recommended!`, author: 'Happy Customer', company: '', avatar: '' },
        ];
        return { title: 'What People Say', items: testimonials };

      case 'faq':
        const faqs = profile?.faqs?.slice(0, 4) || [
          { question: 'How do I get started?', answer: 'Simply reach out through our contact form and we\'ll guide you through the process.' },
          { question: 'What makes you different?', answer: profile?.unique_value_proposition || 'We focus on delivering exceptional results tailored to your needs.' },
        ];
        return { title: 'Frequently Asked Questions', items: faqs };

      case 'form':
        return {
          formId: '',
          title: config.purpose === 'lead-capture' ? 'Get Started Today' : 'Get in Touch',
          description: config.purpose === 'lead-capture'
            ? 'Fill out the form and we\'ll be in touch shortly.'
            : 'Have questions? We\'d love to hear from you.',
        };

      case 'chat':
        return {
          title: 'Questions?',
          subtitle: 'Chat with us for instant answers',
          placeholder: 'Type your question...',
          position: 'inline',
          primaryColor: colors.primary,
        };

      case 'cta':
        return {
          headline: config.purpose === 'lead-capture' ? 'Ready to Get Started?' :
                    config.purpose === 'portfolio' ? 'Let\'s Work Together' : 'Start Your Journey Today',
          description: `Take the next step with ${name}.`,
          buttonText: config.purpose === 'portfolio' ? 'Hire Me' : 'Get Started',
          buttonLink: '#contact',
          backgroundColor: colors.primary,
          textColor: config.style === 'minimal' ? 'dark' : 'light',
        };

      default:
        return createBlock(type).config;
    }
  };

  // Build image prompt
  const buildImagePrompt = (profile: BusinessProfile | undefined, config: PageConfig): string => {
    const industry = profile?.industry || 'technology';
    let prompt = `Professional ${config.style} hero image for a ${industry} `;

    if (config.purpose === 'portfolio') {
      prompt += 'portfolio website, creative workspace, modern design';
    } else if (config.purpose === 'product') {
      prompt += 'product landing page, sleek and modern';
    } else {
      prompt += 'business website, professional and trustworthy';
    }

    prompt += `. Style: ${config.style}, high quality, no text.`;
    return prompt.substring(0, 500);
  };

  // Regenerate a block
  const regenerateBlock = async (index: number) => {
    const block = generatedBlocks[index];
    if (!block) return;

    setGeneratedBlocks(prev => prev.map((b, i) =>
      i === index ? { ...b, status: 'generating' } : b
    ));

    addSystemMessage(`🔄 Regenerating ${getBlockTypeInfo(block.type)?.label}...`);

    await new Promise(r => setTimeout(r, 500));

    const newConfig = generateBlockContent(block.type, profile, config);
    setGeneratedBlocks(prev => prev.map((b, i) =>
      i === index ? { ...b, config: newConfig, status: 'done' } : b
    ));

    addSystemMessage(`✅ Done!`);
  };

  // Remove a block
  const removeBlock = (index: number) => {
    const block = generatedBlocks[index];
    addSystemMessage(`🗑️ Removed ${getBlockTypeInfo(block.type)?.label}`);
    setGeneratedBlocks(prev => prev.filter((_, i) => i !== index));
  };

  // Apply blocks to page
  const applyBlocks = () => {
    const cleanBlocks: PageBlock[] = generatedBlocks.map((b, i) => ({
      id: b.id,
      type: b.type,
      order: i,
      width: b.width || 4,
      config: b.config,
    }));
    onGenerate(cleanBlocks);
  };

  // Render the component
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] overflow-hidden flex">
        {/* Left side - Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">AI Page Builder</h2>
                  <p className="text-white/80 text-xs">
                    {phase === 'building' ? 'Building your page...' :
                     phase === 'review' ? 'Review and refine' :
                     'Let\'s build something amazing'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Chat messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50"
          >
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                onOptionSelect={handleOptionSelect}
              />
            ))}

            {isTyping && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-purple-600" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  phase === 'confirm' ? 'Add more details or say "let\'s go"...' :
                  phase === 'review' ? 'Ask me to refine something...' :
                  'Type a message...'
                }
                disabled={isBuilding || (phase !== 'confirm' && phase !== 'review')}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isBuilding}
                className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>

            {/* Apply button in review phase */}
            {phase === 'review' && generatedBlocks.length > 0 && (
              <button
                onClick={applyBlocks}
                className="w-full mt-3 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all"
              >
                <CheckCircle2 className="w-5 h-5" />
                Apply {generatedBlocks.length} Blocks to Page
              </button>
            )}
          </div>
        </div>

        {/* Right side - Preview (only shows during/after building) */}
        {(phase === 'building' || phase === 'review') && (
          <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Page Preview</h3>
                <span className="text-xs text-gray-500">{generatedBlocks.length} blocks</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {generatedBlocks.map((block, i) => {
                const blockInfo = getBlockTypeInfo(block.type);
                return (
                  <div
                    key={block.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      block.status === 'generating'
                        ? 'border-purple-300 bg-purple-50'
                        : block.status === 'done'
                        ? 'border-gray-200 bg-white hover:border-gray-300'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      block.status === 'generating' ? 'bg-purple-100' :
                      block.status === 'done' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {block.status === 'generating' ? (
                        <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                      ) : block.status === 'done' ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <span className="text-xs text-gray-400">{i + 1}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {blockInfo?.label || block.type}
                      </p>
                      {block.imageStatus === 'generating' && (
                        <p className="text-xs text-purple-600">Generating image...</p>
                      )}
                      {block.imageStatus === 'done' && (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <Image className="w-3 h-3" /> Image ready
                        </p>
                      )}
                    </div>

                    {phase === 'review' && block.status === 'done' && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => regenerateBlock(i)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Regenerate"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeBlock(i)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {generatedBlocks.length === 0 && phase === 'building' && (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Preparing blocks...</p>
                </div>
              )}
            </div>

            {/* Hero image preview */}
            {typeof generatedBlocks[0]?.config?.backgroundImage === 'string' && (
              <div className="p-4 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-2">Hero Image</p>
                <img
                  src={generatedBlocks[0].config.backgroundImage}
                  alt="Hero"
                  className="w-full h-24 object-cover rounded-lg"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Chat message bubble component
function ChatMessageBubble({
  message,
  onOptionSelect,
}: {
  message: ChatMessage;
  onOptionSelect: (option: ChatOption) => void;
}) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="px-3 py-1 bg-gray-200 rounded-full text-xs text-gray-600">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="bg-purple-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-[80%]">
          <p className="text-sm">{message.content}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
          <UserIcon className="w-4 h-4 text-gray-600" />
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-purple-600" />
      </div>
      <div className="space-y-3 max-w-[85%]">
        <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {message.content.split('**').map((part, i) =>
              i % 2 === 1 ? <strong key={i}>{part}</strong> : part
            )}
          </p>
        </div>

        {/* Options */}
        {message.options && message.options.length > 0 && !message.selectedOption && (
          <div className="flex flex-wrap gap-2">
            {message.options.map((option) => (
              <button
                key={option.value}
                onClick={() => onOptionSelect(option)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-purple-300 hover:bg-purple-50 transition-all text-left"
              >
                <span className="block">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-gray-400 mt-0.5">{option.description}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

