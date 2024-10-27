import { City } from "./City.js";

export class Tech {
    readonly prerequisites: string[] = [];
    readonly originalCosts: { type: string, amount: number }[];
    constructor(
        public id: string,
        public name: string,
        public description: string,
        public costs: { type: string, amount: number }[],
        public adoptionRate: number,
        public adoptionGrowth: number,
        public displayX: number, //Should not be negative
        public displayY: number,
        public connections: { id: string, path: number[] }[] = [], //Path represents the turning points of the line in Manhattan distances, e.g., [0.5] turns at the halfway point, [0.3, 0.7] turns once it's covered 30% of the distance and again at 70%. If a path doesn't line up, the last turning point is always as soon as the line becomes adjacent to the target.
        public researched: boolean = false, //HAS been researched
        public unavailable: boolean = false, //CANNOT be researched (in addition to prerequisite techs, there is another limitation somewhere)
    ) {
        this.prerequisites = connections.map(p => p.id);
        this.originalCosts = costs.map(p => ({ type: p.type, amount: p.amount }));
    }

    isUnavailable(city: City): boolean { return this.unavailable; }

    //Minigames and touring other cities and such can reduce tech costs directly. The function supports both additive and multiplicative adjustments. (Use negative numbers to reduce the cost.)
    adjustCost(type: string, amount: number, isFraction: boolean = false): void {
        const cost = this.costs.find(p => p.type === type);
        if (cost) {
            cost.amount += amount * (isFraction ? cost.amount : 1);
            if (cost.amount < 1) this.costs.splice(this.costs.findIndex(p => p.type === type), 1);
        }
    }
    applyEffects(city: City): void { }
    clone(): Tech {
        const clone = Object.assign(Object.create(this), this); //Assumes you won't modify 'connections', or 'prerequisites' at runtime
        clone.costs = this.costs.map(p => ({ type: p.type, amount: p.amount }));
        return clone;
    }
}
