import { DANGER_WATER } from '../sim/people';
import type { AgentId, DistrictId, SimState } from '../sim/types';
import { DISTRICTS, cellKey } from '../sim/types';

const r2 = (n: number) => Math.round(n * 100) / 100;

function floodedDistricts(s: SimState): DistrictId[] {
  return DISTRICTS.filter((d) => s.cells.flat().some((c) => c.district === d && c.type !== 'river' && c.water > DANGER_WATER));
}

/** Public facts every agent sees */
function common(s: SimState) {
  return {
    gameMinute: Math.floor(s.t / 60),
    rain: r2(s.rain),
    floodedDistricts: floodedDistricts(s),
    bridgeIntact: s.bridgeIntact,
    idleTokens: s.tokens.filter((t) => !t.cell).map((t) => ({ id: t.id, type: t.type })),
  };
}

/** Partial observation: each agent sees only its private fields (design §6.3) plus public facts. */
export function observe(s: SimState, id: AgentId): object {
  const base = common(s);
  switch (id) {
    case 'fire':
      return {
        ...base,
        rescueCalls: s.cells.flat()
          .filter((c) => cellKey(c) in s.peopleInDanger && c.residents > 0)
          .map((c) => ({ cell: { x: c.x, y: c.y }, district: c.district, residents: Math.round(c.residents), minutesInDanger: Math.round(s.peopleInDanger[cellKey(c)] / 60) })),
        crews: s.tokens.filter((t) => t.type === 'crew').map((t) => ({ id: t.id, cell: t.cell, busy: t.busyUntil > s.t })),
        harmed: Math.round(s.harmed),
      };
    case 'hospital': {
      const h = s.cells.flat().find((c) => c.type === 'hospital')!;
      return {
        ...base,
        generatorFuelMinutes: r2(s.generatorFuel),
        generatorFuel: r2(s.generatorFuel),
        hospitalOnGrid: !s.substationFlooded && !s.cutDistricts.includes(h.district),
        hospitalPowered: h.powered,
        patientsOnLifeSupport: 14,
        fuelTruck: s.tokens.find((t) => t.type === 'fuel')?.cell ? 'en route' : 'available',
      };
    }
    case 'utilities': {
      const sub = s.cells.flat().find((c) => c.type === 'substation')!;
      return {
        ...base,
        substationWater: r2(sub.water),
        substationFlooded: s.substationFlooded,
        substationCell: { x: sub.x, y: sub.y },
        cutDistricts: s.cutDistricts,
        liveWaterHazards: s.liveWater.length,
        roadsUnderWater: s.cells.flat().filter((c) => c.type === 'road' && c.water > DANGER_WATER).length,
      };
    }
    case 'press':
      return {
        ...base,
        rumours: s.rumours.filter((r) => !r.countered).map((r) => ({ id: r.id, text: r.text, district: r.district, severity: r.severity })),
        compliance: Object.fromEntries(DISTRICTS.map((d) => [d, r2(s.compliance[d])])),
        callVolume: Math.round(10 + s.rumours.filter((r) => !r.countered).length * 15 + Object.keys(s.peopleInDanger).length * 5),
      };
  }
}
