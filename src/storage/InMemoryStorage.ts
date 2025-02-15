import { City } from "../game/City.js";
import { GameAction } from "../game/GameAction.js";
import { Player } from "../game/Player.js";
import { IStorage } from "./IStorage.js";
import { CityDeserializer, CitySerializer } from "./Serialization.js";

export class InMemoryStorage implements IStorage {
    private data: any = {};

    async updatePlayer(playerID: string, player: Player): Promise<void> {
        // Not implemented
    }

    async getPlayerAndFriends(playerId: string): Promise<Player> {
        return new Player(playerId ?? "1", "DeP", <City[]>[{ id: "1", name: "Test City" }]);
    }

    async queueAction(action: GameAction): Promise<void> {
        const actions = await this.getQueuedActions();
        actions.push(action);
        this.data.queuedActions = JSON.stringify(actions);
    }

    async getQueuedActions(): Promise<GameAction[]> {
        const actionsString = this.data.queuedActions;
        return actionsString ? JSON.parse(actionsString) : [];
    }

    async loadCity(player: Player, cityID: string): Promise<City | null> {
        if (!this.data['city' + cityID]) return null;
        const d = new CityDeserializer();
        return d.city(player, this.data['city' + cityID]);
    }

    async saveCity(playerID: string, city: City): Promise<void> {
        const s = new CitySerializer();
        this.data['city' + city.id] = s.city(city);
    }

    async sendAssist(assist: any): Promise<void> {
        const assists = this.data['assist' + assist.cityId] ?? [];
        assists.push(assist);
        this.data['assist' + assist.cityId] = assists;
    }
}
