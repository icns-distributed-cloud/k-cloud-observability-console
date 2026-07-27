import type { ReactNode } from 'react'
import styles from './Card.module.css'

interface CardProps {
  children: ReactNode
}

export default function Card({ children }: CardProps) {
  return <div className={styles.card}>{children}</div>
}