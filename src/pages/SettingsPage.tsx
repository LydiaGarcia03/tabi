import { SettingsPanel } from '../SettingsPanel'
import { href } from '../router'

export function SettingsPage() {
  return (
    <>
      <SettingsPanel />
      <section className="card">
        <h2>Developer</h2>
        <a href={href({ page: 'transit-spike' })}>Transit spike (Google vs NAVITIME)</a>
      </section>
    </>
  )
}
