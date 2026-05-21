
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Copy, Users, X, Trash2 } from 'lucide-react'

interface StaffMember {
  id: string
  name: string
  employment_type: string
  primary_department: string
  secondary_department: string | null
  break_minutes: number
  base_hourly_rate: number | null
  salary_weekly: number | null
  true_hourly_cost: number | null
}

interface RosterEntry {
  id: string
  staff_id: string
  work_date: string
  section: number
  department: string
  scheduled_start: string | null
  scheduled_end: string | null
  employment_type: string
  day_type: string
  status: string
  break_minutes: number
  true_hourly_cost: number | null
  manager_note: string | null
  public_holiday_name: string | null
}

interface Props {
  staff: StaffMember[]
  entries: RosterEntry[]
  weekStart: string
  weekDates: string[]
  prevWeek: string
  nextWeek: string
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_START = 4
const HOUR_END = 22
const TOTAL_HOURS = HOUR_END - HOUR_START
const SLOTS_PER_HOUR = 2
const TOTAL_SLOTS = TOTAL_HOURS * SLOTS_PER_HOUR
const SLOT_WIDTH = 28
const TIMELINE_WIDTH = TOTAL_SLOTS * SLOT_WIDTH
const STAFF_COL_WIDTH = 140
const WEEK_COL_WIDTH = 80
const ROW_HEIGHT = 48
const MAX_SECTIONS = 2

const DEPT_COLOURS: Record<string, { bg: string; barBg: string }> = {
  production: { bg: 'bg-amber-500', barBg: '#f59e0b' },
  shop:       { bg: 'bg-blue-500',  barBg: '#3b82f6' },
  delivery:   { bg: 'bg-green-500', barBg: '#22c55e' },
  admin:      { bg: 'bg-gray-500',  barBg: '#6b7280' },
  management: { bg: 'bg-purple-500', barBg: '#a855f7' },
}

function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return Math.max(0, Math.min(TOTAL_SLOTS, ((h * 60 + m) - HOUR_START * 60) / 30))
}

function slotToTime(slot: number): string {
  const totalMinutes = (HOUR_START * 60) + (slot * 30)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function slotToLabel(slot: number): string {
  const totalMinutes = (HOUR_START * 60) + (slot * 30)
  const h = Math.floor(totalMinutes / 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${ampm}`
}

function estimatedHours(entry: RosterEntry): number {
  if (!entry.scheduled_start || !entry.scheduled_end) return 0
  const [sh, sm] = entry.scheduled_start.split(':').map(Number)
  const [eh, em] = entry.scheduled_end.split(':').map(Number)
  const grossMins = (eh * 60 + em) - (sh * 60 + sm)
  const breakMins = grossMins >= 270 ? (entry.break_minutes ?? 0) : 0
  return Math.round((Math.max(0, grossMins - breakMins)) / 60 * 100) / 100
}

function fmtTimeShort(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`
}

export default function RosterGrid({ staff, entries, weekStart, weekDates, prevWeek, nextWeek }: Props) {
  const router = useRouter()
  const [localEntries, setLocalEntries] = useState<RosterEntry[]>(entries)
  const [activeDay, setActiveDay] = useState<number>(() => {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })).toISOString().split('T')[0]
    const idx = weekDates.indexOf(today)
    return idx >= 0 ? idx : 1
  })
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragState, setDragState] = useState<{
    type: 'create' | 'move' | 'resize-left' | 'resize-right'
    staffId: string; startSlot: number; currentSlot: number
    entryId?: string; originalStart?: number; originalEnd?: number
  } | null>(null)
  const [editEntry, setEditEntry] = useState<{ entry: RosterEntry | null; staffId: string; date: string } | null>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const currentDate = weekDates[activeDay]
  const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' })).toISOString().split('T')[0]

  const weekLabel = (() => {
    const s = new Date(weekStart + 'T00:00:00')
    const e = new Date(weekDates[6] + 'T00:00:00')
    return `${s.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
  })()

  function getEntries(staffId: string, date: string): RosterEntry[] {
    return localEntries.filter(e => e.staff_id === staffId && e.work_date === date && e.status !== 'rostered_off').sort((a, b) => (a.section ?? 1) - (b.section ?? 1))
  }
  function isRosteredOff(staffId: string, date: string): boolean {
    return localEntries.some(e => e.staff_id === staffId && e.work_date === date && e.status === 'rostered_off')
  }
  function staffDayHours(staffId: string, date: string): number {
    return getEntries(staffId, date).reduce((sum, e) => sum + estimatedHours(e), 0)
  }
  function staffWeekHours(staffId: string): number {
    return weekDates.reduce((sum, d) => sum + staffDayHours(staffId, d), 0)
  }
  function staffWeekCost(s: StaffMember): number {
    if (s.employment_type === 'salary') {
      return weekDates.filter(d => getEntries(s.id, d).length > 0).length > 0 ? Number(s.salary_weekly ?? 0) : 0
    }
    return Math.round(staffWeekHours(s.id) * Number(s.true_hourly_cost ?? 0) * 100) / 100
  }
  const totalWeeklyCost = staff.reduce((sum, s) => sum + staffWeekCost(s), 0)
  const totalWeeklyHours = staff.reduce((sum, s) => sum + staffWeekHours(s.id), 0)

  async function handleCopyLastWeek() {
    if (!confirm(`Copy last week's roster to ${weekLabel}?\nExisting entries will be overwritten.`)) return
    setCopying(true); setCopyResult(null)
    try {
      const res = await fetch('/api/admin/roster/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_week_start: prevWeek, to_week_start: weekStart }) })
      const data = await res.json()
      if (res.ok && data.success) { setCopyResult(`Copied ${data.copied} entries`); router.refresh() }
      else setCopyResult(`Error: ${data.error ?? 'Copy failed'}`)
    } catch (e: any) { setCopyResult(`Error: ${e.message}`) }
    finally { setCopying(false) }
  }

  const saveEntry = useCallback(async (staffId: string, date: string, startTime: string, endTime: string, existingId?: string) => {
    setSaving(true)
    try {
      if (existingId) {
        const res = await fetch(`/api/admin/roster/${existingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduled_start: startTime, scheduled_end: endTime }) })
        const data = await res.json()
        if (res.ok) setLocalEntries(prev => prev.map(e => e.id === existingId ? data.entry : e))
      } else {
        const existing = localEntries.filter(e => e.staff_id === staffId && e.work_date === date && e.status !== 'rostered_off')
        const usedSections = existing.map(e => e.section)
        let useSection = 1
        for (let s = 1; s <= MAX_SECTIONS; s++) { if (!usedSections.includes(s)) { useSection = s; break } }
        const res = await fetch('/api/admin/roster/entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: staffId, work_date: date, section: useSection, scheduled_start: startTime, scheduled_end: endTime }) })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => {
            const exists = prev.find(e => e.staff_id === staffId && e.work_date === date && e.section === useSection)
            if (exists) return prev.map(e => e.id === exists.id ? data.entry : e)
            return [...prev, data.entry]
          })
        }
      }
    } catch (e) { console.error('Save failed', e) }
    finally { setSaving(false) }
  }, [localEntries])

  async function handleDelete(entryId: string) {
    setSaving(true)
    try { await fetch(`/api/admin/roster/${entryId}`, { method: 'DELETE' }); setLocalEntries(prev => prev.filter(e => e.id !== entryId)) }
    finally { setSaving(false); setEditEntry(null) }
  }

  const getSlotFromX = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(TOTAL_SLOTS, Math.round((clientX - rect.left + timelineRef.current.scrollLeft) / SLOT_WIDTH)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, staffId: string, type: 'create' | 'move' | 'resize-left' | 'resize-right', entryId?: string, originalStart?: number, originalEnd?: number) => {
    e.preventDefault(); e.stopPropagation()
    setDragState({ type, staffId, startSlot: getSlotFromX(e.clientX), currentSlot: getSlotFromX(e.clientX), entryId, originalStart, originalEnd })
  }, [getSlotFromX])

  useEffect(() => {
    if (!dragState) return
    const handleMouseMove = (e: MouseEvent) => { setDragState(prev => prev ? { ...prev, currentSlot: getSlotFromX(e.clientX) } : null) }
    const handleMouseUp = async () => {
      if (!dragState) return
      const { type, staffId, startSlot, currentSlot, entryId, originalStart, originalEnd } = dragState
      setDragState(null)
      let fs: number, fe: number
      if (type === 'create') { fs = Math.min(startSlot, currentSlot); fe = Math.max(startSlot, currentSlot); if (fe - fs < 1) fe = fs + 2 }
      else if (type === 'move') { const d = currentSlot - startSlot; fs = (originalStart ?? 0) + d; fe = (originalEnd ?? 0) + d; if (fs < 0) { fe -= fs; fs = 0 }; if (fe > TOTAL_SLOTS) { fs -= (fe - TOTAL_SLOTS); fe = TOTAL_SLOTS } }
      else if (type === 'resize-left') { fs = Math.min(currentSlot, (originalEnd ?? TOTAL_SLOTS) - 1); fe = originalEnd ?? TOTAL_SLOTS }
      else { fs = originalStart ?? 0; fe = Math.max(currentSlot, (originalStart ?? 0) + 1) }
      fs = Math.max(0, Math.min(TOTAL_SLOTS - 1, fs)); fe = Math.max(fs + 1, Math.min(TOTAL_SLOTS, fe))
      await saveEntry(staffId, currentDate, slotToTime(fs), slotToTime(fe), entryId)
    }
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [dragState, currentDate, getSlotFromX, saveEntry])

  function getBarForEntry(entry: RosterEntry): { left: number; width: number } | null {
    if (!entry.scheduled_start || !entry.scheduled_end) return null
    const s = timeToSlot(entry.scheduled_start), e = timeToSlot(entry.scheduled_end)
    return { left: s * SLOT_WIDTH, width: Math.max((e - s) * SLOT_WIDTH, SLOT_WIDTH) }
  }

  function getDragPreview(): { staffId: string; left: number; width: number } | null {
    if (!dragState) return null
    const { type, staffId, startSlot, currentSlot, originalStart, originalEnd } = dragState
    let s: number, e: number
    if (type === 'create') { s = Math.min(startSlot, currentSlot); e = Math.max(startSlot, currentSlot); if (e - s < 1) e = s + 2 }
    else if (type === 'move') { const d = currentSlot - startSlot; s = (originalStart ?? 0) + d; e = (originalEnd ?? 0) + d }
    else if (type === 'resize-left') { s = Math.min(currentSlot, (originalEnd ?? TOTAL_SLOTS) - 1); e = originalEnd ?? TOTAL_SLOTS }
    else { s = originalStart ?? 0; e = Math.max(currentSlot, (originalStart ?? 0) + 1) }
    s = Math.max(0, s); e = Math.min(TOTAL_SLOTS, e)
    return { staffId, left: s * SLOT_WIDTH, width: Math.max((e - s) * SLOT_WIDTH, SLOT_WIDTH) }
  }

  function openEditModal(sm: StaffMember, entry: RosterEntry | null) {
    const dow = new Date(currentDate + 'T00:00:00').getDay()
    setEditEntry({ entry, staffId: sm.id, date: currentDate })
    setEditForm({ scheduled_start: entry?.scheduled_start ?? '06:00', scheduled_end: entry?.scheduled_end ?? '14:00', department: entry?.department ?? sm.primary_department, day_type: entry?.day_type ?? (dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'normal'), public_holiday_name: entry?.public_holiday_name ?? '', manager_note: entry?.manager_note ?? '' })
  }

  async function handleSaveModal() {
    if (!editEntry || !editForm) return
    setSaving(true)
    try {
      if (editEntry.entry) {
        const res = await fetch(`/api/admin/roster/${editEntry.entry.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
        const data = await res.json()
        if (res.ok) setLocalEntries(prev => prev.map(e => e.id === editEntry.entry!.id ? data.entry : e))
      } else {
        const existing = localEntries.filter(e => e.staff_id === editEntry.staffId && e.work_date === editEntry.date && e.status !== 'rostered_off')
        let useSection = 1
        for (let s = 1; s <= MAX_SECTIONS; s++) { if (!existing.map(e => e.section).includes(s)) { useSection = s; break } }
        const res = await fetch('/api/admin/roster/entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: editEntry.staffId, work_date: editEntry.date, section: useSection, ...editForm }) })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => {
            const exists = prev.find(e => e.staff_id === editEntry.staffId && e.work_date === editEntry.date && e.section === useSection)
            if (exists) return prev.map(e => e.id === exists.id ? data.entry : e)
            return [...prev, data.entry]
          })
        }
      }
      setEditEntry(null)
    } finally { setSaving(false) }
  }

  const dragPreview = getDragPreview()
  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500'

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-50 z-40">
    {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1 bg-stone-50 border-b flex-shrink-0 flex-wrap">
        <a href="/admin" className="p-1 border rounded hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></a>
        <span className="text-sm font-bold">Roster</span>
        <span className="text-xs text-gray-400 hidden sm:inline">{weekLabel} · {totalWeeklyHours.toFixed(1)}h · ${totalWeeklyCost.toFixed(0)}</span>
        <div className="flex-1" />
        {weekDates.map((date, i) => (
          <button key={date} onClick={() => setActiveDay(i)} className={`px-2 py-0.5 rounded text-xs font-medium ${i === activeDay ? 'bg-amber-700 text-white' : date === todayStr ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-100'}`}>{DAY_LABELS[i]}</button>
        ))}
        <div className="flex-1" />
        <a href={`/admin/roster?week=${prevWeek}`} className="p-1 border rounded hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></a>
        <a href={`/admin/roster?week=${nextWeek}`} className="p-1 border rounded hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></a>
        <button onClick={handleCopyLastWeek} disabled={copying} className="px-2 py-1 bg-amber-700 text-white rounded text-xs hover:bg-amber-800 disabled:opacity-50">{copying ? '...' : 'Copy Wk'}</button>
        <a href="/admin/staff" className="px-2 py-1 border rounded text-xs hover:bg-gray-100">Staff</a>
        {saving && <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />}
      </div>

      {copyResult && (
        <div className={`px-2 py-1 text-xs flex-shrink-0 flex justify-between ${copyResult.includes('Copied') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {copyResult}<button onClick={() => setCopyResult(null)} className="ml-2">✕</button>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-hidden flex">
        {/* Staff names */}
        <div className="flex-shrink-0 bg-white border-r overflow-hidden" style={{ width: STAFF_COL_WIDTH }}>
          <div className="h-8 border-b bg-gray-50 flex items-center px-2"><span className="text-xs font-semibold text-gray-500">Staff</span></div>
          {staff.map(s => {
            const dept = DEPT_COLOURS[s.primary_department] ?? DEPT_COLOURS.admin
            return (
              <div key={s.id} className="border-b flex items-center px-2" style={{ height: ROW_HEIGHT }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{s.name}</p>
                  <div className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${dept.bg}`} /><span className="text-[10px] text-gray-400 capitalize">{s.primary_department}</span></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Timeline area */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={timelineRef}>
          <div style={{ width: TIMELINE_WIDTH, minWidth: '100%' }}>
            <div className="h-8 border-b bg-gray-50 flex">
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div key={i} className="flex-shrink-0 border-l border-gray-200 flex items-end px-1 pb-0.5" style={{ width: SLOT_WIDTH * SLOTS_PER_HOUR }}>
                  <span className="text-[10px] text-gray-400">{slotToLabel(i * SLOTS_PER_HOUR)}</span>
                </div>
              ))}
            </div>
            {staff.map(s => {
              const staffEntries = getEntries(s.id, currentDate)
              const off = isRosteredOff(s.id, currentDate)
              const dept = DEPT_COLOURS[s.primary_department] ?? DEPT_COLOURS.admin
              const showDrag = dragPreview && dragPreview.staffId === s.id
              return (
                <div key={s.id} className="border-b relative group" style={{ height: ROW_HEIGHT }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('[data-bar]')) return
                    if (!off && staffEntries.length < MAX_SECTIONS) handleMouseDown(e, s.id, 'create')
                  }}
                  onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('[data-bar]')) openEditModal(s, null) }}>
                  <div className="absolute inset-0 flex pointer-events-none">
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div key={i} className="flex-shrink-0 border-l border-gray-100" style={{ width: SLOT_WIDTH * SLOTS_PER_HOUR }} />
                    ))}
                  </div>
                  {currentDate === todayStr && (() => {
                    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
                    const ns = timeToSlot(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
                    return ns > 0 && ns < TOTAL_SLOTS ? <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none" style={{ left: ns * SLOT_WIDTH }} /> : null
                  })()}
                  {!off && !showDrag && staffEntries.map(entry => {
                    const bar = getBarForEntry(entry)
                    if (!bar) return null
                    const eDept = DEPT_COLOURS[entry.department ?? s.primary_department] ?? DEPT_COLOURS.admin
                    return (
                      <div key={entry.id} data-bar="true" className="absolute top-1 bottom-1 rounded-md shadow-sm flex items-center cursor-move hover:shadow-md select-none overflow-hidden"
                        style={{ left: bar.left, width: bar.width, backgroundColor: eDept.barBg }}
                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, s.id, 'move', entry.id, timeToSlot(entry.scheduled_start!), timeToSlot(entry.scheduled_end!)) }}
                        onDoubleClick={(e) => { e.stopPropagation(); openEditModal(s, entry) }}>
                        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize hover:bg-white/30 rounded-l-md"
                          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, s.id, 'resize-left', entry.id, timeToSlot(entry.scheduled_start!), timeToSlot(entry.scheduled_end!)) }} />
                        <div className="flex-1 px-1.5 flex items-center gap-1 min-w-0 pointer-events-none">
                          <span className="text-[11px] font-bold text-white truncate">{fmtTimeShort(entry.scheduled_start!)}–{fmtTimeShort(entry.scheduled_end!)}</span>
                          {bar.width > 90 && <span className="text-[10px] text-white/80">{estimatedHours(entry).toFixed(1)}h</span>}
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize hover:bg-white/30 rounded-r-md"
                          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, s.id, 'resize-right', entry.id, timeToSlot(entry.scheduled_start!), timeToSlot(entry.scheduled_end!)) }} />
                      </div>
                    )
                  })}
                  {showDrag && <div className="absolute top-1 bottom-1 rounded-md border-2 border-dashed pointer-events-none z-10" style={{ left: dragPreview.left, width: dragPreview.width, backgroundColor: `${dept.barBg}40`, borderColor: dept.barBg }} />}
                  {off && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 italic">Off</div>}
                  {staffEntries.length === 0 && !off && !showDrag && <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"><span className="text-[10px] text-gray-300">drag to add</span></div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Week totals */}
        <div className="flex-shrink-0 bg-white border-l overflow-hidden" style={{ width: WEEK_COL_WIDTH }}>
          <div className="h-8 border-b bg-gray-50 flex items-center justify-center"><span className="text-[10px] font-semibold text-gray-500">Week</span></div>
          {staff.map(s => (
            <div key={s.id} className="border-b flex flex-col items-center justify-center" style={{ height: ROW_HEIGHT }}>
              <span className="text-xs font-bold">{staffWeekHours(s.id).toFixed(1)}h</span>
              <span className="text-[10px] text-amber-600">${staffWeekCost(s).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editEntry && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditEntry(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{editEntry.entry ? 'Edit Shift' : 'Add Shift'}</h3>
                <p className="text-sm text-gray-500">{staff.find(s => s.id === editEntry.staffId)?.name} · {new Date(editEntry.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {editEntry.entry && editEntry.entry.section > 1 && <span className="ml-1 text-amber-600">(Split #{editEntry.entry.section})</span>}
                </p>
              </div>
              <button onClick={() => setEditEntry(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                <select value={editForm.department} onChange={e => setEditForm((p: any) => ({ ...p, department: e.target.value }))} className={inp}>
                  <option value="production">🍞 Production</option><option value="shop">🏪 Shop</option><option value="delivery">🚚 Delivery</option><option value="admin">📋 Admin</option><option value="management">👔 Management</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Start</label><input type="time" value={editForm.scheduled_start} onChange={e => setEditForm((p: any) => ({ ...p, scheduled_start: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Finish</label><input type="time" value={editForm.scheduled_end} onChange={e => setEditForm((p: any) => ({ ...p, scheduled_end: e.target.value }))} className={inp} /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Day Type</label>
                <select value={editForm.day_type} onChange={e => setEditForm((p: any) => ({ ...p, day_type: e.target.value }))} className={inp}>
                  <option value="normal">Normal</option><option value="saturday">Saturday</option><option value="sunday">Sunday</option><option value="public_holiday">Public Holiday</option><option value="leave">Leave</option>
                </select>
              </div>
              {editForm.day_type === 'public_holiday' && <div><label className="block text-xs font-medium text-gray-700 mb-1">Holiday Name</label><input type="text" value={editForm.public_holiday_name} onChange={e => setEditForm((p: any) => ({ ...p, public_holiday_name: e.target.value }))} className={inp} placeholder="e.g. Easter Monday" /></div>}
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Note</label><input type="text" value={editForm.manager_note} onChange={e => setEditForm((p: any) => ({ ...p, manager_note: e.target.value }))} className={inp} placeholder="Optional..." /></div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <button onClick={handleSaveModal} disabled={saving} className="flex-1 py-2 bg-amber-700 text-white rounded-lg text-sm font-medium hover:bg-amber-800 disabled:opacity-50">{saving ? 'Saving...' : editEntry.entry ? 'Update' : 'Add Shift'}</button>
              {editEntry.entry && <button onClick={() => handleDelete(editEntry.entry!.id)} disabled={saving} className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm hover:bg-red-100 flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" />Del</button>}
              <button onClick={() => setEditEntry(null)} disabled={saving} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

