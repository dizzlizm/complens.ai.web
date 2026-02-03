/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Layout & Spacing
    'min-h-screen',
    'py-4', 'py-6', 'py-12', 'py-16', 'py-20', 'py-24', 'py-28', 'py-32',
    'px-4', 'px-6', 'px-8', 'px-10', 'px-12', 'px-14',
    'p-4', 'p-6', 'p-8', 'p-10', 'p-12', 'p-16',
    'mb-2', 'mb-3', 'mb-4', 'mb-6', 'mb-8', 'mb-10', 'mb-12', 'mb-14', 'mb-16',
    'mt-1', 'mt-2', 'mt-4', 'mt-8',
    'gap-0.5', 'gap-1', 'gap-3', 'gap-4', 'gap-8', 'gap-12', 'gap-16',
    'lg:gap-12',
    'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl', 'max-w-5xl', 'max-w-6xl',

    // Flexbox & Grid
    'flex', 'flex-col', 'flex-wrap', 'items-center', 'justify-center', 'justify-between',
    'grid', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4',
    'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4',
    // 12-column grid system for page builder layouts
    'grid-cols-12',
    'col-span-12', 'col-span-6', 'col-span-8',
    'sm:col-span-4', 'sm:col-span-6', 'sm:col-span-8', 'sm:col-span-12',
    'md:col-span-4', 'md:col-span-6', 'md:col-span-8', 'md:col-span-12',
    'lg:col-span-4', 'lg:col-span-6', 'lg:col-span-8', 'lg:col-span-12',
    'sm:gap-6', 'md:gap-8',
    'md:translate-y-8',

    // Sizing
    'w-8', 'w-11', 'w-14', 'w-16', 'w-20', 'w-96', 'w-full', 'w-1/2',
    'h-5', 'h-6', 'h-8', 'h-14', 'h-16', 'h-20', 'h-96', 'h-full', 'h-1/3',
    'aspect-square',

    // Typography
    'text-xs', 'text-sm', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl',
    'md:text-2xl', 'md:text-5xl', 'md:text-6xl', 'md:text-7xl', 'md:text-8xl',
    'lg:text-8xl', 'lg:text-9xl',
    'font-medium', 'font-semibold', 'font-bold', 'font-black', 'font-extrabold', 'font-light',
    'leading-tight', 'leading-relaxed', 'leading-none',
    'tracking-wide', 'tracking-widest', 'hover:tracking-widest',
    'uppercase',
    'text-center', 'text-left',

    // Colors - Text
    'text-white', 'text-black',
    'text-gray-400', 'text-gray-500', 'text-gray-600', 'text-gray-900',
    'text-slate-300', 'text-slate-400', 'text-slate-500', 'text-slate-600', 'text-slate-900',
    'text-indigo-100', 'text-indigo-200', 'text-indigo-400', 'text-indigo-600',
    'text-purple-600',
    'text-amber-400', 'text-amber-500', 'text-amber-900',
    'text-sky-600',
    'text-zinc-400',

    // Colors - Background
    'bg-white', 'bg-black',
    'bg-gray-50', 'bg-gray-900',
    'bg-slate-50', 'bg-slate-900', 'bg-slate-950',
    'bg-indigo-50', 'bg-indigo-600', 'bg-indigo-700', 'bg-indigo-800', 'bg-indigo-900', 'bg-indigo-950',
    'bg-indigo-500/20', 'bg-purple-500/20',
    'bg-purple-100', 'bg-purple-600',
    'bg-amber-500', 'bg-amber-500/20',
    'bg-sky-50',
    'bg-zinc-800', 'bg-zinc-900', 'bg-zinc-950',
    'bg-black/10', 'bg-black/60', 'bg-white/20',

    // Gradients
    'bg-gradient-to-r', 'bg-gradient-to-br', 'bg-gradient-to-b', 'bg-gradient-to-l', 'bg-gradient-to-t',
    'from-slate-50', 'from-slate-900', 'from-indigo-500', 'from-indigo-600', 'from-indigo-950',
    'from-purple-600', 'from-amber-500', 'from-amber-500/10', 'from-sky-400',
    'from-indigo-500/5', 'from-white',
    'via-indigo-100', 'via-indigo-700', 'via-purple-600', 'via-indigo-950',
    'to-slate-900', 'to-indigo-200', 'to-indigo-700', 'to-indigo-800', 'to-indigo-900',
    'to-purple-500/5', 'to-purple-600', 'to-purple-700', 'to-purple-800', 'to-purple-100', 'to-purple-200',
    'to-red-500', 'to-sky-600', 'to-white', 'to-transparent',
    'bg-clip-text', 'text-transparent',

    // Borders
    'border', 'border-2', 'border-y', 'border-t', 'border-b',
    'border-gray-100', 'border-gray-200', 'border-gray-900',
    'border-slate-100', 'border-slate-800',
    'border-indigo-200', 'border-indigo-300', 'border-indigo-500',
    'border-amber-500', 'border-sky-500',
    'rounded', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full', 'rounded-none',

    // Shadows
    'shadow', 'shadow-lg', 'shadow-xl', 'shadow-2xl',
    'shadow-indigo-500/25', 'shadow-indigo-500/30', 'shadow-indigo-500/40', 'shadow-indigo-500/50',
    'shadow-white/30',
    'hover:shadow-xl', 'hover:shadow-2xl', 'hover:shadow-indigo-500/10', 'hover:shadow-indigo-500/50', 'hover:shadow-white/30',

    // Effects & Transitions
    'opacity-10', 'opacity-20', 'opacity-25', 'opacity-30', 'opacity-50', 'opacity-75',
    'blur-3xl',
    'transition-all', 'transition-colors', 'transition-shadow', 'transition-transform', 'transition-opacity',
    'duration-300', 'duration-500',
    'transform', 'hover:-translate-y-0.5', 'hover:-translate-y-1',
    'hover:scale-105', 'hover:scale-110', 'group-hover:scale-110', 'group-hover:scale-125',
    'group-hover:rotate-3', 'group-hover:translate-x-1',
    'overflow-hidden',

    // Positioning
    'relative', 'absolute', 'inset-0',
    'top-0', 'right-0', 'bottom-0', 'left-0',
    'top-1/4', 'left-1/4', 'bottom-1/4', 'right-1/4',

    // Interactive
    'hover:bg-gray-100', 'hover:bg-gray-900', 'hover:bg-white', 'hover:bg-zinc-800',
    'hover:bg-indigo-700', 'hover:bg-purple-700',
    'hover:text-white', 'hover:text-gray-900', 'hover:text-indigo-500', 'hover:text-amber-500',
    'hover:border-gray-300', 'hover:border-indigo-200', 'hover:border-indigo-300',
    'group', 'group-hover:text-amber-400', 'group-hover:text-amber-500',
    'group-hover:opacity-100',
    'cursor-pointer',

    // Responsive
    'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4',
    'sm:flex-row',

    // Display
    'inline-block', 'inline-flex', 'block', 'hidden',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
      },
    },
  },
  plugins: [],
}
