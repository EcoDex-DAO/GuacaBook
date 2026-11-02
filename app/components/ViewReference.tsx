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
    camera.position.set(5.8, 4.3, 7.5);
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
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.016, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0xb9cbb8 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    scene.add(ring);
    function label(text: string, x: number, y: number, z: number) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 64;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#193b32";
      ctx.font = "bold 26px Arial";
      ctx.textAlign = "center";
      ctx.fillText(text, 128, 42);
      const tex = new THREE.CanvasTexture(c);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, depthTest: false }),
      );
      sprite.position.set(x, y, z);
      sprite.scale.set(1.65, 0.41, 1);
      scene.add(sprite);
    }
    label("DROITE", 1.35, 1.5, 0);
    label("GAUCHE", -1.35, 1.5, 0);
    label("AVANT · BEC", 0, 0.08, 2.5);
    if (value) {
      const a = (value.azimuth * Math.PI) / 180,
        e = (value.elevation * Math.PI) / 180;
      const pos = new THREE.Vector3(
        2.2 * Math.sin(a) * Math.cos(e),
        1.3 + 2.2 * Math.sin(e),
        2.2 * Math.cos(a) * Math.cos(e),
      );
      const marker = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.26, 0.23),
        new THREE.MeshStandardMaterial({ color: 0xdc733f }),
      );
      marker.add(body);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.13, 0.22, 16),
        new THREE.MeshStandardMaterial({ color: 0x273d35 }),
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.19;
      marker.add(lens);
      marker.position.copy(pos);
      marker.lookAt(0, 1.3, 0);
      scene.add(marker);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          pos,
          new THREE.Vector3(0, 1.3, 0),
        ]),
        new THREE.LineDashedMaterial({
          color: 0xdc733f,
          dashSize: 0.1,
          gapSize: 0.06,
        }),
      );
      line.computeLineDistances();
      scene.add(line);
    }
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
        aria-label="Ara schématique 3D avec côtés anatomiques et position de la caméra"
      />
      {failed && (
        <p>
          La 3D n’est pas disponible sur ce navigateur. Les boutons restent
          utilisables : « droit » et « gauche » désignent les côtés de l’animal.
        </p>
      )}
      <p className="small">
        Ara 3D schématique, bec vers « avant ». La caméra orange indique où vous
        vous trouvez par rapport à l’animal. Ce référentiel provisoire pourra
        être remplacé par votre modèle.
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
            {label}
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
