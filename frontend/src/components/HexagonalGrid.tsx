import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './HexagonalGrid.css';

interface Position {
  x: number;
  y: number;
}

interface HexagonProps {
  x: number;
  y: number;
  size: number;
}

const Hexagon: React.FC<HexagonProps> = ({ x, y, size }) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showFullImage, setShowFullImage] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const fetchHexagonImage = async () => {
      try {
        setLoading(true);
        // Fetch thumbnail by default (no parameter needed)
        const response = await fetch(`/api/hexagon/${x}/${y}`);
        
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setImageUrl(url);
        }
      } catch (error) {
        console.error('Error fetching hexagon thumbnail:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHexagonImage();

    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [x, y]);

  const handleHexagonClick = async () => {
    // Only open popup if it wasn't a drag operation
    if (!isDragging) {
      try {
        // Fetch full image for popup (explicitly request full image)
        const response = await fetch(`/api/hexagon/${x}/${y}?thumbnail=false`);
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setFullImageUrl(url);
          setShowFullImage(true);
        }
      } catch (error) {
        console.error('Error fetching full hexagon image:', error);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(false);
    setDragStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos) {
      const deltaX = Math.abs(e.clientX - dragStartPos.x);
      const deltaY = Math.abs(e.clientY - dragStartPos.y);
      const threshold = 5; // pixels
      
      if (deltaX > threshold || deltaY > threshold) {
        setIsDragging(true);
      }
    }
  };

  const handleMouseUp = () => {
    // Reset drag state after a short delay to prevent click from firing
    setTimeout(() => {
      setIsDragging(false);
      setDragStartPos(null);
    }, 10);
  };

  const closeFullImage = () => {
    setShowFullImage(false);
    if (fullImageUrl) {
      URL.revokeObjectURL(fullImageUrl);
      setFullImageUrl('');
    }
  };

  // Calculate hexagon position (centered on 0,0) - adjusted spacing
  const hexX = x * size * 1.; // Reduced from 1.5 to 1.2 (closer in x)
  const hexY = y * size * Math.sqrt(3) * 1.4 + (x % 2) * size * Math.sqrt(3) * 0.7; // Increased spacing in y

  return (
    <>
      <div
        className="hexagon-container"
        style={{
          left: hexX,
          top: hexY,
          width: size * 2,
          height: size * 2,
        }}
        onClick={handleHexagonClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {loading ? (
          <div className="hexagon-placeholder">
            <div className="hexagon-skeleton" />
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`Hexagon at ${x}, ${y}`}
            className="hexagon-image"
            style={{
              width: size * 2,
              height: size * 2,
            }}
          />
        )}
        <div className="hexagon-coords">
          {x}, {y}
        </div>
      </div>

      {/* Full Image Modal rendered in portal so it is not affected by grid transforms */}
      {showFullImage && createPortal(
        (
          <div className="image-modal-overlay" onClick={closeFullImage}>
            <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeFullImage}>×</button>
              <img
                src={fullImageUrl}
                alt={`Full hexagon at ${x}, ${y}`}
                className="full-hexagon-image"
              />
              <div className="modal-coords">
                Hexagon at {x}, {y}
              </div>
            </div>
          </div>
        ),
        document.body
      )}
    </>
  );
};

const HexagonalGrid: React.FC = () => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<Position>({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const baseHexSize = 30;

  // Calculate visible hexagons based on viewport and zoom
  const getVisibleHexagons = useCallback(() => {
    if (!containerRef.current) return [];

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const hexSize = baseHexSize * zoom;

    // Calculate the range of hexagons to render
    const hexWidth = hexSize * 1.2; // Updated to match new spacing
    const hexHeight = hexSize * Math.sqrt(3) * 1.2; // Updated to match new spacing

    const startX = Math.floor((-pan.x) / hexWidth) - 2;
    const endX = Math.ceil((-pan.x + containerWidth) / hexWidth) + 2;
    const startY = Math.floor((-pan.y) / hexHeight) - 2;
    const endY = Math.ceil((-pan.y + containerHeight) / hexHeight) + 2;

    const hexagons: Array<{ x: number; y: number }> = [];
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        hexagons.push({ x, y });
      }
    }

    return hexagons;
  }, [pan, zoom]);

  const [visibleHexagons, setVisibleHexagons] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    setVisibleHexagons(getVisibleHexagons());
  }, [getVisibleHexagons]);

  // Handle mouse wheel for zooming
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    // Get mouse position relative to the container
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate zoom point relative to current pan
    const zoomPointX = (mouseX - pan.x) / zoom;
    const zoomPointY = (mouseY - pan.y) / zoom;
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta));
    
    // Adjust pan to keep zoom point under cursor
    const newPanX = mouseX - zoomPointX * newZoom;
    const newPanY = mouseY - zoomPointY * newZoom;
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan]);

  // Handle mouse down for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart(pan);
  }, [pan]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    setPan({
      x: panStart.x + deltaX,
      y: panStart.y + deltaY,
    });
  }, [isDragging, dragStart, panStart]);

  // Handle mouse up for dragging
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle mouse leave for dragging
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add wheel event listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  return (
    <div className="hexagonal-grid-container">
      <div
        ref={containerRef}
        className="hexagonal-grid"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div
          className="grid-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {visibleHexagons.map(({ x, y }) => (
            <Hexagon
              key={`${x}-${y}`}
              x={x}
              y={y}
              size={baseHexSize}
            />
          ))}
        </div>
      </div>
      
      <div className="controls">
        <div className="zoom-controls">
          <button onClick={() => setZoom(Math.max(0.1, zoom * 0.8))}>-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(5, zoom * 1.25))}>+</button>
        </div>
        
        <div className="pan-controls">
          <button onClick={() => setPan({ x: pan.x + 100, y: pan.y })}>←</button>
          <button onClick={() => setPan({ x: pan.x - 100, y: pan.y })}>→</button>
          <button onClick={() => setPan({ x: pan.x, y: pan.y + 100 })}>↑</button>
          <button onClick={() => setPan({ x: pan.x, y: pan.y - 100 })}>↓</button>
        </div>
        
        <button 
          className="reset-button"
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setZoom(1);
          }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
};

export default HexagonalGrid;
