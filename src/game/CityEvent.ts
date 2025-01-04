import { Building } from "./Building.js";
import { City } from "./City.js";

export class CityEvent {
    public skippedStarts: number = 0; //Allows adjusting chance based on number of times the event didn't start, if it's random or whatever. Can also be used for events with a fixed frequency based on things like population size.
    public activations: number = 0;
    public duration: number = 0;
    public variables: number[] = []; //For storing whatever you need for specific events, like boost quantity and start time for a TourismReward.
    public fromPlayer: string | null = null; //For assists, so we can tell the player who helped them.
    public affectedBuildings: Building[] = []; //Not serialized; just for transfering from the event to the notification
    constructor(
        public type: string,
        public displayName: string,
        public maxDuration: number,
        public startMessage: string,
        public endMessage: string,
        public notificationIcon?: string,
        public tickTiming: EventTickTiming = EventTickTiming.Normal
    ) { }

    /**
     * Should be executed exactly once per long tick, but when it's executed may differ based on the event type.
     * @param city
     * @returns true if the event is still active
     */
    onLongTick(city: City): boolean {
        if (--this.duration > 0) return true;
        this.end(city);
        return false;
    }

    /**
     * Executed exactly once per long tick (except if the event is already running), always at the very end of the long tick. onLongTick would not run for the first tick when an event starts.
     * @param city
     * @param date
     * @returns
     */
    shouldStart(city: City, date: Date): boolean {
        return false;
    }

    /**
     * Just an easy way to update skippedStarts and activations, call start, and return directly
     * @param result The same thing that gets returned
     * @returns
     */
    checkedStart(result: boolean, city: City, date: Date): boolean {
        if (result) this.start(city, date);
        else this.skippedStarts++;
        return result;
    }

    start(city: City, date: Date): void {
        this.skippedStarts = 0;
        this.activations++;
        this.duration = this.maxDuration;
    }
    end(city: City): void { } //Just for override purposes

    clone(): CityEvent {
        const clone = Object.assign(Object.create(this), this);
        clone.variables = this.variables.slice();
        clone.affectedBuildings = this.affectedBuildings.slice();
        return clone;
    }
}

export enum EventTickTiming {
    Normal,
    Tourism,
    Population,
    Early
}
