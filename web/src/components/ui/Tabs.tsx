interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  size?: 'sm' | 'md' | 'lg';
}

const paddingMap = { sm: 'py-2', md: 'py-3', lg: 'py-4' } as const;

export default function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  size = 'lg',
}: TabsProps<T>) {
  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`${paddingMap[size]} px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
