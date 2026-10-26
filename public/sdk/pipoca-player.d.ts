// Tipos do SDK do pipoca-player.

export interface Subtitle {
  /** URL do arquivo .vtt (o servidor das legendas precisa enviar CORS) */
  src: string;
  lang?: string;
  label?: string;
  default?: boolean;
}

export interface NextVideo {
  /** Se informado, o botão "Assistir" abre essa URL (ex.: outro /embed). Sem url, só dispara o evento "next". */
  url?: string;
  title?: string;
  poster?: string;
}

export interface PlayerOptions {
  /** URL do vídeo (.m3u8 ou arquivo direto). Obrigatório. */
  src: string;
  /** Onde o player está hospedado. Se o SDK veio do mesmo lugar, pode omitir. */
  baseUrl?: string;
  /** "hls" ou "mp4". Por padrão detecta pela extensão .m3u8. */
  type?: 'hls' | 'mp4';
  title?: string;
  desc?: string;
  poster?: string;
  year?: string | number;
  /** Classificação indicativa, ex.: "14" */
  age?: string;
  tags?: string[] | string;
  /** Chave do "continuar de onde parou". Padrão: derivada da URL sem query. */
  id?: string;
  /** Começar em N segundos (ignora o "continuar de onde parou") */
  start?: number;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** false desliga o "continuar de onde parou" */
  resume?: boolean;
  /** Cor de destaque, ex.: "#ff2a2a" */
  accent?: string;
  brand?: string;
  engine?: 'auto' | 'native' | 'hlsjs';
  subs?: Subtitle[];
  next?: NextVideo;
}

export interface PlayerState {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  buffering: boolean;
  phase: 'resume' | 'boot' | 'playing' | 'paused' | 'ended' | 'error';
  started: boolean;
  fullscreen: boolean;
  pip: boolean;
  cinema: boolean;
  title: string;
  src: string;
}

export interface PlayerEvents {
  ready: PlayerState;
  loaded: { src: string; title: string };
  loadedmetadata: { duration: number };
  started: { ms: number };
  play: {};
  playing: {};
  pause: {};
  waiting: {};
  seeking: { currentTime: number };
  seeked: { currentTime: number };
  timeupdate: { currentTime: number; duration: number };
  ended: {};
  volumechange: { volume: number; muted: boolean };
  ratechange: { rate: number };
  fullscreenchange: { fullscreen: boolean };
  cinema: { on: boolean };
  next: { url: string; title: string };
  error: { stage: string; code: string; message: string };
}

export default class PipocaPlayer {
  constructor(target: string | HTMLElement, options: PlayerOptions);
  static embedUrl(options: PlayerOptions, baseUrl?: string): string;

  readonly iframe: HTMLIFrameElement;
  readonly channel: string;
  readonly ready: boolean;

  on<K extends keyof PlayerEvents>(event: K, fn: (data: PlayerEvents[K]) => void): this;
  on(event: '*', fn: (event: string, data: unknown) => void): this;
  once<K extends keyof PlayerEvents>(event: K, fn: (data: PlayerEvents[K]) => void): this;
  off(event: string, fn?: Function): this;

  play(): Promise<void>;
  pause(): Promise<PlayerState>;
  toggle(): Promise<void>;
  seek(time: number): Promise<void>;
  seekBy(delta: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  mute(): Promise<void>;
  unmute(): Promise<void>;
  setRate(rate: number): Promise<void>;
  captions(on?: boolean): Promise<{ enabled: boolean | null }>;
  setCinema(on: boolean): Promise<void>;
  getState(): Promise<PlayerState>;
  /** Troca o vídeo sem recarregar o iframe */
  load(options: Omit<PlayerOptions, 'baseUrl'>): Promise<void>;
  command(cmd: string, args?: object, timeoutMs?: number): Promise<unknown>;
  destroy(): void;
}
