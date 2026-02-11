"""Page templates with AI-generated copy.

Shorter, high-impact templates with just 3 sections:
1. Hero - The hook
2. Features - The value
3. CTA - The action
"""

import html as html_module
import json
import re

from complens.utils.css_sanitizer import sanitize_css

TEMPLATES = {
    "professional": {
        "name": "Professional",
        "description": "Clean, modern design for businesses and consultants",
        "preview_color": "#6366f1",
        "html": '''<section class="min-h-screen flex items-center relative bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white px-6 overflow-hidden">
<div class="absolute inset-0 opacity-30" style="background-image: radial-gradient(circle at 20% 20%, rgba(99,102,241,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(139,92,246,0.4) 0%, transparent 40%);"></div>
<div class="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
<div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
<div class="relative max-w-5xl mx-auto text-center py-20">
<p class="text-indigo-400 font-semibold tracking-widest uppercase mb-8 text-sm animate-fade-in">{{tagline}}</p>
<h1 class="text-5xl md:text-7xl lg:text-8xl font-black mb-10 leading-[0.9] bg-gradient-to-r from-white via-indigo-100 to-white bg-clip-text text-transparent">{{headline}}</h1>
<p class="text-xl md:text-2xl text-slate-300 mb-14 max-w-2xl mx-auto leading-relaxed font-light">{{subheadline}}</p>
<a href="#contact" class="inline-flex items-center gap-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-10 py-5 rounded-full font-bold text-lg shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transform hover:-translate-y-1 hover:scale-105 transition-all duration-300">{{cta_text}} <span class="text-xl">→</span></a>
</div>
</section>

<section class="py-32 px-6 bg-white">
<div class="max-w-6xl mx-auto">
<div class="grid md:grid-cols-3 gap-8 lg:gap-12">
<div class="group relative bg-gradient-to-br from-slate-50 to-white p-10 rounded-3xl border border-slate-100 hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500">
<div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
<div class="relative">
<div class="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-4xl mb-8 shadow-xl shadow-indigo-500/25 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">{{feature_1_icon}}</div>
<h3 class="text-2xl font-bold text-slate-900 mb-4">{{feature_1_title}}</h3>
<p class="text-slate-600 leading-relaxed text-lg">{{feature_1_description}}</p>
</div>
</div>
<div class="group relative bg-gradient-to-br from-slate-50 to-white p-10 rounded-3xl border border-slate-100 hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 md:translate-y-8">
<div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
<div class="relative">
<div class="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-4xl mb-8 shadow-xl shadow-indigo-500/25 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">{{feature_2_icon}}</div>
<h3 class="text-2xl font-bold text-slate-900 mb-4">{{feature_2_title}}</h3>
<p class="text-slate-600 leading-relaxed text-lg">{{feature_2_description}}</p>
</div>
</div>
<div class="group relative bg-gradient-to-br from-slate-50 to-white p-10 rounded-3xl border border-slate-100 hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500">
<div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
<div class="relative">
<div class="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-4xl mb-8 shadow-xl shadow-indigo-500/25 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">{{feature_3_icon}}</div>
<h3 class="text-2xl font-bold text-slate-900 mb-4">{{feature_3_title}}</h3>
<p class="text-slate-600 leading-relaxed text-lg">{{feature_3_description}}</p>
</div>
</div>
</div>
</div>
</section>

<section id="contact" class="py-32 px-6 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 text-white relative overflow-hidden">
<div class="absolute inset-0 opacity-30" style="background-image: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.2) 0%, transparent 50%);"></div>
<div class="relative max-w-3xl mx-auto text-center">
<h2 class="text-4xl md:text-6xl font-black mb-8 leading-tight">{{cta_headline}}</h2>
<p class="text-xl text-indigo-100 mb-12 max-w-xl mx-auto">{{cta_subheadline}}</p>
<a href="#form" class="inline-flex items-center gap-3 bg-white text-indigo-600 px-10 py-5 rounded-full font-bold text-lg shadow-2xl hover:shadow-white/30 transform hover:-translate-y-1 transition-all duration-300">{{cta_text}} <span class="text-xl">→</span></a>
</div>
</section>''',
    },

    "bold": {
        "name": "Bold & Modern",
        "description": "High-impact design with strong visuals",
        "preview_color": "#f59e0b",
        "html": '''<section class="min-h-screen flex items-center relative bg-black text-white px-6 overflow-hidden">
<div class="absolute inset-0" style="background: linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(239,68,68,0.15) 50%, rgba(139,92,246,0.15) 100%);"></div>
<div class="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-amber-500/20 to-transparent"></div>
<div class="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-black to-transparent"></div>
<div class="relative max-w-6xl mx-auto py-20">
<p class="text-amber-400 font-black tracking-widest uppercase mb-8 text-sm">{{tagline}}</p>
<h1 class="text-6xl md:text-8xl lg:text-9xl font-black mb-10 leading-[0.85] max-w-4xl">{{headline}}</h1>
<p class="text-xl md:text-2xl text-gray-400 mb-14 max-w-xl leading-relaxed">{{subheadline}}</p>
<a href="#contact" class="inline-block bg-amber-500 text-black px-14 py-6 font-black text-lg uppercase tracking-wider hover:bg-white transition-all duration-300 hover:tracking-widest">{{cta_text}}</a>
</div>
</section>

<section class="py-32 px-6 bg-zinc-950 text-white">
<div class="max-w-6xl mx-auto">
<div class="grid md:grid-cols-3 gap-0.5">
<div class="bg-zinc-900 p-12 hover:bg-zinc-800 transition-all duration-500 group relative overflow-hidden">
<div class="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
<div class="relative">
<div class="text-6xl mb-8 transform group-hover:scale-125 transition-transform duration-300">{{feature_1_icon}}</div>
<h3 class="text-2xl font-black mb-4 group-hover:text-amber-400 transition-colors duration-300">{{feature_1_title}}</h3>
<p class="text-zinc-400 text-lg leading-relaxed">{{feature_1_description}}</p>
</div>
</div>
<div class="bg-zinc-900 p-12 hover:bg-zinc-800 transition-all duration-500 group relative overflow-hidden">
<div class="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
<div class="relative">
<div class="text-6xl mb-8 transform group-hover:scale-125 transition-transform duration-300">{{feature_2_icon}}</div>
<h3 class="text-2xl font-black mb-4 group-hover:text-amber-400 transition-colors duration-300">{{feature_2_title}}</h3>
<p class="text-zinc-400 text-lg leading-relaxed">{{feature_2_description}}</p>
</div>
</div>
<div class="bg-zinc-900 p-12 hover:bg-zinc-800 transition-all duration-500 group relative overflow-hidden">
<div class="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
<div class="relative">
<div class="text-6xl mb-8 transform group-hover:scale-125 transition-transform duration-300">{{feature_3_icon}}</div>
<h3 class="text-2xl font-black mb-4 group-hover:text-amber-400 transition-colors duration-300">{{feature_3_title}}</h3>
<p class="text-zinc-400 text-lg leading-relaxed">{{feature_3_description}}</p>
</div>
</div>
</div>
</div>
</section>

<section id="contact" class="py-32 px-6 bg-amber-500 text-black relative overflow-hidden">
<div class="absolute inset-0 opacity-20" style="background-image: repeating-linear-gradient(90deg, transparent, transparent 100px, rgba(0,0,0,0.03) 100px, rgba(0,0,0,0.03) 200px);"></div>
<div class="relative max-w-4xl mx-auto text-center">
<h2 class="text-5xl md:text-7xl font-black mb-8 leading-tight">{{cta_headline}}</h2>
<p class="text-xl text-amber-900 mb-12 max-w-xl mx-auto">{{cta_subheadline}}</p>
<a href="#form" class="inline-block bg-black text-white px-14 py-6 font-black text-lg uppercase tracking-wider hover:bg-zinc-800 transition-all duration-300">{{cta_text}}</a>
</div>
</section>''',
    },

    "minimal": {
        "name": "Clean Minimal",
        "description": "Simple, elegant, content-focused",
        "preview_color": "#0ea5e9",
        "html": '''<section class="min-h-screen flex items-center px-6 bg-white">
<div class="max-w-4xl mx-auto text-center py-20">
<p class="text-sky-600 font-medium tracking-wide mb-10">{{tagline}}</p>
<h1 class="text-5xl md:text-7xl font-semibold text-gray-900 mb-10 leading-[1.1]">{{headline}}</h1>
<p class="text-xl text-gray-500 mb-14 max-w-xl mx-auto leading-relaxed">{{subheadline}}</p>
<a href="#contact" class="inline-flex items-center gap-3 border-2 border-gray-900 text-gray-900 px-10 py-5 font-medium text-lg hover:bg-gray-900 hover:text-white transition-all duration-300 group"><span>{{cta_text}}</span> <span class="transform group-hover:translate-x-1 transition-transform">→</span></a>
</div>
</section>

<section class="py-32 px-6 bg-gray-50">
<div class="max-w-5xl mx-auto">
<div class="grid md:grid-cols-3 gap-16">
<div class="text-center group">
<div class="text-5xl mb-8 transform group-hover:scale-110 transition-transform duration-300">{{feature_1_icon}}</div>
<h3 class="text-xl font-semibold text-gray-900 mb-4">{{feature_1_title}}</h3>
<p class="text-gray-500 leading-relaxed">{{feature_1_description}}</p>
</div>
<div class="text-center group">
<div class="text-5xl mb-8 transform group-hover:scale-110 transition-transform duration-300">{{feature_2_icon}}</div>
<h3 class="text-xl font-semibold text-gray-900 mb-4">{{feature_2_title}}</h3>
<p class="text-gray-500 leading-relaxed">{{feature_2_description}}</p>
</div>
<div class="text-center group">
<div class="text-5xl mb-8 transform group-hover:scale-110 transition-transform duration-300">{{feature_3_icon}}</div>
<h3 class="text-xl font-semibold text-gray-900 mb-4">{{feature_3_title}}</h3>
<p class="text-gray-500 leading-relaxed">{{feature_3_description}}</p>
</div>
</div>
</div>
</section>

<section id="contact" class="py-32 px-6 bg-gray-900 text-white">
<div class="max-w-3xl mx-auto text-center">
<h2 class="text-4xl md:text-5xl font-semibold mb-8 leading-tight">{{cta_headline}}</h2>
<p class="text-gray-400 text-lg mb-12 max-w-md mx-auto">{{cta_subheadline}}</p>
<a href="#form" class="inline-flex items-center gap-3 border-2 border-white text-white px-10 py-5 font-medium text-lg hover:bg-white hover:text-gray-900 transition-all duration-300 group"><span>{{cta_text}}</span> <span class="transform group-hover:translate-x-1 transition-transform">→</span></a>
</div>
</section>''',
    },
}


def get_template(template_id: str) -> dict | None:
    """Get a template by ID."""
    return TEMPLATES.get(template_id)


def list_templates() -> list[dict]:
    """List all available templates."""
    return [
        {"id": k, "name": v["name"], "description": v["description"], "preview_color": v["preview_color"]}
        for k, v in TEMPLATES.items()
    ]


def _escape_html(value: str | None) -> str:
    """Escape a value for safe HTML insertion.

    Args:
        value: Value to escape.

    Returns:
        HTML-escaped string.
    """
    if value is None:
        return ""
    return html_module.escape(str(value))


def fill_template(template_id: str, content: dict) -> str:
    """Fill a template with content."""
    template = TEMPLATES.get(template_id)
    if not template:
        return ""

    html = template["html"]

    # Replace all placeholders with escaped content
    for key, value in content.items():
        placeholder = "{{" + key + "}}"
        html = html.replace(placeholder, _escape_html(value))

    return html


# Simplified content schema - just 3 sections
CONTENT_SCHEMA = {
    "tagline": "Short tagline (2-4 words)",
    "headline": "Main headline (3-8 words, punchy)",
    "subheadline": "Supporting text (15-25 words)",
    "cta_text": "Call to action button text (2-4 words)",
    "feature_1_icon": "Single emoji",
    "feature_1_title": "Feature title (2-4 words)",
    "feature_1_description": "Feature description (15-25 words)",
    "feature_2_icon": "Single emoji",
    "feature_2_title": "Feature title (2-4 words)",
    "feature_2_description": "Feature description (15-25 words)",
    "feature_3_icon": "Single emoji",
    "feature_3_title": "Feature title (2-4 words)",
    "feature_3_description": "Feature description (15-25 words)",
    "cta_headline": "Final CTA headline (3-6 words)",
    "cta_subheadline": "CTA supporting text (10-20 words)",
}


def render_block_html(
    block: dict,
    primary_color: str = "#6366f1",
    forms: list[dict] | None = None,
    workspace_id: str = "",
) -> str:
    """Render a single block to HTML.

    Args:
        block: Block data (id, type, config, order).
        primary_color: Primary color for styling.
        forms: List of form dicts for rendering form blocks.
        workspace_id: Workspace ID for form blocks.

    Returns:
        HTML string for the block.
    """
    block_type = block.get("type", "")
    config = block.get("config", {})

    if block_type == "hero":
        return _render_hero_block(config, primary_color)
    elif block_type == "features":
        return _render_features_block(config)
    elif block_type == "cta":
        return _render_cta_block(config, primary_color)
    elif block_type == "testimonials":
        return _render_testimonials_block(config)
    elif block_type == "faq":
        return _render_faq_block(config)
    elif block_type == "text":
        return _render_text_block(config)
    elif block_type == "image":
        return _render_image_block(config)
    elif block_type == "video":
        return _render_video_block(config)
    elif block_type == "stats":
        return _render_stats_block(config, primary_color)
    elif block_type == "divider":
        return _render_divider_block(config)
    elif block_type == "pricing":
        return _render_pricing_block(config, primary_color)
    elif block_type == "form":
        return _render_form_block(config, primary_color, forms, workspace_id)
    else:
        return f'<!-- Unknown block type: {block_type} -->'


def _render_form_block(
    config: dict,
    primary_color: str,
    forms: list[dict] | None,
    workspace_id: str,
) -> str:
    """Render a form block by finding and rendering the referenced form.

    Args:
        config: Block config containing formId.
        primary_color: Primary color for styling.
        forms: List of available forms.
        workspace_id: Workspace ID for form submission.

    Returns:
        HTML string for the form block.
    """
    form_id = config.get("formId", "")
    if not form_id or not forms:
        return '<!-- Form block: no form configured -->'

    # Find the matching form
    form = next((f for f in forms if f.get("id") == form_id), None)
    if not form:
        return f'<!-- Form block: form {_escape_html(form_id)} not found -->'

    # Render the form
    return render_form_html(form, workspace_id, primary_color)


def _sanitize_url(url: str | None) -> str:
    """Sanitize a URL to prevent XSS via javascript: protocol.

    Args:
        url: URL to sanitize.

    Returns:
        Sanitized URL or '#' if invalid.
    """
    if not url:
        return "#"
    url = str(url).strip()
    # Block javascript: and data: protocols
    lower_url = url.lower()
    if lower_url.startswith(("javascript:", "data:", "vbscript:")):
        return "#"
    return _escape_html(url)


def _sanitize_color(color: str | None, default: str = "#6366f1") -> str:
    """Sanitize a color value.

    Args:
        color: Color value (hex, rgb, etc).
        default: Default color if invalid.

    Returns:
        Sanitized color value.
    """
    if not color:
        return default
    color = str(color).strip()
    # Allow hex colors, rgb/rgba, and named colors
    if re.match(r'^#[0-9a-fA-F]{3,8}$', color):
        return color
    if re.match(r'^(rgb|rgba|hsl|hsla)\([^)]+\)$', color):
        return _escape_html(color)
    # Allow simple named colors
    if re.match(r'^[a-zA-Z]+$', color):
        return color
    return default


def _render_hero_block(config: dict, primary_color: str) -> str:
    """Render hero block."""
    headline = _escape_html(config.get("headline", "Welcome"))
    subheadline = _escape_html(config.get("subheadline", ""))
    button_text = _escape_html(config.get("buttonText", "Get Started"))
    button_link = _sanitize_url(config.get("buttonLink", "#"))
    bg_type = config.get("backgroundType", "gradient")
    bg_color = _sanitize_color(config.get("backgroundColor"), primary_color)
    gradient_from = _sanitize_color(config.get("gradientFrom"), primary_color)
    gradient_to = _sanitize_color(config.get("gradientTo"), "#8b5cf6")
    bg_image = _sanitize_url(config.get("backgroundImage", ""))
    text_align = config.get("textAlign", "center")
    show_button = config.get("showButton", True)

    # Background style
    if bg_type == "image" and bg_image and bg_image != "#":
        bg_style = f'background-image: url({bg_image}); background-size: cover; background-position: center;'
        overlay = '<div class="absolute inset-0 bg-black/40"></div>'
    elif bg_type == "gradient":
        bg_style = f'background: linear-gradient(135deg, {gradient_from} 0%, {gradient_to} 100%);'
        overlay = ''
    else:
        bg_style = f'background-color: {bg_color};'
        overlay = ''

    align_class = {
        "left": "text-left items-start",
        "center": "text-center items-center mx-auto",
        "right": "text-right items-end ml-auto",
    }.get(text_align, "text-center items-center mx-auto")

    button_html = ""
    if show_button:
        button_html = f'''
        <a href="{button_link}" class="inline-flex items-center px-8 py-4 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors mt-8 shadow-lg">
            {button_text}
        </a>'''

    return f'''
    <section class="relative min-h-[500px] flex items-center px-6 py-20" style="{bg_style}">
        {overlay}
        <div class="relative z-10 max-w-4xl {align_class}">
            <h1 class="text-5xl md:text-6xl font-bold text-white mb-6">{headline}</h1>
            <p class="text-xl text-white/90 max-w-2xl">{subheadline}</p>
            {button_html}
        </div>
    </section>'''


def _render_features_block(config: dict) -> str:
    """Render features block."""
    title = _escape_html(config.get("title", "Features"))
    subtitle = _escape_html(config.get("subtitle", ""))
    items = config.get("items", [])
    columns = config.get("columns", 3)

    grid_class = {2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4"}.get(columns, "md:grid-cols-3")

    items_html = ""
    for item in items:
        icon = _escape_html(item.get("icon", "zap"))
        item_title = _escape_html(item.get("title", ""))
        description = _escape_html(item.get("description", ""))
        items_html += f'''
        <div class="text-center p-6 bg-gray-50 rounded-xl hover:shadow-lg transition-shadow">
            <div class="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-lg mb-4">
                <span class="text-2xl">⚡</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">{item_title}</h3>
            <p class="text-gray-600">{description}</p>
        </div>'''

    return f'''
    <section class="py-16 px-6 bg-white">
        <div class="max-w-6xl mx-auto">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-gray-900 mb-4">{title}</h2>
                <p class="text-lg text-gray-600">{subtitle}</p>
            </div>
            <div class="grid grid-cols-1 {grid_class} gap-8">
                {items_html}
            </div>
        </div>
    </section>'''


def _render_cta_block(config: dict, primary_color: str) -> str:
    """Render CTA block."""
    headline = _escape_html(config.get("headline", "Ready to get started?"))
    description = _escape_html(config.get("description", ""))
    button_text = _escape_html(config.get("buttonText", "Get Started"))
    button_link = _sanitize_url(config.get("buttonLink", "#"))
    bg_color = _sanitize_color(config.get("backgroundColor"), primary_color)
    text_color = config.get("textColor", "light")

    text_class = "text-white" if text_color == "light" else "text-gray-900"
    desc_class = "text-white/80" if text_color == "light" else "text-gray-600"
    btn_class = "bg-white text-gray-900 hover:bg-gray-100" if text_color == "light" else "bg-gray-900 text-white hover:bg-gray-800"

    return f'''
    <section class="py-16 px-6" style="background-color: {bg_color};">
        <div class="max-w-3xl mx-auto text-center">
            <h2 class="text-3xl font-bold mb-4 {text_class}">{headline}</h2>
            <p class="text-lg mb-8 {desc_class}">{description}</p>
            <a href="{button_link}" class="inline-flex items-center px-8 py-4 font-semibold rounded-lg transition-colors {btn_class}">
                {button_text}
            </a>
        </div>
    </section>'''


def _render_testimonials_block(config: dict) -> str:
    """Render testimonials block."""
    title = _escape_html(config.get("title", "What Our Customers Say"))
    items = config.get("items", [])

    items_html = ""
    for item in items:
        quote = _escape_html(item.get("quote", ""))
        author = _escape_html(item.get("author", ""))
        company = _escape_html(item.get("company", ""))
        avatar = _sanitize_url(item.get("avatar", ""))

        avatar_html = f'<img src="{avatar}" alt="{author}" class="w-10 h-10 rounded-full object-cover" loading="lazy">' if avatar and avatar != "#" else '<div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400">👤</div>'

        items_html += f'''
        <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <p class="text-gray-700 mb-6 italic">"{quote}"</p>
            <div class="flex items-center gap-3">
                {avatar_html}
                <div>
                    <p class="font-medium text-gray-900 text-sm">{author}</p>
                    <p class="text-gray-500 text-sm">{company}</p>
                </div>
            </div>
        </div>'''

    return f'''
    <section class="py-16 px-6 bg-gray-50">
        <div class="max-w-6xl mx-auto">
            <h2 class="text-3xl font-bold text-gray-900 text-center mb-12">{title}</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {items_html}
            </div>
        </div>
    </section>'''


def _render_faq_block(config: dict) -> str:
    """Render FAQ block."""
    title = _escape_html(config.get("title", "Frequently Asked Questions"))
    items = config.get("items", [])

    items_html = ""
    for i, item in enumerate(items):
        question = _escape_html(item.get("question", ""))
        answer = _escape_html(item.get("answer", ""))
        items_html += f'''
        <details class="group border border-gray-200 rounded-lg overflow-hidden" {"open" if i == 0 else ""}>
            <summary class="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer font-medium text-gray-900">
                {question}
                <span class="transform group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div class="p-4 bg-white text-gray-600">{answer}</div>
        </details>'''

    return f'''
    <section class="py-16 px-6 bg-white">
        <div class="max-w-3xl mx-auto">
            <h2 class="text-3xl font-bold text-gray-900 text-center mb-12">{title}</h2>
            <div class="space-y-4">{items_html}</div>
        </div>
    </section>'''


def _render_text_block(config: dict) -> str:
    """Render text block."""
    content = _escape_html(config.get("content", ""))
    alignment = config.get("alignment", "left")
    align_class = {"left": "text-left", "center": "text-center", "right": "text-right"}.get(alignment, "text-left")

    # Convert newlines to <br> (content is already escaped)
    content_html = content.replace("\n", "<br>")

    return f'''
    <section class="py-12 px-6 bg-white">
        <div class="max-w-4xl mx-auto {align_class}">
            <div class="text-gray-700 leading-relaxed prose prose-indigo max-w-none">{content_html}</div>
        </div>
    </section>'''


def _render_image_block(config: dict) -> str:
    """Render image block."""
    url = _sanitize_url(config.get("url", ""))
    alt = _escape_html(config.get("alt", ""))
    caption = _escape_html(config.get("caption", ""))
    width = config.get("width", "large")

    if not url or url == "#":
        return '<!-- Image block with no URL -->'

    width_class = {"small": "max-w-md", "medium": "max-w-2xl", "large": "max-w-4xl", "full": "max-w-none"}.get(width, "max-w-4xl")

    caption_html = f'<figcaption class="mt-3 text-center text-sm text-gray-500">{caption}</figcaption>' if caption else ""

    return f'''
    <section class="py-8 px-6 bg-white">
        <figure class="{width_class} mx-auto">
            <img src="{url}" alt="{alt}" class="w-full rounded-lg shadow-sm" loading="lazy">
            {caption_html}
        </figure>
    </section>'''


def _render_video_block(config: dict) -> str:
    """Render video block."""
    url = config.get("url", "")
    title = _escape_html(config.get("title", ""))
    autoplay = config.get("autoplay", False)

    if not url:
        return '<!-- Video block with no URL -->'

    # Parse YouTube/Vimeo URL - only allow specific video platforms
    embed_url = None
    youtube_match = re.search(r'(?:youtube\.com/(?:watch\?v=|embed/)|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
    vimeo_match = re.search(r'vimeo\.com/(\d+)', url)

    if youtube_match:
        video_id = youtube_match.group(1)
        embed_url = f"https://www.youtube.com/embed/{video_id}"
    elif vimeo_match:
        video_id = vimeo_match.group(1)
        embed_url = f"https://player.vimeo.com/video/{video_id}"

    if not embed_url:
        return '<!-- Video block with unsupported URL -->'

    if autoplay:
        embed_url += "?autoplay=1&mute=1"

    escaped_title = title or 'Video'
    title_html = f'<h2 class="text-2xl font-bold text-gray-900 text-center mb-6">{title}</h2>' if title else ""

    return f'''
    <section class="py-12 px-6 bg-white">
        <div class="max-w-4xl mx-auto">
            {title_html}
            <div class="relative aspect-video rounded-xl overflow-hidden shadow-lg">
                <iframe src="{embed_url}" title="{escaped_title}" class="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
        </div>
    </section>'''


def _render_stats_block(config: dict, primary_color: str) -> str:
    """Render stats block."""
    title = _escape_html(config.get("title", ""))
    items = config.get("items", [])
    bg_color = _sanitize_color(primary_color)

    cols = min(len(items), 4)
    grid_class = f"grid-cols-2 md:grid-cols-{cols}"

    items_html = ""
    for item in items:
        value = _escape_html(item.get("value", ""))
        label = _escape_html(item.get("label", ""))
        items_html += f'''
        <div class="text-center">
            <p class="text-4xl md:text-5xl font-bold text-white mb-2">{value}</p>
            <p class="text-indigo-200">{label}</p>
        </div>'''

    title_html = f'<h2 class="text-2xl font-bold text-white text-center mb-12">{title}</h2>' if title else ""

    return f'''
    <section class="py-16 px-6" style="background-color: {bg_color};">
        <div class="max-w-6xl mx-auto">
            {title_html}
            <div class="grid {grid_class} gap-8">{items_html}</div>
        </div>
    </section>'''


def _render_divider_block(config: dict) -> str:
    """Render divider block."""
    style = config.get("style", "line")
    height = config.get("height", "medium")

    height_class = {"small": "py-4", "medium": "py-8", "large": "py-12"}.get(height, "py-8")

    if style == "dots":
        content = '<div class="flex justify-center gap-2"><span class="w-2 h-2 bg-gray-300 rounded-full"></span><span class="w-2 h-2 bg-gray-300 rounded-full"></span><span class="w-2 h-2 bg-gray-300 rounded-full"></span></div>'
    elif style == "space":
        content = '<div class="h-4"></div>'
    else:
        content = '<hr class="border-gray-200">'

    return f'<div class="{height_class} px-6 bg-white"><div class="max-w-4xl mx-auto">{content}</div></div>'


def _render_pricing_block(config: dict, primary_color: str) -> str:
    """Render pricing block."""
    title = _escape_html(config.get("title", "Pricing"))
    subtitle = _escape_html(config.get("subtitle", ""))
    items = config.get("items", [])

    cols = min(len(items), 3)
    grid_class = f"grid-cols-1 md:grid-cols-{cols}"

    items_html = ""
    for item in items:
        name = _escape_html(item.get("name", ""))
        price = _escape_html(item.get("price", ""))
        period = _escape_html(item.get("period", ""))
        features = item.get("features", [])
        highlighted = item.get("highlighted", False)
        button_text = _escape_html(item.get("buttonText", "Get Started"))
        button_link = _sanitize_url(item.get("buttonLink", "#"))

        features_html = "".join(f'<li class="flex items-center gap-2"><span class="text-green-500">✓</span> {_escape_html(f)}</li>' for f in features)

        card_class = "ring-2 ring-indigo-500 shadow-xl scale-105" if highlighted else "border border-gray-200 shadow-sm"
        btn_class = "bg-indigo-600 text-white hover:bg-indigo-700" if highlighted else "bg-gray-100 text-gray-900 hover:bg-gray-200"

        popular_badge = '<div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-sm font-medium px-4 py-1 rounded-full">Most Popular</div>' if highlighted else ""

        items_html += f'''
        <div class="relative bg-white rounded-2xl p-8 {card_class}">
            {popular_badge}
            <h3 class="text-xl font-semibold text-gray-900 text-center mb-4">{name}</h3>
            <div class="text-center mb-6">
                <span class="text-4xl font-bold text-gray-900">{price}</span>
                <span class="text-gray-500">{period}</span>
            </div>
            <ul class="space-y-3 mb-8">{features_html}</ul>
            <a href="{button_link}" class="block w-full py-3 text-center rounded-lg font-semibold transition-colors {btn_class}">{button_text}</a>
        </div>'''

    return f'''
    <section class="py-16 px-6 bg-gray-50">
        <div class="max-w-6xl mx-auto">
            <div class="text-center mb-12">
                <h2 class="text-3xl font-bold text-gray-900 mb-4">{title}</h2>
                <p class="text-lg text-gray-600">{subtitle}</p>
            </div>
            <div class="grid {grid_class} gap-8">{items_html}</div>
        </div>
    </section>'''


def _get_col_span_class(block: dict) -> str:
    """Get the Tailwind col-span class for a block.

    Args:
        block: Block data dict.

    Returns:
        Tailwind col-span class string.
    """
    # Use colSpan (12-column grid) if set
    col_span = block.get("colSpan")
    if col_span:
        return f"col-span-12 md:col-span-{col_span}"

    # Fall back to legacy width (1-4 scale -> 12-column)
    width = block.get("width") or 4
    col_map = {1: 3, 2: 6, 3: 9, 4: 12}
    span = col_map.get(width, 12)
    return f"col-span-12 md:col-span-{span}"


def _get_col_start_class(block: dict) -> str:
    """Get the Tailwind col-start class for a block.

    Args:
        block: Block data dict.

    Returns:
        Tailwind col-start class string or empty.
    """
    col_start = block.get("colStart")
    if col_start is not None and col_start > 0:
        # colStart is 0-indexed, but Tailwind col-start is 1-indexed
        return f"md:col-start-{col_start + 1}"
    return ""


def render_blocks_html(
    blocks: list[dict],
    primary_color: str = "#6366f1",
    forms: list[dict] | None = None,
    workspace_id: str = "",
) -> str:
    """Render a list of blocks to HTML with grid layout support.

    Supports:
    - colSpan: Column span in 12-column grid (4, 6, 8, 12)
    - colStart: Starting column position
    - row: Blocks with same row are grouped side-by-side
    - width: Legacy 1-4 scale (converted to 12-column)
    - form blocks: Renders embedded forms with layout support

    Args:
        blocks: List of block data dicts.
        primary_color: Primary color for styling.
        forms: List of form dicts for form blocks.
        workspace_id: Workspace ID for form blocks.

    Returns:
        Combined HTML string for all blocks.
    """
    if not blocks:
        return ""

    # Sort blocks by order first
    sorted_blocks = sorted(blocks, key=lambda b: b.get("order", 0))

    # Group blocks by row for side-by-side layout
    # Blocks without a row get their own implicit row
    rows: dict[int | str, list[dict]] = {}
    implicit_row = 0

    for block in sorted_blocks:
        row = block.get("row")
        if row is not None:
            row_key = row
        else:
            # Each block without explicit row gets its own row
            row_key = f"implicit_{implicit_row}"
            implicit_row += 1

        if row_key not in rows:
            rows[row_key] = []
        rows[row_key].append(block)

    # Render rows
    html_parts = []

    # Sort rows: numeric rows first (sorted), then implicit rows in order
    numeric_rows = sorted([k for k in rows.keys() if isinstance(k, int)])
    implicit_rows = sorted([k for k in rows.keys() if isinstance(k, str)])
    row_order = numeric_rows + implicit_rows

    for row_key in row_order:
        row_blocks = rows[row_key]

        # Check if any block in this row needs grid layout (has colSpan < 12 or width < 4)
        needs_grid = any(
            (block.get("colSpan") or 12) < 12 or (block.get("width") or 4) < 4
            for block in row_blocks
        )

        if needs_grid and len(row_blocks) > 0:
            # Wrap row in a grid container
            block_html_parts = []
            for block in row_blocks:
                col_span_class = _get_col_span_class(block)
                col_start_class = _get_col_start_class(block)
                block_html = render_block_html(block, primary_color, forms, workspace_id)

                # Wrap block in grid cell
                block_html_parts.append(
                    f'<div class="{col_span_class} {col_start_class}">{block_html}</div>'
                )

            row_html = f'''<div class="grid grid-cols-12 gap-4 md:gap-6">
                {"".join(block_html_parts)}
            </div>'''
            html_parts.append(row_html)
        else:
            # No grid needed - render blocks directly (full width)
            for block in row_blocks:
                html_parts.append(render_block_html(block, primary_color, forms, workspace_id))

    return "\n".join(html_parts)


def render_form_html(form: dict, workspace_id: str, primary_color: str = "#6366f1") -> str:
    """Render a form to HTML.

    Args:
        form: Form data (as dict from model_dump).
        workspace_id: Workspace ID for form submission.
        primary_color: Primary color for styling.

    Returns:
        HTML string for the form.
    """
    form_id = _escape_html(form.get("id", ""))
    fields = form.get("fields", [])
    submit_text = _escape_html(form.get("submit_button_text", "Submit"))
    honeypot_enabled = form.get("honeypot_enabled", True)
    bg_color = _sanitize_color(primary_color)
    ws_id = _escape_html(workspace_id)

    # Build field HTML
    fields_html = []
    for field in fields:
        field_id = _escape_html(field.get("id", ""))
        field_name = _escape_html(field.get("name", ""))
        field_label = _escape_html(field.get("label", ""))
        field_type = field.get("type", "text")
        required = field.get("required", False)
        placeholder = _escape_html(field.get("placeholder", ""))
        options = field.get("options", [])

        required_attr = 'required' if required else ''
        required_star = '<span class="text-red-500">*</span>' if required else ''

        if field_type == "textarea":
            field_html = f'''
            <div class="mb-4">
                <label for="{field_id}" class="block text-sm font-medium text-gray-700 mb-1">{field_label} {required_star}</label>
                <textarea id="{field_id}" name="{field_name}" placeholder="{placeholder}" {required_attr}
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    rows="4"></textarea>
            </div>'''
        elif field_type == "select":
            options_html = ''.join(f'<option value="{_escape_html(opt)}">{_escape_html(opt)}</option>' for opt in options)
            field_html = f'''
            <div class="mb-4">
                <label for="{field_id}" class="block text-sm font-medium text-gray-700 mb-1">{field_label} {required_star}</label>
                <select id="{field_id}" name="{field_name}" {required_attr}
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
                    <option value="">{placeholder or 'Select...'}</option>
                    {options_html}
                </select>
            </div>'''
        elif field_type == "checkbox":
            field_html = f'''
            <div class="mb-4 flex items-center">
                <input type="checkbox" id="{field_id}" name="{field_name}" value="true" {required_attr}
                    class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <label for="{field_id}" class="ml-2 text-sm text-gray-700">{field_label} {required_star}</label>
            </div>'''
        elif field_type == "radio" and options:
            options_html = ''.join(f'''
                <label class="flex items-center">
                    <input type="radio" name="{field_name}" value="{_escape_html(opt)}" {required_attr}
                        class="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500">
                    <span class="ml-2 text-sm text-gray-700">{_escape_html(opt)}</span>
                </label>''' for opt in options)
            field_html = f'''
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">{field_label} {required_star}</label>
                <div class="space-y-2">{options_html}</div>
            </div>'''
        elif field_type == "hidden":
            field_html = f'<input type="hidden" name="{field_name}" value="{placeholder}">'
        else:
            # text, email, phone, date, number
            input_type = "email" if field_type == "email" else "tel" if field_type == "phone" else field_type
            field_html = f'''
            <div class="mb-4">
                <label for="{field_id}" class="block text-sm font-medium text-gray-700 mb-1">{field_label} {required_star}</label>
                <input type="{input_type}" id="{field_id}" name="{field_name}" placeholder="{placeholder}" {required_attr}
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
            </div>'''

        fields_html.append(field_html)

    # Honeypot field (hidden for bots)
    honeypot_html = ''
    if honeypot_enabled:
        honeypot_html = '<div style="position:absolute;left:-9999px;"><input type="text" name="_honeypot" tabindex="-1" autocomplete="off"></div>'

    return f'''
    <section id="form" class="py-16 px-6 bg-gray-50">
        <div class="max-w-lg mx-auto">
            <form data-complens-form="{form_id}" data-workspace="{ws_id}" class="bg-white p-8 rounded-2xl shadow-lg relative">
                {honeypot_html}
                {''.join(fields_html)}
                <button type="submit" style="background-color: {bg_color};"
                    class="w-full py-4 px-6 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-lg">
                    {submit_text}
                </button>
            </form>
        </div>
    </section>'''


def _escape_js_string(s: str) -> str:
    """Escape a string for safe inclusion in JavaScript single-quoted string.

    Args:
        s: String to escape.

    Returns:
        Escaped string safe for JS single quotes.
    """
    if not s:
        return ""
    # Escape backslashes first, then single quotes, then newlines
    return (
        s.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("</script>", "<\\/script>")  # Prevent script injection
    )


def _generate_structured_data(
    page: dict,
    canonical_url: str = "",
    business_profile: dict | None = None,
) -> str:
    """Generate Schema.org JSON-LD structured data for AEO.

    Produces JSON-LD script tags for:
    - WebPage (always)
    - Organization (if business profile provided)
    - FAQPage (if page has FAQ blocks with Q&A items)
    - LocalBusiness (if profile has industry data)

    Args:
        page: Page data dict.
        canonical_url: Canonical URL for the page.
        business_profile: Optional business profile dict.

    Returns:
        HTML string with JSON-LD script tags for the <head>.
    """
    schemas: list[dict] = []
    blocks = page.get("blocks", [])
    meta_title = page.get("meta_title") or page.get("name", "")
    meta_description = page.get("meta_description") or page.get("subheadline", "")

    # 1. WebPage schema (always)
    web_page: dict = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": meta_title,
        "description": meta_description,
    }
    if canonical_url:
        web_page["url"] = canonical_url
    created_at = page.get("created_at")
    updated_at = page.get("updated_at")
    if created_at:
        web_page["datePublished"] = str(created_at)[:10]
    if updated_at:
        web_page["dateModified"] = str(updated_at)[:10]
    schemas.append(web_page)

    # 2. Organization schema (from business profile)
    profile = business_profile or {}
    biz_name = profile.get("business_name")
    if biz_name:
        org: dict = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": biz_name,
        }
        if profile.get("description"):
            org["description"] = profile["description"]
        if profile.get("website"):
            org["url"] = profile["website"]
        if profile.get("industry"):
            org["industry"] = profile["industry"]
        schemas.append(org)

        # 3. LocalBusiness schema (if industry data present)
        industry = profile.get("industry")
        if industry:
            local_biz: dict = {
                "@context": "https://schema.org",
                "@type": "LocalBusiness",
                "name": biz_name,
            }
            if profile.get("description"):
                local_biz["description"] = profile["description"]
            if canonical_url:
                local_biz["url"] = canonical_url
            schemas.append(local_biz)

    # 4. FAQPage schema (if page has FAQ blocks)
    faq_items: list[dict] = []
    for block in blocks:
        if block.get("type") == "faq":
            config = block.get("config", {})
            for item in config.get("items", []):
                question = item.get("question", "").strip()
                answer = item.get("answer", "").strip()
                if question and answer:
                    faq_items.append({
                        "@type": "Question",
                        "name": question,
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": answer,
                        },
                    })

    if faq_items:
        faq_schema: dict = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faq_items,
        }
        schemas.append(faq_schema)

    if not schemas:
        return ""

    # Build script tags
    parts = []
    for schema in schemas:
        json_str = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
        parts.append(
            f'    <script type="application/ld+json">{json_str}</script>'
        )
    return "\n".join(parts)


def render_full_page(
    page: dict,
    ws_url: str,
    api_url: str,
    forms: list[dict] | None = None,
    canonical_url: str = "",
    business_profile: dict | None = None,
) -> str:
    """Render a page to a complete HTML document.

    Args:
        page: Page data (as dict from model_dump).
        ws_url: WebSocket API URL for chat.
        api_url: REST API URL for form submissions.
        forms: List of form data dicts to render on the page.
        canonical_url: Canonical URL for the page.
        business_profile: Optional business profile dict for structured data.

    Returns:
        Complete HTML document string.
    """
    # Get page content
    blocks = page.get("blocks", [])
    body_content = page.get("body_content", "")
    headline = page.get("headline", "")
    meta_title = _escape_html(page.get("meta_title") or page.get("name", ""))
    meta_description = _escape_html(page.get("meta_description") or page.get("subheadline", ""))
    primary_color = _sanitize_color(page.get("primary_color"), "#6366f1")
    og_image_url = _escape_html(page.get("og_image_url") or "")
    # SECURITY: Sanitize custom CSS to prevent injection attacks
    custom_css = sanitize_css(page.get("custom_css", ""))
    page_id = _escape_js_string(page.get("id", ""))
    workspace_id = _escape_html(page.get("workspace_id", ""))
    chat_config = page.get("chat_config", {})
    chat_enabled = chat_config.get("enabled", True) if chat_config else True
    chat_initial_message = _escape_js_string(chat_config.get("initial_message", "") if chat_config else "")
    form_ids = page.get("form_ids", [])
    forms = forms or []

    # Validate URLs (only allow https/wss for security)
    ws_url_safe = _escape_js_string(ws_url) if ws_url.startswith(("wss://", "ws://")) else ""
    api_url_safe = _escape_js_string(api_url) if api_url.startswith(("https://", "http://")) else ""

    # Track which forms are rendered via form blocks (to avoid double-rendering)
    form_block_ids = {
        block.get("config", {}).get("formId")
        for block in blocks
        if block.get("type") == "form"
    }

    # Check layout mode from theme
    theme = page.get("theme", {}) or {}
    page_layout = theme.get("layout", "full-bleed")

    # Render blocks if present, otherwise use body_content
    if blocks:
        body_content = render_blocks_html(blocks, primary_color, forms, workspace_id)
        # Wrap in contained layout if configured
        if page_layout == "contained":
            body_content = f'<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{body_content}</div>'

    # Build chat widget styles and script
    chat_styles = ""
    chat_script = ""
    if chat_enabled and ws_url_safe:
        chat_styles = f"""
    <style>
        .cc-bubble {{
            position: fixed; bottom: 24px; right: 24px;
            width: 60px; height: 60px; border-radius: 50%;
            background: {primary_color}; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 9999; transition: transform 0.2s ease;
        }}
        .cc-bubble:hover {{ transform: scale(1.1); }}
        .cc-bubble svg {{ width: 28px; height: 28px; fill: white; }}

        .cc-panel {{
            display: none; position: fixed; bottom: 96px; right: 24px;
            width: 380px; max-width: calc(100vw - 48px);
            height: 500px; max-height: 60vh;
            background: white; border-radius: 16px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.2);
            z-index: 9999; flex-direction: column; overflow: hidden;
            opacity: 0; transform: translateY(20px);
            transition: opacity 0.25s ease, transform 0.25s ease;
        }}
        .cc-panel.cc-open {{
            display: flex; opacity: 1; transform: translateY(0);
        }}

        .cc-header {{
            padding: 16px 20px; background: {primary_color};
            color: white; font-weight: 600; font-size: 15px;
            display: flex; align-items: center; justify-content: space-between;
        }}
        .cc-close {{
            background: none; border: none; color: white;
            cursor: pointer; font-size: 20px; line-height: 1;
            padding: 0 0 0 8px; opacity: 0.8; transition: opacity 0.15s;
        }}
        .cc-close:hover {{ opacity: 1; }}

        .cc-messages {{
            flex: 1; overflow-y: auto; padding: 16px;
            display: flex; flex-direction: column; gap: 12px;
        }}

        .cc-msg {{
            max-width: 80%; word-wrap: break-word;
            padding: 10px 14px; line-height: 1.5; font-size: 14px;
            animation: cc-fade-in 0.25s ease;
        }}
        .cc-msg a {{ color: inherit; text-decoration: underline; }}
        .cc-msg code {{
            background: rgba(0,0,0,0.06); padding: 1px 5px;
            border-radius: 4px; font-size: 0.9em;
        }}
        .cc-msg-user {{
            align-self: flex-end; background: {primary_color};
            color: white; border-radius: 16px 16px 4px 16px;
        }}
        .cc-msg-bot {{
            align-self: flex-start; background: #f3f4f6;
            color: #1f2937; border-radius: 16px 16px 16px 4px;
        }}

        .cc-input-bar {{
            padding: 12px; border-top: 1px solid #eee;
            display: flex; gap: 8px;
        }}
        .cc-input-bar input {{
            flex: 1; padding: 10px 14px; border: 1px solid #ddd;
            border-radius: 24px; outline: none; font-size: 14px;
        }}
        .cc-input-bar input:focus {{ border-color: {primary_color}; }}
        .cc-input-bar button {{
            padding: 10px 20px; background: {primary_color};
            color: white; border: none; border-radius: 24px;
            cursor: pointer; font-weight: 500; font-size: 14px;
            transition: opacity 0.15s;
        }}
        .cc-input-bar button:hover {{ opacity: 0.9; }}

        .cc-typing {{
            align-self: flex-start; display: flex; gap: 4px;
            padding: 12px 16px; background: #f3f4f6;
            border-radius: 16px 16px 16px 4px;
        }}
        .cc-typing span {{
            width: 6px; height: 6px; border-radius: 50%;
            background: #9ca3af; animation: cc-bounce 1.2s ease-in-out infinite;
        }}
        .cc-typing span:nth-child(2) {{ animation-delay: 0.1s; }}
        .cc-typing span:nth-child(3) {{ animation-delay: 0.2s; }}

        @keyframes cc-bounce {{
            0%, 60%, 100% {{ transform: translateY(0); }}
            30% {{ transform: translateY(-6px); }}
        }}
        @keyframes cc-fade-in {{
            from {{ opacity: 0; transform: translateY(6px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
    </style>"""

        chat_script = f"""
<script>
(function() {{
  var WS_URL = '{ws_url_safe}';
  var PAGE_ID = '{page_id}';
  var WORKSPACE_ID = '{_escape_js_string(workspace_id)}';
  var INITIAL_MSG = '{chat_initial_message}';
  var ws = null;
  var intentionalClose = false;
  var reconnectAttempts = 0;
  var reconnectTimer = null;
  var typingEl = null;
  var messagesEl = null;
  var panelEl = null;
  var initialShown = false;

  var visitorId = localStorage.getItem('complens_vid');
  if (!visitorId) {{
    visitorId = 'v_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('complens_vid', visitorId);
  }}

  function el(tag, cls) {{
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }}

  function renderMarkdown(text) {{
    var s = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\\n/g, '<br>');
    return s;
  }}

  function createWidget() {{
    var root = el('div'); root.id = 'complens-chat';

    // Bubble
    var bubble = el('div', 'cc-bubble');
    bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
    bubble.addEventListener('click', toggleChat);

    // Panel
    panelEl = el('div', 'cc-panel');

    var header = el('div', 'cc-header');
    header.textContent = 'Chat with us';
    var closeBtn = el('button', 'cc-close');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', toggleChat);
    header.appendChild(closeBtn);

    messagesEl = el('div', 'cc-messages');

    var inputBar = el('div', 'cc-input-bar');
    var input = el('input'); input.id = 'cc-input';
    input.type = 'text'; input.placeholder = 'Type a message...';
    input.addEventListener('keypress', function(e) {{ if (e.key === 'Enter') sendChat(); }});
    var sendBtn = el('button');
    sendBtn.textContent = 'Send';
    sendBtn.addEventListener('click', sendChat);
    inputBar.appendChild(input);
    inputBar.appendChild(sendBtn);

    panelEl.appendChild(header);
    panelEl.appendChild(messagesEl);
    panelEl.appendChild(inputBar);

    root.appendChild(bubble);
    root.appendChild(panelEl);
    document.body.appendChild(root);
  }}

  function toggleChat() {{
    if (!panelEl) return;
    var isOpen = panelEl.classList.contains('cc-open');
    if (isOpen) {{
      panelEl.style.opacity = '0';
      panelEl.style.transform = 'translateY(20px)';
      setTimeout(function() {{ panelEl.classList.remove('cc-open'); }}, 250);
    }} else {{
      panelEl.classList.add('cc-open');
      // Force reflow then animate in
      panelEl.offsetHeight;
      panelEl.style.opacity = '1';
      panelEl.style.transform = 'translateY(0)';
      if (!ws) connectWS();
      var inp = document.getElementById('cc-input');
      if (inp) inp.focus();
    }}
  }}

  function connectWS() {{
    if (ws) return;
    intentionalClose = false;
    ws = new WebSocket(WS_URL + '?page_id=' + PAGE_ID + '&workspace_id=' + WORKSPACE_ID + '&visitor_id=' + visitorId);

    ws.onopen = function() {{
      reconnectAttempts = 0;
      if (INITIAL_MSG && !initialShown) {{
        addMessage(INITIAL_MSG, 'bot');
        initialShown = true;
      }}
    }};

    ws.onmessage = function(e) {{
      try {{
        var data = JSON.parse(e.data);
        if (data.action === 'ai_response') {{
          hideTyping();
          addMessage(data.message, 'bot');
        }}
      }} catch (err) {{
        console.error('[Complens Chat] Parse error:', err);
      }}
    }};

    ws.onerror = function() {{}};

    ws.onclose = function() {{
      ws = null;
      if (!intentionalClose) {{
        var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connectWS, delay);
      }}
    }};
  }}

  function sendChat() {{
    var input = document.getElementById('cc-input');
    if (!input) return;
    var msg = input.value.trim();
    if (!msg) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {{
      connectWS();
      return;
    }}
    addMessage(msg, 'user');
    showTyping();
    ws.send(JSON.stringify({{ action: 'public_chat', page_id: PAGE_ID, workspace_id: WORKSPACE_ID, message: msg, visitor_id: visitorId }}));
    input.value = '';
  }}

  function addMessage(text, type) {{
    if (!messagesEl) return;
    var div = el('div', 'cc-msg ' + (type === 'user' ? 'cc-msg-user' : 'cc-msg-bot'));
    if (type === 'user') {{
      div.textContent = text;
    }} else {{
      div.innerHTML = renderMarkdown(text);
    }}
    messagesEl.appendChild(div);
    messagesEl.scrollTo({{ top: messagesEl.scrollHeight, behavior: 'smooth' }});
  }}

  function showTyping() {{
    if (typingEl) return;
    typingEl = el('div', 'cc-typing');
    for (var i = 0; i < 3; i++) typingEl.appendChild(el('span'));
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTo({{ top: messagesEl.scrollHeight, behavior: 'smooth' }});
  }}

  function hideTyping() {{
    if (typingEl && typingEl.parentNode) {{
      typingEl.parentNode.removeChild(typingEl);
      typingEl = null;
    }}
  }}

  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', createWidget);
  }} else {{
    createWidget();
  }}
}})();
</script>"""

    # Build form HTML and script if forms exist
    # Skip forms that were already rendered as form blocks
    forms_html = ""
    form_script = ""
    if forms:
        # Render forms that aren't already rendered in blocks
        for form in forms:
            if form.get("id") not in form_block_ids:
                forms_html += render_form_html(form, workspace_id, primary_color)

        # Add form submission handler script
        form_script = f"""
<script>
(function() {{
  const API_URL = '{api_url_safe}';
  const PAGE_ID = '{page_id}';

  document.querySelectorAll('form[data-complens-form]').forEach(function(form) {{
    form.addEventListener('submit', async function(e) {{
      e.preventDefault();
      const formId = form.dataset.complensForm;
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled = true;

      const data = {{}};
      new FormData(form).forEach((v, k) => data[k] = v);

      try {{
        const res = await fetch(API_URL + '/public/submit/page/' + PAGE_ID, {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ form_id: formId, workspace_id: form.dataset.workspace, data: data }})
        }});
        const result = await res.json();
        if (result.success) {{
          form.innerHTML = '<p style="padding:20px;text-align:center;color:#059669;font-weight:500;">' + (result.message || 'Thank you!') + '</p>';
        }} else {{
          alert(result.error || 'Something went wrong. Please try again.');
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }}
      }} catch (err) {{
        console.error('Form error:', err);
        alert('Something went wrong. Please try again.');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }}
    }});
  }});
}})();
</script>"""

    # Generate structured data for AEO
    structured_data = _generate_structured_data(page, canonical_url, business_profile)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{meta_title}</title>
    <meta name="description" content="{meta_description}">
    <meta property="og:title" content="{meta_title}">
    <meta property="og:description" content="{meta_description}">
    <meta property="og:type" content="website">{f"""
    <meta property="og:image" content="{og_image_url}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="{og_image_url}">""" if og_image_url else ""}
    <meta name="twitter:title" content="{meta_title}">
    <meta name="twitter:description" content="{meta_description}">
    <link rel="canonical" href="{canonical_url}">{f"""
    <meta property="og:url" content="{canonical_url}">""" if canonical_url else ""}
{structured_data}
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {{
            theme: {{
                extend: {{
                    colors: {{
                        primary: '{primary_color}',
                    }}
                }}
            }}
        }}
    </script>
    <style type="text/tailwindcss">
        @layer utilities {{
            .min-h-\\[500px\\] {{ min-height: 500px; }}
            .min-h-\\[600px\\] {{ min-height: 600px; }}
            .w-\\[1em\\] {{ width: 1em; }}
            .h-\\[1em\\] {{ height: 1em; }}
        }}
    </style>
    <style>
        :root {{ --primary-color: {primary_color}; }}
        html {{ scroll-behavior: smooth; }}
        /* Fallback styles for JIT-only features */
        .bg-black\\/40 {{ background-color: rgba(0, 0, 0, 0.4); }}
        .bg-black\\/50 {{ background-color: rgba(0, 0, 0, 0.5); }}
        .text-white\\/90 {{ color: rgba(255, 255, 255, 0.9); }}
        .text-white\\/80 {{ color: rgba(255, 255, 255, 0.8); }}
        .bg-white\\/10 {{ background-color: rgba(255, 255, 255, 0.1); }}
        .bg-white\\/20 {{ background-color: rgba(255, 255, 255, 0.2); }}
        {custom_css or ''}
    </style>
    {chat_styles}
</head>
<body class="min-h-screen">
{body_content}
{forms_html}
{chat_script}
{form_script}
</body>
</html>"""

    return html
