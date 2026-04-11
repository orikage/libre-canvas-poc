export interface RawPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  timestamp: number;
}

export interface InputHandlerCallbacks {
  onStrokeStart: (point: RawPoint) => void;
  onStrokeMove: (point: RawPoint) => void;
  onStrokeEnd: () => void;
}

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: InputHandlerCallbacks;
  private isDrawing = false;
  private lastPointerId: number | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: InputHandlerCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Pointer events for unified mouse/touch/pen handling
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);

    // Prevent context menu on right-click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private handlePointerDown = (e: PointerEvent): void => {
    // Only handle primary button (left click / touch / pen tip)
    if (e.button !== 0) return;

    this.isDrawing = true;
    this.lastPointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);

    const point = this.extractPoint(e);
    this.callbacks.onStrokeStart(point);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isDrawing) return;
    if (e.pointerId !== this.lastPointerId) return;

    // Use coalesced events for high-frequency input (pen tablets)
    const events = e.getCoalescedEvents?.() || [e];
    for (const event of events) {
      const point = this.extractPoint(event);
      this.callbacks.onStrokeMove(point);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.isDrawing) return;
    if (e.pointerId !== this.lastPointerId) return;

    this.isDrawing = false;
    this.lastPointerId = null;
    this.canvas.releasePointerCapture(e.pointerId);

    this.callbacks.onStrokeEnd();
  };

  private extractPoint(e: PointerEvent): RawPoint {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0,
      timestamp: e.timeStamp,
    };
  }

  public destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointerleave', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
  }
}
