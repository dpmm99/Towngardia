import { CityEvent } from "./CityEvent.js";

//Stores info about one player helping another. Doesn't have to contain the player IDs, but does have to contain the target city ID and what is being changed (most likely just a CityEvent instance).
export class Assist {
    public constructor(
        public cityId: string,
        public effect: CityEvent,
        public startAt: number,
        public playerId: string //Not serialized; used internally in the server as the FROM-player. Abused on the front-end and network comms as the TO-player. :)
    ) { }
}