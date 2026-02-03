import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

// Business Profile types
export interface Product {
  name: string;
  description: string;
  price?: string;
  features?: string[];
  target_audience?: string;
}

export interface TeamMember {
  name: string;
  role: string;
  bio?: string;
  image_url?: string;
}

export interface Testimonial {
  quote: string;
  author_name: string;
  author_title?: string;
  company?: string;
  image_url?: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface BusinessProfile {
  id: string;
  workspace_id: string;
  page_id?: string;  // If set, this is a page-specific profile
  business_name: string;
  tagline: string;
  description: string;
  industry: string;
  business_type: string;
  target_audience: string;
  ideal_customer: string;
  customer_pain_points: string[];
  unique_value_proposition: string;
  key_benefits: string[];
  differentiators: string[];
  brand_voice: string;
  brand_values: string[];
  brand_personality: string;
  products: Product[];
  pricing_model: string;
  testimonials: Testimonial[];
  notable_clients: string[];
  achievements: string[];
  team_members: TeamMember[];
  founder_story: string;
  faqs: FAQ[];
  keywords: string[];
  contact_email: string;
  phone: string;
  address: string;
  website: string;
  social_links: Record<string, string>;
  ai_notes: string;
  conversation_history: Array<{ question: string; answer: string; timestamp: string }>;
  onboarding_completed: boolean;
  profile_score: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileInput {
  business_name?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  business_type?: string;
  target_audience?: string;
  ideal_customer?: string;
  customer_pain_points?: string[];
  unique_value_proposition?: string;
  key_benefits?: string[];
  differentiators?: string[];
  brand_voice?: string;
  brand_values?: string[];
  brand_personality?: string;
  products?: Product[];
  pricing_model?: string;
  testimonials?: Testimonial[];
  notable_clients?: string[];
  achievements?: string[];
  team_members?: TeamMember[];
  founder_story?: string;
  faqs?: FAQ[];
  keywords?: string[];
  contact_email?: string;
  phone?: string;
  address?: string;
  website?: string;
  social_links?: Record<string, string>;
  ai_notes?: string;
  onboarding_completed?: boolean;
}

// Onboarding types
export interface OnboardingQuestion {
  question: string;
  field: string;
  input_type: 'text' | 'textarea' | 'select';
  options?: string[];
  placeholder?: string;
  is_complete: boolean;
  progress: number;
}

// Block improvement types
export interface ImproveBlockInput {
  block_type: string;
  config: Record<string, unknown>;
  page_context?: {
    headline?: string;
    subheadline?: string;
    other_blocks?: string[];
  };
  instruction?: string;
  page_id?: string;  // Page-specific profile
}

// Block generation types
export interface GenerateBlocksInput {
  description: string;
  style?: 'professional' | 'bold' | 'minimal' | 'playful';
  include_form?: boolean;
  include_chat?: boolean;
  page_id?: string;  // Page-specific profile
}

// Image generation types
export interface GenerateImageInput {
  context?: string;
  prompt?: string;
  style?: string;
  width?: number;
  height?: number;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}

// Workflow generation types
export interface GenerateWorkflowInput {
  description: string;
}

export interface GeneratedWorkflow {
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    position: { x: number; y: number };
    config: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

// Page content generation types (for wizard)
export interface GeneratePageContentInput {
  business_description: string;
  page_id?: string;
}

export interface GeneratedPageContent {
  business_info: {
    business_name: string;
    business_type: string;
    industry: string;
    products: string[];
    audience: string;
    tone: string;
  };
  content: {
    headlines: string[];
    tagline: string;
    value_props: string[];
    features: Array<{ title: string; description: string; icon: string }>;
    testimonial_concepts: string[];
    faq: Array<{ q: string; a: string }>;
    cta_text: string;
    hero_subheadline: string;
    social_proof?: string;
  };
  suggested_colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface RefinePageContentInput {
  current_content: GeneratedPageContent;
  feedback: string;
  section?: string;
  page_id?: string;
}

// ==================== SYNTHESIS ENGINE TYPES ====================

export interface SynthesizePageInput {
  description: string;
  intent_hints?: string[];
  style_preference?: 'professional' | 'bold' | 'minimal' | 'playful';
  page_id?: string;
  include_form?: boolean;
  include_chat?: boolean;
  block_types?: string[];  // Only generate these block types
}

export interface PageIntent {
  goal: 'lead-gen' | 'portfolio' | 'product-launch' | 'services' | 'coming-soon' | 'event' | 'comparison';
  audience_intent: string;
  content_type: string;
  urgency: 'low' | 'medium' | 'high';
  keywords: string[];
}

export interface ContentAssessment {
  testimonials_score: number;
  testimonials_real: boolean;
  testimonials_count: number;
  stats_score: number;
  stats_real: boolean;
  stats_items: Array<{ value: string; label: string; source?: string }>;
  features_score: number;
  features_count: number;
  pricing_available: boolean;
  faq_score: number;
  faq_count: number;
  gaps: string[];
  strengths: string[];
}

export interface SynthesisColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface SynthesisDesignSystem {
  colors: SynthesisColorScheme;
  style: 'professional' | 'bold' | 'minimal' | 'playful';
  rationale: string;
}

export interface SynthesisPageBlock {
  id: string;
  type: string;
  order: number;
  width: number;
  config: Record<string, unknown>;
}

export interface SynthesisFormConfig {
  name: string;
  fields: Array<Record<string, unknown>>;
  submit_button_text: string;
  success_message: string;
  add_tags: string[];
}

export interface SynthesisWorkflowConfig {
  name: string;
  trigger_type?: string;
  send_welcome_email: boolean;
  notify_owner: boolean;
  owner_email?: string;
  welcome_message?: string;
  add_tags: string[];
}

export interface SynthesisMetadata {
  blocks_included: string[];
  blocks_excluded: Record<string, string>;
  layout_decisions: Record<string, unknown>;
  content_sources: Record<string, string>;
  generation_stages: string[];
}

export interface SynthesisSeoConfig {
  meta_title: string;
  meta_description: string;
  og_image_url?: string;
}

export interface SynthesisResult {
  synthesis_id: string;
  intent: PageIntent;
  assessment: ContentAssessment;
  design_system: SynthesisDesignSystem;
  blocks: SynthesisPageBlock[];
  form_config: SynthesisFormConfig | null;
  workflow_config: SynthesisWorkflowConfig | null;
  metadata: SynthesisMetadata;
  seo: SynthesisSeoConfig;
  business_name: string;
  tagline: string;
}

// Automation config for complete page creation
export interface AutomationConfig {
  send_welcome_email: boolean;
  notify_owner: boolean;
  owner_email?: string;
  welcome_message?: string;
  add_tags: string[];
}

// Synthesized block input for create-complete endpoint
export interface SynthesizedBlockInput {
  id: string;
  type: string;
  order: number;
  width: number;
  config: Record<string, unknown>;
}

// Create complete page types
export interface CreateCompletePageInput {
  // name/slug optional when updating existing page (page_id provided)
  name?: string;
  slug?: string;
  subdomain?: string;
  // Update mode: if provided, update this page instead of creating new
  page_id?: string;
  content: GeneratedPageContent;
  style: 'professional' | 'bold' | 'minimal' | 'playful';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  include_form: boolean;
  include_chat: boolean;
  automation: AutomationConfig;
  replace_existing?: boolean;  // If true, replace existing page with same slug (create mode only)

  // NEW: Synthesis engine outputs (when using synthesis engine)
  synthesized_blocks?: SynthesizedBlockInput[];  // Pre-built blocks from synthesis engine
  synthesized_form_config?: SynthesisFormConfig;  // Form config from synthesis
  synthesized_workflow_config?: SynthesisWorkflowConfig;  // Workflow config from synthesis
  business_name?: string;  // Business name from synthesis
}

export interface CompletePageResult {
  page: { id: string; name: string; slug: string; [key: string]: unknown };
  form: Record<string, unknown> | null;
  workflow: Record<string, unknown> | null;
  updated?: boolean;  // True if this was an update, not create
}

// ==================== HOOKS ====================

// Fetch business profile (workspace-level or page-specific)
export function useBusinessProfile(workspaceId: string | undefined, pageId?: string) {
  return useQuery({
    queryKey: ['businessProfile', workspaceId, pageId],
    queryFn: async () => {
      const params = pageId ? `?page_id=${pageId}` : '';
      const { data } = await api.get<BusinessProfile>(
        `/workspaces/${workspaceId}/ai/profile${params}`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

// Update business profile (workspace-level or page-specific)
export function useUpdateBusinessProfile(workspaceId: string, pageId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const params = pageId ? `?page_id=${pageId}` : '';
      const { data } = await api.put<BusinessProfile>(
        `/workspaces/${workspaceId}/ai/profile${params}`,
        input
      );
      return data;
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(['businessProfile', workspaceId, pageId], updatedProfile);
    },
  });
}

// Analyze content for profile extraction
export function useAnalyzeContent(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { content: string; auto_update?: boolean; page_id?: string }) => {
      const { data } = await api.post<{
        extracted: Partial<BusinessProfile>;
        profile?: BusinessProfile;
      }>(`/workspaces/${workspaceId}/ai/profile/analyze`, input);
      return data;
    },
    onSuccess: (result, variables) => {
      if (result.profile) {
        queryClient.setQueryData(['businessProfile', workspaceId, variables.page_id], result.profile);
      }
    },
  });
}

// Get onboarding question
export function useOnboardingQuestion(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['onboardingQuestion', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<OnboardingQuestion>(
        `/workspaces/${workspaceId}/ai/onboarding/question`
      );
      return data;
    },
    enabled: !!workspaceId,
    refetchOnWindowFocus: false,
  });
}

// Submit onboarding answer
export function useSubmitOnboardingAnswer(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      question: string;
      answer: string;
      field?: string;
      mark_complete?: boolean;
    }) => {
      const { data } = await api.post<{
        profile: BusinessProfile;
        is_complete: boolean;
      }>(`/workspaces/${workspaceId}/ai/onboarding/answer`, input);
      return data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['businessProfile', workspaceId], result.profile);
      // Invalidate to get next question
      queryClient.invalidateQueries({ queryKey: ['onboardingQuestion', workspaceId] });
    },
  });
}

// Improve block content
export function useImproveBlock(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: ImproveBlockInput) => {
      const { data } = await api.post<{ config: Record<string, unknown> }>(
        `/workspaces/${workspaceId}/ai/improve-block`,
        input
      );
      return data.config;
    },
  });
}

// Generate blocks from description
export function useGenerateBlocks(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: GenerateBlocksInput) => {
      const { data } = await api.post<{ blocks: Array<Record<string, unknown>> }>(
        `/workspaces/${workspaceId}/ai/generate-blocks`,
        input
      );
      return data.blocks;
    },
  });
}

// Generate image
export function useGenerateImage(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: GenerateImageInput) => {
      const { data } = await api.post<GeneratedImage>(
        `/workspaces/${workspaceId}/ai/generate-image`,
        input
      );
      return data;
    },
  });
}

// Generate workflow from description
export function useGenerateWorkflow(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: GenerateWorkflowInput) => {
      const { data } = await api.post<{ workflow: GeneratedWorkflow }>(
        `/workspaces/${workspaceId}/ai/generate-workflow`,
        input
      );
      return data.workflow;
    },
  });
}

// Generate page content from business description (for wizard)
export function useGeneratePageContent(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: GeneratePageContentInput) => {
      const { data } = await api.post<GeneratedPageContent>(
        `/workspaces/${workspaceId}/ai/generate-page-content`,
        input
      );
      return data;
    },
  });
}

// Refine previously generated content with feedback
export function useRefinePageContent(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: RefinePageContentInput) => {
      const { data } = await api.post<GeneratedPageContent>(
        `/workspaces/${workspaceId}/ai/refine-page-content`,
        input
      );
      return data;
    },
  });
}

// Create or update complete page package (page + form + workflow)
export function useCreateCompletePage(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCompletePageInput) => {
      const { data } = await api.post<CompletePageResult>(
        `/workspaces/${workspaceId}/pages/create-complete`,
        input
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate pages list
      queryClient.invalidateQueries({ queryKey: ['pages', workspaceId] });
      // If updating existing page, invalidate that page's query too
      if (variables.page_id) {
        queryClient.invalidateQueries({ queryKey: ['page', workspaceId, variables.page_id] });
        // Also invalidate forms and workflows for the page
        queryClient.invalidateQueries({ queryKey: ['pageForms', workspaceId, variables.page_id] });
        queryClient.invalidateQueries({ queryKey: ['pageWorkflows', workspaceId, variables.page_id] });
      }
    },
  });
}

// Synthesize a complete page using the unified synthesis engine
export function useSynthesizePage(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: SynthesizePageInput) => {
      const { data } = await api.post<SynthesisResult>(
        `/workspaces/${workspaceId}/ai/synthesize-page`,
        input
      );
      return data;
    },
  });
}

// Industry options for dropdowns
export const INDUSTRY_OPTIONS = [
  { value: 'technology', label: 'Technology' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance' },
  { value: 'education', label: 'Education' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'creative', label: 'Creative / Design' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'retail', label: 'Retail' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'nonprofit', label: 'Non-profit' },
  { value: 'other', label: 'Other' },
];

export const BUSINESS_TYPE_OPTIONS = [
  { value: 'saas', label: 'SaaS / Software' },
  { value: 'agency', label: 'Agency' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'ecommerce_store', label: 'E-commerce Store' },
  { value: 'local_business', label: 'Local Business' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'coach', label: 'Coach / Trainer' },
  { value: 'creator', label: 'Creator / Influencer' },
  { value: 'nonprofit', label: 'Non-profit' },
  { value: 'other', label: 'Other' },
];

export const BRAND_VOICE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'bold', label: 'Bold' },
  { value: 'playful', label: 'Playful' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'casual', label: 'Casual' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'technical', label: 'Technical' },
];
