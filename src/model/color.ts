export type ColorSpace = 'srgb' | 'display-p3' | 'oklch';
export type ColorChannels = readonly [number, number, number];

export type ColorValue = Readonly<{
  space: ColorSpace;
  components: ColorChannels;
  alpha: number;
}>;

export type Swatch = Readonly<{
  id: string;
  color: ColorValue;
  locked: boolean;
}>;

export type Palette = Readonly<{
  swatches: readonly Swatch[];
  roles: Readonly<Record<string, string>>;
}>;
