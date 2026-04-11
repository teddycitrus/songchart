export type Song = {
  _id: string;
  name: string;
  listen?: string;
  chords: string;
  key: string;
  transpose: string;
  capo: string;
  bpm: string;
  beat: string;
  type?: string[];
  usage_counter?: number;
  lyrics?: string;
  chordsFile?: string;
  lyricsFile?: string;
}
