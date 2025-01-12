'use client'

import { useState, useCallback, useEffect } from 'react'
import { BlockConfig } from '../components/blocks/types/block'
import { WorkflowBlock } from '../components/blocks/components/workflow-block/workflow-block'
import { getBlock } from '../components/blocks/configs'

interface WorkflowBlock {
  id: string
  type: string
  position: { x: number; y: number }
  config: BlockConfig
}

const ZOOM_SPEED = 0.005
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const CANVAS_SIZE = 5000 // 5000px x 5000px virtual canvas

export default function Workflow() {
  const [blocks, setBlocks] = useState<WorkflowBlock[]>([])
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [startPanPos, setStartPanPos] = useState({ x: 0, y: 0 })

  // Initialize pan position after mount
  useEffect(() => {
    const viewportWidth = window.innerWidth - 344 // Account for sidebar
    const viewportHeight = window.innerHeight - 56 // Account for header
    setPan({
      x: (viewportWidth - CANVAS_SIZE) / 2,
      y: (viewportHeight - CANVAS_SIZE) / 2,
    })
  }, [])

  const constrainPan = useCallback(
    (newPan: { x: number; y: number }, currentZoom: number) => {
      // Calculate the visible area dimensions
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight - 56 // Adjust for header height

      // Calculate the scaled canvas size
      const scaledCanvasWidth = CANVAS_SIZE * currentZoom
      const scaledCanvasHeight = CANVAS_SIZE * currentZoom

      // Calculate the maximum allowed pan values
      const maxX = 0
      const minX = viewportWidth - scaledCanvasWidth
      const maxY = 0
      const minY = viewportHeight - scaledCanvasHeight

      return {
        x: Math.min(maxX, Math.max(minX, newPan.x)),
        y: Math.min(maxY, Math.max(minY, newPan.y)),
      }
    },
    []
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    try {
      const { type } = JSON.parse(e.dataTransfer.getData('application/json'))
      const blockConfig = getBlock(type)

      if (!blockConfig) {
        console.error('Invalid block type:', type)
        return
      }

      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const x = mouseX / zoom
      const y = mouseY / zoom

      setBlocks((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type,
          position: { x, y },
          config: blockConfig,
        },
      ])
    } catch (err) {
      console.error('Error dropping block:', err)
    }
  }

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Prevent browser zooming
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = -e.deltaY * ZOOM_SPEED
        setZoom((prevZoom) => {
          // If we're at max/min zoom and trying to zoom further, return current zoom
          if (
            (prevZoom >= MAX_ZOOM && delta > 0) ||
            (prevZoom <= MIN_ZOOM && delta < 0)
          ) {
            return prevZoom
          }
          const newZoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, prevZoom + delta)
          )
          // Adjust pan when zooming to keep the point under cursor fixed
          setPan((prevPan) => constrainPan(prevPan, newZoom))
          return newZoom
        })
      } else {
        // Regular scrolling for pan
        setPan((prevPan) =>
          constrainPan(
            {
              x: prevPan.x - e.deltaX,
              y: prevPan.y - e.deltaY,
            },
            zoom
          )
        )
      }
    },
    [constrainPan, zoom]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || e.button === 0) {
        // Middle mouse or left click
        setIsPanning(true)
        setStartPanPos({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      }
    },
    [pan]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan((prevPan) =>
          constrainPan(
            {
              x: e.clientX - startPanPos.x,
              y: e.clientY - startPanPos.y,
            },
            zoom
          )
        )
      }
    },
    [isPanning, startPanPos, zoom, constrainPan]
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Add this useEffect to prevent browser zoom
  useEffect(() => {
    const preventDefaultZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }

    document.addEventListener('wheel', preventDefaultZoom, { passive: false })
    return () => document.removeEventListener('wheel', preventDefaultZoom)
  }, [])

  // Add this new function to handle block position updates
  const updateBlockPosition = useCallback(
    (id: string, newPosition: { x: number; y: number }) => {
      setBlocks((prevBlocks) =>
        prevBlocks.map((block) =>
          block.id === id ? { ...block, position: newPosition } : block
        )
      )
    },
    []
  )

  return (
    <div
      className="w-full h-[calc(100vh-56px)] overflow-hidden"
      onWheel={handleWheel}
    >
      <div
        className="w-full h-full bg-[#F5F5F5] relative cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage: `radial-gradient(#D9D9D9 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: '0 0',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {blocks.map((block, index) => {
          // Count how many blocks of this type appear before the current index
          const typeCount = blocks
            .slice(0, index + 1)
            .filter((b) => b.type === block.type).length

          return (
            <WorkflowBlock
              key={block.id}
              id={block.id}
              type={block.type}
              position={block.position}
              config={block.config}
              name={`${block.config.toolbar.title} ${typeCount}`}
              onPositionUpdate={updateBlockPosition}
              zoom={zoom}
            />
          )
        })}
      </div>
    </div>
  )
}
