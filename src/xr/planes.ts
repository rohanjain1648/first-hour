import { createSystem, Vector3, XRMesh, XRPlane } from '@iwsdk/core';
import type { PlaneInfo } from './table';

interface RawPlane {
  orientation?: string;
  semanticLabel?: string;
  polygon?: { x: number; y: number; z: number }[];
}

/** Reads detected planes and labelled furniture meshes into plain PlaneInfo records. */
export class PlaneReaderSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  private tmp!: Vector3;

  init(): void {
    this.tmp = new Vector3();
  }

  /** Floor height from a floor plane/mesh, or null when unknown. */
  floorY(): number | null {
    let floor: number | null = null;
    for (const e of this.queries.planes.entities) {
      const p = e.getValue(XRPlane, '_plane') as RawPlane | undefined;
      if (p?.semanticLabel?.toLowerCase() !== 'floor' || !e.object3D) continue;
      e.object3D.getWorldPosition(this.tmp);
      floor = floor === null ? this.tmp.y : Math.min(floor, this.tmp.y);
    }
    return floor;
  }

  collect(): PlaneInfo[] {
    const out: PlaneInfo[] = [];
    for (const e of this.queries.planes.entities) {
      const p = e.getValue(XRPlane, '_plane') as RawPlane | undefined;
      if (!p || !e.object3D) continue;
      e.object3D.getWorldPosition(this.tmp);
      let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
      for (const v of p.polygon ?? []) {
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
      }
      out.push({
        center: { x: this.tmp.x, y: this.tmp.y, z: this.tmp.z },
        width: Math.max(0.01, maxX - minX),
        depth: Math.max(0.01, maxZ - minZ),
        label: p.semanticLabel,
        horizontal: p.orientation !== 'vertical',
      });
    }
    for (const e of this.queries.meshes.entities) {
      if (!e.getValue(XRMesh, 'isBounded3D')) continue;
      const label = e.getValue(XRMesh, 'semanticLabel') as string;
      if (label !== 'table' && label !== 'desk') continue;
      const min = e.getVectorView(XRMesh, 'min');
      const max = e.getVectorView(XRMesh, 'max');
      if (!e.object3D) continue;
      e.object3D.getWorldPosition(this.tmp);
      out.push({
        // bounded meshes report extents relative to their pose; the top face is the playing surface
        center: { x: this.tmp.x + (min[0] + max[0]) / 2, y: this.tmp.y + max[1], z: this.tmp.z + (min[2] + max[2]) / 2 },
        width: Math.abs(max[0] - min[0]),
        depth: Math.abs(max[2] - min[2]),
        label,
        horizontal: true,
      });
    }
    return out;
  }
}
