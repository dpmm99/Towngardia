import { Building } from "./Building.js";
import { City } from "./City.js";
import { Effect } from "./Effect.js";
import { EffectType } from "./GridType.js";

// Types for building effects
export class EffectDefinition {
    constructor(
        public type: EffectType,
        public magnitude: number,
        public dynamicCalculation?: string,
        public rounded?: boolean,
        public radiusX: number = 0,
        public radiusY: number = 0,
        public addRadius: boolean = true // If true, the modifier is added to the area indicator; if false, the modifier is the exact radius (unless upgraded)
    ) {
    }
};

type RadiusUpgrade = {
    tech: string;
    amount: number;
};

// Class to manage building effects
export class BuildingEffects {
    constructor(public effects: EffectDefinition[], private radiusUpgrades: RadiusUpgrade[] = []) {
    }

    // Calculate current radius based on tech research
    public getRadiusUpgradeAmount(city: City): number {
        return this.radiusUpgrades.filter(upgrade => city.techManager.techs.get(upgrade.tech)?.researched).reduce((sum, upgrade) => sum + upgrade.amount, 0);
    }

    // Apply all effects for this building
    applyEffects(building: Building, city: City): void {
        const radiusBonus = this.getRadiusUpgradeAmount(city);

        for (const effect of this.effects) {
            const radiusX = radiusBonus + effect.radiusX + (effect.addRadius ? building.areaIndicatorRadiusX : 0);
            const radiusY = radiusBonus + effect.radiusY + (effect.addRadius ? building.areaIndicatorRadiusY : 0);

            city.spreadEffect(
                new Effect(
                    effect.type,
                    effect.magnitude,
                    building,
                    effect.dynamicCalculation
                ),
                radiusX,
                radiusY,
                effect.rounded ?? building.areaIndicatorRounded
            );
        }
    }

    stopEffects(building: Building, city: City): void {
        const radiusBonus = this.getRadiusUpgradeAmount(city);
        const maxRadius = radiusBonus + this.effects.reduce((max, effect) => Math.max(max,
            effect.radiusX + (effect.addRadius ? building.areaIndicatorRadiusX : 0),
            effect.radiusY + (effect.addRadius ? building.areaIndicatorRadiusY : 0)
        ), 0);
        city.stopEffects(building, maxRadius, maxRadius);
    }
}
