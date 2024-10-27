import { Achievement } from "./Achievement.js";
import { AchievementTypes } from "./AchievementTypes.js";
import { City } from "./City.js";
import { Notification } from "./Notification.js";

export class Player {
    constructor(
        public id: string,
        public name: string,
        public cities: City[] = [],
        public notifications: Notification[] = [],
        public achievements: Achievement[] = Object.values(AchievementTypes).map(p => p.clone()), //Not just attained ones, all of 'em
        public friends: Player[] = [],
        public finishedTutorial: boolean = false,
        public avatar: string = "", //a URL
    ) { }

    addCity(city: City): void {
        if (!this.cities.includes(city)) this.cities.push(city);
    }
    removeCity(city: City): void {
        const index = this.cities.indexOf(city);
        if (index > -1) this.cities.splice(index, 1);
    }
}
