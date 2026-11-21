export type Status = 'proposed' | 'on deck' | 'in progress' | 'scheduled' | 'published' | 'backlog' | 'rejected';
export type Origin = 'experience' | 'read' | 'research' | 'client' | 'agent';
export type Gut = 'yes' | 'not sure' | 'no';
export type Persona = 'Dawn' | 'Alex' | 'Paloma';

export interface Hook { spoken: string; onscreen: string; frame: string; format: string; payoff: string; rec: boolean }
/** A storyboard beat. `gap`: where her words would make it better ("needs you").
 *  `waitingOn`: blocked on someone else's permission; not her gap (D46). */
export interface Beat { t: string; gap?: string; waitingOn?: string }
/** A script line. d: drafted by an agent. g: what her words would add. */
export interface ScriptLine { t: string; d: boolean; g?: string }
export interface Look { setup: string; outfit: string; location: string; props: string; edit: string }
export interface Note { who: string; text: string }
export interface Rehook { field: string; from: string; to: string }

export interface Idea {
  id: string;
  title: string;
  status: Status;
  week: string | null;
  postDate: string | null;
  summary: string;
  pillar: string; type: string; style: string; onCamera: string; voice: string;
  feeling: string; harmHelp: string; cta: string; ctaLink?: string;
  take: number | null;
  story: string | null;
  series: string; ep: number | null;
  safety: 'blinded' | 'clear';
  origin: Origin;
  brief: string;
  sourceLink: { label: string; url: string } | null;
  hooks: Hook[];
  chosen: number | 'own' | null;
  ownHook?: string;
  rehook: Rehook | null;
  beats: Beat[];
  gut: Partial<Record<Persona, Gut>>;
  tips: Record<Persona, string> | null;
  notes: Note[];
  drafted: string[];
  script: ScriptLine[];
  prep: string[];
  slate: string;
  look: Look;
  rejectNote?: string;
  addedAfterLock?: boolean;
  added?: number;
  /** Past-week rows: a light record only (example data until the real history is imported). */
  past?: boolean;
}

export interface Take { short: string; text: string; pillar: string; onCamera: string }
export interface Story { title: string; pillar: string; known: string; missing: string; onCamera: string }
export interface Pillar { name: string; color: string; desc: string; carries: string }
export type OptKey = 'type' | 'feeling' | 'style' | 'onCamera' | 'voice' | 'harmHelp' | 'cta' | 'hookFormat' | 'series' | 'safety';
export interface Version { n: number; date: string; label: string; changes: { field: string; from: string; to: string }[] }
export interface Block { outfit: string; groups: { setup: string; ids: string[] }[] }

export interface Data {
  schema: number;
  ideas: Idea[];
  takes: Record<number, Take>;
  stories: Record<string, Story>;
  opts: Record<OptKey, string[]>;
  retired: Record<OptKey, string[]>;
  pillars: Pillar[];
  config: { mission: string; throughline: string; person: string; vibe: string; advice: string; cadenceWeeks: number; lastCheckin: string; filmWeekday?: number };
  versions: Version[];
  targets: Record<string, [number, number]>;
  includeProposed: boolean;
  locked: Record<string, string>;
  filmed: Record<string, boolean>;
  prepDone: Record<string, boolean>;
  ros: Block[] | null;
}
