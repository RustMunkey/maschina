import {
  useEffect,
  useRef,
  useState,
  useCallback,
  Component,
  ErrorInfo,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

function checkWebGLSupport(): { supported: boolean; isMobile: boolean } {
  if (typeof window === "undefined") return { supported: false, isMobile: false };
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    !!(navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return { supported: false, isMobile };
    return { supported: true, isMobile };
  } catch {
    return { supported: false, isMobile };
  }
}

function polyfillWebGPU() {
  if (typeof window === "undefined") return;
  if (typeof (window as any).GPUShaderStage === "undefined")
    (window as any).GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  if (typeof (window as any).GPUBufferUsage === "undefined")
    (window as any).GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
  if (typeof (window as any).GPUTextureUsage === "undefined")
    (window as any).GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  if (typeof (window as any).GPUMapMode === "undefined")
    (window as any).GPUMapMode = { READ: 1, WRITE: 2 };
}

if (typeof window !== "undefined") polyfillWebGPU();

const NODES = [
  // North America
  { lat: 40.7128,  lng: -74.006,   label: "New York",      country: "United States"  },
  { lat: 37.7749,  lng: -122.4194, label: "San Francisco", country: "United States"  },
  { lat: 34.0522,  lng: -118.2437, label: "Los Angeles",   country: "United States"  },
  { lat: 41.8781,  lng: -87.6298,  label: "Chicago",       country: "United States"  },
  { lat: 29.7604,  lng: -95.3698,  label: "Houston",       country: "United States"  },
  { lat: 47.6062,  lng: -122.3321, label: "Seattle",       country: "United States"  },
  { lat: 43.6532,  lng: -79.3832,  label: "Toronto",       country: "Canada"         },
  { lat: 49.2827,  lng: -123.1207, label: "Vancouver",     country: "Canada"         },
  { lat: 45.5017,  lng: -73.5673,  label: "Montreal",      country: "Canada"         },
  { lat: 51.0447,  lng: -114.0719, label: "Calgary",       country: "Canada"         },
  { lat: 53.5461,  lng: -113.4938, label: "Edmonton",      country: "Canada"         },
  // Europe
  { lat: 51.5074,  lng: -0.1278,   label: "London",        country: "United Kingdom" },
  { lat: 52.52,    lng: 13.405,    label: "Berlin",        country: "Germany"        },
  { lat: 48.8566,  lng: 2.3522,    label: "Paris",         country: "France"         },
  { lat: 52.3676,  lng: 4.9041,    label: "Amsterdam",     country: "Netherlands"    },
  { lat: 41.9028,  lng: 12.4964,   label: "Rome",          country: "Italy"          },
  { lat: 40.4168,  lng: -3.7038,   label: "Madrid",        country: "Spain"          },
  { lat: 59.3293,  lng: 18.0686,   label: "Stockholm",     country: "Sweden"         },
  { lat: 50.0755,  lng: 14.4378,   label: "Prague",        country: "Czech Republic" },
  { lat: 47.3769,  lng: 8.5417,    label: "Zurich",        country: "Switzerland"    },
  { lat: 53.3498,  lng: -6.2603,   label: "Dublin",        country: "Ireland"        },
  // Asia
  { lat: 35.6762,  lng: 139.6503,  label: "Tokyo",         country: "Japan"          },
  { lat: 31.2304,  lng: 121.4737,  label: "Shanghai",      country: "China"          },
  { lat: 39.9042,  lng: 116.4074,  label: "Beijing",       country: "China"          },
  { lat: 1.3521,   lng: 103.8198,  label: "Singapore",     country: "Singapore"      },
  { lat: 19.076,   lng: 72.8777,   label: "Mumbai",        country: "India"          },
  { lat: 28.6139,  lng: 77.209,    label: "Delhi",         country: "India"          },
  { lat: 37.5665,  lng: 126.978,   label: "Seoul",         country: "South Korea"    },
  { lat: 25.2048,  lng: 55.2708,   label: "Dubai",         country: "UAE"            },
  { lat: 55.7558,  lng: 37.6173,   label: "Moscow",        country: "Russia"         },
  { lat: 13.7563,  lng: 100.5018,  label: "Bangkok",       country: "Thailand"       },
  // Oceania
  { lat: -33.8688, lng: 151.2093,  label: "Sydney",        country: "Australia"      },
  { lat: -37.8136, lng: 144.9631,  label: "Melbourne",     country: "Australia"      },
  // South America
  { lat: -23.5505, lng: -46.6333,  label: "São Paulo",     country: "Brazil"         },
  { lat: -34.6037, lng: -58.3816,  label: "Buenos Aires",  country: "Argentina"      },
  { lat: 4.711,    lng: -74.0721,  label: "Bogotá",        country: "Colombia"       },
  // Africa
  { lat: -1.2921,  lng: 36.8219,   label: "Nairobi",       country: "Kenya"          },
  { lat: 6.5244,   lng: 3.3792,    label: "Lagos",         country: "Nigeria"        },
  { lat: -33.9249, lng: 18.4241,   label: "Cape Town",     country: "South Africa"   },
  { lat: 30.0444,  lng: 31.2357,   label: "Cairo",         country: "Egypt"          },
];

const ARCS = [
  // NA internal
  [0,1],[0,2],[0,3],[0,6],[1,5],[1,7],[6,7],[6,8],[7,9],[8,6],[9,10],
  // NA ↔ Europe
  [0,11],[0,13],[6,11],[1,11],[8,13],
  // Europe internal
  [11,12],[11,13],[11,14],[12,13],[13,14],[13,19],[14,15],[12,17],[18,19],[15,16],[17,20],
  // Europe ↔ Asia
  [11,28],[12,29],[13,28],[19,28],
  // Asia internal
  [21,22],[21,27],[22,23],[22,24],[23,26],[24,25],[24,30],[25,28],[27,28],[28,29],[29,30],
  // Asia ↔ Oceania
  [21,31],[24,31],[30,31],[31,32],
  // NA ↔ SA
  [0,33],[4,35],[1,35],
  // SA internal
  [33,34],[33,35],
  // Africa
  [36,37],[36,39],[37,38],[11,39],[28,39],
].map(([i, j]) => ({
  startLat:    NODES[i].lat,
  startLng:    NODES[i].lng,
  endLat:      NODES[j].lat,
  endLng:      NODES[j].lng,
  animateTime: 1000 + Math.random() * 3000,
  dashLength:  0.2 + Math.random() * 0.5,
  dashGap:     0.3 + Math.random() * 0.5,
}));

class GlobeErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, _: ErrorInfo) {
    if (error.message?.includes("GPUShaderStage") || error.message?.includes("WebGPU"))
      this.props.onError();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface GlobeVisualizationProps {
  className?: string;
  width?: number;
  height?: number;
}

export function GlobeVisualization({ className = "", width = 600, height = 600 }: GlobeVisualizationProps) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [GlobeComponent, setGlobeComponent] = useState<any>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [webGLError, setWebGLError] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [countries, setCountries] = useState<any>({ features: [] });
  const [hoveredNode, setHoveredNode] = useState<(typeof NODES)[0] | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Dynamically import globe (avoids SSR + preserves ref forwarding)
  useEffect(() => {
    const { supported, isMobile } = checkWebGLSupport();
    setIsMobileDevice(isMobile);
    if (!supported) { setWebGLSupported(false); return; }

    import("react-globe.gl")
      .then((mod) => setGlobeComponent(() => mod.default))
      .catch(() => {});

    fetch("/countries.geojson")
      .then((r) => r.json())
      .then(setCountries)
      .catch(() => {});

    const handleContextLost = () => setWebGLError(true);
    const handleError = (e: ErrorEvent) => {
      if (e.message?.includes("GPUShaderStage") || e.message?.includes("WebGPU")) {
        setWebGLError(true);
        e.preventDefault();
      }
    };
    window.addEventListener("webglcontextlost", handleContextLost);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("error", handleError);
      if (globeRef.current) {
        try {
          const r = globeRef.current.renderer?.();
          if (r) { r.dispose(); r.forceContextLoss(); }
          globeRef.current.controls?.()?.dispose?.();
        } catch {}
      }
    };
  }, []);

  // Setup controls once globe is ready
  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.minPolarAngle = Math.PI / 3;
    controls.maxPolarAngle = Math.PI - Math.PI / 3;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.5;
    globeRef.current.pointOfView({ lat: 20, lng: -40, altitude: 2.2 }, 0);
  }, [globeReady]);

  // Prevent scroll hijacking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const block = (e: WheelEvent) => e.stopPropagation();
    container.addEventListener("wheel", block, { capture: true, passive: true });
    return () => container.removeEventListener("wheel", block, { capture: true });
  }, [GlobeComponent]);

  const handleGlobeReady = useCallback(() => setGlobeReady(true), []);

  const handlePointHover = useCallback((point: any) => {
    if (point) {
      setHoveredNode(point);
      if (globeRef.current) globeRef.current.controls().autoRotate = false;
    } else {
      setHoveredNode(null);
      if (globeRef.current) globeRef.current.controls().autoRotate = true;
    }
  }, []);

  // Track mouse position in window coordinates for portal card placement
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  if (!webGLSupported || webGLError) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
        <p className="text-xs text-white/20">WebGL not supported</p>
      </div>
    );
  }

  if (!GlobeComponent) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/30" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ width, height }}>
      {/* Solid black circle behind globe to block starfield showing through hex dot gaps */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "46%",
        height: "46%",
        borderRadius: "50%",
        background: "#000",
        zIndex: 0,
      }} />
      <GlobeErrorBoundary onError={() => setWebGLError(true)}>
        <GlobeComponent
          ref={globeRef}
          width={width}
          height={height}
          onGlobeReady={handleGlobeReady}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect fill='%23000000' width='1' height='1'/%3E%3C/svg%3E"
          showGlobe={true}
          showAtmosphere={!isMobileDevice}
          atmosphereColor="rgba(255,255,255,0.06)"
          atmosphereAltitude={0.15}
          hexPolygonsData={countries.features}
          hexPolygonResolution={3}
          hexPolygonMargin={isMobileDevice ? 0.82 : 0.7}
          hexPolygonUseDots={true}
          hexPolygonColor={() => "rgba(255,255,255,0.35)"}
          hexPolygonAltitude={0.001}
          pointsData={NODES}
          pointLat="lat"
          pointLng="lng"
          pointColor={() => "rgba(255,255,255,0.9)"}
          pointAltitude={0.01}
          pointRadius={0.3}
          onPointHover={handlePointHover}
          arcsData={ARCS}
          arcColor={() => "rgba(255,255,255,0.5)"}
          arcDashLength={(d: any) => d.dashLength}
          arcDashGap={(d: any) => d.dashGap}
          arcDashAnimateTime={(d: any) => d.animateTime}
          arcStroke={0.8}
          arcAltitudeAutoScale={0.35}
          ringsData={NODES}
          ringLat="lat"
          ringLng="lng"
          ringColor={() => (t: number) => `rgba(255,255,255,${(1 - t) * 0.5})`}
          ringMaxRadius={3}
          ringPropagationSpeed={1.5}
          ringRepeatPeriod={2000}
        />
      </GlobeErrorBoundary>

      {hoveredNode && createPortal(
        <div
          style={{
            position: "fixed",
            left: mousePos.x,
            top: mousePos.y - 150,
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          <div style={{
            background: "rgba(0,0,0,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            padding: "14px 18px",
            minWidth: "200px",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ color: "rgba(255,255,255,0.95)", fontSize: "14px", fontWeight: 600 }}>
                {hoveredNode.label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Live</span>
              </div>
            </div>
            {/* Divider */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginBottom: "10px" }} />
            {/* Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>Country</span>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px" }}>{hoveredNode.country}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>Lat / Lng</span>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px" }}>
                  {hoveredNode.lat.toFixed(2)}° / {hoveredNode.lng.toFixed(2)}°
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>Status</span>
                <span style={{ color: "#22c55e", fontSize: "11px" }}>Online</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
