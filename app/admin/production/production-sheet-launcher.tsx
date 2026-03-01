'use client';

import { useState } from 'react';
import { Printer, Eye } from 'lucide-react';

function getDatesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00`);
  const last    = new Date(`${end}T00:00:00`);
  if (current > last) return [];
  while (current <= last) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export default function ProductionSheetLauncher() {
  const [open, setOpen]           = useState(false);
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [endDate, setEndDate]     = useState<string>(todayISO());

  const selectedDates = getDatesBetween(startDate, endDate);
  const dayCount      = selectedDates.length;

  function setToday() {
    const t = todayISO(); setStartDate(t); setEndDate(t);
  }
  function setTomorrow() {
    const t = tomorrowISO(); setStartDate(t); setEndDate(t);
  }
  function setTodayAndTomorrow() {
    setStartDate(todayISO()); setEndDate(tomorrowISO());
  }
  function setNextWeek() {
    const s = new Date(); s.setDate(s.getDate() + 1);
    const e = new Date(); e.setDate(e.getDate() + 7);
    setStartDate(s.toISOString().split('T')[0]);
    setEndDate(e.toISOString().split('T')[0]);
  }

  function buildUrl(autoprint = false) {
    const params = new URLSearchParams({ dates: selectedDates.join(',') });
    if (autoprint) params.set('autoprint', '1');
    return `/admin/production/print?${params}`;
  }

  function handleView() {
    if (dayCount === 0) return;
    window.open(buildUrl(false), '_blank');
    setOpen(false);
  }

  function handlePrint() {
    if (dayCount === 0) return;
    window.open(buildUrl(true), '_blank');
    setOpen(false);
  }

  const rangeLabel = startDate === endDate
    ? formatLabel(startDate)
    : `${formatLabel(startDate)} to ${formatLabel(endDate)}`;

  return (
    <div className="relative">

      {/* ── Trigger ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-semibold hover:opacity-90"
        style={{ backgroundColor: '#006A4E' }}
      >
        <Printer className="h-4 w-4" />
        Production Sheet
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-12 z-20 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 space-y-4">

            <p className="text-sm font-semibold text-gray-700">Select date range:</p>

            {/* ── Presets ── */}
            <div className="flex gap-2 flex-wrap">
              {[
                { label: 'Today',            fn: setToday },
                { label: 'Tomorrow',         fn: setTomorrow },
                { label: 'Today+Tomorrow',   fn: setTodayAndTomorrow },
                { label: 'Next 7 Days',      fn: setNextWeek },
              ].map(({ label, fn }) => (
                <button
                  key={label}
                  onClick={fn}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Date inputs ── */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    if (e.target.value > endDate) setEndDate(e.target.value);
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
            </div>

            {/* ── Preview chips ── */}
            {dayCount > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-green-800 mb-1">
                  {dayCount} day{dayCount > 1 ? 's' : ''} selected:
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedDates.map(d => (
                    <span key={d} className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                      {formatLabel(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {dayCount > 7 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                Warning: {dayCount} days selected — may be slow to load.
              </p>
            )}

            {/* ── View / Print buttons ── */}
            <div className="flex gap-2">
              <button
                onClick={handleView}
                disabled={dayCount === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-semibold text-sm border-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: '#006A4E', color: '#006A4E' }}
              >
                <Eye className="h-4 w-4" />
                View
              </button>
              <button
                onClick={handlePrint}
                disabled={dayCount === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#CE1126' }}
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>

            {dayCount > 0 && (
              <p className="text-xs text-center text-gray-400">{rangeLabel}</p>
            )}

          </div>
        </>
      )}
    </div>
  );
}