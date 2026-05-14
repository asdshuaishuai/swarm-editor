import { useState } from 'react'
import { VisualOrchestrator, Workflow } from '../components/VisualOrchestrator'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAppStore } from '../store/appStore'
import { api, WorkflowInfo } from '../services'
import { logger } from '../utils'
import {
  Workflow as WorkflowIcon,
  GitBranch,
  Save,
  Upload,
  Download,
  Trash2,
} from 'lucide-react'

// Use WorkflowInfo from api.ts for saved workflows
type SavedWorkflow = WorkflowInfo

// Validates imported workflow JSON has required fields
function isValidWorkflow(data: unknown): data is Workflow {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.name === 'string' &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.edges)
  )
}

// Convert API WorkflowInfo to VisualOrchestrator Workflow format
function toDesignerWorkflow(wf: WorkflowInfo): Workflow {
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description,
    nodes: (wf.nodes || []).map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      x: n.position?.x || 0,
      y: n.position?.y || 0,
      status: 'idle' as const,
    })),
    edges: (wf.edges || []).map(e => ({
      id: e.id,
      from: e.from,
      to: e.to,
      condition: e.condition,
      label: e.label,
    })),
    status: 'draft' as const,
  }
}

export default function WorkflowPanel() {
  const [activeTab, setActiveTab] = useState<'design' | 'saved'>('design')
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([])
  const [loading, setLoading] = useState(false)
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const addToast = useAppStore(state => state.addToast)

  const loadWorkflows = async () => {
    setLoading(true)
    try {
      const workflows = await api.workflows.list()
      setSavedWorkflows(workflows)
    } catch (err) {
      logger.error('Workflow', 'Failed to load workflows:', err)
      addToast('error', 'Failed to load workflows', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (workflow: Workflow) => {
    try {
      if (workflow.id) {
        await api.workflows.update(workflow.id, {
          name: workflow.name,
          description: workflow.description,
        })
        addToast('success', 'Workflow updated', workflow.name)
      } else {
        const result = await api.workflows.create({
          name: workflow.name,
          description: workflow.description,
        })
        setCurrentWorkflow({ ...workflow, id: result.id })
        addToast('success', 'Workflow created', result.id)
      }
    } catch (err) {
      logger.error('Workflow', 'Failed to save workflow:', err)
      addToast('error', 'Failed to save workflow', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleRun = async (workflow: Workflow) => {
    try {
      if (workflow.id) {
        await api.workflows.execute(workflow.id)
        addToast('success', 'Workflow started', workflow.name)
      }
    } catch (err) {
      logger.error('Workflow', 'Failed to run workflow:', err)
      addToast('error', 'Failed to run workflow', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleExport = (workflow: Workflow) => {
    const data = JSON.stringify(workflow, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflow.name || 'workflow'}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', 'Workflow exported', workflow.name)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const workflow = JSON.parse(text)
        if (!isValidWorkflow(workflow)) {
          addToast('error', 'Failed to import workflow', 'Invalid workflow format: requires name, nodes array, and edges array')
          return
        }
        setCurrentWorkflow(workflow)
        setActiveTab('design')
        addToast('success', 'Workflow imported', workflow.name || file.name)
      } catch {
        addToast('error', 'Failed to import workflow', 'Invalid JSON file')
      }
    }
    input.click()
  }

  const handleDelete = async (id: string) => {
    try {
      await api.workflows.delete(id)
      setSavedWorkflows(prev => prev.filter(w => w.id !== id))
      setDeleteTarget(null)
      addToast('success', 'Workflow deleted')
    } catch (err) {
      logger.error('Workflow', 'Failed to delete workflow:', err)
      addToast('error', 'Failed to delete workflow', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleEditWorkflow = (wf: WorkflowInfo) => {
    setCurrentWorkflow(toDesignerWorkflow(wf))
    setActiveTab('design')
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-mac">
            <GitBranch size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Workflow Designer</h2>
            <p className="text-xs text-text-secondary">Design multi-agent workflows</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-glass hover:bg-card-hover border border-glass-border rounded-mac text-sm text-text-secondary"
          >
            <Upload size={14} />
            Import
          </button>
          <button
            onClick={() => setActiveTab('design')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-mac text-sm ${
              activeTab === 'design'
                ? 'bg-accent text-text-primary'
                : 'bg-glass text-text-secondary hover:bg-card-hover'
            }`}
          >
            <WorkflowIcon size={14} />
            Design
          </button>
          <button
            onClick={() => {
              setActiveTab('saved')
              loadWorkflows()
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-mac text-sm ${
              activeTab === 'saved'
                ? 'bg-accent text-text-primary'
                : 'bg-glass text-text-secondary hover:bg-card-hover'
            }`}
          >
            <Save size={14} />
            Saved
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'design' ? (
          <VisualOrchestrator
            initialWorkflow={currentWorkflow || undefined}
            onSave={handleSave}
            onRun={handleRun}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64 text-text-tertiary">
                Loading workflows...
              </div>
            ) : savedWorkflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
                <WorkflowIcon size={48} className="mb-4 opacity-50" />
                <p className="text-sm">No saved workflows</p>
                <p className="text-xs mt-1">Design and save a workflow to see it here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="p-4 bg-glass border border-glass-border rounded-mac-xl hover:border-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-text-primary">{wf.name}</h4>
                        <p className="text-xs text-text-secondary mt-1">{wf.description || 'No description'}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
                          <span className="flex items-center gap-1">
                            <WorkflowIcon size={12} />
                            {wf.mode}
                          </span>
                          <span>{wf.nodes?.length || 0} nodes</span>
                          <span>{wf.edges?.length || 0} edges</span>
                          <span className={`${
                            wf.status === 'running' ? 'text-success' :
                            wf.status === 'failed' ? 'text-error' : ''
                          }`}>
                            {wf.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditWorkflow(wf)}
                          className="p-1.5 hover:bg-card-hover rounded-mac text-text-secondary"
                          title="Edit"
                          aria-label="Edit"
                        >
                          <WorkflowIcon size={16} />
                        </button>
                        <button
                          onClick={() => handleExport(toDesignerWorkflow(wf))}
                          className="p-1.5 hover:bg-card-hover rounded-mac text-text-secondary"
                          title="Export"
                          aria-label="Export"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(wf.id)}
                          className="p-1.5 hover:bg-card-hover rounded-mac text-text-secondary hover:text-error"
                          title="Delete"
                          aria-label="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Workflow"
          message="Are you sure you want to delete this workflow? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
