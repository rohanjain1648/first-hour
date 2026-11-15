import { createComponent, Types } from '@iwsdk/core';

/** A grabbable resource token; tokenId matches SimState.tokens[].id */
export const FhToken = createComponent('FhToken', {
  tokenId: { type: Types.String, default: '' },
});

/** A pinchable control; action is routed by the HUD/agents systems */
export const FhButton = createComponent('FhButton', {
  action: { type: Types.String, default: '' },
  arg: { type: Types.String, default: '' },
});

/** A gold delegation chip (index 0 or 1) */
export const FhChip = createComponent('FhChip', {
  index: { type: Types.Int8, default: 0 },
});
