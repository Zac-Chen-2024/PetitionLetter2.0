import { useState, useEffect, useCallback, useRef } from 'react';

interface MagnifierProps {
  containerRef: React.RefObject<HTMLDivElement>;
  zoom?: number;      // 放大倍数，默认 3
  size?: number;      // 放大镜直径，默认 150
  enabled?: boolean;  // 是否启用，默认 true
}

/**
 * PDF 放大镜组件
 *
 * 鼠标移动到 PDF 区域时显示跟随鼠标的圆形放大镜，
 * 放大镜显示鼠标位置的放大内容。
 */
export function Magnifier({
  containerRef,
  zoom = 3,
  size = 150,
  enabled = true,
}: MagnifierProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [canvasImage, setCanvasImage] = useState<string | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const currentCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 查找鼠标下方的 canvas 元素
  const findCanvasUnderMouse = useCallback((clientX: number, clientY: number): HTMLCanvasElement | null => {
    const container = containerRef.current;
    if (!container) return null;

    // 获取所有 canvas 元素（react-pdf 渲染的页面）
    const canvases = container.querySelectorAll('canvas');

    for (const canvas of canvases) {
      const rect = canvas.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return canvas;
      }
    }
    return null;
  }, [containerRef]);

  // 监听鼠标移动
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = findCanvasUnderMouse(e.clientX, e.clientY);

      if (canvas) {
        const rect = canvas.getBoundingClientRect();

        // 如果切换到新的 canvas，更新图像
        if (canvas !== currentCanvasRef.current) {
          currentCanvasRef.current = canvas;
          try {
            const dataUrl = canvas.toDataURL('image/png');
            setCanvasImage(dataUrl);
            setCanvasRect(rect);
          } catch (err) {
            // 可能因为跨域问题无法获取 canvas 数据
            console.warn('Cannot get canvas data:', err);
            setCanvasImage(null);
          }
        } else {
          // 更新 rect（可能因滚动而改变）
          setCanvasRect(rect);
        }

        // 计算相对于 canvas 的位置
        setPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
      currentCanvasRef.current = null;
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [containerRef, enabled, findCanvasUnderMouse]);

  if (!isVisible || !enabled || !canvasImage || !canvasRect) return null;

  // 计算背景位置（放大镜中心对准鼠标位置）
  const bgX = position.x * zoom - size / 2;
  const bgY = position.y * zoom - size / 2;

  // 放大镜在屏幕上的位置（跟随鼠标）
  const magnifierX = canvasRect.left + position.x;
  const magnifierY = canvasRect.top + position.y;

  return (
    <div
      className="pointer-events-none fixed rounded-full border-2 border-white shadow-2xl z-50"
      style={{
        width: size,
        height: size,
        left: magnifierX - size / 2,
        top: magnifierY - size / 2,
        backgroundImage: `url(${canvasImage})`,
        backgroundPosition: `-${bgX}px -${bgY}px`,
        backgroundSize: `${canvasRect.width * zoom}px ${canvasRect.height * zoom}px`,
        backgroundRepeat: 'no-repeat',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.1)',
      }}
    />
  );
}
