'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Clock } from 'lucide-react';

const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

export default function CutoffSettingsView({ customer, overrides }: any) {
  const router = useRouter();
  const [defaultCutoff, setDefaultCutoff] = useState(customer.default_cutoff_time || '17:00:00');
  const [dayOverrides, setDayOverrides] = useState(() => {
    const map: Record<string, string> = {};
    overrides.forEach((o: any) => {
      map[o.day_of_week] = o.cutoff_time;
    });
    return map;
  });
  const [saving, setSaving] = useState(false);

  async function saveSettings() {
    setSaving(true);

    try {
      const response = await fetch(`/api/admin/customers/${customer.id}/cutoff-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_cutoff_time: defaultCutoff,
          day_overrides: Object.entries(dayOverrides).map(([day, time]) => ({ day, time })),
        }),
      });

      if (response.ok) {
        alert('✅ Cutoff times updated!');
        router.push('/admin');
      } else {
        alert('❌ Failed to save');
      }
    } catch (error) {
      alert('❌ Error saving');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Clock className="h-6 w-6 text-green-600" />
          Order Cutoff Times - {customer.business_name}
        </h1>

        {/* Default Cutoff */}
        <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Cutoff Time (All Days)
          </label>
          <input
            type="time"
            value={defaultCutoff}
            onChange={(e) => setDefaultCutoff(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md text-lg font-mono"
          />
          <p className="text-sm text-gray-600 mt-2">
            Orders must be placed before this time on the delivery day
          </p>
        </div>

        {/* Per-Day Overrides */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Day-Specific Overrides (Optional)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Set different cutoff times for specific days. Leave blank to use default time.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="border rounded-lg p-4">
                <label className="block text-sm font-medium capitalize mb-2">
                  {day}
                </label>
                <input
                  type="time"
                  value={dayOverrides[day] || ''}
                  onChange={(e) => setDayOverrides({ ...dayOverrides, [day]: e.target.value })}
                  placeholder={defaultCutoff}
                  className="w-full px-3 py-2 border border-gray-300 rounded font-mono"
                />
                {dayOverrides[day] && (
                  <button
                    onClick={() => {
                      const newOverrides = { ...dayOverrides };
                      delete newOverrides[day];
                      setDayOverrides(newOverrides);
                    }}
                    className="text-xs text-red-600 hover:text-red-800 mt-1"
                  >
                    Clear (use default)
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Cutoff Times'}
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}