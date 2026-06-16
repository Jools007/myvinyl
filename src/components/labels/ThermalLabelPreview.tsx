import { useLayoutEffect, useRef, useState } from 'react';
import {
  layoutForThermalScale,
  useThermalPreviewLayout,
  type ThermalPreviewTarget,
} from '../../hooks/useThermalPreviewLayout';
import type { ThermalLabelRenderOptions } from '../../lib/labels/renderThermalLabelCanvas';
import type { VinylRecord } from '../../lib/types';
import { CrateLabel } from './CrateLabel';

interface ThermalLabelPreviewProps {
  record: VinylRecord;
  widthMm: number;
  heightMm: number;
  draft?: ThermalLabelRenderOptions;
  onClick?: () => void;
  className?: string;
  /** When set, scales the 40×30 mm label to fit (modal inspect). */
  displayScale?: number;
}

export function ThermalLabelPreview({
  record,
  widthMm,
  heightMm,
  draft,
  onClick,
  className = '',
  displayScale,
}: ThermalLabelPreviewProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<ThermalPreviewTarget | null>(null);

  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el || displayScale != null) return;

    const container =
      el.parentElement?.parentElement ?? el.parentElement ?? el;

    const update = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;
      setTarget((prev) => {
        if (prev?.width === width && prev?.height === height) return prev;
        return { width, height };
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [displayScale]);

  const autoLayout = useThermalPreviewLayout(widthMm, heightMm, target);
  const layout =
    displayScale != null
      ? layoutForThermalScale(widthMm, heightMm, displayScale)
      : autoLayout;

  const useDraft = Boolean(
    draft?.useDescriptionDraft || draft?.useVibesDraft || draft?.useDisplayDraft
  );

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`thermal-label-preview${onClick ? ' thermal-label-preview--interactive' : ''} ${className}`.trim()}
      style={{ width: layout.displayW, height: layout.displayH }}
      aria-label={
        onClick ? `Edit label for ${record.artist}, ${record.title}` : undefined
      }
    >
      <div
        ref={slotRef}
        className="thermal-label-preview__slot"
        style={{ width: layout.displayW, height: layout.displayH }}
      >
        <div
          className="thermal-label-preview__inner"
          style={{
            width: layout.baseW,
            height: layout.baseH,
            transform: `scale(${layout.scale})`,
          }}
        >
          <CrateLabel
            record={record}
            size="thermal-preview"
            onClick={undefined}
            descriptionOverride={
              useDraft || draft?.description !== undefined ? draft?.description : undefined
            }
            vibesOverride={draft?.useVibesDraft ? draft.vibes : undefined}
            displayOverride={draft?.useDisplayDraft ? draft.display : undefined}
          />
        </div>
      </div>
    </Tag>
  );
}