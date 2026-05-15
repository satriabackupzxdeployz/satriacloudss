import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

// Only non-sensitive IDs stored — used to load avatar via proxy on next login
function pfpKey(email) {
  return `sc_pfp_${email.replace(/[^a-zA-Z0-9]/g, '_')}`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Only store: name, email, picture (Google), sub
    // Profile photo ID loaded separately from sc_pfp_* key
    const raw = localStorage.getItem('sc_user')
    if (raw) {
      try {
        const base = JSON.parse(raw)
        // Re-attach profile photo file ID (not a URL — just an opaque ID)
        const pfpRaw = localStorage.getItem(pfpKey(base.email))
        const pfp = pfpRaw ? JSON.parse(pfpRaw) : {}
        setUser({ ...base, customPhotoFileId: pfp.fileId || null, customPhotoMsgId: pfp.msgId || null })
      } catch { localStorage.removeItem('sc_user') }
    }
    setLoading(false)
  }, [])

  const login = useCallback((userData) => {
    const base = {
      name: userData.name,
      email: userData.email,
      picture: userData.picture || '',
      sub: userData.sub || '',
    }
    localStorage.setItem('sc_user', JSON.stringify(base))

    // Restore profile photo ID for this email
    const pfpRaw = localStorage.getItem(pfpKey(userData.email))
    const pfp = pfpRaw ? JSON.parse(pfpRaw) : {}

    const u = { ...base, customPhotoFileId: pfp.fileId || null, customPhotoMsgId: pfp.msgId || null }
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('sc_user')
    // sc_pfp_* keys are preserved — avatar persists across re-login
    if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect()
  }, [])

  const updateCustomPhoto = useCallback(async (file, currentUser) => {
    const form = new FormData()
    form.append('photo', file, file.name)
    form.append('email', currentUser?.email || 'unknown')
    if (currentUser?.customPhotoMsgId) {
      form.append('oldMessageId', String(currentUser.customPhotoMsgId))
    }

    const res = await fetch('/api/profile', { method: 'POST', body: form })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Upload foto gagal')

    // Persist only the opaque file ID — no URLs
    const pfp = { fileId: data.fileId, msgId: data.messageId }
    localStorage.setItem(pfpKey(currentUser.email), JSON.stringify(pfp))

    const updated = { ...currentUser, customPhotoFileId: data.fileId, customPhotoMsgId: data.messageId }
    setUser(updated)
    // Only save base session data to sc_user
    localStorage.setItem('sc_user', JSON.stringify({
      name: currentUser.name,
      email: currentUser.email,
      picture: currentUser.picture,
      sub: currentUser.sub,
    }))
    return updated
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateCustomPhoto }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
