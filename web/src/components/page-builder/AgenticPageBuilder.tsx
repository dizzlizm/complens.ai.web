import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, X, Check, Loader2, RefreshCw, Send,
  CheckCircle2, Bot, User as UserIcon, Eye,
} from 'lucide-react';
import { PageBlock } from './types';
import {
  useBusinessProfile,
  useGenerateImage,
  useGeneratePageContent,
  useRefinePageContent,
  GeneratedPageContent,
  AutomationConfig,
} from '../../lib/hooks/useAI';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';

interface AgenticPageBuilderProps {
  onComplete: (result: {
    blocks: PageBlock[];
    content: GeneratedPageContent;
    style: WizardStyle;
    colors: ColorScheme;
    automation: AutomationConfig;
    includeForm: boolean;
    includeChat: boolean;
  }) => void;
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
  component?: React.ReactNode;
}

interface ChatOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

type WizardPhase = 'discovery' | 'content' | 'design' | 'automation' | 'building' | 'review';
type WizardStyle = 'professional' | 'bold' | 'minimal' | 'playful';

interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
}

// Phase configuration
const PHASE_INFO: Record<WizardPhase, { title: string; subtitle: string }> = {
  discovery: { title: 'Tell me about your business', subtitle: 'I\'ll create the perfect page for you' },
  content: { title: 'Review your content', subtitle: 'Refine headlines, features, and more' },
  design: { title: 'Choose your style', subtitle: 'Pick colors and visual design' },
  automation: { title: 'Set up automation', subtitle: 'What happens when someone fills out your form?' },
  building: { title: 'Building your page...', subtitle: 'Creating everything for you' },
  review: { title: 'Your page is ready!', subtitle: 'Review and publish' },
};

// Style options with visual preview
const STYLE_OPTIONS: Array<{ value: WizardStyle; label: string; description: string; colors: ColorScheme }> = [
  {
    value: 'professional',
    label: 'Professional',
    description: 'Clean and corporate',
    colors: { primary: '#4f46e5', secondary: '#818cf8', accent: '#c7d2fe' },
  },
  {
    value: 'bold',
    label: 'Bold',
    description: 'Vibrant and eye-catching',
    colors: { primary: '#dc2626', secondary: '#f87171', accent: '#fecaca' },
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Simple and elegant',
    colors: { primary: '#171717', secondary: '#525252', accent: '#d4d4d4' },
  },
  {
    value: 'playful',
    label: 'Playful',
    description: 'Fun and creative',
    colors: { primary: '#ec4899', secondary: '#f472b6', accent: '#fbcfe8' },
  },
];

export default function AgenticPageBuilder({
  onComplete,
  onClose,
  pageId,
}: AgenticPageBuilderProps) {
  const { workspaceId } = useCurrentWorkspace();
  const { data: profile, isLoading: profileLoading } = useBusinessProfile(workspaceId, pageId);
  const generateImage = useGenerateImage(workspaceId || '');
  const generatePageContent = useGeneratePageContent(workspaceId || '');
  const refinePageContent = useRefinePageContent(workspaceId || '');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [phase, setPhase] = useState<WizardPhase>('discovery');
  const [isTyping, setIsTyping] = useState(false);

  // Generated content state
  const [generatedContent, setGeneratedContent] = useState<GeneratedPageContent | null>(null);
  const [selectedHeadline, setSelectedHeadline] = useState(0);

  // Design state
  const [style, setStyle] = useState<WizardStyle>('professional');
  const [colors, setColors] = useState<ColorScheme>({
    primary: '#4f46e5',
    secondary: '#818cf8',
    accent: '#c7d2fe',
  });

  // Options state
  const [includeForm] = useState(true);
  const [includeChat] = useState(true);

  // Automation state
  const [automation, setAutomation] = useState<AutomationConfig>({
    send_welcome_email: true,
    notify_owner: true,
    owner_email: '',
    welcome_message: '',
    add_tags: ['lead', 'website'],
  });

  // Building state
  const [generatedBlocks, setGeneratedBlocks] = useState<PageBlock[]>([]);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState(0);

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
  const addAssistantMessage = useCallback(async (content: string, options?: ChatOption[], component?: React.ReactNode, delay = 500) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, delay));
    setIsTyping(false);

    const msg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      content,
      options,
      component,
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

  // Add system message (for progress)
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
    if (messages.length > 0) return;

    const startConversation = async () => {
      const hasProfile = !!profile?.business_name;

      if (hasProfile) {
        await addAssistantMessage(
          `Hey! I see you're building a page for **${profile.business_name}**. I'll use your AI profile to personalize everything. Tell me more about what this specific page should focus on, or just describe your business!`,
          undefined,
          undefined,
          300
        );
      } else {
        await addAssistantMessage(
          `Hey there! 👋 I'm your AI page builder. Tell me about your business in your own words - what you do, who you help, and what makes you special. I'll create a complete landing page with lead capture and automation!`,
          undefined,
          undefined,
          300
        );
      }

      // Add quick options but allow free text
      await addAssistantMessage(
        `Or pick a quick start:`,
        [
          { value: 'freelancer', label: '👨‍💻 Freelancer/Consultant', description: 'I offer professional services' },
          { value: 'saas', label: '🚀 SaaS/Product', description: 'I sell software or a product' },
          { value: 'agency', label: '🏢 Agency/Company', description: 'We provide business services' },
          { value: 'creator', label: '🎨 Creator/Coach', description: 'I teach or create content' },
        ],
        undefined,
        600
      );
    };

    startConversation();
  }, [profileLoading, profile, messages.length, addAssistantMessage]);

  // Handle option selection
  const handleOptionSelect = async (option: ChatOption) => {
    addUserMessage(option.label);

    if (phase === 'discovery') {
      // Quick start - use predefined descriptions
      const descriptions: Record<string, string> = {
        freelancer: 'I\'m a freelance professional offering consulting and services to businesses.',
        saas: 'We build software products that help businesses work more efficiently.',
        agency: 'We\'re an agency providing professional services to help businesses grow.',
        creator: 'I\'m a creator/coach helping people achieve their goals through courses and content.',
      };

      const desc = descriptions[option.value] || 'I run a business that helps people.';
      await generateContent(desc);
    }
  };

  // Handle text input submission
  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text) return;

    setInputValue('');
    addUserMessage(text);

    if (phase === 'discovery') {
      await generateContent(text);
    } else if (phase === 'content') {
      // User is providing feedback on content
      await refineContent(text);
    } else if (phase === 'automation') {
      // Handle automation configuration from text
      if (text.toLowerCase().includes('@') || text.includes('email')) {
        // Extract email
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          setAutomation(prev => ({ ...prev, owner_email: emailMatch[0] }));
          await addAssistantMessage(
            `Got it! I'll send notifications to **${emailMatch[0]}**. Ready to build?`,
            [
              { value: 'build', label: '🚀 Build my page!', description: 'Create everything now' },
              { value: 'customize', label: '⚙️ Customize more', description: 'Change automation settings' },
            ],
            undefined,
            600
          );
        }
      }
    }
  };

  // Generate content from description
  const generateContent = async (description: string) => {
    await addAssistantMessage('✨ Analyzing your business and generating content...', undefined, undefined, 300);

    try {
      const result = await generatePageContent.mutateAsync({
        business_description: description,
        page_id: pageId,
      });

      setGeneratedContent(result);

      // Apply suggested colors
      if (result.suggested_colors) {
        setColors(result.suggested_colors);
      }

      setPhase('content');

      await addAssistantMessage(
        `I've generated your content! Here's what I came up with for **${result.business_info?.business_name || 'your business'}**:`,
        undefined,
        undefined,
        600
      );

      // Show content review cards
      await addAssistantMessage(
        'Review the headlines and content below. Click to edit, or tell me what to change:',
        undefined,
        <ContentReviewCards
          content={result}
          selectedHeadline={selectedHeadline}
          onSelectHeadline={setSelectedHeadline}
          onRefine={(section, feedback) => refineContent(feedback, section)}
        />,
        800
      );

      await addAssistantMessage(
        'Happy with the content? Let\'s pick a style!',
        [
          { value: 'next', label: '✅ Looks great!', description: 'Move to design' },
          { value: 'refine', label: '✏️ Make changes', description: 'Tell me what to adjust' },
        ],
        undefined,
        600
      );

    } catch (err) {
      console.error('Content generation failed:', err);
      await addAssistantMessage(
        '⚠️ Something went wrong generating your content. Let me try again - can you describe your business in a bit more detail?',
        undefined,
        undefined,
        600
      );
    }
  };

  // Refine content based on feedback
  const refineContent = async (feedback: string, section?: string) => {
    if (!generatedContent) return;

    await addAssistantMessage('🔄 Updating content based on your feedback...', undefined, undefined, 300);

    try {
      const result = await refinePageContent.mutateAsync({
        current_content: generatedContent,
        feedback,
        section,
        page_id: pageId,
      });

      setGeneratedContent(result);

      await addAssistantMessage(
        'Content updated! How does it look now?',
        undefined,
        <ContentReviewCards
          content={result}
          selectedHeadline={selectedHeadline}
          onSelectHeadline={setSelectedHeadline}
          onRefine={(section, feedback) => refineContent(feedback, section)}
        />,
        600
      );

      await addAssistantMessage(
        'Ready to move on?',
        [
          { value: 'next', label: '✅ Looks great!', description: 'Move to design' },
          { value: 'refine', label: '✏️ More changes', description: 'Keep refining' },
        ],
        undefined,
        400
      );

    } catch (err) {
      console.error('Content refinement failed:', err);
      await addAssistantMessage(
        '⚠️ Failed to update content. Let me try that again - what would you like to change?',
        undefined,
        undefined,
        600
      );
    }
  };

  // Move to design phase
  const moveToDesign = async () => {
    setPhase('design');

    await addAssistantMessage(
      '🎨 Let\'s pick your visual style! Choose one that matches your brand:',
      undefined,
      <StyleSelector
        currentStyle={style}
        onSelect={(s) => {
          setStyle(s);
          const styleOption = STYLE_OPTIONS.find(o => o.value === s);
          if (styleOption) {
            setColors(styleOption.colors);
          }
        }}
      />,
      600
    );

    await addAssistantMessage(
      'Selected style looks good? You can also customize colors below, or move on:',
      undefined,
      <ColorPicker colors={colors} onChange={setColors} />,
      800
    );

    await addAssistantMessage(
      'Ready to set up automation?',
      [
        { value: 'automation', label: '➡️ Next: Automation', description: 'Configure what happens when someone fills out your form' },
        { value: 'skip', label: '⏭️ Skip to build', description: 'Use default settings' },
      ],
      undefined,
      400
    );
  };

  // Move to automation phase
  const moveToAutomation = async () => {
    setPhase('automation');

    await addAssistantMessage(
      '⚡ Let\'s set up your automation! When someone fills out your form, I can:',
      undefined,
      <AutomationSetup
        config={automation}
        onChange={setAutomation}
        businessName={generatedContent?.business_info?.business_name || 'your business'}
      />,
      600
    );

    await addAssistantMessage(
      'Configure the options above, or type your notification email. Ready to build?',
      [
        { value: 'build', label: '🚀 Build my page!', description: 'Create page, form, and workflow' },
      ],
      undefined,
      400
    );
  };

  // Start building the page
  const startBuilding = async () => {
    if (!generatedContent) return;

    setPhase('building');
    setBuildProgress(0);

    await addAssistantMessage('🚀 Building your complete marketing package...', undefined, undefined, 300);

    // Build blocks from content
    const blocks = buildBlocksFromContent(generatedContent, style, colors, includeForm, includeChat);

    // Generate hero image
    addSystemMessage('🎨 Generating hero image...');
    setBuildProgress(20);

    try {
      const imagePrompt = buildImagePrompt(generatedContent, style);
      const imageResult = await generateImage.mutateAsync({
        prompt: imagePrompt,
        context: generatedContent.business_info?.business_name || 'business',
        style,
      });

      if (imageResult?.url) {
        setHeroImageUrl(imageResult.url);
        // Update hero block with image
        blocks[0].config = {
          ...blocks[0].config,
          backgroundImage: imageResult.url,
          backgroundType: 'image',
        };
        addSystemMessage('✅ Hero image ready!');
      }
    } catch (err) {
      console.error('Image generation failed:', err);
      addSystemMessage('⚠️ Using gradient background');
    }

    setBuildProgress(60);
    setGeneratedBlocks(blocks);

    // Simulate build progress
    addSystemMessage('📄 Creating page structure...');
    await new Promise(r => setTimeout(r, 500));
    setBuildProgress(80);

    addSystemMessage('📝 Setting up lead capture form...');
    await new Promise(r => setTimeout(r, 500));
    setBuildProgress(90);

    addSystemMessage('⚡ Configuring automation workflow...');
    await new Promise(r => setTimeout(r, 500));
    setBuildProgress(100);

    setPhase('review');

    await addAssistantMessage(
      `🎉 Done! I've created:\n\n` +
      `• **Landing page** with ${blocks.length} sections\n` +
      `${includeForm ? '• **Lead capture form** (email, name, phone, message)\n' : ''}` +
      `${automation.send_welcome_email || automation.notify_owner ? '• **Automation workflow** to handle new leads\n' : ''}` +
      `${includeChat ? '• **AI chat widget** for visitor questions\n' : ''}\n` +
      `Review the preview, then hit "Apply to Page" to publish!`,
      [
        { value: 'apply', label: '✅ Apply to Page', description: 'Save and continue editing' },
      ],
      undefined,
      800
    );
  };

  // Apply and close
  const handleApply = () => {
    if (!generatedContent) return;

    onComplete({
      blocks: generatedBlocks,
      content: generatedContent,
      style,
      colors,
      automation,
      includeForm,
      includeChat,
    });
  };

  // Handle keyboard enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle option clicks from latest message
  const handleLatestOptionClick = async (value: string) => {
    if (value === 'next') {
      await moveToDesign();
    } else if (value === 'automation') {
      await moveToAutomation();
    } else if (value === 'skip' || value === 'build') {
      await startBuilding();
    } else if (value === 'apply') {
      handleApply();
    }
  };

  // Get placeholder text based on phase
  const getPlaceholder = () => {
    switch (phase) {
      case 'discovery':
        return 'Describe your business in your own words...';
      case 'content':
        return 'Tell me what to change (e.g., "make the headline more punchy")...';
      case 'design':
        return 'Describe your brand colors or pick from above...';
      case 'automation':
        return 'Enter your email for notifications...';
      default:
        return 'Type a message...';
    }
  };

  // Render the component
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex">
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
                  <h2 className="text-lg font-bold">{PHASE_INFO[phase].title}</h2>
                  <p className="text-white/80 text-xs">{PHASE_INFO[phase].subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Phase indicators */}
                <div className="flex gap-1">
                  {(['discovery', 'content', 'design', 'automation', 'review'] as WizardPhase[]).map((p, i) => (
                    <div
                      key={p}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        phase === p ? 'bg-white' :
                        ['discovery', 'content', 'design', 'automation', 'review'].indexOf(phase) > i
                          ? 'bg-white/60' : 'bg-white/20'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                onOptionSelect={(opt) => {
                  handleOptionSelect(opt);
                  handleLatestOptionClick(opt.value);
                }}
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

            {/* Build progress */}
            {phase === 'building' && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  <span className="font-medium text-gray-900">Building your page...</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${buildProgress}%` }}
                  />
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
                placeholder={getPlaceholder()}
                disabled={phase === 'building' || phase === 'review'}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || phase === 'building' || phase === 'review'}
                className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right side - Preview (shows during content/design/review phases) */}
        {(phase === 'content' || phase === 'design' || phase === 'building' || phase === 'review') && generatedContent && (
          <div className="w-96 border-l border-gray-200 bg-white flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </h3>
                <span className="text-xs text-gray-500">{style}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <PagePreview
                content={generatedContent}
                selectedHeadline={selectedHeadline}
                style={style}
                colors={colors}
                heroImageUrl={heroImageUrl}
                includeForm={includeForm}
                includeChat={includeChat}
              />
            </div>

            {/* Apply button in review phase */}
            {phase === 'review' && (
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={handleApply}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Apply to Page
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Content Review Cards Component
function ContentReviewCards({
  content,
  selectedHeadline,
  onSelectHeadline,
  onRefine,
}: {
  content: GeneratedPageContent;
  selectedHeadline: number;
  onSelectHeadline: (index: number) => void;
  onRefine: (section: string, feedback: string) => void;
}) {
  return (
    <div className="space-y-3 mt-2">
      {/* Headlines */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase">Headlines</span>
          <button
            onClick={() => onRefine('headlines', 'make the headlines more punchy and compelling')}
            className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        </div>
        <div className="space-y-2">
          {content.content.headlines?.map((headline, i) => (
            <button
              key={i}
              onClick={() => onSelectHeadline(i)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                selectedHeadline === i
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-medium text-gray-900">{headline}</p>
              {selectedHeadline === i && (
                <Check className="w-4 h-4 text-purple-600 inline ml-2" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase">Features</span>
          <button
            onClick={() => onRefine('features', 'make the features more benefit-focused')}
            className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        </div>
        <div className="space-y-2">
          {content.content.features?.slice(0, 3).map((feature, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-lg">{feature.icon}</span>
              <div>
                <p className="font-medium text-sm text-gray-900">{feature.title}</p>
                <p className="text-xs text-gray-500">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ preview */}
      {content.content.faq && content.content.faq.length > 0 && (
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase">FAQ ({content.content.faq.length})</span>
            <button
              onClick={() => onRefine('faq', 'make the FAQ answers more helpful')}
              className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {content.content.faq.map(f => f.q).join(' • ')}
          </p>
        </div>
      )}
    </div>
  );
}

// Style Selector Component
function StyleSelector({
  currentStyle,
  onSelect,
}: {
  currentStyle: WizardStyle;
  onSelect: (style: WizardStyle) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {STYLE_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={`p-3 rounded-xl border-2 transition-all text-left ${
            currentStyle === option.value
              ? 'border-purple-500 bg-purple-50'
              : 'border-gray-200 hover:border-gray-300 bg-white'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: option.colors.primary }}
            />
            <span className="font-medium text-sm text-gray-900">{option.label}</span>
          </div>
          <p className="text-xs text-gray-500">{option.description}</p>
          <div className="flex gap-1 mt-2">
            <div className="w-6 h-2 rounded" style={{ backgroundColor: option.colors.primary }} />
            <div className="w-6 h-2 rounded" style={{ backgroundColor: option.colors.secondary }} />
            <div className="w-6 h-2 rounded" style={{ backgroundColor: option.colors.accent }} />
          </div>
        </button>
      ))}
    </div>
  );
}

// Color Picker Component
function ColorPicker({
  colors,
  onChange,
}: {
  colors: ColorScheme;
  onChange: (colors: ColorScheme) => void;
}) {
  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200 mt-2">
      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Custom Colors</p>
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={colors.primary}
            onChange={(e) => onChange({ ...colors, primary: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <span className="text-xs text-gray-500">Primary</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={colors.secondary}
            onChange={(e) => onChange({ ...colors, secondary: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <span className="text-xs text-gray-500">Secondary</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={colors.accent}
            onChange={(e) => onChange({ ...colors, accent: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <span className="text-xs text-gray-500">Accent</span>
        </div>
      </div>
    </div>
  );
}

// Automation Setup Component
function AutomationSetup({
  config,
  onChange,
}: {
  config: AutomationConfig;
  onChange: (config: AutomationConfig) => void;
  businessName: string;
}) {
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200 mt-2 space-y-4">
      {/* Welcome email toggle */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.send_welcome_email}
          onChange={(e) => onChange({ ...config, send_welcome_email: e.target.checked })}
          className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <div>
          <p className="font-medium text-gray-900">Send welcome email to leads</p>
          <p className="text-xs text-gray-500">Automatically send a thank-you email when someone submits the form</p>
        </div>
      </label>

      {/* Owner notification toggle */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.notify_owner}
          onChange={(e) => onChange({ ...config, notify_owner: e.target.checked })}
          className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <div className="flex-1">
          <p className="font-medium text-gray-900">Notify me about new leads</p>
          <p className="text-xs text-gray-500 mb-2">Get an email when someone fills out your form</p>
          {config.notify_owner && (
            <input
              type="email"
              value={config.owner_email}
              onChange={(e) => onChange({ ...config, owner_email: e.target.value })}
              placeholder="your@email.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          )}
        </div>
      </label>

      {/* Tags */}
      <div>
        <p className="font-medium text-gray-900 text-sm mb-1">Tags to apply</p>
        <div className="flex flex-wrap gap-2">
          {config.add_tags.map((tag, i) => (
            <span
              key={i}
              className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Page Preview Component
function PagePreview({
  content,
  selectedHeadline,
  colors,
  heroImageUrl,
  includeForm,
  includeChat,
}: {
  content: GeneratedPageContent;
  selectedHeadline: number;
  style: WizardStyle;
  colors: ColorScheme;
  heroImageUrl: string | null;
  includeForm: boolean;
  includeChat: boolean;
}) {
  const headline = content.content.headlines?.[selectedHeadline] || content.content.headlines?.[0] || '';

  return (
    <div className="text-sm">
      {/* Hero section */}
      <div
        className="p-6 text-white text-center"
        style={{
          background: heroImageUrl
            ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${heroImageUrl}) center/cover`
            : `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
        }}
      >
        <h1 className="text-xl font-bold mb-2">{headline}</h1>
        <p className="text-sm opacity-90 mb-4">{content.content.hero_subheadline || content.content.tagline}</p>
        <button
          className="px-4 py-2 bg-white text-gray-900 rounded-lg font-medium text-sm"
        >
          {content.content.cta_text || 'Get Started'}
        </button>
      </div>

      {/* Features */}
      {content.content.features && content.content.features.length > 0 && (
        <div className="p-4 bg-white">
          <h2 className="font-bold text-gray-900 mb-3">Why Choose Us</h2>
          <div className="space-y-3">
            {content.content.features.slice(0, 3).map((feature, i) => (
              <div key={i} className="flex gap-2">
                <span>{feature.icon}</span>
                <div>
                  <p className="font-medium text-gray-900 text-xs">{feature.title}</p>
                  <p className="text-xs text-gray-500 line-clamp-1">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form placeholder */}
      {includeForm && (
        <div className="p-4 bg-gray-50">
          <h2 className="font-bold text-gray-900 mb-3">Get in Touch</h2>
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded" />
            <div className="h-8 bg-gray-200 rounded" />
            <div className="h-8 bg-gray-200 rounded" />
            <button
              className="w-full py-2 rounded font-medium text-white text-xs"
              style={{ backgroundColor: colors.primary }}
            >
              {content.content.cta_text || 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* FAQ preview */}
      {content.content.faq && content.content.faq.length > 0 && (
        <div className="p-4 bg-white">
          <h2 className="font-bold text-gray-900 mb-2">FAQ</h2>
          <div className="space-y-1">
            {content.content.faq.slice(0, 2).map((item, i) => (
              <p key={i} className="text-xs text-gray-500">• {item.q}</p>
            ))}
          </div>
        </div>
      )}

      {/* Chat widget indicator */}
      {includeChat && (
        <div className="p-4 flex justify-end">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: colors.primary }}
          >
            💬
          </div>
        </div>
      )}
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

        {/* Custom component */}
        {message.component}

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

// Helper functions
function buildBlocksFromContent(
  content: GeneratedPageContent,
  style: WizardStyle,
  colors: ColorScheme,
  includeForm: boolean,
  includeChat: boolean,
): PageBlock[] {
  const blocks: PageBlock[] = [];
  let order = 0;

  const styleGradients: Record<WizardStyle, [string, string]> = {
    professional: ['#1e1b4b', '#312e81'],
    bold: ['#0f0f0f', '#1f1f1f'],
    minimal: ['#fafafa', '#f5f5f5'],
    playful: ['#831843', '#701a75'],
  };
  const gradients = styleGradients[style];

  // Hero
  const headline = content.content.headlines?.[0] || 'Welcome';
  blocks.push({
    id: Math.random().toString(36).substring(2, 10),
    type: 'hero',
    order: order++,
    width: 4,
    config: {
      headline,
      subheadline: content.content.hero_subheadline || content.content.tagline || '',
      buttonText: content.content.cta_text || 'Get Started',
      buttonLink: '#contact',
      backgroundType: 'gradient',
      gradientFrom: gradients[0],
      gradientTo: gradients[1],
      textAlign: 'center',
      showButton: true,
    },
  });

  // Features
  if (content.content.features && content.content.features.length > 0) {
    blocks.push({
      id: Math.random().toString(36).substring(2, 10),
      type: 'features',
      order: order++,
      width: 4,
      config: {
        title: 'Why Choose Us',
        subtitle: content.content.value_props?.[0] || '',
        columns: Math.min(content.content.features.length, 3),
        items: content.content.features.slice(0, 3).map(f => ({
          icon: f.icon,
          title: f.title,
          description: f.description,
        })),
      },
    });
  }

  // Stats (if we have social proof)
  if (content.content.social_proof) {
    blocks.push({
      id: Math.random().toString(36).substring(2, 10),
      type: 'stats',
      order: order++,
      width: 4,
      config: {
        title: '',
        items: [
          { value: '100%', label: 'Satisfaction' },
          { value: '24/7', label: 'Support' },
          { value: '5+', label: 'Years Experience' },
        ],
      },
    });
  }

  // Testimonials
  if (content.content.testimonial_concepts && content.content.testimonial_concepts.length > 0) {
    blocks.push({
      id: Math.random().toString(36).substring(2, 10),
      type: 'testimonials',
      order: order++,
      width: 4,
      config: {
        title: 'What People Say',
        items: content.content.testimonial_concepts.slice(0, 2).map(t => ({
          quote: t,
          author: 'Happy Customer',
          company: '',
          avatar: '',
        })),
      },
    });
  }

  // FAQ
  if (content.content.faq && content.content.faq.length > 0) {
    blocks.push({
      id: Math.random().toString(36).substring(2, 10),
      type: 'faq',
      order: order++,
      width: 4,
      config: {
        title: 'Frequently Asked Questions',
        items: content.content.faq.slice(0, 4).map(f => ({
          question: f.q,
          answer: f.a,
        })),
      },
    });
  }

  // Form
  if (includeForm) {
    blocks.push({
      id: Math.random().toString(36).substring(2, 10),
      type: 'form',
      order: order++,
      width: 4,
      config: {
        formId: '',
        title: 'Get in Touch',
        description: 'Fill out the form and we\'ll be in touch shortly.',
      },
    });
  }

  // Chat
  if (includeChat) {
    blocks.push({
      id: Math.random().toString(36).substring(2, 10),
      type: 'chat',
      order: order++,
      width: 4,
      config: {
        title: 'Questions?',
        subtitle: 'Chat with us for instant answers',
        placeholder: 'Type your question...',
        position: 'inline',
        primaryColor: colors.primary,
      },
    });
  }

  // CTA
  blocks.push({
    id: Math.random().toString(36).substring(2, 10),
    type: 'cta',
    order: order++,
    width: 4,
    config: {
      headline: 'Ready to Get Started?',
      description: `Take the next step with ${content.business_info?.business_name || 'us'}.`,
      buttonText: content.content.cta_text || 'Get Started',
      buttonLink: '#contact',
      backgroundColor: colors.primary,
      textColor: style === 'minimal' ? 'dark' : 'light',
    },
  });

  return blocks;
}

function buildImagePrompt(content: GeneratedPageContent, style: WizardStyle): string {
  const industry = content.business_info?.industry || 'business';
  const businessType = content.business_info?.business_type || 'professional';

  let prompt = `Professional ${style} hero image for a ${industry} ${businessType} website. `;

  if (businessType === 'freelancer' || businessType === 'consultant') {
    prompt += 'Modern workspace, clean desk, professional environment. ';
  } else if (businessType === 'saas') {
    prompt += 'Abstract technology visualization, digital interface, modern software. ';
  } else if (businessType === 'agency') {
    prompt += 'Creative team environment, modern office, collaboration. ';
  } else {
    prompt += 'Professional business imagery, modern and trustworthy. ';
  }

  prompt += `Style: ${style}, high quality, no text, cinematic lighting.`;

  return prompt.substring(0, 500);
}
