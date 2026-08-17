import { useState, useEffect, useMemo, useRef } from 'react';
import { pdfjs } from 'react-pdf';
import { Portal } from './Portal';
import type { BoundingBox } from '../types';

/** Another snippet on the same page, drawn as a dashed light box for context (M13). */
export interface CandidateBox {
  id: string;
  bbox: BoundingBox;
  color: string;
  label?: string;
}

interface BBoxLightboxProps {
  pdfUrl: string;
  pageNumber: number;
  bbox: BoundingBox;
  originRect: DOMRect;
  snippetColor: string;
  candidates?: CandidateBox[];
  onTransitionEnd?: () => void;
  isLeaving?: boolean;
}

// Cache high-res rendered page canvases (keyed by url:page)
const pageCanvasCache = new Map<string, HTMLCanvasElement>();
const RENDER_SCALE = 3;

async function renderPageHighRes(pdfUrl: string, pageNumber: number): Promise<HTMLCanvasElement> {
  const key = `${pdfUrl}:${pageNumber}`;
  const cached = pageCanvasCache.get(key);
  if (cached) return cached;

  const doc = await pdfjs.getDocument(pdfUrl).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  pageCanvasCache.set(key, canvas);
  return canvas;
}

// Crop region in normalized page units (0..1000), same space as BoundingBox
interface CropRect { x: number; y: number; width: number; height: number }

const CONTEXT_PAD = 40;        // page-units of context around the snippet (4% of the page)
const CANDIDATE_REACH = 60;    // candidates within this distance are pulled into the crop
const MAX_GROWTH = 350;        // never grow the crop by more than this per axis

/**
 * Crop rectangle for the lightbox: the snippet plus a little page context,
 * widened to include nearby candidate boxes so the reader can see the
 * alternatives around the cited passage.
 */
export function computeCropRect(bbox: BoundingBox, candidates: CandidateBox[] = []): CropRect {
  let x1 = bbox.x - CONTEXT_PAD;
  let y1 = bbox.y - CONTEXT_PAD;
  let x2 = bbox.x + bbox.width + CONTEXT_PAD;
  let y2 = bbox.y + bbox.height + CONTEXT_PAD;

  const reachX1 = bbox.x - CANDIDATE_REACH, reachY1 = bbox.y - CANDIDATE_REACH;
  const reachX2 = bbox.x + bbox.width + CANDIDATE_REACH, reachY2 = bbox.y + bbox.height + CANDIDATE_REACH;
  candidates.forEach(({ bbox: c }) => {
    const intersects = c.x < reachX2 && c.x + c.width > reachX1 && c.y < reachY2 && c.y + c.height > reachY1;
    if (!intersects) return;
    x1 = Math.min(x1, c.x - CONTEXT_PAD / 2);
    y1 = Math.min(y1, c.y - CONTEXT_PAD / 2);
    x2 = Math.max(x2, c.x + c.width + CONTEXT_PAD / 2);
    y2 = Math.max(y2, c.y + c.height + CONTEXT_PAD / 2);
  });

  // Bound growth, then clamp to the page
  x1 = Math.max(0, Math.max(x1, bbox.x - MAX_GROWTH));
  y1 = Math.max(0, Math.max(y1, bbox.y - MAX_GROWTH));
  x2 = Math.min(1000, Math.min(x2, bbox.x + bbox.width + MAX_GROWTH));
  y2 = Math.min(1000, Math.min(y2, bbox.y + bbox.height + MAX_GROWTH));
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

function cropRegion(canvas: HTMLCanvasElement, crop: CropRect) {
  const cw = canvas.width;
  const ch = canvas.height;
  const sx = (crop.x / 1000) * cw;
  const sy = (crop.y / 1000) * ch;
  const sw = Math.max(1, (crop.width / 1000) * cw);
  const sh = Math.max(1, (crop.height / 1000) * ch);

  const offscreen = document.createElement('canvas');
  offscreen.width = sw;
  offscreen.height = sh;
  const ctx = offscreen.getContext('2d')!;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return { url: offscreen.toDataURL('image/png'), width: sw, height: sh };
}

/** Position of a page-space box inside the crop, as CSS percentages. */
function boxInCrop(box: BoundingBox, crop: CropRect): React.CSSProperties {
  return {
    left: `${((box.x - crop.x) / crop.width) * 100}%`,
    top: `${((box.y - crop.y) / crop.height) * 100}%`,
    width: `${(box.width / crop.width) * 100}%`,
    height: `${(box.height / crop.height) * 100}%`,
  };
}

export function BBoxLightbox({
  pdfUrl,
  pageNumber,
  bbox,
  originRect,
  snippetColor,
  candidates = [],
  onTransitionEnd,
  isLeaving = false,
}: BBoxLightboxProps) {
  const [cropped, setCropped] = useState<{ url: string; width: number; height: number } | null>(null);
  const crop = useMemo(() => computeCropRect(bbox, candidates), [bbox, candidates]);
  const visibleCandidates = useMemo(
    () => candidates.filter(({ bbox: c }) => c.x < crop.x + crop.width && c.x + c.width > crop.x && c.y < crop.y + crop.height && c.y + c.height > crop.y),
    [candidates, crop],
  );
  const [animPhase, setAnimPhase] = useState<'initial' | 'entered'>('initial');
  const imgRef = useRef<HTMLDivElement>(null);

  // Render page at high resolution from source PDF, then crop bbox
  useEffect(() => {
    let cancelled = false;
    renderPageHighRes(pdfUrl, pageNumber).then((canvas) => {
      if (cancelled) return;
      try {
        setCropped(cropRegion(canvas, crop));
      } catch {
        // canvas security error etc.
      }
    });
    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, crop]);

  // Two-frame enter animation — start after crop is ready
  useEffect(() => {
    if (!cropped || isLeaving) return;
    const id = requestAnimationFrame(() => setAnimPhase('entered'));
    return () => cancelAnimationFrame(id);
  }, [cropped, isLeaving]);

  // If leaving before crop is ready, just cleanup immediately
  useEffect(() => {
    if (isLeaving && !cropped && onTransitionEnd) {
      onTransitionEnd();
    }
  }, [isLeaving, cropped, onTransitionEnd]);

  if (!cropped) return null;

  // Target display size: use native pixel width (already 3x), capped by viewport
  const aspectRatio = cropped.width / cropped.height;
  const maxW = window.innerWidth * 0.6;
  const maxH = window.innerHeight * 0.6;
  let targetW = Math.min(cropped.width, maxW);
  let targetH = targetW / aspectRatio;

  if (targetH > maxH) {
    targetH = maxH;
    targetW = targetH * aspectRatio;
  }
  // Ensure minimum size for very small bboxes
  if (targetW < 200) {
    targetW = Math.min(200, maxW);
    targetH = targetW / aspectRatio;
  }

  const isAtOrigin = animPhase === 'initial' || isLeaving;

  const style: React.CSSProperties = isAtOrigin
    ? {
        position: 'fixed',
        left: originRect.left,
        top: originRect.top,
        width: originRect.width,
        height: originRect.height,
        opacity: 0,
        zIndex: 50,
        pointerEvents: 'none',
        transition: 'all 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        borderRadius: 4,
      }
    : {
        position: 'fixed',
        left: (window.innerWidth - targetW) / 2,
        top: (window.innerHeight - targetH) / 2,
        width: targetW,
        height: targetH,
        opacity: 1,
        zIndex: 50,
        pointerEvents: 'none',
        transition: 'all 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        borderRadius: 4,
      };

  return (
    <Portal>
      <div
        ref={imgRef}
        style={style}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'opacity' && isLeaving && onTransitionEnd) {
            onTransitionEnd();
          }
        }}
      >
        <img
          src={cropped.url}
          alt="bbox preview"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            border: '3px solid rgba(15,23,42,0.35)',
            borderRadius: 4,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08)',
            display: 'block',
          }}
          draggable={false}
        />
        {/* Cited snippet: solid; other snippets on the page: dashed, light (M13 candidate boxes) */}
        <div style={{ position: 'absolute', inset: 3, overflow: 'hidden', pointerEvents: 'none' }}>
          {visibleCandidates.map((c) => (
            <div
              key={c.id}
              style={{
                position: 'absolute',
                ...boxInCrop(c.bbox, crop),
                border: `2px dashed ${c.color}`,
                backgroundColor: `${c.color}14`,
                borderRadius: 3,
                opacity: 0.75,
              }}
              title={c.label}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              ...boxInCrop(bbox, crop),
              border: `3px solid ${snippetColor}`,
              backgroundColor: `${snippetColor}1f`,
              borderRadius: 3,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.6)`,
            }}
          />
        </div>
      </div>
    </Portal>
  );
}
