// Visual Orchestrator for drag-and-drop agent workflow design
// Inspired by LangGraph and AutoGen Studio

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { api } from '../services'
import { logger } from '../utils'
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react'

export interface AgentNode {
  id: string
  name: string
  type: string
  x: number
  y: number
  status: 'idle' | 'running' | 'waiting' | 'error'
}

export interface Edge {
  id: string
  from: string
  to: string
  condition?: string
  label: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  nodes: AgentNode[]
  edges: Edge[]
  status: 'draft' | 'running' | 'paused' | 'completed'
}

interface VisualOrchestratorProps {
  initialWorkflow?: Workflow
  onSave?: (workflow: Workflow) => void
  onRun?: (workflow: Workflow) => void
}

export function VisualOrchestrator({ initialWorkflow, onSave, onRun }: VisualOrchestratorProps) {
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow || {
    id: 'workflow-1',
    name: 'New Workflow',
    description: '',
    nodes: [],
    edges: [],
    status: 'draft',
  })
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null)
  const [activeNodeIndex, setActiveNodeIndex] = useState<number | null>(null)
  const [executionLog, setExecutionLog] = useState<string[]>([])
  const draggingNode = useRef<AgentNode | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const agents = useAppStore(state => state.agents)
  const addToast = useAppStore(state => state.addToast)
  const canvasRef = useRef<HTMLDivElement>(null)

  const handleCanvasClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleAddNode = useCallback((agent: typeof agents[0]) => {
    const newNode: AgentNode = {
      id: `node-${Date.now()}`,
      name: agent.name,
      type: agent.type,
      x: 100 + Math.random() * 400,
      y: 100 + Math.random() * 300,
      status: 'idle',
    }
    setWorkflow(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }))
  }, [])

  const handleAddEdge = useCallback((from: string, to: string) => {
    const newEdge: Edge = {
      id: `edge-${Date.now()}`,
      from,
      to,
      label: 'next',
    }
    setWorkflow(prev => ({
      ...prev,
      edges: [...prev.edges, newEdge]
    }))
  }, [])

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, node: AgentNode) => {
    e.stopPropagation()
    setSelectedNode(node)
    draggingNode.current = node
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }, [])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingNode.current || !canvasRef.current) return

    const canvasRect = canvasRef.current.getBoundingClientRect()
    const newX = e.clientX - canvasRect.left - dragOffset.current.x
    const newY = e.clientY - canvasRect.top - dragOffset.current.y

    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === draggingNode.current?.id
          ? { ...n, x: Math.max(0, newX), y: Math.max(0, newY) }
          : n
      )
    }))
  }, [])

  const handleCanvasMouseUp = useCallback(() => {
    draggingNode.current = null
  }, [])

  const handleSave = useCallback(() => {
    onSave?.(workflow)
    logger.info('Orchestrator', 'Workflow saved:', workflow.name)
    addToast('success', 'Workflow saved', workflow.name)
  }, [workflow, onSave, addToast])

  const handleRun = useCallback(async () => {
    if (workflow.nodes.length < 2) {
      addToast('warning', 'Need more agents', 'Add at least 2 agents to run workflow')
      return
    }
    if (workflow.status !== 'draft') {
      addToast('warning', 'Already running', 'Workflow is already running or completed')
      return
    }

    try {
      const swarmConfig = {
        name: workflow.name,
        topology: 'mesh',
        strategy: 'parallel',
        agentIds: workflow.nodes.map(n => n.id),
      }
      const swarm = await api.swarm.createSwarm(swarmConfig)
      setWorkflow(prev => ({ ...prev, status: 'running' }))
      setActiveNodeIndex(0)
      setExecutionLog([`[${new Date().toLocaleTimeString()}] Started: ${workflow.name}`])
      onRun?.({ ...workflow, status: 'running' })
      logger.info('Orchestrator', 'Workflow started:', swarm.id)
      addToast('success', 'Workflow started', swarm.id)
    } catch (err) {
      logger.error('Orchestrator', 'Failed to run workflow:', err)
      addToast('error', 'Failed to run workflow', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [workflow, onRun, addToast])

  // Pause execution
  const handlePause = useCallback(() => {
    setWorkflow(prev => ({ ...prev, status: 'paused' }))
    addToast('info', 'Workflow paused', workflow.name)
  }, [workflow.name, addToast])

  // Resume execution
  const handleResume = useCallback(() => {
    setWorkflow(prev => ({ ...prev, status: 'running' }))
    addToast('info', 'Workflow resumed', workflow.name)
  }, [workflow.name, addToast])

  // Step through to next node (LangGraph-style)
  const handleStep = useCallback(() => {
    if (activeNodeIndex === null) {
      setActiveNodeIndex(0)
      setExecutionLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Step 1: ${workflow.nodes[0]?.name}`])
      return
    }
    const nextIndex = activeNodeIndex + 1
    if (nextIndex >= workflow.nodes.length) {
      setWorkflow(prev => ({ ...prev, status: 'completed' }))
      setActiveNodeIndex(null)
      setExecutionLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Completed: ${workflow.name}`])
      addToast('success', 'Workflow completed', workflow.name)
    } else {
      setActiveNodeIndex(nextIndex)
      setExecutionLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Step ${nextIndex + 1}: ${workflow.nodes[nextIndex]?.name}`])
    }
  }, [activeNodeIndex, workflow, addToast])

  // Reset execution (LangGraph-style)
  const handleReset = useCallback(() => {
    setWorkflow(prev => ({ ...prev, status: 'draft' }))
    setActiveNodeIndex(null)
    setExecutionLog([])
    addToast('info', 'Workflow reset', workflow.name)
  }, [workflow.name, addToast])

  // Add edge between selected node and clicked node
  const handleNodeClick = useCallback((e: React.MouseEvent, node: AgentNode) => {
    e.stopPropagation()

    // If we have a selected node and click another, create edge
    if (selectedNode && selectedNode.id !== node.id) {
      // Check if edge already exists
      const edgeExists = workflow.edges.some(
        edge => edge.from === selectedNode.id && edge.to === node.id
      )
      if (!edgeExists) {
        handleAddEdge(selectedNode.id, node.id)
      }
    }
    setSelectedNode(node)
  }, [selectedNode, workflow.edges, handleAddEdge])

  // Keyboard shortcut for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
        setWorkflow(prev => ({
          ...prev,
          nodes: prev.nodes.filter(n => n.id !== selectedNode.id),
          edges: prev.edges.filter(e => e.from !== selectedNode.id && e.to !== selectedNode.id)
        }))
        setSelectedNode(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode])

  return (
    <div className="h-full flex bg-mac-panel rounded-mac-xl border border-glass-border overflow-hidden">
      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Grid background */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle, #6b7280 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />

        {/* Edges - SVG lines */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>
          {workflow.edges.map(edge => {
            const fromNode = workflow.nodes.find(n => n.id === edge.from)
            const toNode = workflow.nodes.find(n => n.id === edge.to)
            if (!fromNode || !toNode) return null
            return (
              <line
                key={edge.id}
                x1={fromNode.x + 64}
                y1={fromNode.y + 40}
                x2={toNode.x + 64}
                y2={toNode.y + 40}
                stroke={selectedNode?.id === edge.from || selectedNode?.id === edge.to ? '#3b82f6' : '#6b7280'}
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            )
          })}
        </svg>

        {/* Nodes */}
        {workflow.nodes.map(node => (
          <div
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`${node.name} - ${node.type} - ${node.status}`}
            aria-pressed={selectedNode?.id === node.id}
            className={`absolute cursor-move select-none ${selectedNode?.id === node.id ? 'z-10' : 'z-0'}`}
            style={{ left: node.x, top: node.y }}
            onMouseDown={(e) => handleNodeMouseDown(e, node)}
            onClick={(e) => handleNodeClick(e, node)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedNode(node) }}}
          >
            <div className={`w-32 h-20 bg-card rounded-mac border flex flex-col items-center justify-center transition-all ${
              selectedNode?.id === node.id
                ? 'border-accent ring-2 ring-accent/30'
                : 'border-glass-border hover:border-glass-border/80'
            }`}>
              <div className={`w-3 h-3 rounded-full mb-1 ${
                node.status === 'running' ? 'bg-success animate-pulse' :
                node.status === 'waiting' ? 'bg-warning' :
                node.status === 'error' ? 'bg-error' : 'bg-text-tertiary'
              }`} />
              <span className="text-xs font-medium text-text-primary truncate px-2">{node.name}</span>
              <span className="text-[10px] text-text-tertiary">{node.type}</span>
            </div>
          </div>
        ))}

        {/* Empty state */}
        {workflow.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-text-tertiary">
              <p className="text-sm">Click an agent in the right panel to add it to the workflow</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div className="w-64 border-l border-glass-border flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-glass-border">
          <input
            type="text"
            value={workflow.name}
            onChange={(e) => setWorkflow(prev => ({ ...prev, name: e.target.value }))}
            className="bg-transparent text-sm font-semibold text-text-primary outline-none"
          />
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className="px-2 py-1 bg-glass hover:bg-card-hover rounded-mac text-xs text-text-secondary"
            >
              Save
            </button>
            {/* Execution controls (LangGraph-style: Run/Pause/Resume/Step/Reset) */}
            {workflow.status === 'draft' && (
              <button
                onClick={handleRun}
                className="px-2 py-1 bg-accent hover:bg-accent-hover rounded-mac text-xs text-text-primary flex items-center gap-1 disabled:opacity-40"
                disabled={workflow.nodes.length < 2}
                title="Run workflow"
              >
                <Play size={12} /> Run
              </button>
            )}
            {workflow.status === 'running' && (
              <>
                <button
                  onClick={handlePause}
                  className="px-2 py-1 bg-warning/20 hover:bg-warning/30 rounded-mac text-xs text-warning flex items-center gap-1"
                  title="Pause workflow"
                >
                  <Pause size={12} /> Pause
                </button>
                <button
                  onClick={handleStep}
                  className="px-2 py-1 bg-info/20 hover:bg-info/30 rounded-mac text-xs text-info flex items-center gap-1"
                  title="Step to next node"
                >
                  <SkipForward size={12} /> Step
                </button>
              </>
            )}
            {workflow.status === 'paused' && (
              <>
                <button
                  onClick={handleResume}
                  className="px-2 py-1 bg-accent/20 hover:bg-accent/30 rounded-mac text-xs text-accent flex items-center gap-1"
                  title="Resume workflow"
                >
                  <Play size={12} /> Resume
                </button>
                <button
                  onClick={handleStep}
                  className="px-2 py-1 bg-info/20 hover:bg-info/30 rounded-mac text-xs text-info flex items-center gap-1"
                  title="Step to next node"
                >
                  <SkipForward size={12} /> Step
                </button>
              </>
            )}
            {(workflow.status === 'running' || workflow.status === 'paused' || workflow.status === 'completed') && (
              <button
                onClick={handleReset}
                className="px-2 py-1 bg-glass hover:bg-card-hover rounded-mac text-xs text-text-secondary flex items-center gap-1"
                title="Reset workflow"
              >
                <RotateCcw size={12} /> Reset
              </button>
            )}
            {workflow.status === 'completed' && (
              <span className="px-2 py-1 text-xs text-success">Done</span>
            )}
          </div>
        </div>

        {/* Execution log (last 5 entries) */}
        {executionLog.length > 0 && (
          <div className="px-3 py-2 border-b border-glass-border bg-accent/5">
            <p className="text-xs text-text-secondary mb-1">Execution Log</p>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {executionLog.slice(-5).map((entry, i) => (
                <p key={i} className="text-xs text-text-tertiary font-mono">{entry}</p>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {selectedNode && (
          <div className="p-3 border-b border-glass-border bg-accent/5">
            <p className="text-xs text-text-secondary">
              Click another node to connect, or press Delete to remove
            </p>
          </div>
        )}

        {/* Agent Palette */}
        <div className="flex-1 overflow-y-auto p-3">
          <h4 className="text-xs font-semibold text-text-tertiary mb-2 uppercase tracking-wider">Agents</h4>
          <div className="space-y-2" role="listbox" aria-label="Available agents">
            {agents.map(agent => (
              <div
                key={agent.id}
                role="option"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAddNode(agent) }}}
                className="p-2 bg-glass hover:bg-card-hover rounded-mac cursor-pointer transition-colors"
                onClick={() => handleAddNode(agent)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-accent">{agent.name[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{agent.name}</div>
                    <div className="text-xs text-text-secondary">{agent.type}</div>
                  </div>
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <p className="text-xs text-text-tertiary text-center py-4">No agents available</p>
            )}
          </div>
        </div>

        {/* Workflow Stats */}
        <div className="p-3 border-t border-glass-border text-xs text-text-tertiary">
          <div className="flex justify-between">
            <span>Nodes: {workflow.nodes.length}</span>
            <span>Edges: {workflow.edges.length}</span>
          </div>
          <div className="mt-1">Status: <span className={`${
            workflow.status === 'running' ? 'text-success' :
            workflow.status === 'paused' ? 'text-warning' :
            workflow.status === 'completed' ? 'text-accent' : ''
          }`}>{workflow.status}</span></div>
        </div>
      </div>
    </div>
  )
}
