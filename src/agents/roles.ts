import type { AgentId, ResourceType } from '../sim/types';
import { ROLE_DEPLOY } from '../sim/actions';

export const AGENT_IDS: AgentId[] = ['fire', 'hospital', 'utilities', 'press'];

export interface Role {
  name: string;
  title: string;
  wants: string;
  personality: string;
  domain: string[];
  deployable: ResourceType[];
  canCutPower?: true;
  canBroadcast?: true;
  color: number;
}

export const ROLES: Record<AgentId, Role> = {
  fire: {
    name: 'Chief Okafor',
    title: 'Fire Chief',
    wants: 'Crews on rescues right now; sandbags where people live.',
    personality: 'Impulsive, brave, blunt. Hates waiting for permission.',
    domain: ['people.danger', 'people.harmed', 'people.rescued', 'bus.stranded'],
    deployable: ROLE_DEPLOY.fire,
    color: 0xd8432f,
  },
  hospital: {
    name: 'Dr. Lindqvist',
    title: 'Hospital Director',
    wants: 'Power and fuel priority for the hospital and its patients.',
    personality: 'Cautious, precise, quietly stubborn about patient safety.',
    domain: ['power.outage', 'power.refuel', 'deck.generator_fault'],
    deployable: ROLE_DEPLOY.hospital,
    color: 0xf2efe9,
  },
  utilities: {
    name: 'Ravi Menon',
    title: 'Utilities & Roads Lead',
    wants: 'Cut power to flooded districts and protect the substation.',
    personality: 'Methodical, dry, thinks in systems and failure points.',
    domain: ['power.outage', 'hazard.livewater', 'deck.bridge_collapse', 'deck.substation_alarm'],
    deployable: ROLE_DEPLOY.utilities,
    canCutPower: true,
    color: 0x3f8fd8,
  },
  press: {
    name: 'Mara Quist',
    title: 'Press & Public Officer',
    wants: 'Get a clear public statement out fast; kill rumours early.',
    personality: 'Quick, persuasive, a little anxious about public trust.',
    domain: ['rumour.new', 'deck.viral_livestream', 'deck.rumour_dam'],
    deployable: ROLE_DEPLOY.press,
    canBroadcast: true,
    color: 0x9b6bd6,
  },
};
