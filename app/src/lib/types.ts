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
  /** She decided this idea has no story. story null and noStory false means not picked yet. */
  noStory: boolean;
  series: string; ep: number | null;
  safety: 'blinded' | 'clear';
  origin: Origin;
  brief: string;
  sourceLink: { label: string; url: string } | null;
  /** Channels it's planned for, from the channel option list. */
  channels: string[];
  /** Links beyond the brief and the source: short brief, story card, storyboard, hooks file, assets. url is a web link or a repo path. */
  links: { label: string; url: string }[];
  /** Which parts of the person's inner world it speaks to (keys of config.innerWorld). Optional. */
  innerWorld: (keyof InnerWorld)[];
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
export type OptKey = 'type' | 'feeling' | 'style' | 'onCamera' | 'voice' | 'harmHelp' | 'cta' | 'hookFormat' | 'series' | 'safety' | 'channel';
/** The channel list until a config version carries its own (ideas.md's Channels column). */
export const DEFAULT_CHANNELS = ['TikTok', 'LinkedIn', 'LinkedIn newsletter', 'YouTube', 'Mellonmail', 'community'];
/** What each platform reports, in the order she'd copy them. Signals store them by these keys (posts and signals tables). */
export const METRICS: Record<string, [string, string][]> = {
  TikTok: [['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['saves', 'Saves'], ['shares', 'Shares'], ['avg_watch_seconds', 'Average watch time (seconds)']],
  YouTube: [['views', 'Views'], ['watch_hours', 'Watch time (hours)'], ['avg_view_seconds', 'Average view duration (seconds)'], ['likes', 'Likes'], ['comments', 'Comments'], ['subscribers_gained', 'Subscribers gained']],
  Mellonmail: [['sent', 'Sent'], ['open_rate', 'Open rate (%)'], ['click_rate', 'Click rate (%)'], ['unsubscribes', 'Unsubscribes'], ['replies', 'Replies']],
  LinkedIn: [['impressions', 'Impressions'], ['reactions', 'Reactions'], ['comments', 'Comments'], ['reposts', 'Reposts']],
  'LinkedIn newsletter': [['views', 'Article views'], ['reactions', 'Reactions'], ['comments', 'Comments'], ['subscribers_gained', 'Subscribers gained']],
  community: [['replies', 'Replies'], ['reactions', 'Reactions']],
};
export const INNER_WORLD_LABEL: Record<string, string> = { coreProblem: 'the core problem', hurting: "what's hurting", tried: "what they've tried", thinking: 'what they think but don\'t say', afraid: 'what they fear', wants: 'what they want' };
export interface InnerWorld { coreProblem: string; hurting: string; tried: string; thinking: string; afraid: string; wants: string }
export interface Version { n: number; date: string; label: string; changes: { field: string; from: string; to: string }[]; /** Set on versions made in this tab, until saved. */ key?: string }
export interface Block { outfit: string; groups: { setup: string; ids: string[] }[] }

export interface Data {
  schema: number;
  ideas: Idea[];
  takes: Record<number, Take>;
  stories: Record<string, Story>;
  opts: Record<OptKey, string[]>;
  retired: Record<OptKey, string[]>;
  pillars: Pillar[];
  config: { mission: string; throughline: string; person: string; vibe: string; advice: string; cadenceWeeks: number; lastCheckin: string; filmWeekday?: number;
    /** From foundation.md, added in step 2. Missing on configs saved before then. */
    innerWorld?: Partial<InnerWorld>; personas?: Partial<Record<Persona, string>>; gutQuestion?: string };
  versions: Version[];
  targets: Record<string, [number, number]>;
  includeProposed: boolean;
  locked: Record<string, string>;
  filmed: Record<string, boolean>;
  prepDone: Record<string, boolean>;
  ros: Block[] | null;
}
