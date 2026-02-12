import { BarChart2, Plus, X } from 'lucide-react';
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

  const handleAddItem = () => {
    if (onConfigChange) {
      const newItem: StatItem = {
        value: '0',
        label: 'New Stat',
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
                className="w-full text-2xl font-bold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center hover:border-b hover:border-dashed hover:border-white/40 focus:border-b-2 focus:border-solid focus:border-white/60"
                placeholder="Section title (optional)..."
              />
            ) : (
              <h2 className="text-2xl font-bold text-white">{title}</h2>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className={`grid grid-cols-2 md:grid-cols-${Math.min(items.length + (isEditing ? 1 : 0), 4)} gap-8`}>
          {items.map((item, index) => (
            <div key={index} className="text-center relative group">
              {/* Remove button */}
              {isEditing && (
                <button
                  onClick={() => handleRemoveItem(index)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600"
                  title="Remove stat"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) => handleItemChange(index, 'value', e.target.value)}
                    className="w-full text-4xl md:text-5xl font-bold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center mb-2 hover:border-b hover:border-dashed hover:border-white/40 focus:border-b-2 focus:border-solid focus:border-white/60"
                    placeholder="100+"
                  />
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => handleItemChange(index, 'label', e.target.value)}
                    className="w-full text-indigo-200 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-white/30 rounded text-center hover:border-b hover:border-dashed hover:border-white/40 focus:border-b-2 focus:border-solid focus:border-white/60"
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

          {/* Add stat button */}
          {isEditing && (
            <button
              onClick={handleAddItem}
              className="text-center p-6 rounded-xl border-2 border-dashed border-indigo-400 hover:border-white hover:bg-white/10 transition-colors flex flex-col items-center justify-center gap-2 min-h-[100px]"
            >
              <Plus className="w-8 h-8 text-indigo-300" />
              <span className="text-sm text-indigo-200 font-medium">Add Stat</span>
            </button>
          )}
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
