import React, { useState } from 'react'
import { useTimelineLogic } from '../hooks/useTimelineLogic'
import styles from './Timeline.module.css'

export const Timeline: React.FC = () => {
  const { items, scrollToItem } = useTimelineLogic()
  const [tooltipState, setTooltipState] = useState<{text: string, top: number, visible: boolean}>({ text: '', top: 0, visible: false })

  if (items.length === 0) {
    return null
  }

  return (
    <div className={styles.gsTimelineWrapper}>
      <div className={styles.gsTimelineContainer} aria-label="Conversation Timeline">
        <div className={styles.gsTimelineTrack}>
          {items.map((item) => (
            <div
              key={item.id}
              className={styles.gsTimelineItem}
              onClick={() => scrollToItem(item)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipState({ text: item.text, top: rect.top + rect.height / 2, visible: true });
              }}
              onMouseLeave={() => {
                setTooltipState(prev => ({ ...prev, visible: false }));
              }}
            >
              <div className={styles.gsTimelineDot} />
            </div>
          ))}
        </div>
      </div>
      
      <div 
        className={`${styles.gsTimelineGlobalTooltip} ${tooltipState.visible ? styles.visible : ''}`}
        style={{ top: `${tooltipState.top}px` }}
      >
        {tooltipState.text}
      </div>
    </div>
  )
}
