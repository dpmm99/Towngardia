import { Assist } from "../game/Assist.js";
import { City } from "../game/City.js";
import { GameAction } from "../game/GameAction.js";
import { Player } from "../game/Player.js";

export interface IStorage {
    getPlayerAndFriends(playerID: string): Promise<Player>;

    queueAction(action: GameAction): Promise<void>;
    getQueuedActions(): Promise<GameAction[]>;

    loadCity(player: Player, cityID: string): Promise<City | null>;
    saveCity(playerID: string, city: City): Promise<void>;

    updatePlayer(playerID: string, player: Player): Promise<void>;

    sendAssist(assist: Assist): Promise<void>;
}
