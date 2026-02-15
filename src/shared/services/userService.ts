export const getCurrentUserEmail = (): Promise<string | null> => {
  return new Promise((resolve) => {
    // Try immediately
    const email = findEmailInDom()
    if (email) {
      resolve(email)
      return
    }

    // Observe body for changes to find the account element
    const observer = new MutationObserver((_, obs) => {
      const found = findEmailInDom()
      if (found) {
        obs.disconnect()
        resolve(found)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // Fallback/Timeout after 5 seconds
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, 5000)
  })
}

const findEmailInDom = (): string | null => {
  // Selector based on the provided HTML structure
  // <a class="gb_B gb_0a gb_1" aria-label="Google Account: Name \n(email)" ...>
  // The classes gb_B gb_0a gb_1 might be dynamic/minified, so relying on aria-label prefix is safer
  const accountLink = document.querySelector('a[aria-label^="Google Account:"]')
  if (!accountLink) return null

  const ariaLabel = accountLink.getAttribute('aria-label')
  if (!ariaLabel) return null

  // Extract email between parentheses
  const match = ariaLabel.match(/\(([^)]+)\)/)
  return match ? match[1] : null
}
