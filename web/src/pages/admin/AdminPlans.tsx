import { useState } from 'react';
import { useAdminPlans, useUpdatePlan, type AdminPlanConfig } from '@/lib/hooks/useAdmin';
import { Save, Loader2, Star, Pencil, X } from 'lucide-react';

export default function AdminPlans() {
  const { data: plans, isLoading, error } = useAdminPlans();
  const updatePlan = useUpdatePlan();
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AdminPlanConfig>>({});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (error || !plans) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load plan configurations</p>
      </div>
    );
  }

  const startEditing = (plan: AdminPlanConfig) => {
    setEditingPlan(plan.plan_key);
    setEditForm({
      display_name: plan.display_name,
      price_monthly: plan.price_monthly,
      description: plan.description,
      limits: { ...plan.limits },
      features: { ...plan.features },
      feature_list: [...plan.feature_list],
      highlighted: plan.highlighted,
    });
  };

  const cancelEditing = () => {
    setEditingPlan(null);
    setEditForm({});
  };

  const handleSave = async (planKey: string) => {
    await updatePlan.mutateAsync({ planKey, ...editForm });
    setEditingPlan(null);
    setEditForm({});
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Plans</h1>
        <p className="text-gray-400 mt-1">Manage pricing tiers and feature limits</p>
      </div>

      <div className="space-y-6">
        {plans.map((plan) => {
          const isEditing = editingPlan === plan.plan_key;

          return (
            <div key={plan.plan_key} className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white">{plan.display_name}</h2>
                  <span className="text-xs font-mono px-2 py-1 bg-gray-700 text-gray-400 rounded">
                    {plan.plan_key}
                  </span>
                  {plan.highlighted && (
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleSave(plan.plan_key)}
                        disabled={updatePlan.isPending}
                        className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {updatePlan.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Save
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEditing(plan)}
                      className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Basic Info */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Basic Info</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">Display Name</label>
                      {isEditing ? (
                        <input
                          className="w-full mt-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          value={editForm.display_name ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        />
                      ) : (
                        <p className="text-white text-sm">{plan.display_name}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Price ($/month)</label>
                      {isEditing ? (
                        <input
                          type="number"
                          className="w-full mt-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          value={editForm.price_monthly ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, price_monthly: parseInt(e.target.value) || 0 })}
                        />
                      ) : (
                        <p className="text-white text-sm">${plan.price_monthly}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Description</label>
                      {isEditing ? (
                        <input
                          className="w-full mt-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          value={editForm.description ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        />
                      ) : (
                        <p className="text-gray-300 text-sm">{plan.description}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Resource Limits */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Resource Limits</h3>
                  <div className="space-y-2">
                    {Object.entries(plan.limits).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{key.replace(/_/g, ' ')}</span>
                        {isEditing ? (
                          <input
                            type="number"
                            className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm text-right"
                            value={editForm.limits?.[key] ?? value}
                            onChange={(e) => {
                              const newLimits = { ...editForm.limits, [key]: parseInt(e.target.value) || 0 };
                              setEditForm({ ...editForm, limits: newLimits });
                            }}
                          />
                        ) : (
                          <span className="text-sm font-mono text-white">
                            {value === -1 ? 'unlimited' : value.toLocaleString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Boolean Features */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Features</h3>
                  <div className="space-y-2">
                    {Object.entries(plan.features).map(([key, enabled]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{key.replace(/_/g, ' ')}</span>
                        {isEditing ? (
                          <button
                            onClick={() => {
                              const newFeatures = { ...editForm.features, [key]: !editForm.features?.[key] };
                              setEditForm({ ...editForm, features: newFeatures });
                            }}
                            className={`px-2 py-0.5 text-xs rounded ${
                              (editForm.features?.[key] ?? enabled)
                                ? 'bg-green-600/20 text-green-400'
                                : 'bg-gray-700 text-gray-500'
                            }`}
                          >
                            {(editForm.features?.[key] ?? enabled) ? 'Enabled' : 'Disabled'}
                          </button>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            enabled ? 'bg-green-600/20 text-green-400' : 'bg-gray-700 text-gray-500'
                          }`}>
                            {enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Feature List (display strings) */}
              {isEditing && (
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Feature List (display strings)</h3>
                  <textarea
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono"
                    rows={6}
                    value={(editForm.feature_list ?? []).join('\n')}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      feature_list: e.target.value.split('\n').filter(Boolean),
                    })}
                  />
                  <p className="text-xs text-gray-500 mt-1">One feature per line. These are shown in the pricing table.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
