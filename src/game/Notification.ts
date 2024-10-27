export class Notification {
    constructor(
        public title: string,
        public body: string,
        public icon: string = "notice",
        public date: Date = new Date(), //Defaults to current time, but may need to be backdated according to long ticks that the player/server is behind
        public seen: boolean = false
    ) {
    }
}