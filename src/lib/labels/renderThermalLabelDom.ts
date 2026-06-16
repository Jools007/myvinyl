import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CrateLabel } from '../../components/labels/CrateLabel';
import type { ThermalLabelRenderOptions } from './renderThermalLabelCanvas';
import { ensureThermalLabelFonts, renderThermalLabelCanvas } from './renderThermalLabelCanvas';
import {
  boxDownsampleTo1Bit,
  countInkPixels,
  THERMAL_MIN_INK_PIXELS,
} from './thermalRasterize';
import { getThermalLabelSpecBySize, THERMAL_PRINT_SUPERSAMPLE } from './thermalLabelSpecs';
import type { VinylRecord } from '../types';

function measureLabelPx(widthMm: number, heightMm: number): { w: number; h: number } {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;left:-9999px;top:0;width:${widthMm}mm;height:${heightMm}mm;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(probe);
  const w = probe.offsetWidth;
  const h = probe.offsetHeight;
  document.body.removeChild(probe);
  return { w: Math.max(w, 1), h: Math.max(h, 1) };
}

function revealCloneTree(root: ParentNode): void {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as HTMLElement | null;
  while (node) {
    if (node instanceof HTMLElement) {
      node.style.visibility = 'visible';
      node.style.opacity = '1';
    }
    node = walker.nextNode() as HTMLElement | null;
  }
}

/**
 * Capture the same DOM label shown in preview — true WYSIWYG for M220 print.
 */
export async function renderThermalLabelDomCanvas(
  record: VinylRecord,
  widthMm: number,
  heightMm: number,
  options?: ThermalLabelRenderOptions
): Promise<HTMLCanvasElement> {
  await ensureThermalLabelFonts();

  const useDraft =
    options?.useDescriptionDraft ||
    options?.useVibesDraft ||
    options?.useDisplayDraft;

  const { w: labelW, h: labelH } = measureLabelPx(widthMm, heightMm);

  const host = document.createElement('div');
  host.className = 'thermal-print-capture-host';
  // opacity:0 — NOT visibility:hidden (html2canvas skips hidden subtrees → blank print)
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${labelW}px`,
    `height:${labelH}px`,
    'opacity:0',
    'z-index:-1',
    'pointer-events:none',
    'overflow:hidden',
  ].join(';');
  document.body.appendChild(host);

  const mount = document.createElement('div');
  mount.style.cssText = 'width:100%;height:100%;';
  host.appendChild(mount);

  const root = createRoot(mount);
  root.render(
    createElement(CrateLabel, {
      record,
      size: 'thermal-preview',
      descriptionOverride:
        useDraft || options?.description !== undefined ? options?.description : undefined,
      vibesOverride: options?.useVibesDraft ? options?.vibes : undefined,
      displayOverride: options?.useDisplayDraft ? options?.display : undefined,
    })
  );

  try {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const surface = mount.querySelector('.crate-label__surface') as HTMLElement | null;
    if (!surface) throw new Error('Thermal label surface not found for capture');

    const captureScale = THERMAL_PRINT_SUPERSAMPLE;
    const html2canvas = (await import('html2canvas')).default;
    const shot = await html2canvas(surface, {
      scale: captureScale,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true,
      onclone: (_clonedDoc, clonedElement) => {
        revealCloneTree(clonedElement);
        let parent = clonedElement.parentElement;
        while (parent) {
          parent.style.visibility = 'visible';
          parent.style.opacity = '1';
          parent = parent.parentElement;
        }
      },
    });

    const spec = getThermalLabelSpecBySize(widthMm, heightMm);
    const outW = Math.round(widthMm * spec.pxPerMm);
    const outH = Math.round(heightMm * spec.pxPerMm);
    return boxDownsampleTo1Bit(shot, outW, outH);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}

/** DOM capture when possible; vector canvas fallback if capture is empty. */
export async function renderThermalLabelForPrint(
  record: VinylRecord,
  widthMm: number,
  heightMm: number,
  options?: ThermalLabelRenderOptions
): Promise<HTMLCanvasElement> {
  const domCanvas = await renderThermalLabelDomCanvas(record, widthMm, heightMm, options);
  if (countInkPixels(domCanvas) >= THERMAL_MIN_INK_PIXELS) {
    return domCanvas;
  }

  if (import.meta.env.DEV) {
    console.warn(
      '[thermal] DOM capture had insufficient ink — using vector renderer fallback'
    );
  }
  return renderThermalLabelCanvas(record, widthMm, heightMm, options);
}