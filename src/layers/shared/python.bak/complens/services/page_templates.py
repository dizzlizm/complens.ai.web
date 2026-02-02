"""Page templates with AI-generated copy.

Shorter, high-impact templates with just 3 sections:
1. Hero - The hook
2. Features - The value
3. CTA - The action
"""

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


def fill_template(template_id: str, content: dict) -> str:
    """Fill a template with content."""
    template = TEMPLATES.get(template_id)
    if not template:
        return ""

    html = template["html"]

    # Replace all placeholders
    for key, value in content.items():
        placeholder = "{{" + key + "}}"
        html = html.replace(placeholder, str(value) if value else "")

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


def render_block_html(block: dict, primary_color: str = "#6366f1") -> str:
    """Render a single block to HTML.

    Args:
        block: Block data (id, type, config, order).
        primary_color: Primary color for styling.

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
    else:
        return f'<!-- Unknown block type: {block_type} -->'


def _render_hero_block(config: dict, primary_color: str) -> str:
    """Render hero block."""
    headline = config.get("headline", "Welcome")
    subheadline = config.get("subheadline", "")
    button_text = config.get("buttonText", "Get Started")
    button_link = config.get("buttonLink", "#")
    bg_type = config.get("backgroundType", "gradient")
    bg_color = config.get("backgroundColor", primary_color)
    gradient_from = config.get("gradientFrom", primary_color)
    gradient_to = config.get("gradientTo", "#8b5cf6")
    bg_image = config.get("backgroundImage", "")
    text_align = config.get("textAlign", "center")
    show_button = config.get("showButton", True)

    # Background style
    if bg_type == "image" and bg_image:
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
    title = config.get("title", "Features")
    subtitle = config.get("subtitle", "")
    items = config.get("items", [])
    columns = config.get("columns", 3)

    grid_class = {2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4"}.get(columns, "md:grid-cols-3")

    items_html = ""
    for item in items:
        icon = item.get("icon", "zap")
        item_title = item.get("title", "")
        description = item.get("description", "")
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
    headline = config.get("headline", "Ready to get started?")
    description = config.get("description", "")
    button_text = config.get("buttonText", "Get Started")
    button_link = config.get("buttonLink", "#")
    bg_color = config.get("backgroundColor", primary_color)
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
    title = config.get("title", "What Our Customers Say")
    items = config.get("items", [])

    items_html = ""
    for item in items:
        quote = item.get("quote", "")
        author = item.get("author", "")
        company = item.get("company", "")
        avatar = item.get("avatar", "")

        avatar_html = f'<img src="{avatar}" alt="{author}" class="w-10 h-10 rounded-full object-cover">' if avatar else '<div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400">👤</div>'

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
    title = config.get("title", "Frequently Asked Questions")
    items = config.get("items", [])

    items_html = ""
    for i, item in enumerate(items):
        question = item.get("question", "")
        answer = item.get("answer", "")
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
    content = config.get("content", "")
    alignment = config.get("alignment", "left")
    align_class = {"left": "text-left", "center": "text-center", "right": "text-right"}.get(alignment, "text-left")

    # Convert newlines to <br>
    content_html = content.replace("\n", "<br>")

    return f'''
    <section class="py-12 px-6 bg-white">
        <div class="max-w-4xl mx-auto {align_class}">
            <div class="text-gray-700 leading-relaxed prose prose-indigo max-w-none">{content_html}</div>
        </div>
    </section>'''


def _render_image_block(config: dict) -> str:
    """Render image block."""
    url = config.get("url", "")
    alt = config.get("alt", "")
    caption = config.get("caption", "")
    width = config.get("width", "large")

    if not url:
        return '<!-- Image block with no URL -->'

    width_class = {"small": "max-w-md", "medium": "max-w-2xl", "large": "max-w-4xl", "full": "max-w-none"}.get(width, "max-w-4xl")

    caption_html = f'<figcaption class="mt-3 text-center text-sm text-gray-500">{caption}</figcaption>' if caption else ""

    return f'''
    <section class="py-8 px-6 bg-white">
        <figure class="{width_class} mx-auto">
            <img src="{url}" alt="{alt}" class="w-full rounded-lg shadow-sm">
            {caption_html}
        </figure>
    </section>'''


def _render_video_block(config: dict) -> str:
    """Render video block."""
    url = config.get("url", "")
    title = config.get("title", "")
    autoplay = config.get("autoplay", False)

    if not url:
        return '<!-- Video block with no URL -->'

    # Parse YouTube/Vimeo URL
    embed_url = None
    import re
    youtube_match = re.search(r'(?:youtube\.com/(?:watch\?v=|embed/)|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
    vimeo_match = re.search(r'vimeo\.com/(\d+)', url)

    if youtube_match:
        video_id = youtube_match.group(1)
        embed_url = f"https://www.youtube.com/embed/{video_id}"
    elif vimeo_match:
        video_id = vimeo_match.group(1)
        embed_url = f"https://player.vimeo.com/video/{video_id}"

    if not embed_url:
        return f'<!-- Video block with unsupported URL: {url} -->'

    if autoplay:
        embed_url += "?autoplay=1&mute=1"

    title_html = f'<h2 class="text-2xl font-bold text-gray-900 text-center mb-6">{title}</h2>' if title else ""

    return f'''
    <section class="py-12 px-6 bg-white">
        <div class="max-w-4xl mx-auto">
            {title_html}
            <div class="relative aspect-video rounded-xl overflow-hidden shadow-lg">
                <iframe src="{embed_url}" title="{title or 'Video'}" class="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
        </div>
    </section>'''


def _render_stats_block(config: dict, primary_color: str) -> str:
    """Render stats block."""
    title = config.get("title", "")
    items = config.get("items", [])

    cols = min(len(items), 4)
    grid_class = f"grid-cols-2 md:grid-cols-{cols}"

    items_html = ""
    for item in items:
        value = item.get("value", "")
        label = item.get("label", "")
        items_html += f'''
        <div class="text-center">
            <p class="text-4xl md:text-5xl font-bold text-white mb-2">{value}</p>
            <p class="text-indigo-200">{label}</p>
        </div>'''

    title_html = f'<h2 class="text-2xl font-bold text-white text-center mb-12">{title}</h2>' if title else ""

    return f'''
    <section class="py-16 px-6" style="background-color: {primary_color};">
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
    title = config.get("title", "Pricing")
    subtitle = config.get("subtitle", "")
    items = config.get("items", [])

    cols = min(len(items), 3)
    grid_class = f"grid-cols-1 md:grid-cols-{cols}"

    items_html = ""
    for item in items:
        name = item.get("name", "")
        price = item.get("price", "")
        period = item.get("period", "")
        features = item.get("features", [])
        highlighted = item.get("highlighted", False)
        button_text = item.get("buttonText", "Get Started")
        button_link = item.get("buttonLink", "#")

        features_html = "".join(f'<li class="flex items-center gap-2"><span class="text-green-500">✓</span> {f}</li>' for f in features)

        card_class = "ring-2 ring-indigo-500 shadow-xl scale-105" if highlighted else "border border-gray-200 shadow-sm"
        btn_class = f"bg-indigo-600 text-white hover:bg-indigo-700" if highlighted else "bg-gray-100 text-gray-900 hover:bg-gray-200"

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


def render_blocks_html(blocks: list[dict], primary_color: str = "#6366f1") -> str:
    """Render a list of blocks to HTML.

    Args:
        blocks: List of block data dicts.
        primary_color: Primary color for styling.

    Returns:
        Combined HTML string for all blocks.
    """
    if not blocks:
        return ""

    # Sort blocks by order
    sorted_blocks = sorted(blocks, key=lambda b: b.get("order", 0))

    html_parts = []
    for block in sorted_blocks:
        html_parts.append(render_block_html(block, primary_color))

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
    form_id = form.get("id", "")
    fields = form.get("fields", [])
    submit_text = form.get("submit_button_text", "Submit")
    honeypot_enabled = form.get("honeypot_enabled", True)

    # Build field HTML
    fields_html = []
    for field in fields:
        field_id = field.get("id", "")
        field_name = field.get("name", "")
        field_label = field.get("label", "")
        field_type = field.get("type", "text")
        required = field.get("required", False)
        placeholder = field.get("placeholder", "")
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
            options_html = ''.join(f'<option value="{opt}">{opt}</option>' for opt in options)
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
                    <input type="radio" name="{field_name}" value="{opt}" {required_attr}
                        class="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500">
                    <span class="ml-2 text-sm text-gray-700">{opt}</span>
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
            <form data-complens-form="{form_id}" data-workspace="{workspace_id}" class="bg-white p-8 rounded-2xl shadow-lg relative">
                {honeypot_html}
                {''.join(fields_html)}
                <button type="submit" style="background-color: {primary_color};"
                    class="w-full py-4 px-6 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-lg">
                    {submit_text}
                </button>
            </form>
        </div>
    </section>'''


def render_full_page(
    page: dict,
    ws_url: str,
    api_url: str,
    forms: list[dict] | None = None,
) -> str:
    """Render a page to a complete HTML document.

    Args:
        page: Page data (as dict from model_dump).
        ws_url: WebSocket API URL for chat.
        api_url: REST API URL for form submissions.
        forms: List of form data dicts to render on the page.

    Returns:
        Complete HTML document string.
    """
    # Get page content
    blocks = page.get("blocks", [])
    body_content = page.get("body_content", "")
    headline = page.get("headline", "")
    meta_title = page.get("meta_title") or page.get("name", "")
    meta_description = page.get("meta_description") or page.get("subheadline", "")
    primary_color = page.get("primary_color", "#6366f1")
    custom_css = page.get("custom_css", "")
    page_id = page.get("id", "")
    workspace_id = page.get("workspace_id", "")
    chat_config = page.get("chat_config", {})
    chat_enabled = chat_config.get("enabled", True) if chat_config else True
    chat_initial_message = chat_config.get("initial_message", "") if chat_config else ""
    form_ids = page.get("form_ids", [])
    forms = forms or []

    # Render blocks if present, otherwise use body_content
    if blocks:
        body_content = render_blocks_html(blocks, primary_color)

    # Build chat widget script
    chat_script = ""
    if chat_enabled:
        chat_script = f"""
<script>
(function() {{
  const WS_URL = '{ws_url}';
  const PAGE_ID = '{page_id}';
  let ws, visitorId = localStorage.getItem('complens_vid') || (function() {{
    const id = 'v_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('complens_vid', id);
    return id;
  }})();

  function createWidget() {{
    const container = document.createElement('div');
    container.id = 'complens-chat';
    container.innerHTML = `
      <div id="chat-bubble" onclick="window.toggleChat()" style="position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:{primary_color};cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:9999;transition:transform 0.2s;">
        <svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
      </div>
      <div id="chat-panel" style="display:none;position:fixed;bottom:96px;right:24px;width:380px;max-width:calc(100vw - 48px);height:500px;max-height:60vh;background:white;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.2);z-index:9999;flex-direction:column;overflow:hidden;">
        <div style="padding:16px 20px;background:{primary_color};color:white;font-weight:600;">Chat with us</div>
        <div id="chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;"></div>
        <div style="padding:12px;border-top:1px solid #eee;display:flex;gap:8px;">
          <input id="chat-input" type="text" placeholder="Type a message..." style="flex:1;padding:10px 14px;border:1px solid #ddd;border-radius:24px;outline:none;" onkeypress="if(event.key==='Enter')window.sendChat()">
          <button onclick="window.sendChat()" style="padding:10px 20px;background:{primary_color};color:white;border:none;border-radius:24px;cursor:pointer;font-weight:500;">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
  }}

  window.toggleChat = function() {{
    const panel = document.getElementById('chat-panel');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen && !ws) connectWS();
  }};

  function connectWS() {{
    ws = new WebSocket(WS_URL + '?page_id=' + PAGE_ID + '&visitor_id=' + visitorId);
    ws.onopen = function() {{
      const initial = '{chat_initial_message}';
      if (initial) addMessage(initial, 'bot');
    }};
    ws.onmessage = function(e) {{
      const data = JSON.parse(e.data);
      if (data.action === 'ai_response') addMessage(data.message, 'bot');
    }};
    ws.onclose = function() {{ ws = null; }};
  }}

  window.sendChat = function() {{
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg || !ws) return;
    addMessage(msg, 'user');
    ws.send(JSON.stringify({{ action: 'public_chat', page_id: PAGE_ID, message: msg, visitor_id: visitorId }}));
    input.value = '';
  }};

  function addMessage(text, type) {{
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.style.cssText = type === 'user' ?
      'align-self:flex-end;background:{primary_color};color:white;padding:10px 14px;border-radius:16px 16px 4px 16px;max-width:80%;' :
      'align-self:flex-start;background:#f3f4f6;color:#1f2937;padding:10px 14px;border-radius:16px 16px 16px 4px;max-width:80%;';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createWidget);
  else createWidget();
}})();
</script>"""

    # Build form HTML and script if forms exist
    forms_html = ""
    form_script = ""
    if forms:
        # Render each form
        for form in forms:
            forms_html += render_form_html(form, workspace_id, primary_color)

        # Add form submission handler script
        form_script = f"""
<script>
(function() {{
  const API_URL = '{api_url}';
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

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{meta_title}</title>
    <meta name="description" content="{meta_description}">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root {{ --primary-color: {primary_color}; }}
        html {{ scroll-behavior: smooth; }}
        {custom_css or ''}
    </style>
</head>
<body class="min-h-screen">
{body_content}
{forms_html}
{chat_script}
{form_script}
</body>
</html>"""

    return html
