import { City } from "./City.js";
import { Player } from "./Player.js";

export class Achievement {
    public attained: boolean = false;
    public attainedDate: Date | null = null;
    public lastProgress: number = 0;
    /**Can be used to store arbitrary (but only directly JSON-serializable) data for any specific achievement. WILL be wiped out on the next save if attained is true.*/
    public dataPoints: any[] | undefined;
    constructor(
        public id: string,
        public name: string,
        public description: string,
        public condition: (me: Achievement, player: Player, city: City) => number, // Returns a number between 0 and 1 to represent progress. Should always short-circuit if already unlocked (check "attained") because it can be expensive.
        public rewardDescription?: string,
    ) { }

    clone(): Achievement {
        return Object.assign(Object.create(this), this);
    }

    checkCondition(player: Player, city: City): number {
        return this.attained ? 1 : this.condition(this, player, city);
    }
}
