export class PlayerAction {
    constructor(
        public type: string,
        public category: string,
        public timestamp: number,
        public result: any,
        public resetTime: number
    ) { }

    isAvailable(): boolean { return false; }
}
