"use client";
import HeightGlyph from "./HeightGlyph";
import { useI18n } from "./I18n";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function ViewReference({
  value,
  onChange,
}: {
  value: { azimuth: number; elevation: number } | null | undefined;
  onChange: (v: { azimuth: number; elevation: number } | null) => void;
}) {
  const { t } = useI18n();
  const [helpOpen,setHelpOpen]=useState(false);
  const host = useRef<HTMLDivElement>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!helpOpen || !host.current) return;
    setFailed(false);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    const element = host.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef3eb");
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
    const az = ((value?.azimuth ?? 0) * Math.PI) / 180,
      el = ((value?.elevation ?? 0) * Math.PI) / 180;
    camera.position.set(
      5.5 * Math.sin(az) * Math.cos(el),
      1 + 5.5 * Math.sin(el),
      5.5 * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(0, 1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 2.7));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(4, 7, 5);
    scene.add(light);
    function ellipsoid(
      color: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 16),
        new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
      );
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      scene.add(mesh);
      return mesh;
    }
    ellipsoid(0xe2b442, 0, 1.1, 0, 0.48, 0.85, 0.45); // chest
    ellipsoid(0x238591, 0, 1.1, -0.23, 0.47, 0.8, 0.3);
    ellipsoid(0x2a8096, 0.43, 1.05, 0, 0.16, 0.73, 0.38); // anatomical right
    ellipsoid(0x3aaa87, -0.43, 1.05, 0, 0.16, 0.73, 0.38);
    ellipsoid(0x38a28b, 0, 2, 0.23, 0.4, 0.44, 0.42);
    ellipsoid(0xf4eed7, 0.32, 2, 0.44, 0.1, 0.23, 0.23);
    ellipsoid(0xf4eed7, -0.32, 2, 0.44, 0.1, 0.23, 0.23);
    ellipsoid(0x132e32, 0.407, 2.06, 0.46, 0.045, 0.055, 0.055);
    ellipsoid(0x132e32, -0.407, 2.06, 0.46, 0.045, 0.055, 0.055);
    ellipsoid(0x29383b, 0, 1.92, 0.65, 0.22, 0.3, 0.22);
    const tail = ellipsoid(0x267b91, 0, -0.05, -0.4, 0.17, 0.95, 0.13);
    tail.rotation.x = -0.28;
    for (const x of [-0.23, 0.23])
      ellipsoid(0x5c635a, x, 0.23, 0.2, 0.08, 0.17, 0.12);
    const resize = () => {
      const w = element.clientWidth;
      renderer.setSize(w, 280);
      camera.aspect = w / 280;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => {
      observer.disconnect();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
        }
        if ("material" in obj) {
          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const m of materials) {
            if (m instanceof THREE.SpriteMaterial) m.map?.dispose();
            (m as THREE.Material).dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [helpOpen,value?.azimuth, value?.elevation]);
  const angles = [
    [t("Face"), 0],
    [t("Trois-quarts droit"), 45],
    [t("Profil droit"), 90],
    [t("Arrière droit"), 135],
    [t("Dos"), 180],
    [t("Arrière gauche"), 225],
    [t("Profil gauche"), 270],
    [t("Trois-quarts gauche"), 315],
  ] as const;
  return (
    <div className="reference">
      <details className="viewpoint-help" open={helpOpen} onToggle={event=>setHelpOpen(event.currentTarget.open)}>
        <summary>{t("Aide : comprendre le point de vue")}</summary>
        {helpOpen&&<div className="viewpoint-help-content">
      <div
        ref={host}
        role="img"
        aria-label={t(
          "Ara 3D cadré comme sur une photo selon l’orientation choisie",
        )}
      />
      {failed && (
        <p>
          {" "}
          {t(
            "La 3D n’est pas disponible sur ce navigateur. Les boutons restent utilisables : « droit » et « gauche » désignent les côtés de l’animal.",
          )}{" "}
        </p>
      )}
      <p className="small">
        {" "}
        {t(
          "Comparez la silhouette à votre photo : le modèle est cadré depuis le point de vue choisi. Les côtés sont anatomiques. Modèle schématique provisoire.",
        )}{" "}
      </p>
        </div>}
      </details>
      <div className="angles">
        {angles.map(([label, a]) => (
          <button
            type="button"
            key={a}
            aria-pressed={value?.azimuth === a}
            onClick={() =>
              onChange({ azimuth: a, elevation: value?.elevation ?? 0 })
            }
          >
            <img src={`/reference/${a}.png`} alt="" width="90" height="80" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <fieldset className="height-picker">
        <legend>{t("Hauteur de prise de vue")}</legend>
        <div className="height-options">
          {([
            [30, "Au-dessus de l’ara"],
            [0, "À hauteur de l’ara"],
            [-30, "En dessous de l’ara"],
          ] as const).map(([elevation,label])=><button type="button" key={elevation}
            disabled={!value} aria-pressed={value?.elevation===elevation}
            onClick={()=>value&&onChange({...value,elevation})}>
            <HeightGlyph elevation={elevation}/><span>{t(label)}</span>
          </button>)}
        </div>
        {!value&&<p className="small">{t("Choisissez d’abord une orientation pour préciser la hauteur.")}</p>}
      </fieldset>
      <button className="unknown-viewpoint" type="button" aria-pressed={value===null} onClick={()=>onChange(null)}>
        <HeightGlyph elevation={null}/><span>{t("Point de vue inconnu")}</span>
      </button>
    </div>
  );
}
