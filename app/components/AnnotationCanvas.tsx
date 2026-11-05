"use client";
import { useI18n } from "./I18n";
import { useRef, useState, useEffect } from "react";
import { Box, Photo, makeBox } from "../../lib/dataset";
type Point = { x: number; y: number };
export default function AnnotationCanvas({
  photo,
  url,
  category,
  side,
  canDraw,
  onAdd,
  onReset,
  onResize,
}: {
  photo: Photo;
  url: string;
  category?: Box["category"];
  side: Box["side"];
  canDraw: boolean;
  onAdd: (bbox: Box["bbox"]) => void;
  onReset: () => void;
  onResize: (id: string, bbox: Box["bbox"]) => void;
}) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null),
    pointers = useRef(new Map<number, Point>()),
    gesture = useRef<{
      point: Point;
      cx: number;
      cy: number;
      distance?: number;
      zoom: number;
    } | null>(null);
  const [view, setView] = useState({
      zoom: 1,
      cx: photo.width / 2,
      cy: photo.height / 2,
    }),
    [mode, setMode] = useState<"draw" | "pan">("draw"),
    [draft, setDraft] = useState<{ start: Point; end: Point } | null>(null);
  const resizeRef=useRef<{id:string;pointerId:number;anchor:Point;original:Box["bbox"];bbox:Box["bbox"]}|null>(null);
  const [resizePreview,setResizePreview]=useState<{id:string;bbox:Box["bbox"]}|null>(null);
  const [pixelUnit,setPixelUnit]=useState(photo.width/800);
  function cancelResize(){resizeRef.current=null;setResizePreview(null);}
  const mousePivot=useRef<Point|null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  function bounded(zoom: number, cx: number, cy: number) {
    zoom = Math.max(0.5, Math.min(8, zoom));
    const w = photo.width / zoom,
      h = photo.height / zoom;
    return {
      zoom,
      cx:
        zoom <= 1
          ? Math.max(photo.width-w/2,Math.min(w/2,cx))
          : Math.max(w / 2, Math.min(photo.width - w / 2, cx)),
      cy:
        zoom <= 1
          ? Math.max(photo.height-h/2,Math.min(h/2,cy))
          : Math.max(h / 2, Math.min(photo.height - h / 2, cy)),
    };
  }
  function zoomBy(factor: number) {
    pointers.current.clear();gesture.current=null;
    cancelResize();
    setDraft(null);
    setView(v => {
      const zoom=Math.max(0.5,Math.min(8,v.zoom*factor));
      const pivot=mousePivot.current||{x:v.cx,y:v.cy};
      const ratio=v.zoom/zoom;
      return bounded(zoom,pivot.x+(v.cx-pivot.x)*ratio,pivot.y+(v.cy-pivot.y)*ratio);
    });
  }
  function fit() {
    pointers.current.clear();gesture.current=null;
    cancelResize();
    setDraft(null);
    setView({ zoom: 1, cx: photo.width / 2, cy: photo.height / 2 });
  }
  function point(x: number, y: number): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }
  useEffect(() => {
    setDraft(null);
    pointers.current.clear();
    gesture.current = null;
    cancelResize();
  }, [category, side, canDraw]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      mousePivot.current=point(e.clientX,e.clientY);
      zoomBy(e.deltaY>0?0.85:1.18);
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [photo.width, photo.height]);
  useEffect(()=>{
    const element=svg.current;if(!element)return;
    const measure=()=>{const matrix=element.getScreenCTM();if(matrix){const scale=Math.hypot(matrix.a,matrix.b);if(scale>0)setPixelUnit(1/scale);}};
    const observer=new ResizeObserver(measure);observer.observe(element);measure();
    return()=>observer.disconnect();
  },[view.zoom,photo.width,photo.height]);
  const boxes = photo.boxes.filter((b) => !category || b.category === category),
    w = photo.width / view.zoom,
    h = photo.height / view.zoom;
  return (
    <>
      <div className="canvas-tools" aria-label={t("Outils photo")}>
        <button aria-label={t("Dézoomer")} onClick={() => zoomBy(1 / 1.4)}>
          −
        </button>
        <span>{Math.round(view.zoom * 100)} %</span>
        <button aria-label={t("Zoomer")} onClick={() => zoomBy(1.4)}>
          +
        </button>
        <button onClick={fit}>{t("Ajuster à l’écran")}</button>
        <button
          aria-pressed={mode === "pan"}
          onClick={() => {
            cancelResize();
            setMode(mode === "pan" ? "draw" : "pan");
            setDraft(null);
          }}
        >
          {" "}
          {t("Déplacer l’image")}{" "}
        </button>
        {category && (
          <button
            onClick={() => {
              setDraft(null);
              cancelResize();
              onReset();
            }}
          >
            {" "}
            {t("Réinitialiser les cadres de l’étape")}{" "}
          </button>
        )}
      </div>
      <svg
        ref={svg}
        className={`canvas zoom-canvas ${mode === "pan" ? "panning" : ""}`}
        viewBox={`${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`}
        role="group"
        aria-label={t("Photo à annoter par glisser-déposer")}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if(resizeRef.current)cancelResize();
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const pts = [...pointers.current.values()];
          const v = viewRef.current;
          if (pts.length === 2) {
            setDraft(null);
            gesture.current = {
              point: pts[0],
              cx: v.cx,
              cy: v.cy,
              distance: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
              zoom: v.zoom,
            };
            return;
          }
          gesture.current = {
            point: { x: e.clientX, y: e.clientY },
            cx: v.cx,
            cy: v.cy,
            zoom: v.zoom,
          };
          if (canDraw && mode === "draw") {
            const p = point(e.clientX, e.clientY);
            setDraft({ start: p, end: p });
          }
        }}
        onPointerMove={(e) => {
          if(e.pointerType!=="touch")mousePivot.current=point(e.clientX,e.clientY);
          const resize=resizeRef.current;
          if(resize?.pointerId===e.pointerId){
            pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
            const bbox=makeBox(resize.anchor,point(e.clientX,e.clientY),photo.width,photo.height);
            if(bbox[2]>=3&&bbox[3]>=3){resize.bbox=bbox;setResizePreview({id:resize.id,bbox});}
            return;
          }
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const pts = [...pointers.current.values()],
            g = gesture.current;
          if (!g) return;
          if (pts.length === 2 && g.distance) {
            const distance = Math.hypot(
              pts[1].x - pts[0].x,
              pts[1].y - pts[0].y,
            );
            setView(bounded((g.zoom * distance) / g.distance, g.cx, g.cy));
            return;
          }
          if (mode === "pan") {
            const a = point(g.point.x, g.point.y),
              b = point(e.clientX, e.clientY);
            setView(
              bounded(
                g.zoom,
                viewRef.current.cx + a.x - b.x,
                viewRef.current.cy + a.y - b.y,
              ),
            );
            g.point = { x: e.clientX, y: e.clientY };
            return;
          }
          if (draft) setDraft({ ...draft, end: point(e.clientX, e.clientY) });
        }}
        onPointerCancel={(e) => {
          cancelResize();
          pointers.current.delete(e.pointerId);
          setDraft(null);
          gesture.current = null;
        }}
        onPointerUp={(e) => {
          const resize=resizeRef.current;
          if(resize?.pointerId===e.pointerId){
            pointers.current.delete(e.pointerId);
            if(canDraw&&mode==="draw"&&resize.bbox.some((value,i)=>value!==resize.original[i]))onResize(resize.id,resize.bbox);
            cancelResize();gesture.current=null;return;
          }
          const pinch = !!gesture.current?.distance;
          pointers.current.delete(e.pointerId);
          if (draft && !pinch && mode === "draw" && canDraw) {
            const bbox = makeBox(
              draft.start,
              point(e.clientX, e.clientY),
              photo.width,
              photo.height,
            );
            if (bbox[2] >= 3 && bbox[3] >= 3) onAdd(bbox);
          }
          setDraft(null);
          gesture.current = null;
        }}
      >
        <image href={url} width={photo.width} height={photo.height} />
        {boxes.map((b, i) => {
          const bbox=resizePreview?.id===b.id?resizePreview.bbox:b.bbox;
          const [x,y,width,height]=bbox;
          const color=b.category==="macaw"?"#ffbf67":b.side==="right"?"#f6b38a":"#79ffca";
          const editable=canDraw&&mode==="draw"&&b.category===category&&b.birdId===(photo.birdId||"")&&(category==="macaw"||b.side===side);
          const corners=[{x,y},{x:x+width,y},{x,y:y+height},{x:x+width,y:y+height}];
          return <g key={b.id}>
            <rect data-box-id={b.id} x={x} y={y} width={width} height={height} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke"/>
            <title>{i+1}. {b.category} · {b.side}</title>
            {editable&&corners.map((corner,index)=><g key={index} data-resize-box={b.id} data-corner={index} role="button" tabIndex={0}
              aria-label={t("Redimensionner le cadre {number}, coin {corner}",{number:i+1,corner:index+1})}
              style={{cursor:index===0||index===3?"nwse-resize":"nesw-resize"}}
              onPointerDown={event=>{
                if(event.button!==0)return;event.preventDefault();event.stopPropagation();setDraft(null);
                svg.current?.setPointerCapture(event.pointerId);
                pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
                resizeRef.current={id:b.id,pointerId:event.pointerId,anchor:corners[3-index],original:b.bbox,bbox:b.bbox};
                setResizePreview({id:b.id,bbox:b.bbox});
              }}
              onKeyDown={event=>{
                if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key))return;
                event.preventDefault();const delta=event.shiftKey?10:1;
                const end={x:corner.x+(event.key==="ArrowLeft"?-delta:event.key==="ArrowRight"?delta:0),y:corner.y+(event.key==="ArrowUp"?-delta:event.key==="ArrowDown"?delta:0)};
                const changed=makeBox(corners[3-index],end,photo.width,photo.height);
                if(changed[2]>=3&&changed[3]>=3)onResize(b.id,changed);
              }}>
              <circle cx={corner.x} cy={corner.y} r={14*pixelUnit} fill="transparent"/>
              <circle cx={corner.x} cy={corner.y} r={5*pixelUnit} fill="white" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
            </g>)}
          </g>;
        })}
        {draft &&
          (() => {
            const b = makeBox(
              draft.start,
              draft.end,
              photo.width,
              photo.height,
            );
            return (
              <rect
                x={b[0]}
                y={b[1]}
                width={b[2]}
                height={b[3]}
                fill="#ffffff22"
                stroke="white"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}
      </svg>
      {canDraw&&mode==="draw"&&<p className="small">{t("Ajustez un cadre avec ses poignées rondes. Au clavier : flèches, ou Maj + flèches pour un déplacement plus grand.")}</p>}
      <p className="small">
        {" "}
        {t(
          "Molette ou pincement pour zoomer. Activez « Déplacer l’image » pour explorer, puis désactivez-le pour tracer. « Ajuster à l’écran » restaure la vue entière.",
        )}{" "}
      </p>
    </>
  );
}
