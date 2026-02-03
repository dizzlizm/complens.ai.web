import { Zap, Shield, Heart, Star, Rocket, Target, Users, Globe, Lock, Clock, CheckCircle, Award, Plus, X } from 'lucide-react';
import { FeaturesConfig, FeatureItem } from '../types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  zap: Zap,
  shield: Shield,
  heart: Heart,
  star: Star,
  rocket: Rocket,
  target: Target,
  users: Users,
  globe: Globe,
  lock: Lock,
  clock: Clock,
  check: CheckCircle,
  award: Award,
};

const iconOptions = Object.keys(iconMap);

interface FeaturesBlockProps {
  config: FeaturesConfig;
  isEditing?: boolean;
  onConfigChange?: (config: FeaturesConfig) => void;
}

export default function FeaturesBlock({ config, isEditing, onConfigChange }: FeaturesBlockProps) {
  const {
    title = 'Features',
    subtitle = 'Everything you need to succeed',
    items = [],
    columns = 3,
  } = config;

  const handleTitleChange = (newTitle: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, title: newTitle });
    }
  };

  const handleSubtitleChange = (newSubtitle: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, subtitle: newSubtitle });
    }
  };

  const handleItemChange = (index: number, field: keyof FeatureItem, value: string) => {
    if (onConfigChange) {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [field]: value };
      onConfigChange({ ...config, items: newItems });
    }
  };

  const handleAddItem = () => {
    if (onConfigChange) {
      const newItem: FeatureItem = {
        icon: iconOptions[Math.floor(Math.random() * iconOptions.length)],
        title: 'New Feature',
        description: 'Feature description goes here',
      };
      onConfigChange({ ...config, items: [...items, newItem] });
    }
  };

  const handleRemoveItem = (index: number) => {
    if (onConfigChange) {
      const newItems = items.filter((_, i) => i !== index);
      onConfigChange({ ...config, items: newItems });
    }
  };

  const columnsClass = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className="py-16 px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          {isEditing ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full text-3xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center mb-4"
                placeholder="Section title..."
              />
              <input
                type="text"
                value={subtitle}
                onChange={(e) => handleSubtitleChange(e.target.value)}
                className="w-full text-lg text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center"
                placeholder="Section subtitle..."
              />
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{title}</h2>
              <p className="text-lg text-gray-600">{subtitle}</p>
            </>
          )}
        </div>

        {/* Features Grid */}
        <div className={`grid ${columnsClass} gap-8`}>
          {items.map((item, index) => {
            const Icon = iconMap[item.icon] || Zap;
            return (
              <div key={index} className="text-center p-6 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors relative group">
                {/* Remove button */}
                {isEditing && (
                  <button
                    onClick={() => handleRemoveItem(index)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600"
                    title="Remove feature"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Icon with selector in edit mode */}
                {isEditing ? (
                  <div className="relative inline-block mb-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-lg cursor-pointer group/icon">
                      <Icon className="w-6 h-6 text-indigo-600" />
                    </div>
                    <select
                      value={item.icon}
                      onChange={(e) => handleItemChange(index, 'icon', e.target.value)}
                      className="absolute inset-0 w-12 h-12 opacity-0 cursor-pointer"
                      title="Change icon"
                    >
                      {iconOptions.map((iconName) => (
                        <option key={iconName} value={iconName}>
                          {iconName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-lg mb-4">
                    <Icon className="w-6 h-6 text-indigo-600" />
                  </div>
                )}

                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleItemChange(index, 'title', e.target.value)}
                      className="w-full text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center mb-2"
                      placeholder="Feature title..."
                    />
                    <textarea
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      className="w-full text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center resize-none"
                      placeholder="Feature description..."
                      rows={2}
                    />
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-gray-600">{item.description}</p>
                  </>
                )}
              </div>
            );
          })}

          {/* Add feature button */}
          {isEditing && (
            <button
              onClick={handleAddItem}
              className="text-center p-6 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors flex flex-col items-center justify-center gap-2 min-h-[150px]"
            >
              <Plus className="w-8 h-8 text-gray-400" />
              <span className="text-sm text-gray-500 font-medium">Add Feature</span>
            </button>
          )}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>No features added yet. Configure this block to add features.</p>
          </div>
        )}
      </div>
    </div>
  );
}
