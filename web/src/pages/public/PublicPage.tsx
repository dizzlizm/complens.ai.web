import { useParams, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { usePublicPage } from '../../lib/hooks/usePublicPage';
import PublicForm from '../../components/public/PublicForm';
import ChatWidget from '../../components/public/ChatWidget';
import PublicBlockRenderer from '../../components/public/PublicBlockRenderer';
import type { PageBlock } from '../../components/page-builder/types';

// Configure DOMPurify to allow safe HTML for rich landing pages
DOMPurify.addHook('uponSanitizeElement', (_node, data) => {
  // Allow SVG elements for icons
  if (data.tagName === 'svg' || data.tagName === 'path' || data.tagName === 'circle' ||
      data.tagName === 'rect' || data.tagName === 'line' || data.tagName === 'polyline' ||
      data.tagName === 'polygon' || data.tagName === 'g') {
    return;
  }
});

// Validate hex color format
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Sanitize CSS - only allow safe properties
function sanitizeCSS(css: string): string {
  // Remove any JavaScript-related patterns
  const dangerous = /(javascript|expression|url\s*\(|@import|behavior|binding)/gi;
  return css.replace(dangerous, '');
}

// DOMPurify config for rich HTML
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'strong', 'em', 'b', 'i', 'u',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'img', 'figure', 'figcaption', 'picture', 'source',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'pre', 'code', 'br', 'hr',
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'clipPath', 'use',
    'button', 'form', 'input', 'label', 'textarea', 'select', 'option',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
    'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform',
    'xmlns', 'aria-hidden', 'role', 'aria-label',
    'type', 'name', 'value', 'placeholder', 'disabled', 'readonly', 'required',
    'loading', 'decoding', 'srcset', 'sizes',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_TAGS: ['svg', 'path', 'g'],
  ADD_ATTR: ['viewBox', 'd', 'fill', 'stroke'],
};

export default function PublicPage() {
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('ws');

  const { data: page, isLoading, error } = usePublicPage(pageSlug || '', workspaceId);

  // Set document title
  if (page?.meta_title) {
    document.title = page.meta_title;
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Page Not Found
          </h1>
          <p className="text-gray-600">
            This page requires a workspace ID. Please check the URL.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Page Not Found
          </h1>
          <p className="text-gray-600">
            The page you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  // Sanitize color - fallback to default if invalid
  const safeColor = isValidHexColor(page.primary_color) ? page.primary_color : '#6366f1';

  // Check if page has blocks (new visual builder format)
  const hasBlocks = page.blocks && Array.isArray(page.blocks) && page.blocks.length > 0;

  // Check if body_content has rich HTML (sections, divs with classes)
  const hasRichContent = page.body_content && (
    page.body_content.includes('<section') ||
    page.body_content.includes('class="') ||
    page.body_content.includes('grid')
  );

  // Generate CSS variables for the primary color shades
  const colorStyles = `
    /* Primary color palette */
    .bg-primary-100 { background-color: ${adjustColor(safeColor, 180)}; }
    .bg-primary-200 { background-color: ${adjustColor(safeColor, 140)}; }
    .bg-primary-400 { background-color: ${adjustColor(safeColor, 40)}; }
    .bg-primary-500 { background-color: ${adjustColor(safeColor, 20)}; }
    .bg-primary-600 { background-color: ${safeColor}; }
    .bg-primary-700 { background-color: ${adjustColor(safeColor, -20)}; }
    .bg-primary-800 { background-color: ${adjustColor(safeColor, -40)}; }

    .text-primary-400 { color: ${adjustColor(safeColor, 40)}; }
    .text-primary-500 { color: ${adjustColor(safeColor, 20)}; }
    .text-primary-600 { color: ${safeColor}; }
    .text-primary-700 { color: ${adjustColor(safeColor, -20)}; }

    .border-primary-500 { border-color: ${adjustColor(safeColor, 20)}; }
    .border-primary-600 { border-color: ${safeColor}; }

    /* Gradient utilities */
    .from-primary-100 { --tw-gradient-from: ${adjustColor(safeColor, 180)}; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
    .from-primary-200 { --tw-gradient-from: ${adjustColor(safeColor, 140)}; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
    .from-primary-500 { --tw-gradient-from: ${adjustColor(safeColor, 20)}; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
    .from-primary-600 { --tw-gradient-from: ${safeColor}; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }
    .to-primary-200 { --tw-gradient-to: ${adjustColor(safeColor, 140)}; }
    .to-primary-600 { --tw-gradient-to: ${safeColor}; }
    .to-primary-700 { --tw-gradient-to: ${adjustColor(safeColor, -20)}; }
    .to-primary-800 { --tw-gradient-to: ${adjustColor(safeColor, -40)}; }
    .via-primary-700 { --tw-gradient-via: ${adjustColor(safeColor, -20)}; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-via), var(--tw-gradient-to); }

    /* Hover states */
    .hover\\:bg-primary-700:hover { background-color: ${adjustColor(safeColor, -20)}; }
    .hover\\:text-primary-600:hover { color: ${safeColor}; }
    .hover\\:border-primary-600:hover { border-color: ${safeColor}; }

    /* Focus/ring states */
    .ring-primary-500 { --tw-ring-color: ${adjustColor(safeColor, 20)}; }
    .focus\\:ring-primary-500:focus { --tw-ring-color: ${adjustColor(safeColor, 20)}; }

    /* Button/link styles for generated content */
    .page-content a[href="#contact"] {
      transition: all 0.2s ease;
    }
    .page-content a[href="#contact"]:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
    }
  `;

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={
        {
          '--primary-color': safeColor,
        } as React.CSSProperties
      }
    >
      {/* Dynamic color styles */}
      <style>{colorStyles}</style>

      {/* Custom CSS injection - sanitized */}
      {page.custom_css && <style>{sanitizeCSS(page.custom_css)}</style>}

      {/* Render content based on format: blocks > rich HTML > simple content */}
      {hasBlocks ? (
        // New visual builder format - render blocks
        <PublicBlockRenderer
          blocks={page.blocks as PageBlock[]}
          primaryColor={safeColor}
          workspaceId={workspaceId}
          pageId={page.id}
        />
      ) : hasRichContent ? (
        // Legacy rich HTML content
        <div
          className="page-content"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(page.body_content || '', SANITIZE_CONFIG) }}
        />
      ) : (
        // Simple fallback layout
        <>
          {/* Simple Hero Section for non-rich content */}
          <section
            className="relative py-20 px-4"
            style={{
              background: page.hero_image_url
                ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${encodeURI(page.hero_image_url)}) center/cover`
                : `linear-gradient(135deg, ${safeColor}, ${adjustColor(safeColor, -30)})`,
            }}
          >
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
                {page.headline}
              </h1>
              {page.subheadline && (
                <p className="text-xl text-white/90 max-w-2xl mx-auto">
                  {page.subheadline}
                </p>
              )}
            </div>
          </section>

          {/* Simple Body Content */}
          {page.body_content && (
            <section className="py-12 px-4">
              <div
                className="max-w-3xl mx-auto prose prose-lg"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(page.body_content, SANITIZE_CONFIG) }}
              />
            </section>
          )}
        </>
      )}

      {/* Forms Section - only render if NOT using blocks (blocks have forms embedded) */}
      {!hasBlocks && page.form_ids && page.form_ids.length > 0 && (
        <section className="py-12 px-4 bg-gray-50">
          <div className="max-w-xl mx-auto">
            {page.form_ids.map((formId) => (
              <div key={formId} className="bg-white rounded-lg shadow-lg p-6">
                <PublicForm
                  formId={formId}
                  workspaceId={workspaceId}
                  pageId={page.id}
                  primaryColor={page.primary_color}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 px-4 text-center text-gray-500 text-sm">
        <p>
          Powered by{' '}
          <a
            href="https://complens.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: page.primary_color }}
          >
            Complens.ai
          </a>
        </p>
      </footer>

      {/* Chat Widget */}
      {page.chat_config?.enabled && (
        <ChatWidget
          pageId={page.id}
          workspaceId={workspaceId}
          config={page.chat_config}
          primaryColor={page.primary_color}
        />
      )}
    </div>
  );
}

// Utility to darken/lighten a hex color
function adjustColor(hex: string, amount: number): string {
  const color = hex.replace('#', '');
  const num = parseInt(color, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
