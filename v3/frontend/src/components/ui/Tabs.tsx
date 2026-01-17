import { type ReactNode, createContext, useContext, useState } from 'react';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  defaultTab: string;
  children: ReactNode;
  onChange?: (tabId: string) => void;
}

export function Tabs({ defaultTab, children, onChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    onChange?.(id);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleTabChange }}>
      {children}
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: ReactNode;
  variant?: 'default' | 'pills' | 'underline';
  fullWidth?: boolean;
}

export function TabList({ children, variant = 'pills', fullWidth = false }: TabListProps) {
  const baseStyles = 'flex gap-1 overflow-x-auto hide-scrollbar';

  const variantStyles = {
    default: 'bg-gray-100 p-1 rounded-xl',
    pills: '',
    underline: 'border-b border-gray-200',
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${fullWidth ? 'w-full' : ''}`}>
      {children}
    </div>
  );
}

interface TabProps {
  id: string;
  children: ReactNode;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

export function Tab({ id, children, count, icon, disabled = false }: TabProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab must be used within Tabs');

  const { activeTab, setActiveTab } = context;
  const isActive = activeTab === id;

  return (
    <button
      onClick={() => !disabled && setActiveTab(id)}
      disabled={disabled}
      className={`
        flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl
        whitespace-nowrap transition-all duration-150
        ${isActive
          ? 'bg-brand-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
      {count !== undefined && (
        <span
          className={`
            px-1.5 py-0.5 text-xs rounded-full min-w-[20px] text-center
            ${isActive ? 'bg-white/20' : 'bg-gray-200 text-gray-600'}
          `}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface TabPanelProps {
  id: string;
  children: ReactNode;
}

export function TabPanel({ id, children }: TabPanelProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanel must be used within Tabs');

  if (context.activeTab !== id) return null;

  return <div className="mt-4">{children}</div>;
}

// Standalone scrollable filter tabs (for simpler use cases)
interface FilterTab {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface FilterTabsProps {
  tabs: FilterTab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function FilterTabs({ tabs, activeTab, onChange }: FilterTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`
            flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl
            whitespace-nowrap transition-all duration-150
            ${activeTab === tab.id
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }
          `}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`
                px-1.5 py-0.5 text-xs rounded-full min-w-[20px] text-center
                ${activeTab === tab.id ? 'bg-white/20' : 'bg-gray-200'}
              `}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
