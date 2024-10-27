export class Resource {
    constructor(
        public type: string,
        public displayName: string,
        public amount: number,
        public productionRate: number,
        public capacity: number,
        public consumptionRate: number,
        public isSpecial: boolean = false,
        public buyPrice: number = 0, //0 for non-tradeable
        public sellPrice: number = 0,
        public autoBuyBelow: number = 0, //0 to 1
        public autoSellAbove: number = 1, //0 to 1
        public buyableAmount: number = 0,
        public buyCapacity: number = 0,
        public buyPriceMultiplier = 1,
        public sellPriceMultiplier = 1,
        public autoCollect: boolean = false,
    ) { }

    produce(amount: number): void { this.amount = Math.min(this.capacity, this.amount + amount); }
    consume(amount: number): void { this.amount -= amount; } //No minimum, tentatively...

    clone(withValues?: Partial<Resource>): Resource {
        return Object.assign(Object.create(this), this, withValues);
    }
}