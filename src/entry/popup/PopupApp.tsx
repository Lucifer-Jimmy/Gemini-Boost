import React from 'react'
import styles from './PopupApp.module.css'

export const PopupApp: React.FC = () => (
  <main className={styles.gsPopup}>
    <div className={styles.gsHeader}>
      <img src="/icon-48.png" alt="Logo" className={styles.gsLogo} />
      <h1 className={styles.gsTitle}>Gemini Boost</h1>
    </div>
    <div className={styles.gsStatusContainer}>
      <span className={styles.gsStatusDot}></span>
      <p className={styles.gsStatusText}>运行中</p>
    </div>
    <p className={styles.gsSubtitle}>增强 Google Gemini 的功能和体验</p>
  </main>
)
