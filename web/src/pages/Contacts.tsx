import { Plus, Search, Upload, MoreVertical, Mail, Phone } from 'lucide-react';

const contacts = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    phone: '+1 (555) 123-4567',
    tags: ['lead', 'newsletter'],
    lastActive: '2 hours ago',
  },
  {
    id: '2',
    name: 'Mike Chen',
    email: 'mike.chen@example.com',
    phone: '+1 (555) 234-5678',
    tags: ['customer', 'vip'],
    lastActive: '1 day ago',
  },
  {
    id: '3',
    name: 'Emily Davis',
    email: 'emily.d@example.com',
    phone: '+1 (555) 345-6789',
    tags: ['lead'],
    lastActive: '3 days ago',
  },
  {
    id: '4',
    name: 'James Wilson',
    email: 'j.wilson@example.com',
    phone: '+1 (555) 456-7890',
    tags: ['customer', 'enterprise'],
    lastActive: '1 week ago',
  },
];

export default function Contacts() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-gray-500">Manage your contact list and segments</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary inline-flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import
          </button>
          <button className="btn btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            className="input pl-10"
          />
        </div>
        <select className="input w-full sm:w-40">
          <option>All Tags</option>
          <option>lead</option>
          <option>customer</option>
          <option>vip</option>
          <option>newsletter</option>
        </select>
      </div>

      {/* Contacts list */}
      <div className="card p-0 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input type="checkbox" className="rounded border-gray-300" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Active
              </th>
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <input type="checkbox" className="rounded border-gray-300" />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium">
                      {contact.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{contact.name}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          {contact.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          {contact.phone}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {contact.lastActive}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium">
                  <button className="p-1 text-gray-400 hover:text-gray-600">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing 1 to 4 of 2,451 contacts
        </p>
        <div className="flex gap-2">
          <button className="btn btn-secondary" disabled>Previous</button>
          <button className="btn btn-secondary">Next</button>
        </div>
      </div>
    </div>
  );
}
