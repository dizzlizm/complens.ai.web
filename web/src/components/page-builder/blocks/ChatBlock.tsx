import { MessageCircle, Send } from 'lucide-react';
import { ChatConfig } from '../types';

interface ChatBlockProps {
  config: ChatConfig;
  isEditing?: boolean;
  onConfigChange?: (config: ChatConfig) => void;
}

export default function ChatBlock({ config, isEditing, onConfigChange }: ChatBlockProps) {
  const {
    title = 'Chat with us',
    subtitle = 'Ask us anything!',
    placeholder = 'Type your message...',
    position = 'inline',
    primaryColor = '#6366f1',
  } = config;

  const handleChange = (field: keyof ChatConfig, value: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  if (position === 'floating') {
    // Floating chat preview (corner widget)
    return (
      <div className="py-8 px-4">
        <div className="flex justify-end">
          <div className="w-80">
            {/* Chat window preview */}
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div
                className="p-4 text-white"
                style={{ backgroundColor: primaryColor }}
              >
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => handleChange('title', e.target.value)}
                      className="w-full font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-white placeholder-white/50"
                      placeholder="Chat title..."
                    />
                    <input
                      type="text"
                      value={subtitle}
                      onChange={(e) => handleChange('subtitle', e.target.value)}
                      className="w-full text-sm bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-white/80 placeholder-white/50"
                      placeholder="Subtitle..."
                    />
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-sm text-white/80">{subtitle}</p>
                  </>
                )}
              </div>

              {/* Messages area */}
              <div className="h-48 bg-gray-50 p-4">
                <div className="flex gap-2 mb-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    AI
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-none px-4 py-2 shadow-sm max-w-[80%]">
                    <p className="text-sm text-gray-700">Hi! How can I help you today?</p>
                  </div>
                </div>
              </div>

              {/* Input area */}
              <div className="p-3 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={placeholder}
                    className="flex-1 px-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none"
                    disabled
                  />
                  <button
                    className="p-2 rounded-full text-white"
                    style={{ backgroundColor: primaryColor }}
                    disabled
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Preview note */}
            <p className="text-xs text-gray-400 text-center mt-2">
              Floating chat widget preview
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Inline chat (embedded in page)
  return (
    <div className="py-12 px-8 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          {isEditing ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center mb-2"
                placeholder="Chat title..."
              />
              <input
                type="text"
                value={subtitle}
                onChange={(e) => handleChange('subtitle', e.target.value)}
                className="w-full text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center"
                placeholder="Subtitle..."
              />
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
              <p className="text-gray-600">{subtitle}</p>
            </>
          )}
        </div>

        {/* Chat interface */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Messages area */}
          <div className="h-64 bg-gray-50 p-6 overflow-y-auto">
            {/* Welcome message */}
            <div className="flex gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                <p className="text-gray-700">
                  Hi there! I'm here to help. What would you like to know?
                </p>
              </div>
            </div>
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-gray-200 bg-white">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder={placeholder}
                className="flex-1 px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                disabled
              />
              <button
                className="p-3 rounded-xl text-white transition-transform hover:scale-105"
                style={{ backgroundColor: primaryColor }}
                disabled
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">
              Powered by AI - Chat widget preview
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
