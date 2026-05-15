import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services'
import { useAppStore } from '../store/appStore'

export function CustomInstructionsPanel() {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const addToast = useAppStore(state => state.addToast)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchInstructions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.instructions.get()
      if (!mountedRef.current) return
      setContent(result.content || '')
      setFiles(result.files || [])
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load instructions')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInstructions()
  }, [fetchInstructions])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await api.instructions.save(content)
      if (!mountedRef.current) return
      addToast('success', 'Instructions saved', 'Custom instructions updated successfully')
    } catch (err) {
      if (!mountedRef.current) return
      addToast('error', 'Save failed', err instanceof Error ? err.message : 'Failed to save instructions')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [content, addToast])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)',
        background: 'var(--bg-surface)',
      }}>
        Loading instructions...
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-surface)',
      color: 'var(--text-primary)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Custom Instructions</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '4px 16px',
            background: 'var(--primary)',
            color: 'var(--bg-surface)',
            border: 'none',
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Source files */}
      {files.length > 0 && (
        <div style={{
          padding: '8px 16px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-default)',
        }}>
          来源: {files.join(', ')}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 16px',
          fontSize: '12px',
          color: '#f44336',
          borderBottom: '1px solid var(--border-default)',
        }}>
          {error}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Enter custom instructions for agents..."
        style={{
          flex: 1,
          padding: '16px',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '13px',
          lineHeight: '1.5',
        }}
      />
    </div>
  )
}
