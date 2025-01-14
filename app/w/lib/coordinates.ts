/**
 * Represents a point in 2D space
 */
interface Point {
  x: number
  y: number
}

/**
 * Represents the current transform state of the canvas
 */
interface CanvasTransform {
  scale: number
  translateX: number
  translateY: number
}

/**
 * Utility class for handling coordinate transformations in the workflow
 */
export class CoordinateTransformer {
  private static readonly SIDEBAR_WIDTH = 344
  private static readonly HEADER_HEIGHT = 56

  /**
   * Gets the current transform state from a canvas element
   */
  static getCanvasTransform(element: HTMLElement): CanvasTransform {
    const matrix = new DOMMatrix(window.getComputedStyle(element).transform)
    return {
      scale: matrix.a,
      translateX: matrix.e,
      translateY: matrix.f,
    }
  }

  /**
   * Converts viewport coordinates to canvas coordinates
   */
  static viewportToCanvas(point: Point, canvasElement: HTMLElement): Point {
    const matrix = new DOMMatrix(window.getComputedStyle(canvasElement).transform)
    const domPoint = new DOMPoint(point.x, point.y)
    const transformed = domPoint.matrixTransform(matrix.inverse())

    return {
      x: transformed.x,
      y: transformed.y,
    }
  }

  /**
   * Converts canvas coordinates to viewport coordinates
   */
  static canvasToViewport(point: Point, canvasElement: HTMLElement): Point {
    const matrix = new DOMMatrix(window.getComputedStyle(canvasElement).transform)
    const domPoint = new DOMPoint(point.x, point.y)
    const transformed = domPoint.matrixTransform(matrix)

    return {
      x: transformed.x,
      y: transformed.y,
    }
  }

  /**
   * Converts client coordinates to viewport coordinates by removing sidebar and header offsets
   */
  static clientToViewport(point: Point): Point {
    return {
      x: point.x - this.SIDEBAR_WIDTH,
      y: point.y - this.HEADER_HEIGHT,
    }
  }

  /**
   * Gets the viewport dimensions
   */
  static getViewportDimensions(): { width: number; height: number } {
    return {
      width: window.innerWidth - this.SIDEBAR_WIDTH,
      height: window.innerHeight - this.HEADER_HEIGHT,
    }
  }

  /**
   * Gets the relative position of an element within the canvas
   */
  static getElementCanvasPosition(element: HTMLElement, canvasElement: HTMLElement): Point {
    const rect = element.getBoundingClientRect()
    const point = {
      x: rect.left,
      y: rect.top,
    }
    
    return this.viewportToCanvas(this.clientToViewport(point), canvasElement)
  }

  /**
   * Calculates the distance between two points accounting for canvas transform
   */
  static getTransformedDistance(point1: Point, point2: Point, canvasElement: HTMLElement): Point {
    const transform = this.getCanvasTransform(canvasElement)
    return {
      x: (point2.x - point1.x) / transform.scale,
      y: (point2.y - point1.y) / transform.scale,
    }
  }
}