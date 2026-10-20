import { db } from './db'
import type { Expense } from './model'

export async function addExpense(input: Omit<Expense, 'id'>): Promise<void> {
  await db.expenses.add({ ...input, id: crypto.randomUUID() })
}

export async function updateExpense(id: string, changes: Partial<Omit<Expense, 'id' | 'tripId'>>): Promise<void> {
  await db.expenses.update(id, changes)
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id)
}
