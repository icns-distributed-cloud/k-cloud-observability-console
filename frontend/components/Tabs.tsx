import styles from './Tabs.module.css'

interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
}

export default function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <div className={styles.tabs}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`${styles.tab} ${item.id === active ? styles.active : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}