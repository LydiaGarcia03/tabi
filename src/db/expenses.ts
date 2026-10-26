import { db } from './db'
import type { Expense } from './model'

export async function addExpense(input: Omit<Expense, 'id'>): Promise<void> {
  await db.expenses.add({ ...input, id: crypto.randomUUID() })
}

export async function updateExpense(id: string, changes: Partial<Omit<Expense, 'id' | 'tripId'>>): Promise<void> {
  await db.expenses.update(id, changes)
}

/**
 * Removes an expense. A booking made from an option goes back to being just
 * an option (not chosen), and flight steps that used the booking in the days
 * ("Use my flight") then point at that option, else at nothing.
 */
export async function deleteExpense(id: string): Promise<void> {
  await db.transaction('rw', db.expenses, db.options, db.legs, async () => {
    const expense = await db.expenses.get(id)
    if (!expense) return
    await db.expenses.delete(id)
    const option = await db.options.where('tripId').equals(expense.tripId).filter((o) => o.expenseId === id).first()
    if (option) await db.options.update(option.id, { expenseId: undefined, status: option.status === 'chosen' ? 'idea' : option.status })
    const legs = await db.legs.where('tripId').equals(expense.tripId).toArray()
    for (const leg of legs) {
      if (!leg.segments.some((s) => s.booking?.kind === 'booking' && s.booking.id === id)) continue
      const segments = leg.segments.map((s) => {
        if (s.booking?.kind !== 'booking' || s.booking.id !== id) return s
        const first = s.booking.price != null
        return { ...s, booking: option ? { kind: 'option' as const, id: option.id, price: first ? option.price : undefined } : undefined }
      })
      await db.legs.update(leg.id, { segments })
    }
  })
}
