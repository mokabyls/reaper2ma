import { bpmTagProvider } from "./bpm.js";
import { cueFadeTagProvider } from "./cue-fade.js";
import { delayFromTagProvider } from "./delay-from.js";
import { delayToTagProvider } from "./delay-to.js";
import { fadeFromTagProvider } from "./fade-from.js";
import { fadeToTagProvider } from "./fade-to.js";
import { createMarkerEnrichmentState } from "./types.js";
const DEFAULT_PROVIDERS = [
    bpmTagProvider,
    cueFadeTagProvider,
    fadeFromTagProvider,
    fadeToTagProvider,
    delayFromTagProvider,
    delayToTagProvider,
];
export class MarkerTagProviderRegistry {
    providers;
    constructor(providers = DEFAULT_PROVIDERS) {
        this.providers = providers;
    }
    enrich(tags) {
        const state = createMarkerEnrichmentState();
        for (const tag of tags) {
            for (const provider of this.providers) {
                if (!provider.supports(tag)) {
                    continue;
                }
                provider.apply(tag, state);
                break;
            }
        }
        return state;
    }
}
export function createDefaultMarkerTagProviderRegistry() {
    return new MarkerTagProviderRegistry();
}
//# sourceMappingURL=registry.js.map