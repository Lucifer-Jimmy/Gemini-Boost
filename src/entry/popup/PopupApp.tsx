import React from 'react'
import styles from './PopupApp.module.css'

export const PopupApp: React.FC = () => (
  <main className={styles.gsPopup}>
    <h1 className={styles.gsTitle}>Gemini Boost</h1>
    <p className={styles.gsSubtitle}>Folders for Gemini chat history are ready.</p>
  </main>
)
