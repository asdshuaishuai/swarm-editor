import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import {
  Cpu,
  Play,
  Square,
  Zap,
  AlertCircle,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  LayoutGrid,
} from 'lucide-react'
import type { AgentState } from '../types'

// ==================== Constants ====================
const GRID_SIZE = 20 // n8n-style snap-to-grid

// Node types
export type NodeType = 'agent' | 'task' | 'condition' | 'start' | 'end'

export interface WorkflowNode {
  id: string
  type: NodeType
  label: string
  x: number
  y: number
  width?: number
  height?: number
  data?: Record<string, unknown>
  status?: 'idle' | 'active' | 'completed' | 'error'
}

export type EdgeStyle = 'bezier' | 'straight' | 'step' | 'smoothstep'

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
  edgeType?: EdgeStyle
}

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// Props
interface WorkflowEditorProps {
  swarmId?: string
  width?: number
  height?: number
  readOnly?: boolean
  onNodeClick?: (node: WorkflowNode) => void
  onNodeDoubleClick?: (node: WorkflowNode) => void
  onEdgeClick?: (edge: WorkflowEdge) => void
  onGraphChange?: (graph: WorkflowGraph) => void
}

// ==================== Command Pattern (Undo/Redo) ====================
// Inspired by n8n's dual-stack history

interface Command {
  execute(nodes: WorkflowNode[], edges: WorkflowEdge[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
  undo(nodes: WorkflowNode[], edges: WorkflowEdge[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
}

class AddNodeCommand implements Command {
  constructor(private node: WorkflowNode) {}
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: [...n, this.node], edges: e }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n.filter((nd) => nd.id !== this.node.id), edges: e }
  }
}

class DeleteNodeCommand implements Command {
  constructor(private node: WorkflowNode, private removedEdges: WorkflowEdge[]) {}
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return {
      nodes: n.filter((nd) => nd.id !== this.node.id),
      edges: e.filter((ed) => ed.source !== this.node.id && ed.target !== this.node.id),
    }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: [...n, this.node], edges: [...e, ...this.removedEdges] }
  }
}

// Composite command for batch node deletion
class DeleteNodesCommand implements Command {
  private subCommands: DeleteNodeCommand[]
  constructor(nodes: WorkflowNode[], allEdges: WorkflowEdge[]) {
    // Pre-compute all edges to remove for all nodes
    const allRemovedEdges: WorkflowEdge[] = []
    for (const node of nodes) {
      const removed = allEdges.filter((ed) => ed.source === node.id || ed.target === node.id)
      for (const r of removed) {
        if (!allRemovedEdges.some((e) => e.id === r.id)) {
          allRemovedEdges.push(r)
        }
      }
    }
    this.subCommands = nodes.map((n) => new DeleteNodeCommand(n, []))
    this._removedEdges = allRemovedEdges
  }
  private _removedEdges: WorkflowEdge[]
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    let nodes = n
    let edges = e
    for (const cmd of this.subCommands) {
      const result = cmd.execute(nodes, edges)
      nodes = result.nodes
      edges = result.edges
    }
    return { nodes, edges }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    let nodes = n
    let edges = e
    // Restore in reverse order
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      const cmd = this.subCommands[i]
      const result = cmd.undo(nodes, edges)
      nodes = result.nodes
      edges = result.edges
    }
    // Restore edges that were removed
    return { nodes, edges: [...edges, ...this._removedEdges] }
  }
}

// Paste command: clones clipboard nodes with new IDs and offset position
class PasteNodesCommand implements Command {
  private newNodes: WorkflowNode[]
  private readonly pastedIds: string[]
  constructor(clipboard: WorkflowNode[], private offset = GRID_SIZE) {
    this.newNodes = clipboard.map((n) => ({
      ...n,
      id: `${n.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: n.x + this.offset,
      y: n.y + this.offset,
    }))
    this.pastedIds = this.newNodes.map((nd) => nd.id)
  }
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: [...n, ...this.newNodes], edges: e }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    const ids = new Set(this.pastedIds)
    return { nodes: n.filter((nd) => !ids.has(nd.id)), edges: e }
  }
}

class MoveNodeCommand implements Command {
  constructor(private nodeId: string, private fromX: number, private fromY: number, private toX: number, private toY: number) {}
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n.map((nd) => nd.id === this.nodeId ? { ...nd, x: this.toX, y: this.toY } : nd), edges: e }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n.map((nd) => nd.id === this.nodeId ? { ...nd, x: this.fromX, y: this.fromY } : nd), edges: e }
  }
}

class AddEdgeCommand implements Command {
  constructor(private edge: WorkflowEdge) {}
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n, edges: [...e, this.edge] }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n, edges: e.filter((ed) => ed.id !== this.edge.id) }
  }
}

class DeleteEdgeCommand implements Command {
  constructor(private edge: WorkflowEdge) {}
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n, edges: e.filter((ed) => ed.id !== this.edge.id) }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n, edges: [...e, this.edge] }
  }
}

class ChangeEdgeTypeCommand implements Command {
  constructor(private edgeId: string, private newType: EdgeStyle, edges: WorkflowEdge[]) {
    this._oldType = (edges.find((ed) => ed.id === edgeId)?.edgeType as EdgeStyle) || 'bezier'
  }
  private _oldType: EdgeStyle
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n, edges: e.map((ed) => ed.id === this.edgeId ? { ...ed, edgeType: this.newType } : ed) }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: n, edges: e.map((ed) => ed.id === this.edgeId ? { ...ed, edgeType: this._oldType } : ed) }
  }
}

// Move selected nodes by delta with undo support (React Flow arrow key navigation)
class MoveNodesCommand implements Command {
  constructor(private nodeIds: string[], private deltaX: number, private deltaY: number, allNodes: WorkflowNode[]) {
    // Pre-compute old positions
    this._oldPositions = new Map(
      allNodes.filter((nd) => nodeIds.includes(nd.id)).map((nd) => [nd.id, { x: nd.x, y: nd.y }])
    )
  }
  private _oldPositions: Map<string, { x: number; y: number }>
  execute(n: WorkflowNode[], _e: WorkflowEdge[]) {
    return {
      nodes: n.map((nd) =>
        this.nodeIds.includes(nd.id)
          ? { ...nd, x: nd.x + this.deltaX, y: nd.y + this.deltaY }
          : nd
      ),
      edges: _e,
    }
  }
  undo(n: WorkflowNode[], _e: WorkflowEdge[]) {
    return {
      nodes: n.map((nd) => {
        const old = this._oldPositions.get(nd.id)
        return old ? { ...nd, x: old.x, y: old.y } : nd
      }),
      edges: _e,
    }
  }
}

// Auto-layout command with undo support (stores old positions for restoration)
class AutoLayoutCommand implements Command {
  private _oldPositions: Map<string, { x: number; y: number }>
  constructor(oldNodes: WorkflowNode[], private newNodes: WorkflowNode[]) {
    this._oldPositions = new Map(oldNodes.map((nd) => [nd.id, { x: nd.x, y: nd.y }]))
  }
  execute(_n: WorkflowNode[], e: WorkflowEdge[]) {
    return { nodes: this.newNodes, edges: e }
  }
  undo(_n: WorkflowNode[], e: WorkflowEdge[]) {
    return {
      nodes: this.newNodes.map((nd) => {
        const old = this._oldPositions.get(nd.id)
        return old ? { ...nd, x: old.x, y: old.y } : nd
      }),
      edges: e,
    }
  }
}

// Resize a node with undo support (React Flow-style node resize)
class ResizeNodeCommand implements Command {
  constructor(
    private nodeId: string,
    private oldWidth: number,
    private oldHeight: number,
    private newWidth: number,
    private newHeight: number,
  ) {}
  execute(n: WorkflowNode[], e: WorkflowEdge[]) {
    return {
      nodes: n.map((nd) =>
        nd.id === this.nodeId
          ? { ...nd, width: this.newWidth, height: this.newHeight }
          : nd
      ),
      edges: e,
    }
  }
  undo(n: WorkflowNode[], e: WorkflowEdge[]) {
    return {
      nodes: n.map((nd) =>
        nd.id === this.nodeId
          ? { ...nd, width: this.oldWidth, height: this.oldHeight }
          : nd
      ),
      edges: e,
    }
  }
}

const MAX_UNDO_STACK = 100

function useHistoryManager(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<WorkflowEdge[]>>,
) {
  const [undoStack, setUndoStack] = useState<Command[]>([])
  const [redoStack, setRedoStack] = useState<Command[]>([])

  const applyCommand = useCallback((cmd: Command) => {
    const result = cmd.execute(nodes, edges)
    setNodes(result.nodes)
    setEdges(result.edges)
    // Bounded stack — evict oldest when full to prevent memory exhaustion
    setUndoStack((prev) => [...prev, cmd].slice(-MAX_UNDO_STACK))
    setRedoStack([])
  }, [nodes, edges, setNodes, setEdges])

  const undo = useCallback(() => {
    const cmd = undoStack[undoStack.length - 1]
    if (!cmd) return
    const result = cmd.undo(nodes, edges)
    setNodes(result.nodes)
    setEdges(result.edges)
    setUndoStack((prev) => prev.slice(0, -1))
    setRedoStack((prev) => [...prev, cmd])
  }, [nodes, edges, undoStack, setNodes, setEdges])

  const redo = useCallback(() => {
    const cmd = redoStack[redoStack.length - 1]
    if (!cmd) return
    const result = cmd.execute(nodes, edges)
    setNodes(result.nodes)
    setEdges(result.edges)
    setRedoStack((prev) => prev.slice(0, -1))
    setUndoStack((prev) => [...prev, cmd])
  }, [nodes, edges, redoStack, setNodes, setEdges])

  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  return { applyCommand, undo, redo, canUndo, canRedo, undoCount: undoStack.length, redoCount: redoStack.length }
}

// ==================== Auto Layout (dagre-style hierarchical) ====================
// Inspired by LangGraph Studio / React Flow auto-layout

function autoLayout(nodes: WorkflowNode[], edges: WorkflowEdge[], width: number, height: number): WorkflowNode[] {
  if (nodes.length === 0) return nodes

  // Topological sort using Kahn's algorithm
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  nodes.forEach((n) => {
    inDegree.set(n.id, 0)
    adjacency.set(n.id, [])
  })
  edges.forEach((e) => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
    adjacency.get(e.source)?.push(e.target)
  })

  const queue: string[] = []
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id)
  })

  const layers: string[][] = []
  const visited = new Set<string>()

  while (queue.length > 0) {
    const layerSize = queue.length
    const layer: string[] = []
    for (let i = 0; i < layerSize; i++) {
      const nodeId = queue.shift()!
      if (visited.has(nodeId)) continue
      visited.add(nodeId)
      layer.push(nodeId)
      for (const next of adjacency.get(nodeId) || []) {
        inDegree.set(next, (inDegree.get(next) || 0) - 1)
        if ((inDegree.get(next) || 0) === 0) queue.push(next)
      }
    }
    if (layer.length > 0) layers.push(layer)
  }

  // Add any unvisited nodes (disconnected)
  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      layers.push([n.id])
      visited.add(n.id)
    }
  })

  // Position nodes based on layers
  const horizontalSpacing = 200
  const verticalSpacing = 100
  const startY = height / 2 - ((layers.length - 1) * verticalSpacing) / 2

  const positioned = nodes.map((node) => {
    let layerIdx = layers.findIndex((l) => l.includes(node.id))
    if (layerIdx === -1) layerIdx = 0
    const colIdx = layers[layerIdx].indexOf(node.id)

    const layerWidth = layers[layerIdx].length
    const layerStartX = width / 2 - ((layerWidth - 1) * horizontalSpacing) / 2

    return {
      ...node,
      x: layerStartX + colIdx * horizontalSpacing,
      y: startY + layerIdx * verticalSpacing,
    }
  })

  return positioned
}

// ==================== Map agent state ====================

function mapAgentState(state: AgentState): WorkflowNode['status'] {
  switch (state) {
    case 'executing':
    case 'thinking':
      return 'active'
    case 'idle':
    case 'waiting':
      return 'idle'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

// ==================== Node Components ====================

function NodeIcon({ type, status }: { type: NodeType; status?: WorkflowNode['status'] }) {
  const statusColor = {
    idle: 'text-text-secondary',
    active: 'text-accent',
    completed: 'text-success',
    error: 'text-error',
  }[status || 'idle']

  switch (type) {
    case 'agent':
      return <Cpu size={16} className={statusColor} />
    case 'task':
      return <Zap size={16} className={statusColor} />
    case 'condition':
      return <AlertCircle size={16} className={statusColor} />
    case 'start':
      return <Play size={16} className="text-success" />
    case 'end':
      return <Square size={16} className="text-error" />
    default:
      return <Cpu size={16} className={statusColor} />
  }
}

function StatusIndicator({ status }: { status?: WorkflowNode['status'] }) {
  if (!status) return null
  const colors: Record<string, string> = {
    idle: 'bg-text-secondary',
    active: 'bg-accent animate-pulse',
    completed: 'bg-success',
    error: 'bg-error',
  }
  return <span className={`w-2 h-2 rounded-full ${colors[status] || colors.idle}`} aria-label={`Status: ${status}`} role="status" />
}

// Resize handles shown when node is selected (React Flow-style)
// Batches resize into a single undo operation — only commits on mouseup
function ResizeHandles({
  nodeWidth,
  nodeHeight,
  onResizeCommit,
}: {
  nodeWidth: number
  nodeHeight: number
  onResizeCommit: (finalW: number, finalH: number) => void
}) {
  const moveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const upHandlerRef = useRef<(() => void) | null>(null)

  // Cleanup document listeners on unmount (prevents leak if component unmounts mid-resize)
  useEffect(() => {
    return () => {
      if (moveHandlerRef.current) document.removeEventListener('mousemove', moveHandlerRef.current)
      if (upHandlerRef.current) document.removeEventListener('mouseup', upHandlerRef.current)
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent, dir: string) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const initW = nodeWidth
    const initH = nodeHeight
    let lastPreviewW = initW
    let lastPreviewH = initH

    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      let dw = 0, dh = 0
      if (dir === 'e') dw = dx
      else if (dir === 's') dh = dy
      else if (dir === 'se') { dw = dx; dh = dy }
      lastPreviewW = Math.max(80, initW + dw)
      lastPreviewH = Math.max(36, initH + dh)
      // Visual preview: resize parent via CSS
      const el = (e.currentTarget as HTMLElement).parentElement
      if (el) {
        el.style.width = lastPreviewW + 'px'
        el.style.height = lastPreviewH + 'px'
      }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      moveHandlerRef.current = null
      upHandlerRef.current = null
      // Only commit if size actually changed
      if (lastPreviewW !== initW || lastPreviewH !== initH) {
        onResizeCommit(lastPreviewW, lastPreviewH)
      }
      // Reset inline styles so React takes over again
      const el = (e.currentTarget as HTMLElement).parentElement
      if (el) {
        el.style.width = ''
        el.style.height = ''
      }
    }
    moveHandlerRef.current = onMove
    upHandlerRef.current = onUp
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <>
      {/* Corner resize handle */}
      <div
        className="absolute w-3 h-3 bg-accent border border-accent/60 rounded-sm cursor-se-resize"
        style={{ bottom: -4, right: -4, zIndex: 10 }}
        onMouseDown={(e) => handleMouseDown(e, 'se')}
      />
      {/* Right edge resize handle */}
      <div
        className="absolute w-2 h-full bg-accent/30 hover:bg-accent/50 cursor-e-resize right-0 top-0"
        style={{ width: 4, zIndex: 10 }}
        onMouseDown={(e) => handleMouseDown(e, 'e')}
      />
      {/* Bottom edge resize handle */}
      <div
        className="absolute h-2 w-full bg-accent/30 hover:bg-accent/50 cursor-s-resize bottom-0 left-0"
        style={{ height: 4, zIndex: 10 }}
        onMouseDown={(e) => handleMouseDown(e, 's')}
      />
    </>
  )
}

// Connection handles (input/output ports for edge creation)
function ConnectionHandles({
  nodeId,
  onOutputDragStart,
  onInputDrop,
}: {
  nodeId: string
  onOutputDragStart: (e: React.MouseEvent, nodeId: string) => void
  onInputDrop: (e: React.MouseEvent, nodeId: string) => void
}) {
  return (
    <>
      {/* Output handle (right side) */}
      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent/60 border border-accent opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
        onMouseDown={(e) => {
          e.stopPropagation()
          onOutputDragStart(e, nodeId)
        }}
      />
      {/* Input handle (left side) */}
      <div
        className="absolute -left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-success/60 border border-success opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
        onMouseUp={(e) => {
          e.stopPropagation()
          onInputDrop(e, nodeId)
        }}
      />
    </>
  )
}

function AgentNodeComponent({
  node,
  selected,
  onMouseDown,
  onClick,
  onDoubleClick,
  onOutputDragStart,
  onInputDrop,
  onContextMenu,
  onResize,
}: {
  node: WorkflowNode
  selected: boolean
  onMouseDown: (e: React.MouseEvent, node: WorkflowNode) => void
  onClick: (node: WorkflowNode, e: React.MouseEvent) => void
  onDoubleClick: (node: WorkflowNode) => void
  onOutputDragStart: (e: React.MouseEvent, nodeId: string) => void
  onInputDrop: (e: React.MouseEvent, nodeId: string) => void
  onContextMenu?: (e: React.MouseEvent, node: WorkflowNode) => void
  onResize?: (nodeId: string, deltaW: number, deltaH: number) => void
}) {
  return (
    <div
      className={`
        absolute flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-move
        transition-all duration-150 select-none
        ${selected
          ? 'bg-accent/20 border-accent shadow-lg shadow-accent/30'
          : 'bg-mac-panel border-glass-border hover:border-accent/50 hover:bg-accent/10'
        }
      `}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu?.(e, node) }}
      style={{
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
        minWidth: node.width ? undefined : 140,
        width: node.width,
        height: node.height,
      }}
      onMouseDown={(e) => onMouseDown(e, node)}
      onClick={(e) => {
        e.stopPropagation()
        onClick(node, e)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick(node)
      }}
    >
      <NodeIcon type={node.type} status={node.status} />
      <span className="text-sm font-medium text-text-primary whitespace-nowrap">{node.label}</span>
      <StatusIndicator status={node.status} />
      <ConnectionHandles nodeId={node.id} onOutputDragStart={onOutputDragStart} onInputDrop={onInputDrop} />
      {selected && onResize && <ResizeHandles nodeWidth={node.width ?? 140} nodeHeight={node.height ?? 44} onResizeCommit={(w, h) => onResize(node.id, w, h)} />}
    </div>
  )
}

function TaskNodeComponent({
  node,
  selected,
  onMouseDown,
  onClick,
  onDoubleClick,
  onOutputDragStart,
  onInputDrop,
  onContextMenu,
  onResize,
}: {
  node: WorkflowNode
  selected: boolean
  onMouseDown: (e: React.MouseEvent, node: WorkflowNode) => void
  onClick: (node: WorkflowNode, e: React.MouseEvent) => void
  onDoubleClick: (node: WorkflowNode) => void
  onOutputDragStart: (e: React.MouseEvent, nodeId: string) => void
  onInputDrop: (e: React.MouseEvent, nodeId: string) => void
  onContextMenu?: (e: React.MouseEvent, node: WorkflowNode) => void
  onResize?: (nodeId: string, deltaW: number, deltaH: number) => void
}) {
  return (
    <div
      className={`
        absolute flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-move
        transition-all duration-150 select-none
        ${selected
          ? 'bg-accent/20 border-accent shadow-lg shadow-accent/30'
          : 'bg-surface border-glass-border hover:border-accent/50 hover:bg-accent/10'
        }
      `}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu?.(e, node) }}
      style={{
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
        minWidth: node.width ? undefined : 120,
        width: node.width,
        height: node.height,
      }}
      onMouseDown={(e) => onMouseDown(e, node)}
      onClick={(e) => {
        e.stopPropagation()
        onClick(node, e)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick(node)
      }}
    >
      <NodeIcon type={node.type} status={node.status} />
      <span className="text-sm text-text-primary whitespace-nowrap">{node.label}</span>
      {node.status && <StatusIndicator status={node.status} />}
      <ConnectionHandles nodeId={node.id} onOutputDragStart={onOutputDragStart} onInputDrop={onInputDrop} />
      {selected && onResize && <ResizeHandles nodeWidth={node.width ?? 140} nodeHeight={node.height ?? 44} onResizeCommit={(w, h) => onResize(node.id, w, h)} />}
    </div>
  )
}

function TerminalNode({
  node,
  selected,
  onClick,
  onOutputDragStart,
  onInputDrop,
  onContextMenu,
}: {
  node: WorkflowNode
  selected: boolean
  onClick: (node: WorkflowNode, e: React.MouseEvent) => void
  onOutputDragStart: (e: React.MouseEvent, nodeId: string) => void
  onInputDrop: (e: React.MouseEvent, nodeId: string) => void
  onContextMenu?: (e: React.MouseEvent, node: WorkflowNode) => void
}) {
  const isStart = node.type === 'start'
  return (
    <div
      className="absolute flex flex-col items-center gap-1 cursor-pointer transition-all duration-150"
      style={{
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick(node, e)
      }}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu?.(e, node) }}
    >
      <div
        className={`
          flex items-center justify-center w-10 h-10 rounded-full border-2
          ${selected
            ? 'bg-accent/20 border-accent shadow-lg'
            : isStart
              ? 'bg-success/20 border-success hover:bg-success/30'
              : 'bg-error/20 border-error hover:bg-error/30'
          }
        `}
      >
        <NodeIcon type={node.type} status={node.status} />
      </div>
      <span className="text-xs text-text-secondary">{node.label}</span>
      {/* Start has output, End has input */}
      {isStart ? (
        <div
          className="w-3 h-3 rounded-full bg-accent/60 border border-accent opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
          onMouseDown={(e) => {
            e.stopPropagation()
            onOutputDragStart(e, node.id)
          }}
        />
      ) : (
        <div
          className="w-3 h-3 rounded-full bg-success/60 border border-success opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
          onMouseUp={(e) => {
            e.stopPropagation()
            onInputDrop(e, node.id)
          }}
        />
      )}
    </div>
  )
}

// ==================== Edge Component ====================

// Helper: get exit port on source node (right side) and entry port on target node (left side)
function getEdgeEndpoints(source: WorkflowNode, target: WorkflowNode): { sx: number; sy: number; tx: number; ty: number } {
  // Self-loop: exit right side, re-enter bottom
  if (source.id === target.id) {
    const sw = source.width ?? 140
    const sh = source.height ?? 44
    return {
      sx: source.x + sw / 2, sy: source.y + sh,
      tx: source.x + sw, ty: source.y + sh / 2,
    }
  }

  const sw = source.width ?? 140
  const tw = target.width ?? 140
  const sh = source.height ?? 44
  const th = target.height ?? 44
  const dx = target.x - source.x

  if (dx === 0) {
    // Vertical alignment (same X): exit right, enter left
    return {
      sx: source.x + sw / 2, sy: source.y + sh / 2,
      tx: target.x - tw / 2, ty: target.y + th / 2,
    }
  }
  if (dx < 0) {
    // Target is to the left: exit left, enter right
    return {
      sx: source.x - sw / 2, sy: source.y + sh / 2,
      tx: target.x + tw / 2, ty: target.y + th / 2,
    }
  }
  // Target is to the right: exit right, enter left
  return {
    sx: source.x + sw / 2, sy: source.y + sh / 2,
    tx: target.x - tw / 2, ty: target.y + th / 2,
  }
}

function EdgeComponent({
  edge,
  nodes,
  selected,
  onClick,
  onDelete,
  onContextMenu,
}: {
  edge: WorkflowEdge
  nodes: WorkflowNode[]
  selected: boolean
  onClick: (edge: WorkflowEdge) => void
  onDelete: (edge: WorkflowEdge) => void
  onContextMenu?: (e: React.MouseEvent, edge: WorkflowEdge) => void
}) {
  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)

  if (!sourceNode || !targetNode) return null

  // Self-loop: render a curved loop around the node
  if (sourceNode.id === targetNode.id) {
    const sw = sourceNode.width ?? 140
    const sh = sourceNode.height ?? 44
    const loopR = Math.min(sw / 2 + 20, 60)
    const cx = sourceNode.x + sw / 2
    const cy = sourceNode.y - loopR / 2
    const p1x = sourceNode.x + sw
    const p1y = sourceNode.y + sh / 2
    const p3x = sourceNode.x + sw
    const p3y = sourceNode.y
    const arrowSize = 8
    const arrowAngle = Math.PI / 6
    const arrowX = p3x + arrowSize
    const arrowY = p3y - arrowSize * 0.5
    const ax1x = arrowX - arrowSize * Math.cos(-arrowAngle)
    const ax1y = arrowY - arrowSize * Math.sin(-arrowAngle)
    const ax2x = arrowX - arrowSize
    const ax2y = arrowY
    const loopPath = `M ${p1x} ${p1y} C ${p1x + loopR} ${p1y}, ${cx + loopR} ${cy - loopR}, ${cx + loopR} ${cy}`
      + ` C ${cx + loopR} ${cy + loopR}, ${p3x + loopR} ${p3y + loopR}, ${p3x + loopR} ${p3y}`
      + ` L ${arrowX} ${arrowY}`
    return (
      <g onClick={() => onClick(edge)} onDoubleClick={() => onDelete(edge)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, edge) }} className="cursor-pointer">
        <path d={loopPath} fill="none" stroke={selected ? '#3b82f6' : '#64748b'} strokeWidth={selected ? 2.5 : 1.5} className="transition-all duration-150" />
        <polygon points={`${arrowX},${arrowY} ${ax1x},${ax1y} ${ax2x},${ax2y}`} fill={selected ? '#3b82f6' : '#64748b'} />
      </g>
    )
  }

  const { sx, sy, tx, ty } = getEdgeEndpoints(sourceNode, targetNode)
  const cx = (sx + tx) / 2
  const cy = (sy + ty) / 2
  const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2)
  const curveOffset = Math.min(dist * 0.15, 40)
  const stepOffset = Math.min(curveOffset * 1.5, 30)

  const angle = Math.atan2(ty - sy, tx - sx)
  const arrowSize = 8
  const arrowAngle = Math.PI / 6
  const p1x = tx - arrowSize * Math.cos(angle - arrowAngle)
  const p1y = ty - arrowSize * Math.sin(angle - arrowAngle)
  const p2x = tx - arrowSize * Math.cos(angle + arrowAngle)
  const p2y = ty - arrowSize * Math.sin(angle + arrowAngle)

  // Build path based on edge type (n8n-style: bezier, straight, step, smoothstep)
  const edgeType = edge.edgeType || 'bezier'
  let pathD: string
  let labelX: number
  let labelY: number
  if (edgeType === 'straight') {
    pathD = `M ${sx} ${sy} L ${tx} ${ty}`
    labelX = cx
    labelY = cy - 10
  } else if (edgeType === 'step') {
    pathD = `M ${sx} ${sy} H ${cx} V ${ty}`
    labelX = cx
    labelY = cy
  } else if (edgeType === 'smoothstep') {
    pathD = `M ${sx} ${sy} C ${sx + stepOffset} ${sy}, ${tx - stepOffset} ${ty}, ${tx} ${ty}`
    labelX = cx
    labelY = cy - 10
  } else {
    // bezier (default)
    pathD = `M ${sx} ${sy} Q ${cx} ${cy - curveOffset} ${tx} ${ty}`
    labelX = cx
    labelY = cy - curveOffset - 10
  }

  return (
    <g onClick={() => onClick(edge)} onDoubleClick={() => onDelete(edge)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, edge) }} className="cursor-pointer">
      <path
        d={pathD}
        fill="none"
        stroke={selected ? '#3b82f6' : '#64748b'}
        strokeWidth={selected ? 2.5 : 1.5}
        className="transition-all duration-150"
      />
      <polygon
        points={`${tx},${ty} ${p1x},${p1y} ${p2x},${p2y}`}
        fill={selected ? '#3b82f6' : '#64748b'}
      />
      {edge.label && (
        <text x={labelX} y={labelY} textAnchor="middle" className="text-xs fill-text-secondary">
          {edge.label}
        </text>
      )}
    </g>
  )
}

// ==================== MiniMap ====================

function MiniMap({
  nodes,
  viewport,
  onNavigate,
}: {
  nodes: WorkflowNode[]
  viewport: { x: number; y: number; scale: number }
  onNavigate: (x: number, y: number) => void
}) {
  if (nodes.length === 0) return null

  const bounds = nodes.reduce(
    (acc, node) => ({
      minX: Math.min(acc.minX, node.x),
      maxX: Math.max(acc.maxX, node.x),
      minY: Math.min(acc.minY, node.y),
      maxY: Math.max(acc.maxY, node.y),
    }),
    { minX: 0, maxX: 100, minY: 0, maxY: 100 }
  )

  const padding = 20
  const mapWidth = bounds.maxX - bounds.minX + padding * 2
  const mapHeight = bounds.maxY - bounds.minY + padding * 2
  const scale = Math.min(80 / mapWidth, 60 / mapHeight)

  const handleMiniMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Convert minimap click coordinates to canvas coordinates
    const canvasX = (clickX / scale) + bounds.minX - padding
    const canvasY = (clickY / scale) + bounds.minY - padding

    // Center the viewport on the clicked point
    const vpX = canvasX * viewport.scale - 80 / 2
    const vpY = canvasY * viewport.scale - 60 / 2

    onNavigate(vpX, vpY)
  }

  if (nodes.length === 0) return null

  return (
    <div className="absolute bottom-4 right-4 bg-mac-panel/90 border border-glass-border rounded-lg p-2">
      <svg
        width={80}
        height={60}
        className="bg-surface/50 rounded cursor-pointer"
        onClick={handleMiniMapClick}
      >
        {nodes.map((node) => (
          <circle
            key={node.id}
            cx={(node.x - bounds.minX + padding) * scale}
            cy={(node.y - bounds.minY + padding) * scale}
            r={4}
            fill={node.type === 'agent' ? '#3b82f6' : '#10b981'}
          />
        ))}
        <rect
          x={Math.max(0, (viewport.x / viewport.scale - bounds.minX + padding) * scale)}
          y={Math.max(0, (viewport.y / viewport.scale - bounds.minY + padding) * scale)}
          width={Math.max(0, 80 / viewport.scale)}
          height={Math.max(0, 60 / viewport.scale)}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1}
          opacity={0.5}
        />
      </svg>
    </div>
  )
}

// ==================== Toolbar ====================

function Toolbar({
  onAddNode,
  onDelete,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  onAutoLayout,
  onZoomIn,
  onZoomOut,
  onFit,
  selectedNode,
  canDelete,
}: {
  onAddNode: () => void
  onDelete: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  undoCount: number
  redoCount: number
  onAutoLayout: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  selectedNode: WorkflowNode | null
  canDelete: boolean
}) {
  const undoTitle = 'Undo (Ctrl+Z)' + (undoCount > 0 ? ` — ${undoCount} ops` : '')
  const redoTitle = 'Redo (Ctrl+Shift+Z)' + (redoCount > 0 ? ` — ${redoCount} ops` : '')
  return (
    <div className="absolute top-4 left-4 flex items-center gap-1 bg-mac-panel/90 border border-glass-border rounded-lg p-2 backdrop-blur-sm">
      <button onClick={onUndo} disabled={!canUndo} className="p-1.5 hover:bg-accent/20 rounded transition-colors disabled:opacity-30" title={undoTitle} aria-label="Undo">
        <Undo2 size={16} className="text-text-secondary" />
      </button>
      <button onClick={onRedo} disabled={!canRedo} className="p-1.5 hover:bg-accent/20 rounded transition-colors disabled:opacity-30" title={redoTitle} aria-label="Redo">
        <Redo2 size={16} className="text-text-secondary" />
      </button>
      <div className="w-px h-4 bg-glass-border mx-0.5" />
      <button onClick={onAddNode} className="p-1.5 hover:bg-accent/20 rounded transition-colors" title="Add Node" aria-label="Add Node">
        <Plus size={16} className="text-text-secondary" />
      </button>
      <button onClick={onDelete} disabled={!selectedNode || !canDelete} className="p-1.5 hover:bg-error/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Delete (Del)" aria-label="Delete">
        <Trash2 size={16} className="text-text-secondary" />
      </button>
      <div className="w-px h-4 bg-glass-border mx-0.5" />
      <button onClick={onAutoLayout} className="p-1.5 hover:bg-accent/20 rounded transition-colors" title="Auto Layout" aria-label="Auto Layout">
        <LayoutGrid size={16} className="text-text-secondary" />
      </button>
      <div className="w-px h-4 bg-glass-border mx-0.5" />
      <button onClick={onZoomOut} className="p-1.5 hover:bg-accent/20 rounded transition-colors" title="Zoom Out" aria-label="Zoom Out">
        <ZoomOut size={16} className="text-text-secondary" />
      </button>
      <button onClick={onZoomIn} className="p-1.5 hover:bg-accent/20 rounded transition-colors" title="Zoom In" aria-label="Zoom In">
        <ZoomIn size={16} className="text-text-secondary" />
      </button>
      <button onClick={onFit} className="p-1.5 hover:bg-accent/20 rounded transition-colors" title="Fit View" aria-label="Fit View">
        <Maximize2 size={16} className="text-text-secondary" />
      </button>
    </div>
  )
}

// ==================== Main WorkflowEditor ====================

export function WorkflowEditor({
  swarmId,
  width = 800,
  height = 600,
  readOnly = false,
  onNodeClick,
  onNodeDoubleClick,
  onEdgeClick,
  onGraphChange,
}: WorkflowEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null)

  // Track container rect for connection line rendering (avoids ref access during render)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const updateRect = () => setContainerRect(el.getBoundingClientRect())
    updateRect()
    const observer = new ResizeObserver(updateRect)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const activeSwarm = useAppStore(state => state.activeSwarm)

  // Initial graph data (derived from swarm, not side-effect)
  const initialGraph = useMemo((): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } => {
    if (activeSwarm) {
      const newNodes: WorkflowNode[] = [
        { id: 'start', type: 'start', label: 'Start', x: 100, y: height / 2, status: 'completed' },
      ]
      activeSwarm.agents.forEach((agent, idx) => {
        newNodes.push({
          id: agent.id,
          type: 'agent',
          label: agent.name,
          x: 300,
          y: 100 + idx * 120,
          status: mapAgentState(agent.state),
        })
      })
      newNodes.push({ id: 'end', type: 'end', label: 'End', x: 500, y: height / 2, status: 'idle' })
      const newEdges: WorkflowEdge[] = []
      newNodes
        .filter((n) => n.type === 'agent')
        .forEach((agent, idx) => {
          if (idx === 0) {
            newEdges.push({ id: `e-start-${agent.id}`, source: 'start', target: agent.id })
          }
          newEdges.push({ id: `e-${agent.id}-end`, source: agent.id, target: 'end' })
        })
      return { nodes: newNodes, edges: newEdges }
    }

    if (!swarmId) {
      return {
        nodes: [
          { id: 'start', type: 'start', label: 'Start', x: 100, y: height / 2, status: 'completed' },
          { id: 'agent-1', type: 'agent', label: 'Agent 1', x: 300, y: height / 2 - 60, status: 'active' },
          { id: 'agent-2', type: 'agent', label: 'Agent 2', x: 300, y: height / 2 + 60, status: 'idle' },
          { id: 'task-1', type: 'task', label: 'Task', x: 500, y: height / 2, status: 'active' },
          { id: 'end', type: 'end', label: 'End', x: 700, y: height / 2, status: 'idle' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'agent-1' },
          { id: 'e2', source: 'start', target: 'agent-2' },
          { id: 'e3', source: 'agent-1', target: 'task-1' },
          { id: 'e4', source: 'agent-2', target: 'task-1' },
          { id: 'e5', source: 'task-1', target: 'end' },
        ],
      }
    }

    return { nodes: [], edges: [] }
  }, [activeSwarm, swarmId, height])

  // Mutable state — restore from localStorage or fall back to initial graph
  const savedGraph = useMemo(() => {
    try {
      const saved = localStorage.getItem('swarm-editor-workflow')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  }, [])
  const [nodes, setNodes] = useState<WorkflowNode[]>(savedGraph?.nodes || initialGraph.nodes)
  const [edges, setEdges] = useState<WorkflowEdge[]>(savedGraph?.edges || initialGraph.edges)
  const [selectedNodes, setSelectedNodes] = useState<WorkflowNode[]>([])
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const selectionBoxRef = useRef<{ startX: number; startY: number } | null>(null)
  const justLassoedRef = useRef(false)
  const [clipboard, setClipboard] = useState<WorkflowNode[]>([])
  const [selectedEdge, setSelectedEdge] = useState<WorkflowEdge | null>(null)
  const [dragging, setDragging] = useState<{ node: WorkflowNode; offsetX: number; offsetY: number; fromX: number; fromY: number } | null>(null)
  const [panning, setPanning] = useState<{ startX: number; startY: number; vpX: number; vpY: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [viewport, setViewport] = useState<{ x: number; y: number; scale: number }>(savedGraph?.viewport || { x: 0, y: 0, scale: 1 })
  const [connecting, setConnecting] = useState<{ sourceId: string; mouseX: number; mouseY: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    target: WorkflowNode | WorkflowEdge | null
    type: 'node' | 'edge' | 'canvas'
  } | null>(null)

  // Persist nodes/edges/viewport to localStorage on change (debounced to avoid excess writes during drag)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem('swarm-editor-workflow', JSON.stringify({ nodes, edges, viewport }))
      } catch {
        // localStorage full or unavailable — ignore
      }
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [nodes, edges, viewport])

  // History manager (uses current nodes/edges directly for synchronous updates)
  const history = useHistoryManager(nodes, edges, setNodes, setEdges)
  const [historyVersion, setHistoryVersion] = useState(0)

  // Refs for stale closures
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // Apply a command to the graph state
  const applyCommand = useCallback((cmd: Command) => {
    history.applyCommand(cmd)
    setHistoryVersion((v) => v + 1)
  }, [history])

  // Edge creation: drag from output handle
  const handleOutputDragStart = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (readOnly) return
    e.preventDefault()
    setConnecting({ sourceId: nodeId, mouseX: e.clientX, mouseY: e.clientY })
  }, [readOnly])

  const handleInputDrop = useCallback((e: React.MouseEvent, targetId: string) => {
    if (readOnly || !connecting) return
    e.preventDefault()
    // Prevent self-loops and duplicate edges
    if (connecting.sourceId === targetId) {
      setConnecting(null)
      return
    }
    const exists = edges.some((ed) => ed.source === connecting.sourceId && ed.target === targetId)
    if (exists) {
      setConnecting(null)
      return
    }
    const newEdge: WorkflowEdge = {
      id: `e-${connecting.sourceId}-${targetId}`,
      source: connecting.sourceId,
      target: targetId,
    }
    applyCommand(new AddEdgeCommand(newEdge))
    setConnecting(null)
  }, [readOnly, connecting, edges, applyCommand])

  // Cancel connecting on escape or click empty space
  useEffect(() => {
    if (!connecting) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConnecting(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [connecting])

  // Spacebar panning (n8n-style: hold Space + drag to pan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false)
        setPanning(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Node drag
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, node: WorkflowNode) => {
      if (readOnly) return
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      setDragging({
        node,
        offsetX: (e.clientX - rect.left - viewport.x) / viewport.scale - node.x,
        offsetY: (e.clientY - rect.top - viewport.y) / viewport.scale - node.y,
        fromX: node.x,
        fromY: node.y,
      })
    },
    [readOnly, viewport]
  )

  // Handle node resize — receives absolute final sizes, creates single undo command
  const handleResizeNode = useCallback((nodeId: string, finalW: number, finalH: number) => {
    if (readOnly) return
    const node = nodesRef.current.find((n) => n.id === nodeId)
    if (!node) return
    const oldW = node.width ?? 140
    const oldH = node.height ?? 44
    const newW = Math.max(80, finalW)
    const newH = Math.max(36, finalH)
    if (newW === oldW && newH === oldH) return
    history.applyCommand(new ResizeNodeCommand(nodeId, oldW, oldH, newW, newH))
    if (onGraphChange) {
      onGraphChange({ nodes: nodesRef.current, edges: edgesRef.current })
    }
  }, [readOnly, history, onGraphChange])

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      const current = nodesRef.current.find((n) => n.id === dragging.node.id)
      if (current && (current.x !== dragging.fromX || current.y !== dragging.fromY)) {
        applyCommand(new MoveNodeCommand(dragging.node.id, dragging.fromX, dragging.fromY, current.x, current.y))
      }
      if (onGraphChange) {
        onGraphChange({ nodes: nodesRef.current, edges: edgesRef.current })
      }
    }
    // Complete lasso selection
    if (selectionBoxRef.current) {
      const box = selectionBox
      if (box && (box.width > 5 || box.height > 5)) {
        // Select all nodes within the selection box
        const selected = nodesRef.current.filter((n) =>
          n.x >= box.x && n.x <= box.x + box.width &&
          n.y >= box.y && n.y <= box.y + box.height
        )
        setSelectedNodes(selected)
      }
      selectionBoxRef.current = null
      setSelectionBox(null)
      justLassoedRef.current = true
    }
    setDragging(null)
    setPanning(null)
  }, [dragging, onGraphChange, applyCommand, selectionBox])

  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return
      // Cancel connecting if clicking empty space
      if (connecting) {
        setConnecting(null)
        return
      }
      if (e.button === 1 || (e.button === 0 && (e.shiftKey || spaceHeld))) {
        e.preventDefault()
        setPanning({
          startX: e.clientX,
          startY: e.clientY,
          vpX: viewport.x,
          vpY: viewport.y,
        })
        return
      }
      // Left click on empty space: start lasso selection
      if (e.button === 0 && !spaceHeld) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const x = (e.clientX - rect.left - viewport.x) / viewport.scale
          const y = (e.clientY - rect.top - viewport.y) / viewport.scale
          selectionBoxRef.current = { startX: x, startY: y }
          setSelectionBox({ x, y, width: 0, height: 0 })
          setSelectedNodes([])
        }
      }
    },
    [readOnly, viewport, connecting, spaceHeld])

  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Track mouse position during connection drag
      if (connecting) {
        setConnecting((prev) => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : null)
        return
      }
      if (panning) {
        const dx = e.clientX - panning.startX
        const dy = e.clientY - panning.startY
        setViewport((prev) => ({ ...prev, x: panning.vpX + dx, y: panning.vpY + dy }))
        return
      }
      // Update selection box
      if (selectionBoxRef.current) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const mx = (e.clientX - rect.left - viewport.x) / viewport.scale
          const my = (e.clientY - rect.top - viewport.y) / viewport.scale
          const sx = selectionBoxRef.current.startX
          const sy = selectionBoxRef.current.startY
          setSelectionBox({
            x: Math.min(sx, mx),
            y: Math.min(sy, my),
            width: Math.abs(mx - sx),
            height: Math.abs(my - sy),
          })
        }
        return
      }
      if (!dragging) return
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const rawX = (e.clientX - rect.left - viewport.x) / viewport.scale - dragging.offsetX
      const rawY = (e.clientY - rect.top - viewport.y) / viewport.scale - dragging.offsetY
      // Snap to grid (n8n-style)
      const newX = Math.round(rawX / GRID_SIZE) * GRID_SIZE
      const newY = Math.round(rawY / GRID_SIZE) * GRID_SIZE

      setNodes((prev) =>
        prev.map((n) => (n.id === dragging.node.id ? { ...n, x: newX, y: newY } : n))
      )
    },
    [panning, dragging, viewport, setSelectionBox, connecting]
  )

  // Zoom
  const handleZoom = useCallback((delta: number) => {
    setViewport((prev) => ({
      ...prev,
      scale: Math.max(0.25, Math.min(2, prev.scale + delta)),
    }))
  }, [])

  // Fit view
  const handleFit = useCallback(() => {
    if (nodes.length === 0) return
    const bounds = nodes.reduce(
      (acc, node) => ({
        minX: Math.min(acc.minX, node.x),
        maxX: Math.max(acc.maxX, node.x),
        minY: Math.min(acc.minY, node.y),
        maxY: Math.max(acc.maxY, node.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    )
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    setViewport({ x: width / 2 - centerX, y: height / 2 - centerY, scale: 1 })
  }, [nodes, width, height])

  // Auto layout (with undo support via command pattern)
  const handleAutoLayout = useCallback(() => {
    const positioned = autoLayout(nodes, edges, width, height)
    applyCommand(new AutoLayoutCommand(nodes, positioned))
    handleFit()
  }, [nodes, edges, width, height, applyCommand, handleFit])

  // Add node
  const handleAddNode = useCallback(() => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'task',
      label: 'New Task',
      x: width / 2,
      y: height / 2,
      status: 'idle',
    }
    applyCommand(new AddNodeCommand(newNode))
  }, [width, height, applyCommand])

  // Delete selected nodes (multi-select aware)
  const handleDeleteNode = useCallback(() => {
    if (selectedNodes.length === 0 || readOnly) return
    if (selectedNodes.length === 1) {
      const node = selectedNodes[0]
      const removedEdges = edges.filter((e) => e.source === node.id || e.target === node.id)
      applyCommand(new DeleteNodeCommand(node, removedEdges))
    } else {
      applyCommand(new DeleteNodesCommand(selectedNodes, edges))
    }
    setSelectedNodes([])
  }, [selectedNodes, edges, readOnly, applyCommand])

  // Copy selected nodes to clipboard
  const handleCopy = useCallback(() => {
    if (selectedNodes.length === 0) return
    setClipboard(selectedNodes)
  }, [selectedNodes])

  // Paste from clipboard (creates new nodes with offset)
  const handlePaste = useCallback(() => {
    if (clipboard.length === 0 || readOnly) return
    applyCommand(new PasteNodesCommand(clipboard))
    // Select the newly pasted nodes
    setTimeout(() => {
      const pastedPrefixes = clipboard.map((n) => n.id + '-copy-')
      setSelectedNodes(nodesRef.current.filter((nd) => pastedPrefixes.some((p) => nd.id.startsWith(p))))
    }, 0)
  }, [clipboard, readOnly, applyCommand])

  // Duplicate selected nodes (copy + paste in one step)
  const handleDuplicate = useCallback(() => {
    if (selectedNodes.length === 0 || readOnly) return
    applyCommand(new PasteNodesCommand(selectedNodes))
    setTimeout(() => {
      const pastedPrefixes = selectedNodes.map((n) => n.id + '-copy-')
      setSelectedNodes(nodesRef.current.filter((nd) => pastedPrefixes.some((p) => nd.id.startsWith(p))))
    }, 0)
  }, [selectedNodes, readOnly, applyCommand])

  // Select all nodes
  const handleSelectAll = useCallback(() => {
    setSelectedNodes(nodes)
  }, [nodes])

  // Delete edge
  const handleDeleteEdge = useCallback((edge: WorkflowEdge) => {
    if (readOnly) return
    applyCommand(new DeleteEdgeCommand(edge))
    setSelectedEdge(null)
  }, [readOnly, applyCommand])

  // Change edge type
  const handleChangeEdgeType = useCallback((edge: WorkflowEdge, newType: EdgeStyle) => {
    if (readOnly) return
    applyCommand(new ChangeEdgeTypeCommand(edge.id, newType, edges))
  }, [readOnly, applyCommand, edges])

  // Undo
  const handleUndo = useCallback(() => {
    if (readOnly) return
    history.undo()
    setHistoryVersion((v) => v + 1)
  }, [readOnly, history])

  // Redo
  const handleRedo = useCallback(() => {
    if (readOnly) return
    history.redo()
    setHistoryVersion((v) => v + 1)
  }, [readOnly, history])

  // Zoom to fit selected nodes (Ctrl+Shift+F)
  const handleZoomToSelection = useCallback(() => {
    if (selectedNodes.length === 0) return
    const padding = 80
    const minX = Math.min(...selectedNodes.map((n) => n.x))
    const minY = Math.min(...selectedNodes.map((n) => n.y))
    const maxX = Math.max(...selectedNodes.map((n) => n.x)) + 140 // node width
    const maxY = Math.max(...selectedNodes.map((n) => n.y)) + 50 // node height
    const contentW = maxX - minX
    const contentH = maxY - minY
    const scaleX = (width - padding * 2) / contentW
    const scaleY = (height - padding * 2) / contentH
    const newScale = Math.max(0.25, Math.min(2, Math.min(scaleX, scaleY)))
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    setViewport({
      scale: newScale,
      x: width / 2 - centerX * newScale,
      y: height / 2 - centerY * newScale,
    })
  }, [selectedNodes, width, height])

  // Zoom to a specific node on double-click (n8n-style)
  const handleZoomToNode = useCallback((node: WorkflowNode) => {
    const targetScale = 1.2
    setViewport({
      scale: targetScale,
      x: width / 2 - node.x * targetScale,
      y: height / 2 - node.y * targetScale,
    })
  }, [width, height])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleUndo()
      } else if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleCopy()
      } else if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handlePaste()
      } else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleDuplicate()
      } else if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSelectAll()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodes.length > 0) {
        e.preventDefault()
        handleDeleteNode()
      } else if (e.key === 'Escape') {
        setSelectedNodes([])
        setSelectedEdge(null)
        setConnecting(null)
        setContextMenu(null)
      } else if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault()
        handleZoomToSelection()
      } else if (selectedNodes.length === 1 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Arrow key node movement (React Flow-style)
        if (e.target !== document.body && e.target !== containerRef.current) return
        e.preventDefault()
        const step = e.shiftKey ? GRID_SIZE * 5 : GRID_SIZE
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        history.applyCommand(new MoveNodesCommand(selectedNodes.map((n) => n.id), dx, dy, nodes))
      } else if (e.key === 'Tab' && !readOnly) {
        // Tab cycles through nodes (accessibility)
        e.preventDefault()
        if (nodes.length === 0) return
        const selectable = nodes.filter((n) => n.type !== 'start' && n.type !== 'end')
        if (selectable.length === 0) return
        const current = selectedNodes[0]
        if (!current) {
          setSelectedNodes([selectable[0]])
        } else {
          const idx = selectable.findIndex((n) => n.id === current.id)
          const nextIdx = e.shiftKey ? (idx - 1 + selectable.length) % selectable.length : (idx + 1) % selectable.length
          setSelectedNodes([selectable[nextIdx]])
          handleZoomToNode(selectable[nextIdx])
        }
      } else if (e.key === ' ' && selectedNodes.length === 1) {
        // Space deselects the focused node (accessibility)
        e.preventDefault()
        setSelectedNodes([])
      } else if (e.key === 'Enter' && selectedNodes.length === 1 && !readOnly) {
        // Enter activates the selected node (open detail/rename)
        e.preventDefault()
        const node = selectedNodes[0]
        if (node.type !== 'start' && node.type !== 'end') {
          onNodeDoubleClick?.(node)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodes, readOnly, handleDeleteNode, handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, handleSelectAll, handleZoomToSelection, handleZoomToNode, history, nodes, onNodeDoubleClick])

  // Mouse wheel zoom toward cursor
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setViewport((prev) => {
        const newScale = Math.max(0.25, Math.min(2, prev.scale + delta))
        const ratio = newScale / prev.scale
        return { scale: newScale, x: mx - ratio * (mx - prev.x), y: my - ratio * (my - prev.y) }
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Cancel connecting on click empty space
  // Context menu (right-click) — use raw clientX/Y + fixed positioning
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node?: WorkflowNode, edge?: WorkflowEdge) => {
      if (readOnly) return
      e.preventDefault()

      if (node) {
        setContextMenu({ x: e.clientX, y: e.clientY, target: node, type: 'node' })
      } else if (edge) {
        setContextMenu({ x: e.clientX, y: e.clientY, target: edge, type: 'edge' })
      } else {
        setContextMenu({ x: e.clientX, y: e.clientY, target: null, type: 'canvas' })
      }
    },
    [readOnly],
  )

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleCanvasClick = useCallback(() => {
    if (connecting) {
      setConnecting(null)
      return
    }
    // Skip if we just completed a lasso selection
    if (justLassoedRef.current) {
      justLassoedRef.current = false
      return
    }
    setSelectedNodes([])
    setSelectedEdge(null)
  }, [connecting])

  // Connection line (dragging from output handle)
  const connectionLine = connecting ? (() => {
    const source = nodes.find((n) => n.id === connecting.sourceId)
    const rect = containerRect
    if (!source || !rect) return null
    const sx = source.x + (source.width ?? 140) / 2
    const sy = source.y + (source.height ?? 44) / 2
    const tx = (connecting.mouseX - rect.left - viewport.x) / viewport.scale
    const ty = (connecting.mouseY - rect.top - viewport.y) / viewport.scale
    return (
      <svg
        className="absolute inset-0 pointer-events-none z-50"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <line x1={sx} y1={sy} x2={tx} y2={ty} stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" className="opacity-60" />
      </svg>
    )
  })() : null

  // Selection box (lasso/rubber-band)
  const selectionBoxEl = selectionBox ? (
    <svg
      className="absolute inset-0 pointer-events-none z-40"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        transformOrigin: '0 0',
      }}
    >
      <rect
        x={selectionBox.x}
        y={selectionBox.y}
        width={selectionBox.width}
        height={selectionBox.height}
        fill="rgba(59, 130, 246, 0.1)"
        stroke="#3b82f6"
        strokeWidth={1}
        strokeDasharray="4 2"
      />
    </svg>
  ) : null

  // Render node
  const renderNode = (node: WorkflowNode) => {
    const isSelected = selectedNodes.some((n) => n.id === node.id)
    const handleProps = { onOutputDragStart: handleOutputDragStart, onInputDrop: handleInputDrop, onContextMenu: (e: React.MouseEvent, n: WorkflowNode) => handleContextMenu(e, n), onResize: handleResizeNode }

    switch (node.type) {
      case 'start':
      case 'end':
        return (
          <TerminalNode
            key={node.id}
            node={node}
            selected={isSelected}
            onClick={(n, e) => {
              if (e.shiftKey) {
                setSelectedNodes((prev) =>
                  prev.some((s) => s.id === n.id)
                    ? prev.filter((s) => s.id !== n.id)
                    : [...prev, n]
                )
              } else {
                setSelectedNodes([n])
              }
              onNodeClick?.(n)
            }}
            {...handleProps}
          />
        )
      case 'agent':
        return (
          <AgentNodeComponent
            key={node.id}
            node={node}
            selected={isSelected}
            onMouseDown={handleNodeMouseDown}
            onClick={(n, e) => {
              if (e.shiftKey) {
                setSelectedNodes((prev) =>
                  prev.some((s) => s.id === n.id)
                    ? prev.filter((s) => s.id !== n.id)
                    : [...prev, n]
                )
              } else {
                setSelectedNodes([n])
              }
              onNodeClick?.(n)
            }}
            onDoubleClick={(n) => { handleZoomToNode(n); onNodeDoubleClick?.(n) }}
            {...handleProps}
          />
        )
      default:
        return (
          <TaskNodeComponent
            key={node.id}
            node={node}
            selected={isSelected}
            onMouseDown={handleNodeMouseDown}
            onClick={(n, e) => {
              if (e.shiftKey) {
                setSelectedNodes((prev) =>
                  prev.some((s) => s.id === n.id)
                    ? prev.filter((s) => s.id !== n.id)
                    : [...prev, n]
                )
              } else {
                setSelectedNodes([n])
              }
              onNodeClick?.(n)
            }}
            onDoubleClick={(n) => { handleZoomToNode(n); onNodeDoubleClick?.(n) }}
            {...handleProps}
          />
        )
    }
  }

  // Use historyVersion to force re-render for canUndo/canRedo display
  void historyVersion

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Workflow canvas. Use Tab to cycle nodes, Arrow keys to move, Space to deselect, Enter to activate, Ctrl+Z to undo."
      tabIndex={0}
      className="relative bg-gradient-to-br from-surface to-mac-panel rounded-lg overflow-hidden"
      style={{ width, height, cursor: panning ? 'grabbing' : spaceHeld ? 'grab' : dragging ? 'move' : connecting ? 'crosshair' : undefined }}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(to right, #64748b 1px, transparent 1px),
            linear-gradient(to bottom, #64748b 1px, transparent 1px)
          `,
          backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />

      {/* SVG layer for edges */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <g className="pointer-events-auto">
          {edges.map((edge) => (
            <EdgeComponent
              key={edge.id}
              edge={edge}
              nodes={nodes}
              selected={selectedEdge?.id === edge.id}
              onClick={(e) => { setSelectedEdge(e); onEdgeClick?.(e) }}
              onDelete={handleDeleteEdge}
              onContextMenu={(e, edgeArg) => handleContextMenu(e, undefined, edgeArg)}
            />
          ))}
        </g>
      </svg>

      {/* Connection line */}
      {connectionLine}
      {/* Selection box (lasso) */}
      {selectionBoxEl}

      {/* Nodes layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {nodes.map(renderNode)}
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <Toolbar
          onAddNode={handleAddNode}
          onDelete={handleDeleteNode}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          undoCount={history.undoCount}
          redoCount={history.redoCount}
          onAutoLayout={handleAutoLayout}
          onZoomIn={() => handleZoom(0.1)}
          onZoomOut={() => handleZoom(-0.1)}
          onFit={handleFit}
          selectedNode={selectedNodes[0] || null}
          canDelete={selectedNodes.length > 0 && selectedNodes.every((n) => n.type !== 'start' && n.type !== 'end')}
        />
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 text-xs text-text-secondary bg-mac-panel/80 px-2 py-1 rounded">
        {Math.round(viewport.scale * 100)}%
      </div>

      {/* MiniMap */}
      <MiniMap
        nodes={nodes}
        viewport={viewport}
        onNavigate={(x, y) => setViewport((prev) => ({ ...prev, x, y }))}
      />

      {/* Connection mode hint */}
      {connecting && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-accent/90 text-white text-xs px-3 py-1.5 rounded-full">
          Click a target node to connect, Esc to cancel
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          {/* Click-away overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleCloseContextMenu}
            onContextMenu={(e) => { e.preventDefault(); handleCloseContextMenu() }}
          />
          <div
            role="menu"
            aria-label="Workflow context menu"
            className="fixed z-50 bg-mac-panel border border-mac-border rounded-lg shadow-xl py-1 min-w-[160px] text-sm"
            ref={(el) => {
              if (!el) return
              const rect = el.getBoundingClientRect()
              const vw = window.innerWidth
              const vh = window.innerHeight
              if (rect.right > vw) el.style.left = Math.max(0, contextMenu.x - rect.width) + 'px'
              if (rect.bottom > vh) el.style.top = Math.max(0, contextMenu.y - rect.height) + 'px'
            }}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'node' && (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-mac-hover text-text-primary"
                  role="menuitem"
                  onClick={() => {
                    const n = contextMenu.target as WorkflowNode
                    setClipboard([n])
                    handleCloseContextMenu()
                  }}
                >
                  Copy
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-mac-hover text-text-primary"
                  role="menuitem"
                  onClick={() => {
                    const n = contextMenu.target as WorkflowNode
                    applyCommand(new PasteNodesCommand([n]))
                    handleCloseContextMenu()
                  }}
                >
                  Duplicate
                </button>
                {(contextMenu.target as WorkflowNode).type !== 'start' && (contextMenu.target as WorkflowNode).type !== 'end' && (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-mac-hover text-error"
                    role="menuitem"
                    onClick={() => {
                      const n = contextMenu.target as WorkflowNode
                      setSelectedNodes([n])
                      handleDeleteNode()
                      handleCloseContextMenu()
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
            {contextMenu.type === 'edge' && (
              <>
                <div className="px-3 py-1 text-xs text-text-secondary uppercase tracking-wide" role="group" aria-label="Edge type options">Edge Type</div>
                {(['bezier', 'straight', 'step', 'smoothstep'] as EdgeStyle[]).map((type) => {
                  const edgeObj = contextMenu.target as WorkflowEdge
                  const currentType = edgeObj.edgeType || 'bezier'
                  return (
                    <button
                      key={type}
                      className={`w-full text-left px-3 py-1.5 hover:bg-mac-hover text-sm ${
                        currentType === type ? 'text-accent font-medium' : 'text-text-primary'
                      }`}
                      role="menuitemradio"
                      aria-checked={currentType === type}
                      onClick={() => {
                        handleChangeEdgeType(edgeObj, type)
                        handleCloseContextMenu()
                      }}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  )
                })}
                <div className="border-t border-glass-border my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-error/10 text-error text-sm"
                  role="menuitem"
                  onClick={() => {
                    const e = contextMenu.target as WorkflowEdge
                    setSelectedEdge(e)
                    handleDeleteEdge(e)
                    handleCloseContextMenu()
                  }}
                >
                  Delete Edge
                </button>
              </>
            )}
            {contextMenu.type === 'canvas' && (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-mac-hover text-text-primary disabled:opacity-40"
                  role="menuitem"
                  disabled={clipboard.length === 0}
                  onClick={() => { handlePaste(); handleCloseContextMenu() }}
                >
                  Paste
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-mac-hover text-text-primary"
                  role="menuitem"
                  onClick={() => { handleSelectAll(); handleCloseContextMenu() }}
                >
                  Select All
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-mac-hover text-text-primary"
                  role="menuitem"
                  onClick={() => { handleAutoLayout(); handleCloseContextMenu() }}
                >
                  Auto Layout
                </button>
                <div className="border-t border-mac-border my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-mac-hover text-text-primary"
                  role="menuitem"
                  onClick={() => { handleFit(); handleCloseContextMenu() }}
                >
                  Fit View
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Export types
export type { WorkflowEditorProps }
