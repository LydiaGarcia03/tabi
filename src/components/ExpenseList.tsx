import { useState, type FormEvent } from 'react'
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL } from '../budget'
import { addExpense, deleteExpense, updateExpense } from '../db/expenses'
import type { Expense, ExpenseCategory, Trip } from '../db/model'
import { formatMoney } from '../format'

interface Props {
  trip: Trip
  /** Day the new expenses belong to; omit for trip-wide expenses. */
  dayId?: string
  expenses: Expense[]
}

/** List of free-form expenses with add / edit / delete. */
export function ExpenseList({ trip, dayId, expenses }: Props) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  return (
    <div className="expenses">
      {expenses.length === 0 && editing !== 'new' && <p className="muted small">No expenses yet.</p>}
      <ul className="expense-list">
        {expenses.map((expense) =>
          editing === expense.id ? (
            <li key={expense.id}>
              <ExpenseForm
                trip={trip}
                expense={expense}
                onSave={async (changes) => {
                  await updateExpense(expense.id, changes)
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={expense.id} className="expense-row">
              <span>
                {CATEGORY_ICON[expense.category]} {expense.description}
                {expense.notes && <span className="muted small"> · {expense.notes}</span>}
              </span>
              <span className="row">
                <strong>{formatMoney(expense.amount)}</strong>
                <button type="button" className="link" onClick={() => setEditing(expense.id)}>
                  Edit
                </button>
                <button type="button" className="link" onClick={() => deleteExpense(expense.id)}>
                  Remove
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <ExpenseForm
          trip={trip}
          defaultCategory={dayId ? 'food' : 'lodging'}
          onSave={async (values) => {
            await addExpense({ ...values, tripId: trip.id, dayId })
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditing('new')}>
          + Add expense
        </button>
      )}
    </div>
  )
}

type ExpenseValues = Pick<Expense, 'category' | 'description' | 'amount' | 'notes'>

function ExpenseForm({
  trip,
  expense,
  defaultCategory = 'other',
  onSave,
  onCancel,
}: {
  trip: Trip
  expense?: Expense
  defaultCategory?: ExpenseCategory
  onSave: (values: ExpenseValues) => Promise<void>
  onCancel: () => void
}) {
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? defaultCategory)
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense?.amount.amount.toString() ?? '')
  const [currency, setCurrency] = useState(expense?.amount.currency ?? trip.baseCurrency)
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const currencies = [...new Set([trip.baseCurrency, trip.displayCurrency, currency])]
  const value = Number(amount)
  const valid = description.trim() !== '' && amount.trim() !== '' && Number.isFinite(value) && value >= 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    await onSave({ category, description: description.trim(), amount: { amount: value, currency }, notes: notes.trim() || undefined })
  }

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="row wrap">
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Hotel, JR Pass, lunch…" />
        </label>
      </div>
      <div className="row wrap">
        <label>
          Amount
          <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paid in advance, per person…" />
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
          Save expense
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
