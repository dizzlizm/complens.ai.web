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
  useCreateCompletePage,
  useSynthesizePage,
  GeneratedPageContent,
  AutomationConfig,
  CompletePageResult,
  SynthesisResult,
  SynthesisPageBlock,
} from '../../lib/hooks/useAI';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';

// Derive subdomain suffix from API URL (e.g., "dev.complens.ai" from "https://api.dev.complens.ai")
const API_URL = import.meta.env.VITE_API_URL || '';
const SUBDOMAIN_SUFFIX = API_URL.replace(/^https?:\/\/api\./, '') || 'complens.ai';

interface AgenticPageBuilderProps {
  onComplete: (result: {
    blocks: PageBlock[];
    content: GeneratedPageContent;
    style: WizardStyle;
    colors: ColorScheme;
    automation: AutomationConfig;
    includeForm: boolean;
    includeChat: boolean;
    createdPage?: CompletePageResult;
    synthesisResult?: SynthesisResult;
  }) => void;
  onClose: () => void;
  pageId?: string;
  useSynthesisEngine?: boolean; // Feature flag to enable new synthesis engine
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

type WizardPhase = 'discovery' | 'content' | 'design' | 'automation' | 'naming' | 'building' | 'review';
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
  naming: { title: 'Name your page', subtitle: 'Choose a name and subdomain' },
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
  useSynthesisEngine = false, // Default to false for gradual rollout
}: AgenticPageBuilderProps) {
  const { workspaceId } = useCurrentWorkspace();
  const { data: profile, isLoading: profileLoading } = useBusinessProfile(workspaceId, pageId);
  const generateImage = useGenerateImage(workspaceId || '');
  const generatePageContent = useGeneratePageContent(workspaceId || '');
  const refinePageContent = useRefinePageContent(workspaceId || '');
  const createCompletePage = useCreateCompletePage(workspaceId || '');
  const synthesizePage = useSynthesizePage(workspaceId || '');

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

  // Page naming state
  const [pageName, setPageName] = useState('');
  const [pageSubdomain, setPageSubdomain] = useState('');

  // Building state
  const [generatedBlocks, setGeneratedBlocks] = useState<PageBlock[]>([]);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState(0);
  const [createdPageResult, setCreatedPageResult] = useState<CompletePageResult | null>(null);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);

  // Slug conflict state (for replace confirmation)
  const [pendingSlugConflict, setPendingSlugConflict] = useState<{
    slug: string;
    heroUrl: string | null;
    avatarUrls: string[];
    contentWithImages: GeneratedPageContent;
  } | null>(null);

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

      await addAssistantMessage(
        'Review the headlines and content below. Click to select your favorite headline, or tell me what to change. When you\'re happy, click "Next: Design" to continue.',
        undefined,
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
        'Content updated! Review the changes below. Tell me if you want more adjustments, or click "Next: Design" when ready.',
        undefined,
        undefined,
        600
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
      '🎨 Let\'s pick your visual style! Choose a style that matches your brand below, then customize colors if you want. Click "Next: Automation" when you\'re ready.',
      undefined,
      undefined,
      600
    );
  };

  // Move to automation phase
  const moveToAutomation = async () => {
    setPhase('automation');

    await addAssistantMessage(
      '⚡ Let\'s set up your automation! Configure what happens when someone fills out your form below. You can:\n\n• Send a welcome email to new leads\n• Get notified when someone submits\n• Auto-tag contacts for organization',
      undefined,
      undefined,
      600
    );
  };

  // Move to naming phase (skipped in update mode)
  const moveToNaming = async () => {
    // If we're updating an existing page, skip naming and go straight to building
    if (pageId) {
      await startBuilding();
      return;
    }

    // Auto-generate page name and subdomain from business info
    const businessName = generatedContent?.business_info?.business_name || '';
    if (businessName && !pageName) {
      setPageName(businessName);
      // Generate subdomain from business name (lowercase, alphanumeric, hyphens)
      const suggestedSubdomain = businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 30);
      setPageSubdomain(suggestedSubdomain);
    }

    setPhase('naming');

    await addAssistantMessage(
      `📝 Almost there! Give your page a name and optional subdomain. The subdomain will let people access your page at **yourname.${SUBDOMAIN_SUFFIX}**.`,
      undefined,
      undefined,
      600
    );
  };

  // Build using synthesis engine (new approach)
  const startBuildingWithSynthesis = async () => {
    if (!generatedContent) return;

    const isUpdateMode = !!pageId;
    if (!isUpdateMode && !pageName.trim()) {
      await addAssistantMessage('⚠️ Please enter a page name first.', undefined, undefined, 300);
      return;
    }

    setPhase('building');
    setBuildProgress(0);

    const actionText = isUpdateMode ? 'Synthesizing your page...' : 'Building your complete marketing package with AI synthesis...';
    await addAssistantMessage(`🚀 ${actionText}`, undefined, undefined, 300);

    const slug = pageName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    addSystemMessage('🧠 Running AI synthesis engine...');
    setBuildProgress(10);

    try {
      // Use the synthesis engine to generate blocks intelligently
      const synthesisDesc = `${generatedContent.business_info?.business_name || pageName}: ${generatedContent.content.tagline || ''} ${generatedContent.content.hero_subheadline || ''}`;

      const result = await synthesizePage.mutateAsync({
        description: synthesisDesc,
        intent_hints: generatedContent.business_info?.business_type ? [generatedContent.business_info.business_type] : undefined,
        style_preference: style,
        page_id: pageId,
        include_form: includeForm,
        include_chat: includeChat,
      });

      setSynthesisResult(result);
      setBuildProgress(40);

      // Display synthesis metadata
      addSystemMessage(`✅ Synthesis complete: ${result.metadata.blocks_included.length} blocks included`);
      if (Object.keys(result.metadata.blocks_excluded).length > 0) {
        const excludedReasons = Object.entries(result.metadata.blocks_excluded)
          .map(([block, reason]) => `${block}: ${reason}`)
          .slice(0, 2)
          .join('; ');
        addSystemMessage(`ℹ️ Excluded: ${excludedReasons}`);
      }

      // Convert synthesis blocks to PageBlock format with proper type casting
      const synthesizedBlocks: PageBlock[] = result.blocks.map((b: SynthesisPageBlock) => ({
        id: b.id,
        type: b.type as PageBlock['type'],
        order: b.order,
        width: (b.width >= 1 && b.width <= 4 ? b.width : 4) as PageBlock['width'],
        config: b.config as Record<string, unknown>,
      }));

      setBuildProgress(50);

      // Generate hero image if not present
      addSystemMessage('🎨 Generating hero image...');
      let heroUrl: string | null = null;
      try {
        const imageResult = await generateImage.mutateAsync({
          context: buildImageContext(generatedContent, style),
          style,
        });
        if (imageResult?.url) {
          heroUrl = imageResult.url;
          setHeroImageUrl(imageResult.url);
          // Update hero block with image
          const heroBlock = synthesizedBlocks.find(b => b.type === 'hero');
          if (heroBlock) {
            heroBlock.config.backgroundType = 'image';
            heroBlock.config.backgroundImage = imageResult.url;
          }
          addSystemMessage('✅ Hero image ready!');
        }
      } catch {
        addSystemMessage('⚠️ Using gradient background');
      }

      setBuildProgress(60);

      // Prepare content with synthesis data for create-complete
      const contentWithSynthesis = {
        ...generatedContent,
        content: {
          ...generatedContent.content,
          hero_image_url: heroUrl,
        },
      };

      // Create or update the page
      addSystemMessage(isUpdateMode ? '📄 Updating page...' : '📄 Creating page, form, and workflow...');

      const createResult = await createCompletePage.mutateAsync({
        ...(isUpdateMode
          ? { page_id: pageId }
          : { name: pageName, slug, subdomain: pageSubdomain.trim() || undefined }
        ),
        content: contentWithSynthesis,
        style,
        colors: {
          primary: result.design_system.colors.primary,
          secondary: result.design_system.colors.secondary,
          accent: result.design_system.colors.accent,
        },
        include_form: includeForm,
        include_chat: includeChat,
        automation,
        // Pass synthesis engine outputs for intelligent form/workflow creation
        synthesized_blocks: result.blocks.map(b => ({
          id: b.id,
          type: b.type,
          order: b.order,
          width: b.width,
          config: b.config,
        })),
        synthesized_form_config: result.form_config || undefined,
        synthesized_workflow_config: result.workflow_config || undefined,
        business_name: result.business_name || undefined,
      });

      setCreatedPageResult(createResult);
      setGeneratedBlocks(synthesizedBlocks);
      setBuildProgress(100);

      addSystemMessage(isUpdateMode ? '✅ Page updated!' : '✅ Page created!');
      if (createResult.form) addSystemMessage('✅ Lead capture form ready!');
      if (createResult.workflow) addSystemMessage('✅ Automation workflow active!');

      setPhase('review');

      const pageUrl = pageSubdomain.trim()
        ? `https://${pageSubdomain}.${SUBDOMAIN_SUFFIX}`
        : 'Your page is ready';

      const strengthsText = result.assessment.strengths.length > 0
        ? `\n\n**Content strengths:** ${result.assessment.strengths.slice(0, 2).join(', ')}`
        : '';

      const successMessage = createResult.updated
        ? `🎉 Done! Your page has been updated with:\n\n` +
          `• **${synthesizedBlocks.length} intelligent sections** (${result.intent.goal} optimized)\n` +
          `${createResult.form ? '• **Lead capture form** ready\n' : ''}` +
          `${createResult.workflow ? '• **Automation workflow** active\n' : ''}` +
          `${includeChat ? '• **AI chat widget** enabled\n' : ''}` +
          strengthsText +
          `\n\nClick "Done" to see your updated page!`
        : `🎉 Done! The synthesis engine created:\n\n` +
          `• **Landing page** with ${synthesizedBlocks.length} optimized sections\n` +
          `• **Intent detected:** ${result.intent.goal} (${result.intent.audience_intent})\n` +
          `${createResult.form ? '• **Lead capture form** (email, name, phone, message)\n' : ''}` +
          `${createResult.workflow ? '• **Automation workflow** to handle new leads\n' : ''}` +
          `${includeChat ? '• **AI chat widget** for visitor questions\n' : ''}\n` +
          `${pageSubdomain.trim() ? `🌐 **Live at:** ${pageUrl}\n\n` : ''}` +
          strengthsText +
          `\n\nClick "Done" to close the wizard and view your page!`;

      await addAssistantMessage(
        successMessage,
        [
          { value: 'apply', label: '✅ Done', description: createResult.updated ? 'Close wizard and refresh page' : 'Close wizard and view page' },
        ],
        undefined,
        800
      );

    } catch (err) {
      console.error('Synthesis build failed:', err);
      await addAssistantMessage(
        `⚠️ Synthesis failed. Error: ${err instanceof Error ? err.message : 'Unknown error'}. Falling back to standard build...`,
        undefined,
        undefined,
        600
      );
      // Fall back to the original build method
      await startBuildingLegacy();
    }
  };

  // Start building - dispatches to synthesis or legacy based on feature flag
  const startBuilding = async () => {
    if (useSynthesisEngine) {
      await startBuildingWithSynthesis();
    } else {
      await startBuildingLegacy();
    }
  };

  // Start building the page (legacy approach)
  const startBuildingLegacy = async () => {
    if (!generatedContent) return;

    // In create mode, require page name
    const isUpdateMode = !!pageId;
    if (!isUpdateMode && !pageName.trim()) {
      await addAssistantMessage('⚠️ Please enter a page name first.', undefined, undefined, 300);
      return;
    }

    setPhase('building');
    setBuildProgress(0);

    const actionText = isUpdateMode ? 'Updating your page...' : 'Building your complete marketing package...';
    await addAssistantMessage(`🚀 ${actionText}`, undefined, undefined, 300);

    // Generate slug from page name (only used in create mode)
    const slug = pageName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Step 1: Generate hero image
    addSystemMessage('🎨 Generating hero image...');
    setBuildProgress(10);

    let heroUrl: string | null = null;
    try {
      const imageResult = await generateImage.mutateAsync({
        context: buildImageContext(generatedContent, style),
        style,
      });
      if (imageResult?.url) {
        heroUrl = imageResult.url;
        setHeroImageUrl(imageResult.url);
        addSystemMessage('✅ Hero image ready!');
      }
    } catch (err) {
      console.error('Hero image generation failed:', err);
      addSystemMessage('⚠️ Using gradient background');
    }

    setBuildProgress(25);

    // Step 2: Generate testimonial avatars
    const testimonialConcepts = generatedContent.content.testimonial_concepts || [];
    const avatarUrls: string[] = [];

    if (testimonialConcepts.length > 0) {
      addSystemMessage('👤 Generating testimonial avatars...');

      for (let i = 0; i < Math.min(testimonialConcepts.length, 3); i++) {
        try {
          const concept = testimonialConcepts[i] || {};
          const avatarResult = await generateImage.mutateAsync({
            context: buildAvatarContext(concept, style),
            style,
            width: 512,
            height: 512,
          });
          if (avatarResult?.url) {
            avatarUrls.push(avatarResult.url);
          }
        } catch (err) {
          console.error(`Avatar ${i} generation failed:`, err);
        }
        setBuildProgress(25 + ((i + 1) / Math.min(testimonialConcepts.length, 3)) * 20);
      }

      if (avatarUrls.length > 0) {
        addSystemMessage(`✅ ${avatarUrls.length} testimonial avatars ready!`);
      }
    }

    setBuildProgress(50);

    // Step 3: Prepare content with images
    const contentWithImages = {
      ...generatedContent,
      content: {
        ...generatedContent.content,
        hero_image_url: heroUrl,
        testimonial_avatars: avatarUrls,
      },
    };

    // Step 4: Create or update complete page (page + form + workflow)
    const updateMode = !!pageId;
    addSystemMessage(updateMode ? '📄 Updating page content...' : '📄 Creating page, form, and workflow...');
    setBuildProgress(60);

    try {
      const result = await createCompletePage.mutateAsync({
        // In update mode, send page_id instead of name/slug
        ...(updateMode
          ? { page_id: pageId }
          : { name: pageName, slug, subdomain: pageSubdomain.trim() || undefined }
        ),
        content: contentWithImages,
        style,
        colors,
        include_form: includeForm,
        include_chat: includeChat,
        automation,
      });

      setCreatedPageResult(result);
      addSystemMessage(updateMode ? '✅ Page updated!' : '✅ Page created!');
      setBuildProgress(80);

      if (result.form) {
        addSystemMessage(result.updated ? '✅ Form ready!' : '✅ Lead capture form created!');
      }
      setBuildProgress(90);

      if (result.workflow) {
        addSystemMessage('✅ Automation workflow created!');
      }
      setBuildProgress(100);

      // Build blocks for preview (with images)
      const blocks = buildBlocksFromContent(contentWithImages, style, colors, includeForm, includeChat, avatarUrls, heroUrl);
      setGeneratedBlocks(blocks);

      setPhase('review');

      const pageUrl = pageSubdomain.trim()
        ? `https://${pageSubdomain}.${SUBDOMAIN_SUFFIX}`
        : `Your page is ready`;

      // Different message for update vs create
      const successMessage = result.updated
        ? `🎉 Done! Your page has been updated with:\n\n` +
          `• **${blocks.length} new sections**\n` +
          `${result.form ? '• **Lead capture form** ready\n' : ''}` +
          `${result.workflow ? '• **Automation workflow** active\n' : ''}` +
          `${includeChat ? '• **AI chat widget** enabled\n' : ''}\n` +
          `Click "Done" to see your updated page!`
        : `🎉 Done! I've created:\n\n` +
          `• **Landing page** with ${blocks.length} sections\n` +
          `${result.form ? '• **Lead capture form** (email, name, phone, message)\n' : ''}` +
          `${result.workflow ? '• **Automation workflow** to handle new leads\n' : ''}` +
          `${includeChat ? '• **AI chat widget** for visitor questions\n' : ''}\n` +
          `${pageSubdomain.trim() ? `🌐 **Live at:** ${pageUrl}\n\n` : ''}` +
          `Click "Done" to close the wizard and view your page!`;

      await addAssistantMessage(
        successMessage,
        [
          { value: 'apply', label: '✅ Done', description: result.updated ? 'Close wizard and refresh page' : 'Close wizard and view page' },
        ],
        undefined,
        800
      );

    } catch (err) {
      console.error('Create complete page failed:', err);

      // Check if this is a slug conflict error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorResponse = (err as any)?.response?.data;
      const errorCode = errorResponse?.error_code;

      if (errorCode === 'SLUG_EXISTS') {
        // Save state for potential retry with replace_existing
        setPendingSlugConflict({
          slug,
          heroUrl,
          avatarUrls,
          contentWithImages,
        });

        setPhase('naming');

        await addAssistantMessage(
          `⚠️ A page with the slug "${slug}" already exists in your workspace. Would you like to replace it with this new page? This will delete the existing page, its forms, and workflows.`,
          [
            { value: 'replace', label: '🔄 Replace existing page', description: 'Delete old page and create new one' },
            { value: 'rename', label: '✏️ Choose a different name', description: 'Keep both pages' },
          ],
          undefined,
          600
        );
      } else {
        await addAssistantMessage(
          `⚠️ Something went wrong creating your page. Error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
          undefined,
          undefined,
          600
        );
        setPhase('naming');
      }
    }
  };

  // Handle replacing an existing page after slug conflict confirmation
  const handleReplaceExisting = async () => {
    if (!pendingSlugConflict || !generatedContent) return;

    const { slug, heroUrl, avatarUrls, contentWithImages } = pendingSlugConflict;
    setPendingSlugConflict(null);

    setPhase('building');
    setBuildProgress(60);

    addSystemMessage('🔄 Replacing existing page...');

    try {
      const result = await createCompletePage.mutateAsync({
        name: pageName,
        slug,
        subdomain: pageSubdomain.trim() || undefined,
        content: contentWithImages,
        style,
        colors,
        include_form: includeForm,
        include_chat: includeChat,
        automation,
        replace_existing: true,
      });

      setCreatedPageResult(result);
      addSystemMessage('✅ Page replaced!');
      setBuildProgress(80);

      if (result.form) {
        addSystemMessage('✅ Lead capture form created!');
      }
      setBuildProgress(90);

      if (result.workflow) {
        addSystemMessage('✅ Automation workflow created!');
      }
      setBuildProgress(100);

      // Build blocks for preview
      const blocks = buildBlocksFromContent(contentWithImages, style, colors, includeForm, includeChat, avatarUrls, heroUrl);
      setGeneratedBlocks(blocks);

      setPhase('review');

      const pageUrl = pageSubdomain.trim()
        ? `https://${pageSubdomain}.${SUBDOMAIN_SUFFIX}`
        : `Your page is ready`;

      await addAssistantMessage(
        `🎉 Done! I've replaced your existing page and created:\n\n` +
        `• **Landing page** with ${blocks.length} sections\n` +
        `${result.form ? '• **Lead capture form** (email, name, phone, message)\n' : ''}` +
        `${result.workflow ? '• **Automation workflow** to handle new leads\n' : ''}` +
        `${includeChat ? '• **AI chat widget** for visitor questions\n' : ''}\n` +
        `${pageSubdomain.trim() ? `🌐 **Live at:** ${pageUrl}\n\n` : ''}` +
        `Click "Done" to close the wizard and view your page!`,
        [
          { value: 'apply', label: '✅ Done', description: 'Close wizard and view page' },
        ],
        undefined,
        800
      );

    } catch (err) {
      console.error('Replace page failed:', err);
      await addAssistantMessage(
        `⚠️ Failed to replace the page. Error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        undefined,
        undefined,
        600
      );
      setPhase('naming');
    }
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
      createdPage: createdPageResult || undefined,
      synthesisResult: synthesisResult || undefined,
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
    } else if (value === 'replace') {
      // User confirmed they want to replace existing page
      await handleReplaceExisting();
    } else if (value === 'rename') {
      // User wants to choose a different name, stay on naming phase
      setPendingSlugConflict(null);
      await addAssistantMessage(
        'No problem! Change the page name below and try again.',
        undefined,
        undefined,
        300
      );
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
                {/* Phase indicators - skip 'naming' phase in update mode */}
                <div className="flex gap-1">
                  {(pageId
                    ? ['discovery', 'content', 'design', 'automation', 'review'] as WizardPhase[]
                    : ['discovery', 'content', 'design', 'automation', 'naming', 'review'] as WizardPhase[]
                  ).map((p, i, phases) => (
                    <div
                      key={p}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        phase === p ? 'bg-white' :
                        phases.indexOf(phase as WizardPhase) > i
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

            {/* Content Review - rendered directly so state updates work */}
            {phase === 'content' && generatedContent && (
              <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
                <ContentReviewCards
                  content={generatedContent}
                  selectedHeadline={selectedHeadline}
                  onSelectHeadline={setSelectedHeadline}
                  onRefine={(section, feedback) => refineContent(feedback, section)}
                />
                <div className="flex justify-end">
                  <button
                    onClick={moveToDesign}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                  >
                    ✅ Next: Design
                  </button>
                </div>
              </div>
            )}

            {/* Design Options - rendered directly so state updates work */}
            {phase === 'design' && (
              <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
                <StyleSelector
                  currentStyle={style}
                  onSelect={(s) => {
                    setStyle(s);
                    const styleOption = STYLE_OPTIONS.find(o => o.value === s);
                    if (styleOption) {
                      setColors(styleOption.colors);
                    }
                  }}
                />
                <ColorPicker colors={colors} onChange={setColors} />
                <div className="flex justify-end">
                  <button
                    onClick={moveToAutomation}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                  >
                    ➡️ Next: Automation
                  </button>
                </div>
              </div>
            )}

            {/* Automation Setup - rendered directly so state updates work */}
            {phase === 'automation' && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <AutomationSetup
                  config={automation}
                  onChange={setAutomation}
                  businessName={generatedContent?.business_info?.business_name || 'your business'}
                />
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={moveToNaming}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                  >
                    ➡️ Next: Name Your Page
                  </button>
                </div>
              </div>
            )}

            {/* Naming Setup - rendered directly so state updates work */}
            {phase === 'naming' && (
              <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Page Name</label>
                  <input
                    type="text"
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    placeholder="e.g., My Business Landing Page"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain (optional)</label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={pageSubdomain}
                      onChange={(e) => setPageSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="yourname"
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                    <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-200 rounded-r-lg text-gray-500 text-sm">
                      .{SUBDOMAIN_SUFFIX}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to use the page slug instead
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={startBuilding}
                    disabled={!pageName.trim()}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    🚀 Build my page!
                  </button>
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

        {/* Right side - Preview (shows during content/design/naming/building/review phases) */}
        {(phase === 'content' || phase === 'design' || phase === 'naming' || phase === 'building' || phase === 'review') && generatedContent && (
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

            {/* Synthesis metadata (when using synthesis engine) */}
            {phase === 'review' && synthesisResult && (
              <div className="p-3 border-t border-gray-200 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Synthesis Details</p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Intent:</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">{synthesisResult.intent.goal}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Blocks:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {synthesisResult.metadata.blocks_included.map(block => (
                        <span key={block} className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">
                          {block}
                        </span>
                      ))}
                    </div>
                  </div>
                  {Object.keys(synthesisResult.metadata.blocks_excluded).length > 0 && (
                    <div>
                      <span className="text-gray-500">Excluded:</span>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(synthesisResult.metadata.blocks_excluded).slice(0, 3).map(([block, reason]) => (
                          <div key={block} className="text-gray-400 text-[10px]">
                            <span className="line-through">{block}</span>: {reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

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
  const [newTag, setNewTag] = useState('');

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !config.add_tags.includes(tag)) {
      onChange({ ...config, add_tags: [...config.add_tags, tag] });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange({ ...config, add_tags: config.add_tags.filter(t => t !== tagToRemove) });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200 mt-2 space-y-4">
      {/* Welcome email toggle */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="send_welcome_email"
          checked={config.send_welcome_email}
          onChange={(e) => onChange({ ...config, send_welcome_email: e.target.checked })}
          className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
        />
        <label htmlFor="send_welcome_email" className="cursor-pointer">
          <p className="font-medium text-gray-900">Send welcome email to leads</p>
          <p className="text-xs text-gray-500">Automatically send a thank-you email when someone submits the form</p>
        </label>
      </div>

      {/* Owner notification toggle */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="notify_owner"
          checked={config.notify_owner}
          onChange={(e) => onChange({ ...config, notify_owner: e.target.checked })}
          className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
        />
        <div className="flex-1">
          <label htmlFor="notify_owner" className="cursor-pointer">
            <p className="font-medium text-gray-900">Notify me about new leads</p>
            <p className="text-xs text-gray-500 mb-2">Get an email when someone fills out your form</p>
          </label>
          {config.notify_owner && (
            <input
              type="email"
              value={config.owner_email || ''}
              onChange={(e) => onChange({ ...config, owner_email: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="your@email.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          )}
        </div>
      </div>

      {/* Tags - editable */}
      <div>
        <p className="font-medium text-gray-900 text-sm mb-2">Tags to apply to new contacts</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {config.add_tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="ml-1 text-purple-500 hover:text-purple-800 font-bold"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Add a tag..."
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!newTag.trim()}
            className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
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
  avatarUrls: string[] = [],
  heroUrl: string | null = null,
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
      backgroundType: heroUrl ? 'image' : 'gradient',
      backgroundImage: heroUrl || undefined,
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
    // Generate placeholder names for testimonials
    const placeholderNames = ['Sarah M.', 'James T.', 'Emily R.', 'Michael K.', 'Jessica L.'];
    const placeholderCompanies = ['Satisfied Customer', 'Happy Client', 'Loyal Customer', 'Verified Buyer', 'Business Owner'];

    blocks.push({
      id: Math.random().toString(36).substring(2, 10),
      type: 'testimonials',
      order: order++,
      width: 4,
      config: {
        title: 'What People Say',
        items: content.content.testimonial_concepts.slice(0, 3).map((t, i) => ({
          quote: t,
          author: placeholderNames[i] || 'Happy Customer',
          company: placeholderCompanies[i] || '',
          avatar: avatarUrls[i] || '',
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

function buildImageContext(content: GeneratedPageContent, style: WizardStyle): string {
  const businessName = content.business_info?.business_name || '';
  const industry = content.business_info?.industry || 'business';
  const tagline = content.content.tagline || '';
  const headline = content.content.headlines?.[0] || '';

  const parts = [businessName, headline, tagline, `${industry} industry`]
    .filter(Boolean);

  return `Hero banner for: ${parts.join(' — ')}. Visual style: ${style}. Wide aspect ratio, no text or logos, cinematic quality.`;
}

function buildAvatarContext(testimonialConcept: string | { author?: string; company?: string; quote?: string }, style: WizardStyle): string {
  // testimonial_concepts can be strings (quotes) or objects
  const quote = typeof testimonialConcept === 'string' ? testimonialConcept : (testimonialConcept.quote || '');
  return `Professional headshot portrait of a person who might say: "${quote.slice(0, 100)}". Photorealistic corporate photography, ${style} aesthetic, clean background, well-lit, friendly expression.`;
}
