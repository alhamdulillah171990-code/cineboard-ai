export type Genre = string;
export type VisualStyle = string;
export type VisualEffect = string;
export type Language = 'Indonesia' | 'English' | 'Arabic';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '2.35:1';
export type Duration = '15s' | '30s' | '1m' | '2m' | '3m' | '4m' | '5m' | 'Custom';
export type DurationPerShot = '5s' | '10s' | '15s';
export type ShotMode = 'Auto' | 'Custom';
export type StoryFormat = 'dialog' | 'narasi' | 'dialog_narasi';

export interface DialogueLine {
  character: string;
  line: string;
}

export interface ShotContent {
  dialog?: DialogueLine[];
  narration?: string;
}

export interface RandomIdea {
  title: string;
  story: string;
  message: string;
}

export interface ProjectInput {
  title: string;
  storyInput: string;
  genre: Genre;
  style: VisualStyle;
  visualEffect: VisualEffect;
  language: Language;
  aspectRatio: AspectRatio;
  duration: Duration;
  durationPerShot: DurationPerShot;
  storyFormat: StoryFormat;
  shotMode: ShotMode;
  customShot: number;
  mainMessage: string;
  autoMessage: boolean;
}

export interface Shot {
  number: number;
  scene: string;
  duration: string;
  camera: string;
  movement: string;
  transition: string;
  description: string;
  visualPrompt: string;
  content?: ShotContent;
  durationPerShot: DurationPerShot;
  videoVisualPrompt?: string;
  imageUrl?: string;
  locked?: boolean;
}

export interface CastingItem {
  name: string;
  description: string;
  visualPrompt: string;
  imageUrl?: string;
  locked?: boolean;
}

export interface Scene {
  number: number;
  title: string;
  description: string;
}

export interface FilmSystemOutput {
  title: string;
  logline: string;
  synopsis: string;
  mainMessage: string;
  characters: string;
  masterConceptImageUrl?: string;
  masterConceptPrompt: string;
  casting: {
    actors: CastingItem[];
    elements: CastingItem[];
    locations: CastingItem[];
    time: string;
    emotions: string;
    wardrobe: string;
  };
  scenes: Scene[];
  shots: Shot[];
  captions: {
    short: string;
    story: string;
    viral: string;
  };
  formats: {
    reels: string;
    story: string;
  };
}

export interface Project {
  id: string;
  name: string;
  userId: string;
  input: ProjectInput;
  output: FilmSystemOutput | null;
  lastUpdated: string;
}
