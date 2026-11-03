"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function ViewReference({
  value,
  onChange,
}: {
  value: { azimuth: number; elevation: number } | null | undefined;
  onChange: (v: { azimuth: number; elevation: number } | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
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
  }, [value?.azimuth, value?.elevation]);
  const angles = [
    ["Face", 0],
    ["Trois-quarts droit", 45],
    ["Profil droit", 90],
    ["Arrière droit", 135],
    ["Dos", 180],
    ["Arrière gauche", 225],
    ["Profil gauche", 270],
    ["Trois-quarts gauche", 315],
  ] as const;
  return (
    <div className="reference">
      <div
        ref={host}
        role="img"
        aria-label="Ara 3D cadré comme sur une photo selon l’orientation choisie"
      />
      {failed && (
        <p>
          La 3D n’est pas disponible sur ce navigateur. Les boutons restent
          utilisables : « droit » et « gauche » désignent les côtés de l’animal.
        </p>
      )}
      <p className="small">
        Comparez la silhouette à votre photo : le modèle est cadré depuis le
        point de vue choisi. Les côtés sont anatomiques. Modèle schématique
        provisoire.
      </p>
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
      <label>
        Hauteur de prise de vue
        <select
          value={value?.elevation ?? 0}
          disabled={!value}
          onChange={(e) =>
            value && onChange({ ...value, elevation: Number(e.target.value) })
          }
        >
          <option value={0}>À hauteur de l’ara</option>
          <option value={30}>Vue de dessus (+30°)</option>
          <option value={-30}>Vue de dessous (−30°)</option>
        </select>
      </label>
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        Point de vue inconnu
      </button>
    </div>
  );
}
