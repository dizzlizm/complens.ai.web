import { PlayCircle } from 'lucide-react';
import { VideoConfig } from '../types';

interface VideoBlockProps {
  config: VideoConfig;
  isEditing?: boolean;
  onConfigChange?: (config: VideoConfig) => void;
}

function getEmbedUrl(url: string): string | null {
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  // Vimeo
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  return null;
}

export default function VideoBlock({ config, isEditing, onConfigChange }: VideoBlockProps) {
  const {
    url = '',
    autoplay = false,
    title = '',
  } = config;

  const handleChange = (field: keyof VideoConfig, value: string | boolean) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  const embedUrl = getEmbedUrl(url);

  return (
    <div className="py-12 px-8 bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Title */}
        {(title || isEditing) && (
          <div className="text-center mb-6">
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center"
                placeholder="Video title (optional)..."
              />
            ) : (
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            )}
          </div>
        )}

        {/* Video embed */}
        {embedUrl ? (
          <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg">
            <iframe
              src={`${embedUrl}${autoplay ? '?autoplay=1&mute=1' : ''}`}
              title={title || 'Embedded video'}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300">
            <PlayCircle className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">No video set</p>
            {isEditing && (
              <input
                type="text"
                value={url}
                onChange={(e) => handleChange('url', e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 w-80"
                placeholder="Enter YouTube or Vimeo URL..."
              />
            )}
            {!isEditing && (
              <p className="text-sm text-gray-400">
                Add a YouTube or Vimeo URL in block settings
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
