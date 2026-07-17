export interface MeasureState {
  pointA: [number, number, number] | null;
  pointB: [number, number, number] | null;
  distance: number | null;
}

export const EMPTY_MEASURE_STATE: MeasureState = {
  pointA: null,
  pointB: null,
  distance: null,
};

export interface SectionState {
  normal: [number, number, number];
  offset: number;
}

export const DEFAULT_SECTION_STATE: SectionState = {
  normal: [0, 1, 0],
  offset: 0,
};
