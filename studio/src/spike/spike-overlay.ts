/**
 * Phase 0 spike (remove in phase 1): a plain text overlay in the game UI
 * container. Every line goes through textContent (engine Safe UI rule).
 */
export class SpikeOverlay {
  private readonly root: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      top: '12px',
      left: '12px',
      maxWidth: 'calc(100% - 24px)',
      padding: '8px 12px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: '#fff',
      font: '13px/1.5 monospace',
      pointerEvents: 'none',
      zIndex: '10',
    });
    container.appendChild(this.root);
  }

  public line(label: string, value: string): void {
    const row = document.createElement('div');
    row.textContent = `${label}: ${value}`;
    this.root.appendChild(row);
    console.log(`[golfcraft-spike] ${label}: ${value}`);
  }

  public dispose(): void {
    this.root.remove();
  }
}
