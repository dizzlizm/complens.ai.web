import { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Loader2, ChevronRight, AlertCircle, FileText, Workflow, Image, Check, Building2, Plus, MessageSquare, Eye, ChevronLeft } from 'lucide-react';
import { BlockType, BLOCK_TYPES, PageBlock } from './types';
import {
  useSynthesizePlan,
  useSynthesizeGenerate,
  useGenerateImage,
  useBusinessProfile,
  SynthesisResult,
  PlanResult,
  GenerateResult,
  SynthesisPageBlock,
} from '../../lib/hooks/useAI';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';

interface FormFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'number';
  required: boolean;
  placeholder?: string;
  options?: string[];
  map_to_contact_field?: string;
}

interface SynthesisPopupProps {
  selectedBlockTypes: BlockType[];
  selectedSlotIds?: string[];  // Optional: slot IDs from visual canvas
  existingBlockTypes?: string[];  // Block types already on the page (to avoid injecting duplicates)
  pageId?: string;
  onClose: () => void;
  onApply: (blocks: PageBlock[], synthesisResult: SynthesisResult, options: ApplyOptions) => void;
}

export interface ApplyOptions {
  createForm: boolean;
  createWorkflow: boolean;
  generateImages: boolean;
  formFields: FormFieldConfig[];
  workflowTrigger: string;
  // Workflow configuration
  workflowTags: string[];
  notifyOwner: boolean;
  ownerEmail: string;
  sendWelcomeEmail: boolean;
}

// Blocks that can benefit from AI-generated images
const IMAGE_CAPABLE_BLOCKS = ['hero', 'testimonials', 'image', 'gallery', 'slider'];

// Default form fields (always included)
const DEFAULT_FORM_FIELDS: FormFieldConfig[] = [
  { name: 'first_name', label: 'Name', type: 'text', required: true, placeholder: 'Your name', map_to_contact_field: 'first_name' },
  { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'your@email.com', map_to_contact_field: 'email' },
  { name: 'phone', label: 'Phone', type: 'phone', required: false, placeholder: '(555) 123-4567', map_to_contact_field: 'phone' },
  { name: 'message', label: 'Message', type: 'textarea', required: false, placeholder: 'How can we help?' },
];

// Extra field presets users can add
const EXTRA_FIELD_PRESETS: FormFieldConfig[] = [
  { name: 'company', label: 'Company', type: 'text', required: false, placeholder: 'Your company', map_to_contact_field: 'custom_fields.company' },
  { name: 'job_title', label: 'Job Title', type: 'text', required: false, placeholder: 'Your role', map_to_contact_field: 'custom_fields.job_title' },
  { name: 'website', label: 'Website', type: 'text', required: false, placeholder: 'https://', map_to_contact_field: 'custom_fields.website' },
  { name: 'budget', label: 'Budget', type: 'select', required: false, options: ['Under $1k', '$1k - $5k', '$5k - $10k', '$10k - $25k', '$25k+'] },
  { name: 'service_interest', label: 'Service', type: 'select', required: false, options: ['Consulting', 'Development', 'Design', 'Marketing', 'Other'] },
  { name: 'preferred_date', label: 'Preferred Date', type: 'date', required: false },
];

// Workflow trigger options
const WORKFLOW_TRIGGERS: Array<{
  value: string;
  label: string;
  icon: typeof FileText;
  description: string;
  requiresBlock?: BlockType;
}> = [
  { value: 'trigger_form_submitted', label: 'Form Submission', icon: FileText, description: 'When someone submits the form' },
  { value: 'trigger_chat_message', label: 'Chat Message', icon: MessageSquare, description: 'When someone sends a chat message', requiresBlock: 'chat' },
  { value: 'trigger_page_visit', label: 'Page Visit', icon: Eye, description: 'When someone visits the page' },
];

// Map brand_voice from profile to synthesis style options
function mapBrandVoiceToStyle(brandVoice: string): 'professional' | 'bold' | 'minimal' | 'playful' {
  switch (brandVoice) {
    case 'professional':
    case 'authoritative':
    case 'technical':
      return 'professional';
    case 'bold':
    case 'inspirational':
      return 'bold';
    case 'casual':
    case 'friendly':
    case 'playful':
      return 'playful';
    default:
      return 'professional';
  }
}

const STYLE_OPTIONS = [
  { value: 'professional', label: 'Professional', description: 'Clean, corporate, trustworthy' },
  { value: 'bold', label: 'Bold', description: 'High-contrast, urgent, attention-grabbing' },
  { value: 'minimal', label: 'Minimal', description: 'Simple, elegant, lots of whitespace' },
  { value: 'playful', label: 'Playful', description: 'Colorful, friendly, approachable' },
] as const;

type Step = 'input' | 'plan' | 'generate';

export default function SynthesisPopup({
  selectedBlockTypes,
  selectedSlotIds: _selectedSlotIds = [],  // Reserved for future slot-specific generation
  existingBlockTypes,
  pageId,
  onClose,
  onApply,
}: SynthesisPopupProps) {
  const { workspaceId } = useCurrentWorkspace();
  const { data: profile } = useBusinessProfile(workspaceId, pageId);
  const [pagePurpose, setPagePurpose] = useState('');
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState<'professional' | 'bold' | 'minimal' | 'playful'>('professional');
  const [profileApplied, setProfileApplied] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  // 3-step flow state
  const [step, setStep] = useState<Step>('input');
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [generatedBlocks, setGeneratedBlocks] = useState<SynthesisPageBlock[]>([]);
  const [generateProgress, setGenerateProgress] = useState({ current: 0, total: 0, completed: [] as string[] });
  const [isGenerating, setIsGenerating] = useState(false);

  // Options for what to create alongside blocks
  const [createForm, setCreateForm] = useState(true);
  const [createWorkflow, setCreateWorkflow] = useState(true);
  const [generateImages, setGenerateImages] = useState(true);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState<string>('');

  // Form field configuration
  const [formFields, setFormFields] = useState<FormFieldConfig[]>([...DEFAULT_FORM_FIELDS]);

  // Workflow configuration
  const [workflowTrigger, setWorkflowTrigger] = useState<string>('trigger_form_submitted');
  const [workflowTags, setWorkflowTags] = useState<string>('lead, website');
  const [notifyOwner, setNotifyOwner] = useState(true);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  // Form/workflow config from generate phase
  const [formConfig, setFormConfig] = useState<GenerateResult['form_config']>(null);
  const [workflowConfig, setWorkflowConfig] = useState<GenerateResult['workflow_config']>(null);

  // Auto-apply profile defaults once when profile loads
  useEffect(() => {
    if (profile && !profileApplied) {
      if (profile.brand_voice) {
        setStyle(mapBrandVoiceToStyle(profile.brand_voice));
      }
      if (profile.contact_email && !ownerEmail) {
        setOwnerEmail(profile.contact_email);
      }
      setProfileApplied(true);
    }
  }, [profile, profileApplied, ownerEmail]);

  const synthesizePlan = useSynthesizePlan(workspaceId || '');
  const synthesizeGenerate = useSynthesizeGenerate(workspaceId || '');
  const generateImage = useGenerateImage(workspaceId || '');

  // Check if any selected blocks can use images
  const hasImageCapableBlocks = selectedBlockTypes.some(type => IMAGE_CAPABLE_BLOCKS.includes(type));

  // Check what's relevant based on selected blocks — include injected blocks from plan
  const plannedBlockTypes = planResult
    ? planResult.block_plan.map(b => b.type)
    : selectedBlockTypes;
  const hasFormBlock = plannedBlockTypes.includes('form');
  const hasChatBlock = plannedBlockTypes.includes('chat');
  const hasCreationOptions = hasFormBlock || hasChatBlock || hasImageCapableBlocks;

  // Get block labels for display
  const getBlockLabel = (type: string): string => {
    const blockInfo = BLOCK_TYPES.find((b) => b.type === type);
    return blockInfo?.label || type;
  };

  // Build full description from purpose + extra details
  const buildFullDescription = useCallback(() => {
    const parts: string[] = [];
    if (pagePurpose) {
      parts.push(`This is a ${pagePurpose} page.`);
    }
    if (description) {
      parts.push(description);
    }
    return parts.join(' ') || 'Generate content for the selected blocks';
  }, [pagePurpose, description]);

  // Build intent hints from purpose
  const buildIntentHints = useCallback(() => {
    const intentHints: string[] = [];
    if (pagePurpose) {
      const purposeToHint: Record<string, string> = {
        'lead generation': 'lead-gen',
        'portfolio / showcase': 'portfolio',
        'product launch': 'product-launch',
        'services': 'services',
        'event / webinar': 'event',
        'coming soon': 'coming-soon',
      };
      const hint = purposeToHint[pagePurpose];
      if (hint) intentHints.push(hint);
    }
    return intentHints;
  }, [pagePurpose]);

  // Step 1 → Step 2: Run plan phase
  const handlePlan = useCallback(async () => {
    if (!workspaceId) return;

    const fullDescription = buildFullDescription();
    const intentHints = buildIntentHints();

    try {
      setSynthesisError(null);
      const result = await synthesizePlan.mutateAsync({
        description: fullDescription,
        style_preference: style,
        page_id: pageId,
        block_types: selectedBlockTypes,
        ...(intentHints.length > 0 && { intent_hints: intentHints }),
        ...(existingBlockTypes && existingBlockTypes.length > 0 && { existing_block_types: existingBlockTypes }),
      });

      setPlanResult(result);
      setStep('plan');
    } catch (error: unknown) {
      const axiosErr = error as { response?: { status?: number; data?: { message?: string } }; code?: string };
      const status = axiosErr?.response?.status;
      const message = axiosErr?.response?.data?.message;

      if (status === 429) {
        setSynthesisError('Rate limit reached. Please wait a moment and try again.');
      } else if (status === 400) {
        setSynthesisError(message || 'Invalid request. Please check your inputs.');
      } else {
        setSynthesisError('Something went wrong. Please try again.');
      }
    }
  }, [workspaceId, synthesizePlan, buildFullDescription, buildIntentHints, style, pageId, selectedBlockTypes]);

  // Step 2 → Step 3: Run generate phase (batched)
  const handleGenerate = useCallback(async () => {
    if (!workspaceId || !planResult) return;

    const fullDescription = buildFullDescription();
    const blockTypes = planResult.block_plan.map(b => b.type);

    // Split into batches of 3
    const batches: string[][] = [];
    for (let i = 0; i < blockTypes.length; i += 3) {
      batches.push(blockTypes.slice(i, i + 3));
    }

    setStep('generate');
    setIsGenerating(true);
    setGeneratedBlocks([]);
    setGenerateProgress({ current: 0, total: blockTypes.length, completed: [] });
    setSynthesisError(null);

    const allBlocks: SynthesisPageBlock[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const isLastBatch = i === batches.length - 1;

        const result = await synthesizeGenerate.mutateAsync({
          description: fullDescription,
          page_id: pageId,
          brand: planResult.brand,
          design_system: planResult.design_system,
          intent: planResult.intent,
          block_types: batch,
          include_form: isLastBatch && hasFormBlock,
        });

        allBlocks.push(...result.blocks);
        setGeneratedBlocks([...allBlocks]);

        // Update progress
        const completedTypes = allBlocks.map(b => b.type);
        setGenerateProgress({
          current: allBlocks.length,
          total: blockTypes.length,
          completed: completedTypes,
        });

        // Capture form/workflow config from the batch that includes it
        if (result.form_config) setFormConfig(result.form_config);
        if (result.workflow_config) setWorkflowConfig(result.workflow_config);
      }
    } catch (error: unknown) {
      const axiosErr = error as { response?: { status?: number; data?: { message?: string } }; code?: string };
      const status = axiosErr?.response?.status;

      if (status === 504 || axiosErr?.code === 'ECONNABORTED') {
        setSynthesisError('Generation timed out. Try selecting fewer blocks.');
      } else if (status === 429) {
        setSynthesisError('Rate limit reached. Please wait and try again.');
      } else {
        setSynthesisError('Generation failed. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [workspaceId, planResult, synthesizeGenerate, buildFullDescription, pageId, hasFormBlock]);

  // Generate images for blocks that need them
  const generateImagesForBlocks = useCallback(async (blocks: SynthesisPageBlock[]): Promise<SynthesisPageBlock[]> => {
    const updatedBlocks = [...blocks];

    const colors = planResult?.design_system?.colors;
    const designStyle = planResult?.design_system?.style || style;
    const businessName = planResult?.brand?.business_name || 'business';

    // Build a safe color description for Titan (avoid hex codes which can be noisy)
    const styleDescMap: Record<string, string> = {
      professional: 'clean corporate design, muted blue and gray tones',
      bold: 'high contrast modern design, dark background with bright accents',
      minimal: 'minimalist white space design, soft neutral tones',
      playful: 'vibrant colorful design, warm friendly palette',
    };
    const styleDesc = styleDescMap[designStyle] || styleDescMap.professional;

    for (let i = 0; i < updatedBlocks.length; i++) {
      const block = updatedBlocks[i];

      if (block.type === 'hero' && !block.config.backgroundImage) {
        setImageProgress(`Generating hero background...`);
        try {
          const heroHeadline = (block.config.headline as string) || '';
          const heroSub = (block.config.subheadline as string) || '';
          const heroContext = [businessName, heroHeadline, heroSub].filter(Boolean).join(' — ');
          const result = await generateImage.mutateAsync({
            context: `Hero banner for: ${heroContext}. Style: ${styleDesc}. Abstract background, no text, no people.`,
            style: designStyle === 'playful' ? 'vibrant' : 'professional',
            colors: colors ? { primary: colors.primary, secondary: colors.secondary, accent: colors.accent } : undefined,
          });
          updatedBlocks[i] = {
            ...block,
            config: { ...block.config, backgroundType: 'image', backgroundImage: result.url },
          };
        } catch {
          // Hero image generation failed, skipping
        }
      }

      if (block.type === 'testimonials') {
        const allItems = (block.config.items as Array<{ quote: string; author: string; company: string; avatar?: string }>) || [];
        const items = allItems.slice(0, 3);
        const updatedItems = [];

        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          if (!item.avatar) {
            setImageProgress(`Generating avatar ${j + 1}/${items.length}...`);
            try {
              const result = await generateImage.mutateAsync({
                context: `Professional headshot portrait of ${item.author || 'a professional'}${item.company ? ` from ${item.company}` : ''}. Photorealistic corporate photography, clean background, well-lit, friendly expression.`,
                style: 'professional',
                width: 512,
                height: 512,
              });
              updatedItems.push({ ...item, avatar: result.url });
            } catch {
              updatedItems.push(item);
            }
          } else {
            updatedItems.push(item);
          }
        }

        updatedBlocks[i] = {
          ...block,
          config: { ...block.config, items: updatedItems },
        };
      }

      if (block.type === 'image' && !(block.config as { url?: string }).url) {
        setImageProgress(`Generating image...`);
        try {
          const caption = (block.config as { caption?: string }).caption || '';
          const alt = (block.config as { alt?: string }).alt || '';
          const imageContext = [businessName, caption, alt].filter(Boolean).join(' — ') || businessName;
          const result = await generateImage.mutateAsync({
            context: `Image for ${imageContext}. Style: ${styleDesc}. No text.`,
            style: designStyle === 'playful' ? 'vibrant' : 'professional',
            colors: colors ? { primary: colors.primary, secondary: colors.secondary, accent: colors.accent } : undefined,
          });
          updatedBlocks[i] = {
            ...block,
            config: { ...block.config, url: result.url },
          };
        } catch {
          // Image generation failed, skipping
        }
      }
    }

    setImageProgress('');
    return updatedBlocks;
  }, [generateImage, planResult, style]);

  // Handle apply (from generate step)
  const handleApply = useCallback(async () => {
    if (!planResult || generatedBlocks.length === 0) return;

    let finalBlocks = generatedBlocks;

    // Generate images if enabled
    if (generateImages && hasImageCapableBlocks) {
      setIsGeneratingImages(true);
      try {
        finalBlocks = await generateImagesForBlocks(finalBlocks);
      } finally {
        setIsGeneratingImages(false);
      }
    }

    // Convert to PageBlock format with layout fields
    const blocks: PageBlock[] = finalBlocks.map((block, index) => ({
      id: block.id,
      type: block.type as BlockType,
      config: block.config,
      order: index,
      width: (block.width || 4) as 1 | 2 | 3 | 4,
      row: block.row ?? index,
      colSpan: (block.colSpan ?? 12) as 4 | 6 | 8 | 12,
      colStart: block.colStart ?? 0,
    }));

    // Build a SynthesisResult-compatible object for onApply
    const synthesisResult: SynthesisResult = {
      synthesis_id: planResult.plan_id,
      intent: planResult.intent,
      assessment: planResult.assessment,
      design_system: planResult.design_system,
      blocks: finalBlocks,
      form_config: formConfig,
      workflow_config: workflowConfig,
      metadata: {
        blocks_included: finalBlocks.map(b => b.type),
        blocks_excluded: planResult.excluded,
        layout_decisions: {},
        content_sources: {},
        generation_stages: ['plan', 'generate'],
      },
      seo: planResult.seo,
      business_name: planResult.brand.business_name,
      tagline: planResult.brand.tagline,
    };

    onApply(blocks, synthesisResult, {
      createForm,
      createWorkflow,
      generateImages,
      formFields,
      workflowTrigger,
      workflowTags: workflowTags.split(',').map(t => t.trim()).filter(Boolean),
      notifyOwner,
      ownerEmail,
      sendWelcomeEmail,
    });
    onClose();
  }, [planResult, generatedBlocks, generateImages, hasImageCapableBlocks, generateImagesForBlocks, onApply, onClose, createForm, createWorkflow, formFields, workflowTrigger, workflowTags, notifyOwner, ownerEmail, sendWelcomeEmail, formConfig, workflowConfig]);

  // Available extra fields (not already added)
  const availableExtras = EXTRA_FIELD_PRESETS.filter(
    preset => !formFields.some(f => f.name === preset.name)
  );

  // Render creation options — only sections relevant to selected blocks
  const renderCreationOptions = () => {
    if (!hasCreationOptions) return null;

    return (
      <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Also create</h5>

        {/* Form option — only when form block is selected */}
        {hasFormBlock && (
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                createForm ? 'bg-indigo-600' : 'bg-gray-200 group-hover:bg-gray-300'
              }`}>
                {createForm && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <input
                type="checkbox"
                checked={createForm}
                onChange={(e) => setCreateForm(e.target.checked)}
                className="sr-only"
              />
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-sm text-gray-900">Lead Capture Form</span>
            </label>

            {createForm && (
              <div className="ml-7 pl-3 border-l-2 border-indigo-200 space-y-1.5">
                <div className="space-y-1">
                  {formFields.map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center justify-between px-2.5 py-1 bg-white rounded border border-gray-200 text-xs"
                    >
                      <span className="text-gray-700">
                        {field.label}
                        {field.required && <span className="text-red-400 ml-0.5">*</span>}
                        <span className="text-gray-400 ml-1.5">{field.type}</span>
                      </span>
                      <button
                        onClick={() => setFormFields(prev => prev.filter(f => f.name !== field.name))}
                        className="p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {availableExtras.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {availableExtras.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => setFormFields(prev => [...prev, preset])}
                        className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Workflow option — only when form or chat block is selected */}
        {(hasFormBlock || hasChatBlock) && (
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                createWorkflow ? 'bg-indigo-600' : 'bg-gray-200 group-hover:bg-gray-300'
              }`}>
                {createWorkflow && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <input
                type="checkbox"
                checked={createWorkflow}
                onChange={(e) => setCreateWorkflow(e.target.checked)}
                className="sr-only"
              />
              <Workflow className="w-3.5 h-3.5 text-green-600" />
              <span className="text-sm text-gray-900">Automation Workflow</span>
            </label>

            {createWorkflow && (
              <div className="ml-7 pl-3 border-l-2 border-green-200 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {WORKFLOW_TRIGGERS.map((trigger) => {
                    const isAvailable = !trigger.requiresBlock || plannedBlockTypes.includes(trigger.requiresBlock);
                    if (!isAvailable) return null;
                    return (
                      <button
                        key={trigger.value}
                        onClick={() => setWorkflowTrigger(trigger.value)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${
                          workflowTrigger === trigger.value
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {trigger.label}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  value={workflowTags}
                  onChange={(e) => setWorkflowTags(e.target.value)}
                  placeholder="Tags: lead, website"
                  className="w-full px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
                />

                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={sendWelcomeEmail} onChange={(e) => setSendWelcomeEmail(e.target.checked)} className="w-3.5 h-3.5 text-green-600 rounded focus:ring-green-500" />
                    <span className="text-xs text-gray-600">Welcome email</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={notifyOwner} onChange={(e) => setNotifyOwner(e.target.checked)} className="w-3.5 h-3.5 text-green-600 rounded focus:ring-green-500" />
                    <span className="text-xs text-gray-600">Notify me</span>
                  </label>
                </div>

                {notifyOwner && (
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Image generation option */}
        {hasImageCapableBlocks && (
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
              generateImages ? 'bg-indigo-600' : 'bg-gray-200 group-hover:bg-gray-300'
            }`}>
              {generateImages && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <input
              type="checkbox"
              checked={generateImages}
              onChange={(e) => setGenerateImages(e.target.checked)}
              className="sr-only"
            />
            <Image className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-sm text-gray-900">Generate AI Images</span>
          </label>
        )}
      </div>
    );
  };

  // Width label helper
  const widthLabel = (width: number) => {
    const labels: Record<number, string> = { 4: 'Full', 3: '2/3', 2: '1/2', 1: '1/3' };
    return labels[width] || `${width}/4`;
  };

  // Render Step 2: Plan Preview
  const renderPlanPreview = () => {
    if (!planResult) return null;

    return (
      <div className="space-y-4">
        {/* Brand Summary */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">
                {planResult.brand.business_name || 'Your Page'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                {planResult.brand.tagline || planResult.brand.narrative_theme || 'Ready to generate'}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>Goal: {planResult.intent.goal}</span>
                <span>Style: {planResult.design_system.style}</span>
                <span>Tone: {planResult.brand.tone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Method Injected Notice */}
        {planResult.contact_method_injected && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-600 mt-0.5" />
              <p className="text-sm text-green-800">
                {planResult.contact_method_injected}
              </p>
            </div>
          </div>
        )}

        {/* Planned Blocks */}
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-gray-700">Planned blocks</h5>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {planResult.block_plan.map((block, index) => (
              <div
                key={`${block.type}-${index}`}
                className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg"
              >
                <span className="w-5 h-5 flex items-center justify-center bg-gray-200 rounded text-xs font-medium text-gray-600">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-900 capitalize">
                  {getBlockLabel(block.type as BlockType)}
                </span>
                <span className="text-xs text-gray-400">{widthLabel(block.width)}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  block.content_source === 'profile'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {block.content_source}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Color Scheme */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Colors:</span>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: planResult.design_system.colors.primary }}
              title="Primary"
            />
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: planResult.design_system.colors.secondary }}
              title="Secondary"
            />
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: planResult.design_system.colors.accent }}
              title="Accent"
            />
          </div>
          <span className="text-xs text-gray-500 capitalize">
            {planResult.design_system.style} style
          </span>
        </div>

        {/* Excluded Blocks */}
        {Object.keys(planResult.excluded).length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Excluded blocks</p>
                <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
                  {Object.entries(planResult.excluded).slice(0, 5).map(([type, reason]) => (
                    <li key={type}>
                      <span className="font-medium">{type}</span>: {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Creation Options */}
        {renderCreationOptions()}
      </div>
    );
  };

  // Render Step 3: Generate with Progress
  const renderGenerateProgress = () => {
    const blockTypes = planResult?.block_plan.map(b => b.type) || [];
    const progressPct = blockTypes.length > 0
      ? Math.round((generateProgress.current / blockTypes.length) * 100)
      : 0;

    return (
      <div className="space-y-4">
        {/* Progress header */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              {isGenerating ? (
                <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5 text-purple-600" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">
                {isGenerating
                  ? `Generating ${generateProgress.current} of ${blockTypes.length}`
                  : `${generatedBlocks.length} blocks generated`
                }
              </h4>
              {/* Progress bar */}
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Block status list */}
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {blockTypes.map((type, index) => {
            const isCompleted = generateProgress.completed.includes(type);
            const isCurrent = !isCompleted && generateProgress.current === index && isGenerating;

            return (
              <div
                key={`${type}-${index}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  isCompleted ? 'bg-green-50' : isCurrent ? 'bg-purple-50' : 'bg-gray-50'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                )}
                <span className={`flex-1 text-sm capitalize ${
                  isCompleted ? 'text-green-800 font-medium' : 'text-gray-600'
                }`}>
                  {getBlockLabel(type as BlockType)}
                </span>
                {isCompleted && (
                  <span className="text-xs text-green-600">done</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Generated block previews */}
        {!isGenerating && generatedBlocks.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-sm font-medium text-gray-700">Generated Content</h5>
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {generatedBlocks.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg"
                >
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 capitalize">{block.type}</p>
                    {(block.config as { headline?: string }).headline && (
                      <p className="text-xs text-gray-500 truncate">
                        {(block.config as { headline: string }).headline}
                      </p>
                    )}
                    {(block.config as { title?: string }).title && !(block.config as { headline?: string }).headline && (
                      <p className="text-xs text-gray-500 truncate">
                        {(block.config as { title: string }).title}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {widthLabel(block.width || 4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Step titles
  const stepTitles: Record<Step, { title: string; subtitle: string }> = {
    input: { title: 'AI Synthesis', subtitle: 'Describe your page to generate content' },
    plan: { title: 'Plan Preview', subtitle: 'Review the plan before generating' },
    generate: { title: 'Generating Content', subtitle: isGenerating ? 'Creating blocks...' : 'Review and apply generated content' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {stepTitles[step].title}
              </h3>
              <p className="text-sm text-gray-500">
                {stepTitles[step].subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {step === 'input' && (
            <>
              {/* Profile Banner */}
              {profile?.business_name ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-indigo-900">
                      Using AI Profile: {profile.business_name}
                    </p>
                    <p className="text-xs text-indigo-600 mt-0.5">
                      {profile.brand_voice
                        ? `Brand voice: ${profile.brand_voice} · Style auto-selected`
                        : `Industry: ${profile.industry || 'Not set'} · Set brand voice in AI Profile for auto-styling`}
                    </p>
                  </div>
                  <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <Building2 className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-900">
                      No AI Profile found
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Complete your AI Profile for better content generation
                    </p>
                  </div>
                </div>
              )}

              {/* Selected Blocks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Blocks
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedBlockTypes.map((type) => (
                    <span
                      key={type}
                      className="px-3 py-1.5 bg-purple-100 text-purple-700 text-sm font-medium rounded-full"
                    >
                      {getBlockLabel(type)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Page Purpose */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What is this page for?
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'lead generation', label: 'Lead Generation' },
                    { value: 'portfolio / showcase', label: 'Portfolio' },
                    { value: 'product launch', label: 'Product Launch' },
                    { value: 'services', label: 'Services' },
                    { value: 'event / webinar', label: 'Event' },
                    { value: 'coming soon', label: 'Coming Soon' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPagePurpose(pagePurpose === option.value ? '' : option.value)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                        pagePurpose === option.value
                          ? 'bg-purple-100 border-purple-300 text-purple-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {profile?.business_name && (
                  <p className="text-xs text-gray-400 mt-1">Content will be generated from your AI profile for {profile.business_name}</p>
                )}
              </div>

              {/* Additional Context */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Any extra details? <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Focus on our new pricing plans, target small businesses, mention the free trial..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Style Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Style
                </label>
                <div className="flex gap-2">
                  {STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setStyle(option.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-center transition-all ${
                        style === option.value
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <span className="text-xs font-medium">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 'plan' && renderPlanPreview()}

          {step === 'generate' && renderGenerateProgress()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 bg-gray-50 border-t border-gray-100">
          {step === 'input' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePlan}
                disabled={synthesizePlan.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-purple-500/25"
              >
                {synthesizePlan.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Planning...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Plan Page
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}

          {step === 'plan' && (
            <>
              <button
                onClick={() => setStep('input')}
                className="flex items-center gap-1.5 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={synthesizeGenerate.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-purple-500/25"
              >
                <Sparkles className="w-4 h-4" />
                Generate
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'generate' && (
            <>
              <button
                onClick={() => {
                  setStep('plan');
                  setGeneratedBlocks([]);
                  setGenerateProgress({ current: 0, total: 0, completed: [] });
                }}
                disabled={isGenerating || isGeneratingImages}
                className="flex items-center gap-1.5 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Plan
              </button>
              <button
                onClick={handleApply}
                disabled={isGenerating || isGeneratingImages || generatedBlocks.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md shadow-purple-500/25 disabled:opacity-70"
              >
                {isGeneratingImages ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {imageProgress || 'Generating images...'}
                  </>
                ) : isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Apply to Page
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Error Display */}
        {(synthesizePlan.isError || synthesizeGenerate.isError || synthesisError) && (
          <div className="mx-5 mb-5 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              {synthesisError || 'Something went wrong. Please try again.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
