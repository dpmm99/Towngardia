import { Building } from "./Building.js";

/**Ephemeral storage for business information while calculating sales tax revenue*/
//TODO: may just want to move them straight to Building or SUBCLASS Building and have businesses subclass this. Then we can show patronage in the building info screen.
export class Business {
    constructor(
        public building: Building,
        public connectedPoweredAndUpkeepEfficiency: number = 0,
        public totalAssigned: number = 0
    ) { }

    get revenue(): number {
        return this.building.businessValue * this.building.lastEfficiency;
    }
}