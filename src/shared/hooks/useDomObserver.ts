import { useEffect } from 'react'

type UseDomObserverOptions = {
  root?: Node
  onMutation: (mutations: MutationRecord[]) => void
  subtree?: boolean
}

export const useDomObserver = ({
  root = document.body,
  onMutation,
  subtree = true,
}: UseDomObserverOptions): void => {
  useEffect(() => {
    if (!root) {
      return undefined
    }

    const observer = new MutationObserver((mutations) => {
      onMutation(mutations)
    })

    observer.observe(root, { childList: true, subtree })

    return () => observer.disconnect()
  }, [onMutation, root, subtree])
}
