import { useEffect, useRef, useCallback } from 'react'

interface AgentNode {
  id: string
  name: string
  status: 'active' | 'idle' | 'error'
  x: number
  y: number
  vx: number
  vy: number
  tasks: number
  connections: string[]
}

interface TaskFlow {
  from: string
  to: string
  status: 'pending' | 'in_progress' | 'completed'
}

interface AgentNetworkGraphProps {
  agents: AgentNode[]
  flows: TaskFlow[]
  width?: number
  height?: number
  onNodeClick?: (agentId: string) => void
}

/**
 * 力导向布局的 Agent 网络图
 * 使用简化的 Force-Directed 算法实现
 */
export function AgentNetworkGraph({
  agents,
  flows,
  width = 400,
  height = 300,
  onNodeClick
}: AgentNetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<AgentNode[]>([])
  const animationRef = useRef<number>(0)

  // 初始化节点位置
  const initializeNodes = useCallback(() => {
    nodesRef.current = agents.map((agent) => ({
      ...agent,
      x: agent.x || (width / 4) + (Math.random() * width / 2),
      y: agent.y || (height / 4) + (Math.random() * height / 2),
      vx: 0,
      vy: 0
    }))
  }, [agents, width, height])

  // 力导向布局计算
  const applyForces = useCallback(() => {
    const nodes = nodesRef.current
    const centerX = width / 2
    const centerY = height / 2

    // 1. 斥力 - 节点之间互相排斥
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const distance = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 1000 / (distance * distance)

        const fx = (dx / distance) * force
        const fy = (dy / distance) * force

        nodes[i].vx -= fx
        nodes[i].vy -= fy
        nodes[j].vx += fx
        nodes[j].vy += fy
      }
    }

    // 2. 引力 - 连接的节点互相吸引
    flows.forEach(flow => {
      const source = nodes.find(n => n.id === flow.from)
      const target = nodes.find(n => n.id === flow.to)

      if (source && target) {
        const dx = target.x - source.x
        const dy = target.y - source.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 1
        const force = distance * 0.01 // 吸引力系数

        const fx = (dx / distance) * force
        const fy = (dy / distance) * force

        source.vx += fx
        source.vy += fy
        target.vx -= fx
        target.vy -= fy
      }
    })

    // 3. 向心力 - 所有节点向中心靠拢
    nodes.forEach(node => {
      const dx = centerX - node.x
      const dy = centerY - node.y
      node.vx += dx * 0.001
      node.vy += dy * 0.001
    })

    // 4. 应用速度并添加阻尼
    nodes.forEach(node => {
      node.vx *= 0.9 // 阻尼
      node.vy *= 0.9
      node.x += node.vx
      node.y += node.vy

      // 边界约束
      const padding = 30
      node.x = Math.max(padding, Math.min(width - padding, node.x))
      node.y = Math.max(padding, Math.min(height - padding, node.y))
    })
  }, [flows, width, height])

  // 绘制图形
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const nodes = nodesRef.current
    const dpr = window.devicePixelRatio || 1

    // 清空画布
    ctx.clearRect(0, 0, width * dpr, height * dpr)

    // 绘制连接线（任务流）
    flows.forEach(flow => {
      const source = nodes.find(n => n.id === flow.from)
      const target = nodes.find(n => n.id === flow.to)

      if (source && target) {
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)

        // 根据状态设置样式
        if (flow.status === 'completed') {
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)'
          ctx.lineWidth = 2
        } else if (flow.status === 'in_progress') {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'
          ctx.lineWidth = 2
          ctx.setLineDash([5, 5])
        } else {
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)'
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
        }

        ctx.stroke()
        ctx.setLineDash([])

        // 绘制箭头
        const angle = Math.atan2(target.y - source.y, target.x - source.x)
        const arrowLength = 10
        const arrowX = target.x - Math.cos(angle) * 25
        const arrowY = target.y - Math.sin(angle) * 25

        ctx.beginPath()
        ctx.moveTo(arrowX, arrowY)
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
        )
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
        )
        ctx.closePath()
        ctx.fillStyle = ctx.strokeStyle
        ctx.fill()
      }
    })

    // 绘制节点
    nodes.forEach(node => {
      const radius = 18 + node.tasks * 4

      // 发光效果
      const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 2)
      if (node.status === 'active') {
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)')
        gradient.addColorStop(1, 'transparent')
      } else if (node.status === 'error') {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)')
        gradient.addColorStop(1, 'transparent')
      } else {
        gradient.addColorStop(0, 'rgba(100, 116, 139, 0.3)')
        gradient.addColorStop(1, 'transparent')
      }

      ctx.beginPath()
      ctx.arc(node.x, node.y, radius * 2, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()

      // 节点圆形
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = node.status === 'active' ? '#22c55e' : node.status === 'error' ? '#ef4444' : '#64748b'
      ctx.fill()

      // 节点边框
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 1
      ctx.stroke()

      // 节点名称
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const shortName = node.name.split(' ')[0].substring(0, 6)
      ctx.fillText(shortName, node.x, node.y)

      // 任务计数徽章
      if (node.tasks > 0) {
        const badgeX = node.x + radius - 5
        const badgeY = node.y - radius + 5
        ctx.beginPath()
        ctx.arc(badgeX, badgeY, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#f97316'
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 8px sans-serif'
        ctx.fillText(node.tasks.toString(), badgeX, badgeY)
      }
    })
  }, [flows, width, height])

  // 动画循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    initializeNodes()

    let frameCount = 0
    const maxFrames = 100 // 限制动画帧数

    const animate = () => {
      applyForces()
      draw(ctx)
      frameCount++

      if (frameCount < maxFrames) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [initializeNodes, applyForces, draw, width, height])

  // 处理点击
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !onNodeClick) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const clickedNode = nodesRef.current.find(node => {
      const dx = node.x - x
      const dy = node.y - y
      return Math.sqrt(dx * dx + dy * dy) < 20
    })

    if (clickedNode) {
      onNodeClick(clickedNode.id)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Basic keyboard support for canvas navigation
        if (e.key === 'Escape') {
          onNodeClick?.('')
        }
      }}
      tabIndex={0}
      role="img"
      aria-label={`Agent network graph with ${agents.length} agents and ${flows.length} connections. Click on a node to select.`}
      className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
      style={{ width, height }}
    />
  )
}

export default AgentNetworkGraph
