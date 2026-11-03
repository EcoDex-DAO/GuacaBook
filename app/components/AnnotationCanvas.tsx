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
}: {
  photo: Photo;
  url: string;
  category?: Box["category"];
  side: Box["side"];
  canDraw: boolean;
  onAdd: (bbox: Box["bbox"]) => void;
  onReset: () => void;
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
          ? photo.width / 2
          : Math.max(w / 2, Math.min(photo.width - w / 2, cx)),
      cy:
        zoom <= 1
          ? photo.height / 2
          : Math.max(h / 2, Math.min(photo.height - h / 2, cy)),
    };
  }
  function zoomBy(factor: number) {
    setDraft(null);
    setView((v) => bounded(v.zoom * factor, v.cx, v.cy));
  }
  function fit() {
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
  }, [category, side]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      setDraft(null);
      setView((v) =>
        bounded(v.zoom * (e.deltaY > 0 ? 0.85 : 1.18), v.cx, v.cy),
      );
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [photo.width, photo.height]);
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
        role="img"
        aria-label={t("Photo à annoter par glisser-déposer")}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
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
          pointers.current.delete(e.pointerId);
          setDraft(null);
          gesture.current = null;
        }}
        onPointerUp={(e) => {
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
        {boxes.map((b, i) => (
          <g key={b.id}>
            <rect
              x={b.bbox[0]}
              y={b.bbox[1]}
              width={b.bbox[2]}
              height={b.bbox[3]}
              fill="none"
              stroke={
                b.category === "macaw"
                  ? "#ffbf67"
                  : b.side === "right"
                    ? "#f6b38a"
                    : "#79ffca"
              }
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
            <title>
              {i + 1}. {b.category} · {b.side}
            </title>
          </g>
        ))}
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
      <p className="small">
        {" "}
        {t(
          "Molette ou pincement pour zoomer. Activez « Déplacer l’image » pour explorer, puis désactivez-le pour tracer. « Ajuster à l’écran » restaure la vue entière.",
        )}{" "}
      </p>
    </>
  );
}
