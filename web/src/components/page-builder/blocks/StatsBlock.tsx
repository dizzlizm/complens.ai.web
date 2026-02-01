import { BarChart2 } from 'lucide-react';
import { StatsConfig, StatItem } from '../types';

interface StatsBlockProps {
  config: StatsConfig;
  isEditing?: boolean;
  onConfigChange?: (config: StatsConfig) => void;
}

export default function StatsBlock({ config, isEditing, onConfigChange }: StatsBlockProps) {
  const {
    title = '',
    items = [],
  } = config;

  const handleTitleChange = (newTitle: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, title: newTitle });
    }
  };

  const handleItemChange = (index: number, field: keyof StatItem, value: string) => {
    if (onConfigChange) {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [field]: value };
      onConfigChange({ ...config, items: newItems });
    }
  };

  return (
    <div className="py-16 px-8 bg-indigo-600">
      <div className="max-w-6xl mx-auto">
        {/* Title */}
        {(title || isEditing) && (
          <div className="text-center mb-12">
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full text-2xl font-bold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center"
                placeholder="Section title (optional)..."
              />
            ) : (
              <h2 className="text-2xl font-bold text-white">{title}</h2>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className={`grid grid-cols-2 md:grid-cols-${Math.min(items.length, 4)} gap-8`}>
          {items.map((item, index) => (
            <div key={index} className="text-center">
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) => handleItemChange(index, 'value', e.target.value)}
                    className="w-full text-4xl md:text-5xl font-bold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center mb-2"
                    placeholder="100+"
                  />
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => handleItemChange(index, 'label', e.target.value)}
                    className="w-full text-indigo-200 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center"
                    placeholder="Label"
                  />
                </>
              ) : (
                <>
                  <p className="text-4xl md:text-5xl font-bold text-white mb-2">{item.value}</p>
                  <p className="text-indigo-200">{item.label}</p>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-8 text-indigo-200">
            <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No stats added yet. Configure this block to add numbers.</p>
          </div>
        )}
      </div>
    </div>
  );
}
