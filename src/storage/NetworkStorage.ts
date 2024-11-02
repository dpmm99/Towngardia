import { Assist } from '../game/Assist.js';
import { City } from '../game/City.js';
import { GameAction } from '../game/GameAction.js';
import { Player } from '../game/Player.js';
import { IStorage } from './IStorage.js';
import { CityDeserializer, CitySerializer, PlayerDeserializer, PlayerSerializer } from './Serialization.js';
import { gzip } from 'pako';

export class NetworkStorage implements IStorage {
    private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
        const response = await fetch(url, {
            ...options,
            keepalive: true, //Don't abort if the page is closed--don't want to lose the player's progress
            credentials: 'include', // This ensures cookies are sent with the request
        });

        if (response.status === 401) {
            // Handle unauthorized access (e.g., redirect to login page)
            window.location.href = 'index.html';
        }

        return response;
    }

    async getPlayerAndFriends(playerId: string): Promise<Player> {
        const response = await this.fetchWithAuth(`api/player`);
        if (!response.ok) {
            throw new Error('Failed to fetch player info');
        }

        const serializedPlayer = await response.json();
        const d = new PlayerDeserializer();
        return d.player(serializedPlayer);
    }

    async loadCity(player: Player, cityID: string): Promise<City | null> {
        const response = await this.fetchWithAuth(`api/loadCity/${cityID}`);
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error('Failed to load city');
        }
        const data = await response.json();
        const d = new CityDeserializer();
        return d.city(player, data);
    }

    async saveCity(playerID: string, city: City): Promise<void> {
        const s = new CitySerializer();
        const data = s.city(city);
        const response = await this.fetchWithAuth(`api/saveCity`, {
            method: 'POST',
            headers: {
                'Content-Encoding': 'gzip',
                'Content-Type': 'application/json',
            },
            body: gzip(JSON.stringify(data)),
        });
        city.id = (await response.json()).id;
        if (!response.ok) {
            throw new Error('Failed to save city');
        }
    }

    async updatePlayer(player: Player): Promise<void> {
        const s = new PlayerSerializer();
        const serializedPlayer = s.player(player);
        const response = await this.fetchWithAuth(`api/savePlayer`, {
            method: 'POST',
            headers: {
                'Content-Encoding': 'gzip',
                'Content-Type': 'application/json',
            },
            body: gzip(JSON.stringify(serializedPlayer)),
        });
        if (!response.ok) {
            throw new Error('Failed to update player');
        }
    }

    async sendAssist(assist: Assist): Promise<void> {
        const response = await this.fetchWithAuth(`api/assist-friend`, {
            method: 'POST',
            headers: {
                'Content-Encoding': 'gzip',
                'Content-Type': 'application/json',
            },
            body: gzip(JSON.stringify([assist])),
        });
        if (!response.ok) {
            throw new Error('Failed to send friend assistance');
        }
    }

    // Placeholder implementations for GameAction methods
    async queueAction(action: GameAction): Promise<void> {
        console.warn('queueAction is not implemented yet');
    }

    async getQueuedActions(): Promise<GameAction[]> {
        console.warn('getQueuedActions is not implemented yet');
        return [];
    }

    async logOut(): Promise<void> {
        //Just navigate to the logout page
        window.location.href = 'auth/logout';
    }
}