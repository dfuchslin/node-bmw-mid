export enum DisplayEvent {
  PixelTestToggled = 'display:pixel-test-toggled',
}

export interface PixelTestTogglePayload {
  enabled: boolean;
}
