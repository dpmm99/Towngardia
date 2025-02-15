import { City } from "../game/City.js";
import { GameAction } from "../game/GameAction.js";
import { Player } from "../game/Player.js";
import { IStorage } from "./IStorage.js";
import { CityDeserializer, CitySerializer } from "./Serialization.js";

export class BrowserStorage implements IStorage {
    async updatePlayer(playerID: string, player: Player): Promise<void> {
        // Not implemented
    }
    async getPlayerAndFriends(playerId: string): Promise<Player> {
        return new Player(playerId ?? "1", "DeP", <City[]>[{ id: "1", name: "Test City" }]);
    }

    async queueAction(action: GameAction): Promise<void> {
        const actions = await this.getQueuedActions();
        actions.push(action);
        localStorage.setItem('queuedActions', JSON.stringify(actions));
    }

    async getQueuedActions(): Promise<GameAction[]> {
        const actionsString = localStorage.getItem('queuedActions');
        return actionsString ? JSON.parse(actionsString) : [];
    }

    async loadCity(player: Player, cityID: string): Promise<City | null> {
        const data = localStorage.getItem('city' + cityID);
        if (!data || data === '[object Object]') return null;
        const d = new CityDeserializer();
        return d.city(player, JSON.parse(data));
    }

    async saveCity(playerID: string, city: City): Promise<void> {
        const s = new CitySerializer();
        localStorage.setItem('city' + city.id, JSON.stringify(s.city(city)));
    }

    async sendAssist(assist: any): Promise<void> {
        const assists = JSON.parse(localStorage.getItem('assist' + assist.cityId) ?? "[]");
        assists.push(assist);
        localStorage.setItem('assist' + assist.cityId, JSON.stringify(assists));
    }
}
