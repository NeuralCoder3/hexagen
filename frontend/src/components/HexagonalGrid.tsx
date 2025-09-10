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
  thumbnailSrc?: string;
  onTileGenerated?: (x: number, y: number) => void;
  isCenter?: boolean;
  isAuthenticated?: boolean;
}

const Hexagon: React.FC<HexagonProps> = ({ x, y, size, thumbnailSrc, onTileGenerated, isCenter = false, isAuthenticated = false }) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showFullImage, setShowFullImage] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [metadata, setMetadata] = useState<{ prompt?: string; createdAt?: string; username?: string | null } | null>(null);
  const [showLoginCta, setShowLoginCta] = useState(false);
  const [canGenerateHere, setCanGenerateHere] = useState<boolean | null>(null);
  const [cannotReason, setCannotReason] = useState<string>('');
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);
  const [generatingCoordinates, setGeneratingCoordinates] = useState<{ x: number; y: number } | null>(null);
  const [generatingUser, setGeneratingUser] = useState<string | null>(null);

  // Countdown timer for rate limiting
  useEffect(() => {
    if (rateLimitCountdown !== null && rateLimitCountdown > 0) {
      const timer = setTimeout(() => {
        setRateLimitCountdown(rateLimitCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (rateLimitCountdown === 0) {
      // Countdown reached zero, recheck if generation is now allowed
      setRateLimitCountdown(null);
      if (showGenerateForm && isAuthenticated) {
        checkCanGenerate();
      }
    }
  }, [rateLimitCountdown, showGenerateForm, isAuthenticated]);

  const checkCanGenerate = async () => {
    try {
      const canRes = await fetch(`/api/hexagon/${x}/${y}/can-generate`, { credentials: 'include' });
      const canJson = await canRes.json();
      if (canRes.ok && canJson.allowed) {
        setCanGenerateHere(true);
        setCannotReason('');
        setRateLimitCountdown(null);
        setIsGenerating(false);
        setGeneratingCoordinates(null);
        setGeneratingUser(null);
      } else {
        const reason = canJson?.reason || 'Tile cannot be generated here yet.';
        setCanGenerateHere(false);
        setCannotReason(reason);
        
        // Check if this is a rate limiting response
        if (canJson.timeUntilNext) {
          setRateLimitCountdown(canJson.timeUntilNext);
        } else {
          setRateLimitCountdown(null);
        }
        
        // Check if this is a concurrent generation response
        if (canJson.isGenerating) {
          setIsGenerating(true);
          if (canJson.generatingCoordinates) {
            setGeneratingCoordinates(canJson.generatingCoordinates);
          }
          if (canJson.generatingUser) {
            setGeneratingUser(canJson.generatingUser);
          }
        } else {
          setIsGenerating(false);
          setGeneratingCoordinates(null);
          setGeneratingUser(null);
        }
      }
    } catch (e) {
      setCanGenerateHere(false);
      setCannotReason('Unable to check whether tile can be generated.');
      setRateLimitCountdown(null);
      setIsGenerating(false);
      setGeneratingCoordinates(null);
      setGeneratingUser(null);
    }
  };

  useEffect(() => {
    if (thumbnailSrc) {
      setImageUrl(thumbnailSrc);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [thumbnailSrc]);

  useEffect(() => {
    if (showFullImage) {
      // Fetch metadata when opening the popup
      fetch(`/api/hexagon/${x}/${y}/metadata`, { credentials: 'include' })
        .then(async (r) => (r.ok ? r.json() : null))
        .then((json) => setMetadata(json))
        .catch(() => setMetadata(null));
    } else {
      setMetadata(null);
    }
  }, [showFullImage, x, y]);

  const handleHexagonClick = async () => {
    // Only open popup if it wasn't a drag operation
    if (!isDragging) {
      try {
        // First check if tile exists
        const checkResponse = await fetch(`/api/hexagon/${x}/${y}?checkExists=true`, { credentials: 'include' });
        const checkData = await checkResponse.json();
        
        if (checkData.exists) {
          // Tile exists, fetch full image for popup
          const response = await fetch(`/api/hexagon/${x}/${y}?thumbnail=false`, { credentials: 'include' });
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setFullImageUrl(url);
            setShowFullImage(true);
          }
        } else {
          // Tile doesn't exist, show generation form or login CTA
          if (isAuthenticated) {
            setShowGenerateForm(true);
            await checkCanGenerate();
          } else {
            setShowGenerateForm(false);
            setShowFullImage(false);
            setShowLoginCta(true);
          }
        }
      } catch (error) {
        console.error('Error checking/fetching hexagon:', error);
      }
    }
  };

  const handleGenerateTile = async () => {
    if (!generatePrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-tile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          x: x,
          y: y,
          prompt: generatePrompt
        })
      });

      const data = await response.json();
      
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      
      if (response.ok) {
        // Success - refresh the image
        setShowGenerateForm(false);
        setGeneratePrompt('');
        setRateLimitCountdown(null);
        // Notify parent component to refresh this tile
        onTileGenerated?.(x, y);
      } else {
        if (response.status === 403) {
          alert('Tile generation is only allowed adjacent (or one apart) to an existing tile.');
        } else if (response.status === 429) {
          // Rate limiting error
          if (data.timeUntilNext) {
            setRateLimitCountdown(data.timeUntilNext);
          }
          alert(`Rate limited: ${data.error}`);
        } else {
          alert(`Error: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('Error generating tile:', error);
      alert('Error generating tile');
    } finally {
      setIsGenerating(false);
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

  const closeGenerateForm = () => {
    setShowGenerateForm(false);
    setGeneratePrompt('');
    setCanGenerateHere(null);
    setCannotReason('');
    setRateLimitCountdown(null);
    setIsGenerating(false);
    setGeneratingCoordinates(null);
    setGeneratingUser(null);
  };

  // Calculate hexagon position (centered on 0,0) - adjusted spacing
  const hexX = x * size * 1.; // Reduced from 1.5 to 1.2 (closer in x)
  const hexY = y * size * Math.sqrt(3) * 1.4 + (x % 2) * size * Math.sqrt(3) * 0.7; // Increased spacing in y

  return (
    <>
      <div
        className={`hexagon-container ${isCenter ? 'center-hexagon' : ''}`}
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
              {metadata && (
                <div className="modal-metadata">
                  {metadata.prompt && (
                    <div><strong>Prompt:</strong> {metadata.prompt}</div>
                  )}
                  {metadata.createdAt && (
                    <div><strong>Created:</strong> {new Date(metadata.createdAt).toLocaleString()}</div>
                  )}
                  {typeof metadata.username !== 'undefined' && metadata.username !== null && (
                    <div><strong>By:</strong> {metadata.username}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ),
        document.body
      )}

      {/* Generate Tile Modal */}
      {showGenerateForm && createPortal(
        (
          <div className="image-modal-overlay" onClick={closeGenerateForm}>
            <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeGenerateForm}>×</button>
              <div className="generate-form">
                <h3>Generate Tile at ({x}, {y})</h3>
                {canGenerateHere === false ? (
                  <div>
                    <p>{cannotReason}</p>
                    {rateLimitCountdown !== null && rateLimitCountdown > 0 && (
                      <div className="rate-limit-countdown">
                        <p>⏰ Next generation available in: <strong>{rateLimitCountdown}s</strong></p>
                      </div>
                    )}
                    {isGenerating && generatingCoordinates && (
                      <div className="concurrent-generation-warning">
                        <p>🔄 Currently generating tile at ({generatingCoordinates.x}, {generatingCoordinates.y})</p>
                        {generatingUser && <p>By: {generatingUser}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p>This tile doesn't exist yet. Enter a prompt to generate it:</p>
                    {rateLimitCountdown !== null && rateLimitCountdown > 0 && (
                      <div className="rate-limit-countdown">
                        <p>⏰ Next generation available in: <strong>{rateLimitCountdown}s</strong></p>
                      </div>
                    )}
                    {isGenerating && generatingCoordinates && (
                      <div className="concurrent-generation-warning">
                        <p>🔄 Currently generating tile at ({generatingCoordinates.x}, {generatingCoordinates.y})</p>
                        {generatingUser && <p>By: {generatingUser}</p>}
                      </div>
                    )}
                    <textarea
                      value={generatePrompt}
                      onChange={(e) => setGeneratePrompt(e.target.value)}
                      placeholder="Describe what you want to see in this tile..."
                      className="generate-prompt"
                      rows={4}
                    />
                  </>
                )}
                <div className="generate-buttons">
                  {canGenerateHere === false ? (
                    <button onClick={closeGenerateForm} className="cancel-button">Close</button>
                  ) : (
                    <>
                      <button 
                        onClick={handleGenerateTile}
                        disabled={!generatePrompt.trim() || isGenerating || (rateLimitCountdown !== null && rateLimitCountdown > 0)}
                        className="generate-button"
                      >
                        {isGenerating ? 'Generating...' : 'Generate Tile'}
                      </button>
                      <button onClick={closeGenerateForm} className="cancel-button">
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ),
        document.body
      )}

      {/* Login CTA Modal */}
      {showLoginCta && createPortal(
        (
          <div className="image-modal-overlay" onClick={() => setShowLoginCta(false)}>
            <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowLoginCta(false)}>×</button>
              <div className="generate-form">
                <h3>Sign in required</h3>
                <p>You need to be signed in the CMS to generate a new tile at ({x}, {y}).</p>
                <div className="generate-buttons">
                  <a href="/login" className="generate-button">Log in</a>
                  <button onClick={() => setShowLoginCta(false)} className="cancel-button">
                    Cancel
                  </button>
                </div>
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
  const [zoom, setZoom] = useState(1.5); // Start at 150% (which will be the new 100%)
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<Position>({ x: 0, y: 0 });
  const [jumpX, setJumpX] = useState<string>('0');
  const [jumpY, setJumpY] = useState<string>('0');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const baseHexSize = 30;

  // Cache for thumbnails: key is `${x}_${y}`, value is object URL or data URL
  const [thumbnailCache] = useState<Map<string, string>>(() => new Map());
  
  // Polling state for updates
  const [lastUpdateCheck, setLastUpdateCheck] = useState<number>(Date.now());
  const [isPolling, setIsPolling] = useState<boolean>(true);
  
  // Current center hexagon position
  const [centerHexagon, setCenterHexagon] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Flag to prevent URL updates during initial navigation - set to true initially
  const [isInitialNavigation, setIsInitialNavigation] = useState<boolean>(true);
  
  // Auth status for all hexagons (shared across all hexagon components)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Check auth status once on mount
  useEffect(() => {
    fetch('/api/auth/status', { credentials: 'include' })
      .then(r => r.json())
      .then(j => setIsAuthenticated(!!j.authenticated))
      .catch(() => setIsAuthenticated(false));
  }, []);

  // Load position from URL on mount (run IMMEDIATELY, before any other effects)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlX = urlParams.get('x');
    const urlY = urlParams.get('y');
    
    if (urlX !== null && urlY !== null) {
      const x = parseInt(urlX);
      const y = parseInt(urlY);
      
      if (!isNaN(x) && !isNaN(y)) {
        console.log(`URL parameters found: x=${urlX}, y=${urlY}`);
        
        // Navigate immediately, don't wait
        console.log(`Navigating to URL position: (${x}, ${y})`);
        navigateToPosition(x, y);
        
        // Clear flag after navigation is complete
        setTimeout(() => {
          console.log('Initial navigation complete, resuming URL updates');
          setIsInitialNavigation(false);
        }, 1000); // Longer delay to ensure navigation is complete
      } else {
        // Invalid URL params, clear flag immediately
        console.log('Invalid URL parameters, clearing initial navigation flag');
        setIsInitialNavigation(false);
      }
    } else {
      console.log('No URL parameters found, will use default (0,0) position');
      // No URL params, clear flag immediately
      setIsInitialNavigation(false);
    }
  }, []); // Run once on mount, IMMEDIATELY

  // Calculate the center hexagon position based on current pan/zoom
  const calculateCenterHexagon = useCallback(() => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Calculate the center point of the viewport
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    
    // Convert screen coordinates to hexagon coordinates
    const stepX = baseHexSize * 1.0 * zoom;
    const stepY = baseHexSize * Math.sqrt(3) * 1.4 * zoom;
    
    // Calculate which hexagon is closest to the center
    const hexX = Math.round((-pan.x + centerX) / stepX);
    const hexY = Math.round((-pan.y + centerY) / stepY);
    
    return { x: hexX, y: hexY };
  }, [pan, zoom]);

  // Update center hexagon position when pan/zoom changes (but not during initial navigation)
  useEffect(() => {
    // Skip if we're in the middle of initial navigation
    if (isInitialNavigation) {
      console.log('Skipping center calculation during initial navigation');
      return;
    }
    
    const newCenter = calculateCenterHexagon();
    setCenterHexagon(newCenter);
    
    // Update input fields to show current center
    setJumpX(newCenter.x.toString());
    setJumpY(newCenter.y.toString());
    
    // Update URL with current position
    updateURL(newCenter.x, newCenter.y);
  }, [pan, zoom, calculateCenterHexagon, isInitialNavigation]);

  // Update URL with current position
  const updateURL = useCallback((x: number, y: number) => {
    console.log(`Updating URL to: (${x}, ${y})`);
    const url = new URL(window.location.href);
    url.searchParams.set('x', x.toString());
    url.searchParams.set('y', y.toString());
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Navigate to a specific position
  const navigateToPosition = useCallback((x: number, y: number) => {
    if (!containerRef.current) {
      console.log('Container not ready for navigation');
      return;
    }
    
    // Calculate the position of the target hexagon
    const hexX = x * baseHexSize * 1.0;
    const hexY = y * baseHexSize * Math.sqrt(3) * 1.4 + (x % 2) * baseHexSize * Math.sqrt(3) * 0.7;
    
    // Center the target hexagon on screen
    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const centerX = containerWidth / 2 - hexX * zoom;
    const centerY = containerHeight / 2 - hexY * zoom;
    
    console.log(`Navigating to (${x}, ${y}): container=${containerWidth}x${containerHeight}, hex=(${hexX}, ${hexY}), pan=(${centerX}, ${centerY}), zoom=${zoom}`);
    
    setPan({ x: centerX, y: centerY });
  }, [zoom]);

  // Callback to refresh a specific tile after generation
  const handleTileGenerated = useCallback((x: number, y: number) => {
    // Clear cache for this specific tile to force re-fetch
    thumbnailCache.delete(`${x}_${y}`);
    // Trigger a re-render by updating a state that affects the grid
    setZoom(prevZoom => prevZoom + 0.001); // Tiny change to trigger re-render
  }, [thumbnailCache]);

  // Poll for updates every 30 seconds
  useEffect(() => {
    if (!isPolling) return;

    const pollForUpdates = async () => {
      try {
        const response = await fetch(`/api/updates?since=${lastUpdateCheck}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.hasUpdates && data.updated.length > 0) {
            console.log(`Found ${data.updated.length} updated tiles:`, data.updated);
            
            // Clear cache for updated tiles to force re-fetch
            data.updated.forEach((update: { x: number; y: number }) => {
              thumbnailCache.delete(`${update.x}_${update.y}`);
            });
            
            // Trigger a re-render to refresh the grid
            setZoom(prevZoom => prevZoom + 0.001);
          }
          
          // Update the last check time
          setLastUpdateCheck(data.lastSystemUpdate || Date.now());
        }
      } catch (error) {
        console.warn('Failed to check for updates:', error);
      }
    };

    // Poll immediately on mount, then every 30 seconds
    pollForUpdates();
    const interval = setInterval(pollForUpdates, 30000);

    return () => clearInterval(interval);
  }, [isPolling, lastUpdateCheck, thumbnailCache]);

  // Pause polling when user is interacting (optional optimization)
  useEffect(() => {
    const handleUserActivity = () => {
      setIsPolling(true);
    };

    const handleUserInactivity = () => {
      // Pause polling after 5 minutes of inactivity
      setTimeout(() => {
        setIsPolling(false);
      }, 300000); // 5 minutes
    };

    // Listen for user activity
    document.addEventListener('mousedown', handleUserActivity);
    document.addEventListener('keydown', handleUserActivity);
    document.addEventListener('scroll', handleUserActivity);
    document.addEventListener('touchstart', handleUserActivity);

    // Set up inactivity timer
    let inactivityTimer: number;
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(handleUserInactivity, 300000); // 5 minutes
    };

    resetInactivityTimer();
    document.addEventListener('mousedown', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);
    document.addEventListener('scroll', resetInactivityTimer);
    document.addEventListener('touchstart', resetInactivityTimer);

    return () => {
      document.removeEventListener('mousedown', handleUserActivity);
      document.removeEventListener('keydown', handleUserActivity);
      document.removeEventListener('scroll', handleUserActivity);
      document.removeEventListener('touchstart', handleUserActivity);
      
      document.removeEventListener('mousedown', resetInactivityTimer);
      document.removeEventListener('keydown', resetInactivityTimer);
      document.removeEventListener('scroll', resetInactivityTimer);
      document.removeEventListener('touchstart', resetInactivityTimer);
      
      clearTimeout(inactivityTimer);
    };
  }, []);

  // Calculate visible hexagons based on viewport and zoom
  const getVisibleHexagons = useCallback(() => {
    if (!containerRef.current) return [];

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    // Match spacing used in Hexagon positioning
    const stepX = baseHexSize * 1.0 * zoom;
    const stepY = baseHexSize * Math.sqrt(3) * 1.4 * zoom;

    // Calculate the range of hexagons to render with some buffer
    const startX = Math.floor((-pan.x) / stepX) - 3;
    const endX = Math.ceil((-pan.x + containerWidth) / stepX) + 3;
    const startY = Math.floor((-pan.y) / stepY) - 3;
    const endY = Math.ceil((-pan.y + containerHeight) / stepY) + 3;

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

  // Batch fetch thumbnails for currently visible hexes
  useEffect(() => {
    // Clear cache when switching between thumbnail/full image modes
    const requestThumbnails = zoom <= 4.0;
    const cacheKey = requestThumbnails ? 'thumbnail' : 'full';
    
    // If we're switching modes, clear the cache
    if (thumbnailCache.get('_mode') !== cacheKey) {
      thumbnailCache.clear();
      thumbnailCache.set('_mode', cacheKey);
    }
    
    const missing = visibleHexagons.filter(({ x, y }) => !thumbnailCache.has(`${x}_${y}`));
    if (missing.length === 0) return;

    const controller = new AbortController();
    const CHUNK_SIZE = 120; // keep well below backend 2mb and 500 cap
    const chunks: Array<Array<{ x: number; y: number }>> = [];
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      chunks.push(missing.slice(i, i + CHUNK_SIZE));
    }

    let cancelled = false;
    const run = async () => {
      // Limit concurrency to 2
      const MAX_CONCURRENCY = 2;
      let index = 0;
      const inFlight: Promise<void>[] = [];

      const launch = async (chunkIndex: number) => {
        const coords = chunks[chunkIndex].map(({ x, y }) => ({ x, y }));
        // Request full images when zoom > 400% (4.0), thumbnails otherwise
        const requestThumbnails = zoom <= 4.0;
        const res = await fetch('/api/hexagons/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coords, thumbnail: requestThumbnails }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        const items: Array<{ x: number; y: number; contentType: string; data: string }> = json.items || [];
        for (const item of items) {
          const key = `${item.x}_${item.y}`;
          const dataUrl = `data:${item.contentType};base64,${item.data}`;
          if (!thumbnailCache.has(key)) {
            thumbnailCache.set(key, dataUrl);
          }
        }
        if (!cancelled) {
          setVisibleHexagons((prev) => [...prev]);
        }
      };

      while (index < chunks.length || inFlight.length > 0) {
        while (index < chunks.length && inFlight.length < MAX_CONCURRENCY) {
          const p = launch(index++).catch(() => {});
          inFlight.push(p);
        }
        await Promise.race(inFlight);
        // remove settled
        for (let i = inFlight.length - 1; i >= 0; i--) {
          if ((inFlight[i] as any).settled) continue;
        }
        // filter by settled using Promise.any trick is not straightforward; just await all briefly
        await Promise.allSettled(inFlight.splice(0, inFlight.length));
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visibleHexagons, thumbnailCache, zoom]);

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
    const newZoom = Math.max(0.4, Math.min(5, zoom * delta));
    
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

  // Center view on (0,0) at startup (only if no URL parameters)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlX = urlParams.get('x');
    const urlY = urlParams.get('y');
    
    // Only center on (0,0) if no URL parameters are present
    if (urlX === null && urlY === null && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Center (0,0) hexagon on screen
      const hexX = 0 * baseHexSize * 1.0;
      const hexY = 0 * baseHexSize * Math.sqrt(3) * 1.4 + (0 % 2) * baseHexSize * Math.sqrt(3) * 0.7;
      
      const centerX = containerWidth / 2 - hexX * zoom;
      const centerY = containerHeight / 2 - hexY * zoom;
      
      setPan({ x: centerX, y: centerY });
    }
  }, []); // Run once on mount

  // Jump to specific coordinates
  const handleJumpToCoordinate = useCallback(() => {
    const x = parseInt(jumpX);
    const y = parseInt(jumpY);
    
    if (isNaN(x) || isNaN(y)) {
      alert('Please enter valid coordinates');
      return;
    }
    
    // Use the new navigateToPosition function
    navigateToPosition(x, y);
  }, [jumpX, jumpY, navigateToPosition]);

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
              thumbnailSrc={thumbnailCache.get(`${x}_${y}`)}
              onTileGenerated={handleTileGenerated}
              isCenter={x === centerHexagon.x && y === centerHexagon.y}
              isAuthenticated={isAuthenticated || false}
            />
          ))}
        </div>
      </div>
      
      <div className="controls">
        <div className="zoom-controls">
          <button onClick={() => setZoom(Math.max(0.4, zoom * 0.8))}>-</button>
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
            setZoom(1.5); // Reset to new "100%" zoom
            // Center on (0,0)
            if (containerRef.current) {
              const containerWidth = containerRef.current.clientWidth;
              const containerHeight = containerRef.current.clientHeight;
              
              const hexX = 0 * baseHexSize * 1.0;
              const hexY = 0 * baseHexSize * Math.sqrt(3) * 1.4 + (0 % 2) * baseHexSize * Math.sqrt(3) * 0.7;
              
              const centerX = containerWidth / 2 - hexX * 1.5;
              const centerY = containerHeight / 2 - hexY * 1.5;
              
              setPan({ x: centerX, y: centerY });
            }
          }}
        >
          Reset View
        </button>
        
        <div className="jump-controls">
          <h4>Jump to Coordinate</h4>
          <div className="jump-inputs">
            <input
              type="number"
              value={jumpX}
              onChange={(e) => setJumpX(e.target.value)}
              placeholder="X"
              className="jump-input"
            />
            <input
              type="number"
              value={jumpY}
              onChange={(e) => setJumpY(e.target.value)}
              placeholder="Y"
              className="jump-input"
            />
            <button 
              className="jump-button"
              onClick={handleJumpToCoordinate}
            >
              Jump
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HexagonalGrid;
