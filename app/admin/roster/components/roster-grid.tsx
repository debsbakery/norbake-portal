// app/admin/roster/components/roster-grid.tsx
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Copy, Calendar, Users, Clock, DollarSign, X, Trash2 } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Constants ────────────────────────────────────────────────────────────────
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_START = 4   // 4 AM
const HOUR_END = 22    // 10 PM
const TOTAL_HOURS = HOUR_END - HOUR_START
const SLOTS_PER_HOUR = 2  // 30 min slots
const TOTAL_SLOTS = TOTAL_HOURS * SLOTS_PER_HOUR
const SLOT_WIDTH = 28  // pixels per 30-min slot
const TIMELINE_WIDTH = TOTAL_SLOTS * SLOT_WIDTH
const STAFF_COL_WIDTH = 160
const WEEK_COL_WIDTH = 90
const ROW_HEIGHT = 52

const DEPT_COLOURS: Record<string, { bg: string; border: string; text: string; barBg: string }> = {
  production: { bg: 'bg-amber-500', border: 'border-amber-600', text: 'text-white', barBg: '#f59e0b' },
  shop:       { bg: 'bg-blue-500',  border: 'border-blue-600',  text: 'text-white', barBg: '#3b82f6' },
  delivery:   { bg: 'bg-green-500', border: 'border-green-600', text: 'text-white', barBg: '#22c55e' },
  admin:      { bg: 'bg-gray-500',  border: 'border-gray-600',  text: 'text-white', barBg: '#6b7280' },
  management: { bg: 'bg-purple-500',border: 'border-purple-600',text: 'text-white', barBg: '#a855f7' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + m
  const startMinutes = HOUR_START * 60
  return Math.max(0, Math.min(TOTAL_SLOTS, (totalMinutes - startMinutes) / 30))
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
  const m = totalMinutes % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}`
}

function estimatedHours(entry: RosterEntry): number {
  if (!entry.scheduled_start || !entry.scheduled_end) return 0
  const [sh, sm] = entry.scheduled_start.split(':').map(Number)
  const [eh, em] = entry.scheduled_end.split(':').map(Number)
  const grossMins = (eh * 60 + em) - (sh * 60 + sm)
  const paidMins = Math.max(0, grossMins - (entry.break_minutes ?? 0))
  return Math.round((paidMins / 60) * 100) / 100
}

function fmtTimeShort(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`
}

// ── Component ────────────────────────────────────────────────────────────────
export default function RosterGrid({
  staff, entries, weekStart, weekDates, prevWeek, nextWeek,
}: Props) {
  const router = useRouter()
  const [localEntries, setLocalEntries] = useState<RosterEntry[]>(entries)
  const [activeDay, setActiveDay] = useState<number>(() => {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
      .toISOString().split('T')[0]
    const idx = weekDates.indexOf(today)
    return idx >= 0 ? idx : 1 // Default to Monday if today isn't in this week
  })
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Drag state
  const [dragState, setDragState] = useState<{
    type: 'create' | 'move' | 'resize-left' | 'resize-right'
    staffId: string
    startSlot: number
    currentSlot: number
    entryId?: string
    originalStart?: number
    originalEnd?: number
  } | null>(null)

  // Edit modal
  const [editEntry, setEditEntry] = useState<{
    entry: RosterEntry | null
    staffId: string
    date: string
  } | null>(null)
  const [editForm, setEditForm] = useState<any>(null)

  const timelineRef = useRef<HTMLDivElement>(null)
  const currentDate = weekDates[activeDay]

  // ── Week calculations ──────────────────────────────────────────────────────
  const weekLabel = (() => {
    const s = new Date(weekStart + 'T00:00:00')
    const e = new Date(weekDates[6] + 'T00:00:00')
    return `${s.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
  })()

  function getEntry(staffId: string, date: string): RosterEntry | null {
    return localEntries.find(
      e => e.staff_id === staffId && e.work_date === date && e.section === 1
    ) ?? null
  }

  function staffDayHours(staffId: string, date: string): number {
    const e = getEntry(staffId, date)
    return e ? estimatedHours(e) : 0
  }

  function staffWeekHours(staffId: string): number {
    return weekDates.reduce((sum, d) => sum + staffDayHours(staffId, d), 0)
  }

  function staffWeekCost(s: StaffMember): number {
    if (s.employment_type === 'salary') {
      const daysWorked = weekDates.filter(d => {
        const e = getEntry(s.id, d)
        return e && e.status !== 'rostered_off' && e.status !== 'leave'
      }).length
      return daysWorked > 0 ? Number(s.salary_weekly ?? 0) : 0
    }
    const hrs = staffWeekHours(s.id)
    return Math.round(hrs * Number(s.true_hourly_cost ?? 0) * 100) / 100
  }

  function dayTotalHours(date: string): number {
    return staff.reduce((sum, s) => sum + staffDayHours(s.id, date), 0)
  }

  function dayTotalCost(date: string): number {
    return staff.reduce((sum, s) => {
      const e = getEntry(s.id, date)
      if (!e || e.status === 'rostered_off') return sum
      if (s.employment_type === 'salary') return sum + Number(s.salary_weekly ?? 0) / 5
      const hrs = estimatedHours(e)
      return sum + hrs * Number(s.true_hourly_cost ?? 0)
    }, 0)
  }

  const totalWeeklyCost = staff.reduce((sum, s) => sum + staffWeekCost(s), 0)
  const totalWeeklyHours = staff.reduce((sum, s) => sum + staffWeekHours(s.id), 0)

  // ── Copy last week ─────────────────────────────────────────────────────────
  async function handleCopyLastWeek() {
    if (!confirm(`Copy last week's roster to ${weekLabel}?\n\nExisting entries will be overwritten.`)) return
    setCopying(true)
    setCopyResult(null)
    try {
      const res = await fetch('/api/admin/roster/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_week_start: prevWeek, to_week_start: weekStart }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCopyResult(`✅ Copied ${data.copied} entries from last week`)
        router.refresh()
      } else {
        setCopyResult(`❌ ${data.error ?? 'Copy failed'}`)
      }
    } catch (e: any) {
      setCopyResult(`❌ ${e.message}`)
    } finally {
      setCopying(false)
    }
  }

  // ── Save entry via API ─────────────────────────────────────────────────────
  const saveEntry = useCallback(async (
    staffId: string, date: string, startTime: string, endTime: string, existingId?: string
  ) => {
    setSaving(true)
    try {
      if (existingId) {
        const res = await fetch(`/api/admin/roster/${existingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_start: startTime, scheduled_end: endTime }),
        })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => prev.map(e => e.id === existingId ? data.entry : e))
        }
      } else {
        const res = await fetch('/api/admin/roster/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: staffId,
            work_date: date,
            section: 1,
            scheduled_start: startTime,
            scheduled_end: endTime,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => {
            const exists = prev.find(e => e.staff_id === staffId && e.work_date === date && e.section === 1)
            if (exists) return prev.map(e => e.id === exists.id ? data.entry : e)
            return [...prev, data.entry]
          })
        }
      }
    } catch (e) {
      console.error('Save failed', e)
    } finally {
      setSaving(false)
    }
  }, [])

  // ── Delete entry ───────────────────────────────────────────────────────────
  async function handleDelete(entryId: string) {
    setSaving(true)
    try {
      await fetch(`/api/admin/roster/${entryId}`, { method: 'DELETE' })
      setLocalEntries(prev => prev.filter(e => e.id !== entryId))
    } finally {
      setSaving(false)
      setEditEntry(null)
    }
  }

  // ── Mouse handlers for drag ────────────────────────────────────────────────
  const getSlotFromX = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const x = clientX - rect.left + timelineRef.current.scrollLeft
    const slot = Math.round(x / SLOT_WIDTH)
    return Math.max(0, Math.min(TOTAL_SLOTS, slot))
  }, [])

  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    staffId: string,
    type: 'create' | 'move' | 'resize-left' | 'resize-right',
    entryId?: string,
    originalStart?: number,
    originalEnd?: number
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const slot = getSlotFromX(e.clientX)
    setDragState({
      type, staffId, startSlot: slot, currentSlot: slot,
      entryId, originalStart, originalEnd,
    })
  }, [getSlotFromX])

  useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (e: MouseEvent) => {
      const slot = getSlotFromX(e.clientX)
      setDragState(prev => prev ? { ...prev, currentSlot: slot } : null)
    }

    const handleMouseUp = async () => {
      if (!dragState) return

      const { type, staffId, startSlot, currentSlot, entryId, originalStart, originalEnd } = dragState
      setDragState(null)

      let finalStart: number
      let finalEnd: number

      if (type === 'create') {
        finalStart = Math.min(startSlot, currentSlot)
        finalEnd = Math.max(startSlot, currentSlot)
        if (finalEnd - finalStart < 1) finalEnd = finalStart + 2 // minimum 1 hour
      } else if (type === 'move') {
        const delta = currentSlot - startSlot
        finalStart = (originalStart ?? 0) + delta
        finalEnd = (originalEnd ?? 0) + delta
        // Clamp
        if (finalStart < 0) { finalEnd -= finalStart; finalStart = 0 }
        if (finalEnd > TOTAL_SLOTS) { finalStart -= (finalEnd - TOTAL_SLOTS); finalEnd = TOTAL_SLOTS }
      } else if (type === 'resize-left') {
        finalStart = Math.min(currentSlot, (originalEnd ?? TOTAL_SLOTS) - 1)
        finalEnd = originalEnd ?? TOTAL_SLOTS
      } else {
        // resize-right
        finalStart = originalStart ?? 0
        finalEnd = Math.max(currentSlot, (originalStart ?? 0) + 1)
      }

      finalStart = Math.max(0, Math.min(TOTAL_SLOTS - 1, finalStart))
      finalEnd = Math.max(finalStart + 1, Math.min(TOTAL_SLOTS, finalEnd))

      const startTime = slotToTime(finalStart)
      const endTime = slotToTime(finalEnd)

      await saveEntry(staffId, currentDate, startTime, endTime, entryId)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, currentDate, getSlotFromX, saveEntry])

  // ── Get visual bar position ────────────────────────────────────────────────
  function getBarForEntry(entry: RosterEntry): { left: number; width: number } | null {
    if (!entry.scheduled_start || !entry.scheduled_end) return null
    const startSlot = timeToSlot(entry.scheduled_start)
    const endSlot = timeToSlot(entry.scheduled_end)
    return {
      left: startSlot * SLOT_WIDTH,
      width: Math.max((endSlot - startSlot) * SLOT_WIDTH, SLOT_WIDTH),
    }
  }

  function getDragPreview(): { staffId: string; left: number; width: number } | null {
    if (!dragState) return null
    const { type, staffId, startSlot, currentSlot, originalStart, originalEnd } = dragState
    let s: number, e: number

    if (type === 'create') {
      s = Math.min(startSlot, currentSlot)
      e = Math.max(startSlot, currentSlot)
      if (e - s < 1) e = s + 2
    } else if (type === 'move') {
      const delta = currentSlot - startSlot
      s = (originalStart ?? 0) + delta
      e = (originalEnd ?? 0) + delta
    } else if (type === 'resize-left') {
      s = Math.min(currentSlot, (originalEnd ?? TOTAL_SLOTS) - 1)
      e = originalEnd ?? TOTAL_SLOTS
    } else {
      s = originalStart ?? 0
      e = Math.max(currentSlot, (originalStart ?? 0) + 1)
    }

    s = Math.max(0, s)
    e = Math.min(TOTAL_SLOTS, e)

    return {
      staffId,
      left: s * SLOT_WIDTH,
      width: Math.max((e - s) * SLOT_WIDTH, SLOT_WIDTH),
    }
  }

  // ── Edit modal handlers ────────────────────────────────────────────────────
  function openEditModal(staffMember: StaffMember, entry: RosterEntry | null) {
    const dow = new Date(currentDate + 'T00:00:00').getDay()
    setEditEntry({ entry, staffId: staffMember.id, date: currentDate })
    setEditForm({
      scheduled_start: entry?.scheduled_start ?? '06:00',
      scheduled_end: entry?.scheduled_end ?? '14:00',
      department: entry?.department ?? staffMember.primary_department,
      day_type: entry?.day_type ?? (dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'normal'),
      public_holiday_name: entry?.public_holiday_name ?? '',
      manager_note: entry?.manager_note ?? '',
    })
  }

  async function handleSaveModal() {
    if (!editEntry || !editForm) return
    setSaving(true)
    try {
      if (editEntry.entry) {
        const res = await fetch(`/api/admin/roster/${editEntry.entry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => prev.map(e => e.id === editEntry.entry!.id ? data.entry : e))
        }
      } else {
        const res = await fetch('/api/admin/roster/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: editEntry.staffId,
            work_date: editEntry.date,
            section: 1,
            ...editForm,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setLocalEntries(prev => {
            const exists = prev.find(
              e => e.staff_id === editEntry.staffId && e.work_date === editEntry.date && e.section === 1
            )
            if (exists) return prev.map(e => e.id === exists.id ? data.entry : e)
            return [...prev, data.entry]
          })
        }
      }
      setEditEntry(null)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
    .toISOString().split('T')[0]
  const dragPreview = getDragPreview()
  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500'

  return (
    <div className="container mx-auto px-4 py-6 max-w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="h-7 w-7 text-amber-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Roster</h1>
            <p className="text-sm text-gray-500">{weekLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href={`/admin/roster?week=${prevWeek}`}
            className="p-2 border rounded-lg hover:bg-gray-50 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </a>
          <a href={`/admin/roster?week=${nextWeek}`}
            className="p-2 border rounded-lg hover:bg-gray-50 transition-colors">
            <ChevronRight className="h-5 w-5" />
          </a>
          <button onClick={handleCopyLastWeek} disabled={copying}
            className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-lg
                       text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors">
            <Copy className="h-4 w-4" />
            {copying ? 'Copying…' : 'Copy Last Week'}
          </button>
          <a href="/admin/staff"
            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Users className="h-4 w-4" /> Staff
          </a>
        </div>
      </div>

      {/* Copy result */}
      {copyResult && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${
          copyResult.startsWith('✅') ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {copyResult}
          <button onClick={() => setCopyResult(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Users className="h-3 w-3" /> Staff</p>
          <p className="text-xl font-bold">{staff.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Est. Weekly</p>
          <p className="text-xl font-bold text-amber-700">${totalWeeklyCost.toFixed(0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Week Hours</p>
          <p className="text-xl font-bold">{totalWeeklyHours.toFixed(1)}h</p>
        </div>
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Today Cost</p>
          <p className="text-xl font-bold text-green-700">${dayTotalCost(currentDate).toFixed(0)}</p>
        </div>
      </div>

      {/* ── Day Tabs ── */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {weekDates.map((date, i) => {
          const isToday = date === todayStr
          const isActive = i === activeDay
          const hrs = dayTotalHours(date)
          const cost = dayTotalCost(date)
          return (
            <button key={date} onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-amber-700 text-white shadow-md'
                  : isToday
                    ? 'bg-amber-100 text-amber-800 border-2 border-amber-300'
                    : 'bg-white text-gray-600 border hover:bg-gray-50'
                }`}>
              <div className="font-bold">{DAY_LABELS[i]}</div>
              <div className="text-xs opacity-80">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </div>
              {hrs > 0 && (
                <div className={`text-xs mt-0.5 ${isActive ? 'opacity-80' : 'text-gray-400'}`}>
                  {hrs.toFixed(1)}h · ${cost.toFixed(0)}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Saving indicator ── */}
      {saving && (
        <div className="mb-2 text-xs text-amber-600 font-medium flex items-center gap-1">
          <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          Saving…
        </div>
      )}

      {/* ── Timeline Grid ── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="flex">

          {/* Staff column (sticky left) */}
          <div className="flex-shrink-0 z-20 bg-white border-r" style={{ width: STAFF_COL_WIDTH }}>
            {/* Header */}
            <div className="h-10 border-b bg-gray-50 flex items-center px-3">
              <span className="text-xs font-semibold text-gray-600">Staff</span>
            </div>
            {/* Staff rows */}
            {staff.map(s => {
              const dept = DEPT_COLOURS[s.primary_department] ?? DEPT_COLOURS.admin
              return (
                <div key={s.id} className="border-b flex items-center px-3 hover:bg-gray-50 group"
                  style={{ height: ROW_HEIGHT }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${dept.bg}`} />
                      <span className="text-xs text-gray-400 capitalize">{s.primary_department}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Scrollable timeline */}
          <div className="flex-1 overflow-x-auto" ref={timelineRef}>
            <div style={{ width: TIMELINE_WIDTH, minWidth: '100%' }}>
              {/* Hour headers */}
              <div className="h-10 border-b bg-gray-50 flex relative">
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div key={i} className="flex-shrink-0 border-l border-gray-200 flex items-end px-1 pb-1"
                    style={{ width: SLOT_WIDTH * SLOTS_PER_HOUR }}>
                    <span className="text-xs text-gray-500 font-medium">
                      {slotToLabel(i * SLOTS_PER_HOUR)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Staff rows with timeline */}
              {staff.map(s => {
                const entry = getEntry(s.id, currentDate)
                const bar = entry ? getBarForEntry(entry) : null
                const isOff = entry?.status === 'rostered_off'
                const dept = DEPT_COLOURS[entry?.department ?? s.primary_department] ?? DEPT_COLOURS.admin
                const showDrag = dragPreview && dragPreview.staffId === s.id

                return (
                  <div key={s.id} className="border-b relative group"
                    style={{ height: ROW_HEIGHT }}
                    onMouseDown={(e) => {
                      // Only create if clicking empty area (not on bar)
                      if ((e.target as HTMLElement).dataset.bar) return
                      if (!bar || isOff) {
                        handleMouseDown(e, s.id, 'create')
                      }
                    }}
                    onDoubleClick={() => openEditModal(s, entry)}>

                    {/* Background grid lines */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                        <div key={i} className="flex-shrink-0 border-l border-gray-100"
                          style={{ width: SLOT_WIDTH * SLOTS_PER_HOUR }}>
                          <div className="w-1/2 h-full border-r border-gray-50" />
                        </div>
                      ))}
                    </div>

                    {/* Current time indicator */}
                    {currentDate === todayStr && (() => {
                      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Perth' }))
                      const nowSlot = timeToSlot(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
                      if (nowSlot >= 0 && nowSlot <= TOTAL_SLOTS) {
                        return (
                          <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                            style={{ left: nowSlot * SLOT_WIDTH }} />
                        )
                      }
                      return null
                    })()}

                    {/* Shift bar */}
                    {bar && !isOff && !showDrag && (
                      <div
                        data-bar="true"
                        className="absolute top-1.5 bottom-1.5 rounded-lg shadow-sm flex items-center cursor-move
                                   transition-shadow hover:shadow-md group/bar select-none overflow-hidden"
                        style={{
                          left: bar.left,
                          width: bar.width,
                          backgroundColor: dept.barBg,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          const startSlot = timeToSlot(entry!.scheduled_start!)
                          const endSlot = timeToSlot(entry!.scheduled_end!)
                          handleMouseDown(e, s.id, 'move', entry!.id, startSlot, endSlot)
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          openEditModal(s, entry)
                        }}>

                        {/* Left resize handle */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize
                                     hover:bg-white/30 transition-colors rounded-l-lg"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            const startSlot = timeToSlot(entry!.scheduled_start!)
                            const endSlot = timeToSlot(entry!.scheduled_end!)
                            handleMouseDown(e, s.id, 'resize-left', entry!.id, startSlot, endSlot)
                          }}
                        />

                        {/* Label */}
                        <div className="flex-1 px-2 flex items-center gap-2 min-w-0 pointer-events-none">
                          <span className="text-xs font-bold text-white truncate">
                            {fmtTimeShort(entry!.scheduled_start!)} – {fmtTimeShort(entry!.scheduled_end!)}
                          </span>
                          {bar.width > 120 && (
                            <span className="text-xs text-white/80 truncate">
                              {estimatedHours(entry!).toFixed(1)}h
                            </span>
                          )}
                        </div>

                        {/* Right resize handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize
                                     hover:bg-white/30 transition-colors rounded-r-lg"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            const startSlot = timeToSlot(entry!.scheduled_start!)
                            const endSlot = timeToSlot(entry!.scheduled_end!)
                            handleMouseDown(e, s.id, 'resize-right', entry!.id, startSlot, endSlot)
                          }}
                        />
                      </div>
                    )}

                    {/* Drag preview */}
                    {showDrag && (
                      <div
                        className="absolute top-1.5 bottom-1.5 rounded-lg border-2 border-dashed pointer-events-none z-10"
                        style={{
                          left: dragPreview.left,
                          width: dragPreview.width,
                          backgroundColor: `${dept.barBg}40`,
                          borderColor: dept.barBg,
                        }}>
                        <div className="flex items-center h-full px-2">
                          <span className="text-xs font-bold" style={{ color: dept.barBg }}>
                            {slotToLabel(Math.round(dragPreview.left / SLOT_WIDTH))} –{' '}
                            {slotToLabel(Math.round((dragPreview.left + dragPreview.width) / SLOT_WIDTH))}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Rostered off indicator */}
                    {isOff && (
                      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2
                                      text-center text-xs text-gray-400 italic">
                        Rostered Off
                      </div>
                    )}

                    {/* Empty state — hint text */}
                    {!entry && !isOff && !showDrag && (
                      <div className="absolute inset-0 flex items-center justify-center
                                      opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="text-xs text-gray-300">Click & drag to add shift</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Week totals column (sticky right) */}
          <div className="flex-shrink-0 z-20 bg-white border-l" style={{ width: WEEK_COL_WIDTH }}>
            <div className="h-10 border-b bg-gray-50 flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-600">Week Total</span>
            </div>
            {staff.map(s => {
              const hrs = staffWeekHours(s.id)
              const cost = staffWeekCost(s)
              return (
                <div key={s.id} className="border-b flex flex-col items-center justify-center"
                  style={{ height: ROW_HEIGHT }}>
                  <span className="text-sm font-bold text-gray-900">{hrs.toFixed(1)}h</span>
                  <span className="text-xs text-amber-600">${cost.toFixed(0)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Legend + Tips ── */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          {Object.entries(DEPT_COLOURS).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${val.bg}`} />
              <span className="capitalize">{key}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto text-gray-400">
          <span>💡</span>
          <span>Click & drag to create · Drag bar to move · Drag edges to resize · Double-click to edit details</span>
        </div>
      </div>

      {/* ── Mobile Fallback (card view) ── */}
      <div className="md:hidden mt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {DAY_LABELS[activeDay]} – {new Date(currentDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
        </h3>
        <div className="space-y-2">
          {staff.map(s => {
            const entry = getEntry(s.id, currentDate)
            const dept = DEPT_COLOURS[entry?.department ?? s.primary_department] ?? DEPT_COLOURS.admin
            const isOff = !entry || entry.status === 'rostered_off'
            return (
              <div key={s.id}
                className="bg-white rounded-lg shadow p-3 flex items-center justify-between"
                onClick={() => openEditModal(s, entry)}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${dept.bg}`} />
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    {isOff ? (
                      <p className="text-xs text-gray-400 italic">Off</p>
                    ) : entry?.scheduled_start && entry?.scheduled_end ? (
                      <p className="text-xs text-gray-500">
                        {fmtTimeShort(entry.scheduled_start)} – {fmtTimeShort(entry.scheduled_end)}
                        <span className="ml-2 text-amber-600">{estimatedHours(entry).toFixed(1)}h</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">No shift</p>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editEntry && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setEditEntry(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {editEntry.entry ? 'Edit Shift' : 'Add Shift'}
                </h3>
                <p className="text-sm text-gray-500">
                  {staff.find(s => s.id === editEntry.staffId)?.name} ·{' '}
                  {new Date(editEntry.date + 'T00:00:00').toLocaleDateString('en-AU', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })}
                </p>
              </div>
              <button onClick={() => setEditEntry(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Department */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                <select value={editForm.department}
                  onChange={e => setEditForm((p: any) => ({ ...p, department: e.target.value }))}
                  className={inp}>
                  <option value="production">Production</option>
                  <option value="shop">Shop</option>
                  <option value="delivery">Delivery</option>
                  <option value="admin">Admin</option>
                  <option value="management">Management</option>
                </select>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
                  <input type="time" value={editForm.scheduled_start}
                    onChange={e => setEditForm((p: any) => ({ ...p, scheduled_start: e.target.value }))}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Finish</label>
                  <input type="time" value={editForm.scheduled_end}
                    onChange={e => setEditForm((p: any) => ({ ...p, scheduled_end: e.target.value }))}
                    className={inp} />
                </div>
              </div>

              {/* Day type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Day Type</label>
                <select value={editForm.day_type}
                  onChange={e => setEditForm((p: any) => ({ ...p, day_type: e.target.value }))}
                  className={inp}>
                  <option value="normal">Normal</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                  <option value="public_holiday">Public Holiday</option>
                  <option value="leave">Leave</option>
                </select>
              </div>

              {editForm.day_type === 'public_holiday' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Holiday Name</label>
                  <input type="text" value={editForm.public_holiday_name}
                    onChange={e => setEditForm((p: any) => ({ ...p, public_holiday_name: e.target.value }))}
                    className={inp} placeholder="e.g. Easter Monday" />
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
                <input type="text" value={editForm.manager_note}
                  onChange={e => setEditForm((p: any) => ({ ...p, manager_note: e.target.value }))}
                  className={inp} placeholder="Optional note…" />
              </div>
            </div>

            <div className="p-5 border-t flex gap-2">
              <button onClick={handleSaveModal} disabled={saving}
                className="flex-1 py-2.5 bg-amber-700 text-white rounded-lg text-sm font-medium
                           hover:bg-amber-800 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : editEntry.entry ? 'Update' : 'Add Shift'}
              </button>
              {editEntry.entry && (
                <button onClick={() => handleDelete(editEntry.entry!.id)} disabled={saving}
                  className="px-4 py-2.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium
                             hover:bg-red-100 transition-colors flex items-center gap-1">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              <button onClick={() => setEditEntry(null)} disabled={saving}
                className="px-4 py-2.5 border rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}