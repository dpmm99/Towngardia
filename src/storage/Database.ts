import mysql from "mysql2/promise.js";
import { City } from '../game/City.js';
import { CityDeserializer, CitySerializer, PlayerDeserializer, PlayerSerializer } from './Serialization.js';
import { IStorage } from "./IStorage.js";
import { Player } from '../game/Player.js';
import { GameAction } from '../game/GameAction.js';
import { Assist } from "../game/Assist.js";

export class Database implements IStorage {
    protected queuedActions: string = ""; //Probably not needed. Will be needed in the client-server comms layer.

    /** Open the database connection and run the given query with the given parameters, then return the result. */
    protected async query(sql: string, params: any[]): Promise<any> {
        const db = await mysql.createConnection({
            multipleStatements: true,
            host: "localhost",
            user: process.env.DBUSER || "localuser",
            password: process.env.DBPASS || "local",
            database: process.env.DBNAME || "aureusco_games"
        });

        const results = await db.query(sql, params);

        await db.end();
        return results;
    }

    async queueAction(action: GameAction): Promise<void> {
        const actions = await this.getQueuedActions();
        actions.push(action);
        this.queuedActions = JSON.stringify(actions);
    }

    async getQueuedActions(): Promise<GameAction[]> {
        const actionsString = this.queuedActions;
        return actionsString ? JSON.parse(actionsString) : [];
    }

    async loadCity(player: Player, cityID: string): Promise<City | null> {
        const d = new CityDeserializer();
        const response = await this.query(`
            SELECT c.city, c.id, c.name, p.id AS player_id, COALESCE(p.name, p.display_name) AS player_name FROM towngardia_cities c
            LEFT JOIN towngardia_players p ON p.id = c.player
            LEFT JOIN towngardia_player_friends f ON f.player_id = c.player
            WHERE (f.friend_id = ? OR c.player = ?) AND c.id = ?
            LIMIT 1
        `, [player.id, player.id, cityID]);
        if (response.length === 0 || response[0].length === 0 || !response[0][0]) return null;
        const responseObj = response[0][0];
        let parsedCity = responseObj.city; //MySQL parses automatically; MariaDB (on my Lightsail server) does not.
        if (typeof parsedCity === "string" && parsedCity) parsedCity = JSON.parse(parsedCity);

        //Forget about the passed-in player; update the player object with the data we just pulled. It won't make much difference, though.
        const isMyCity = player.id == responseObj.player_id;
        player.id = responseObj.player_id;
        player.name = responseObj.player_name;

        //Lets me create NEW cities or CLONED cities in the database easily, especially for debugging:
        const cityData = parsedCity ? d.city(player, parsedCity) : new City(player, responseObj.id, responseObj.name || (player.name + "-gardia"), 50, 50);
        cityData.id = responseObj.id;

        //Get any separately stored assists, apply them to the city, re-save the city with them in it, and then delete those assists from the friends table.
        if (isMyCity) await this.getAndApplyCityAssists(player, cityData);

        return cityData;
    }

    private async getAndApplyCityAssists(player: Player, cityData: City) {
        const assists = await this.getAssistsForPlayer(player.id);
        const assistsToAdd = [...assists.filter(p => p.cityId == cityData.id).sort((a, b) => a.startAt - b.startAt)];
        if (assistsToAdd.length === 0) return;
        cityData.assists.push(...assistsToAdd); //Oldest to newest so they apply in order, though I don't expect order to ever matter.
        await this.saveCity(player.id, cityData); //At this point, playerId is the assisting player, not the one being assisted (i.e., it's not this player whose city is being loaded)

        //Now that the assists have been applied, we can clear them.
        const assistsByFriend = new Map<string, Assist[]>();
        for (const assist of assists) {
            const assistsForFriend = assistsByFriend.get(assist.playerId) ?? [];
            assistsByFriend.set(assist.playerId, assistsForFriend); //In case it wasn't there already
            if (assist.cityId != cityData.id) assistsForFriend.push(assist);
        }

        //Clear the assists from the database
        for (const [assistedById, assistsForFriend] of assistsByFriend) {
            await this.replaceAssists(assistedById, player.id, assistsForFriend); //player.id is friend_id in the assists table. assistedById is player_id in the table.
        }
    }

    //playerID is passed in to validate when updating the city that it's not being stolen by another player. ;)
    async saveCity(playerID: string, city: City): Promise<void> {
        if (city.id) await this.updateCity(playerID, city);
        else {
            const newID = await this.insertCity(city);
            city.id = newID.toString();
        }
    }

    /**
     * Save a new game record for the given players with the given seed.
     * @returns The ID of the new game in persistent storage. Also gets assigned to the city object.
     */
    protected async insertCity(city: City): Promise<number> {
        const s = new CitySerializer();
        const result = await this.query("INSERT INTO towngardia_cities SET ?", [{ player: city.player.id, name: city.name, city: JSON.stringify(s.city(city)) }]);
        return city.id = result[0].insertId;
    }

    /**
     * Update the city in storage; assumes it already exists.
     */
    protected async updateCity(playerID: string, city: City): Promise<void> {
        if (playerID != city.player.id) throw new Error("Wrong player ID submitted for city" + city.id + ". City has: " + city.player.id + "; given player ID was: " + playerID);

        //Check that the city hasn't been updated on another client since it was loaded on that client
        const lastActionTimestamp = await this.query("SELECT last_action FROM towngardia_cities WHERE id = ?", [city.id]); //lastUserActionTimestamp is a Date; last_action is a TIMESTAMP(3). Both are UTC.
        if (lastActionTimestamp[0].length === 0) throw new Error("City with ID " + city.id + " not found.");
        if (city.lastSavedUserActionTimestamp < lastActionTimestamp[0][0].last_action) throw new Error("Tried to save outdated version of city data.");
        city.lastSavedUserActionTimestamp = city.lastUserActionTimestamp; //Update the last saved timestamp, or else it'll load incorrectly next time

        const s = new CitySerializer();
        await this.query("UPDATE towngardia_cities SET city = ?, name = ?, last_action = ? WHERE player = ? AND id = ?", [JSON.stringify(s.city(city)), city.name, city.lastUserActionTimestamp, playerID, city.id]);
    }

    /**
    * Get a given player by ID plus all of that player's friends.
    * @param {number} playerId ID of the player.
    * @returns {Promise<Player>} The player with their friends' details populated including IDs, names, avatar/profile picture URLs, and lists of city IDs and names.
    */
    async getPlayerAndFriends(playerId: string): Promise<Player> {
        const sql = `
        SELECT p.id, 
               CASE WHEN p.facebook_id IS NOT NULL THEN p.name ELSE p.display_name END AS name,
               CASE WHEN p.avatar IS NOT NULL THEN
                   CASE WHEN p.discord_id IS NOT NULL THEN CONCAT('https://cdn.discordapp.com/avatars/', p.discord_id, '/', p.avatar) ELSE p.avatar END
               ELSE '' END AS avatar,
               c.id AS city_id,
               c.name AS city_name,
               p.other_public,
               CASE WHEN p.id = ? THEN 1 ELSE 0 END AS is_main_player
        FROM towngardia_players p
        LEFT JOIN towngardia_cities c ON p.id = c.player
        WHERE p.id = ? OR p.id IN (SELECT player_id FROM towngardia_player_friends WHERE friend_id = ?)
        ORDER BY p.id, c.id;
    `; //TODO: Need to get Facebook profile picture URL somehow

        const [rows] = await this.query(sql, [playerId, playerId, playerId]);
        const d = new PlayerDeserializer();

        let mainPlayer: Player | null = null;
        const friendsMap = new Map<string, Player>();

        for (const row of rows) {
            let parsedOther = row.other_public; //MySQL parses automatically; MariaDB (on my Lightsail server) does not.
            if (typeof parsedOther === "string") parsedOther = JSON.parse(parsedOther);
            const player: Player = ((row.is_main_player && mainPlayer) ? mainPlayer! : null) || friendsMap.get(row.id) || (parsedOther ? d.player(parsedOther) : new Player(row.id, row.name));
            player.id = row.id;
            player.name = row.name;
            player.avatar = row.avatar;

            if (row.city_id && row.city_name) {
                player.cities.push(<City>{ id: row.city_id, name: row.city_name }); //Cheating for now. Not a true City object, but these fields do exist on City.
            }

            if (row.is_main_player) {
                mainPlayer = player;
            } else {
                friendsMap.set(row.id, player);
            }
        }

        if (!mainPlayer) {
            throw new Error(`Player with ID ${playerId} not found`);
        }

        mainPlayer.friends = Array.from(friendsMap.values());

        return mainPlayer;
    }

    /**
     * After getting the user info from Discord's API, call this to ensure that their Discord data (including their Discord ID, if they didn't have a record in our DB before) is up-to-date.
     */
    async upsertDiscordPlayer(discordUserObject: { id: string, avatar: string, username: string }): Promise<string> {
        const response = await this.query(`
        SET @discord_id = ?;
        SET @id = (SELECT id FROM towngardia_players WHERE discord_id = @discord_id);
        INSERT INTO towngardia_players (id, discord_id, avatar, display_name) VALUES (@id, @discord_id, ?, ?)
        ON DUPLICATE KEY UPDATE avatar=VALUES(avatar), display_name=VALUES(display_name);
        SELECT COALESCE(@id, LAST_INSERT_ID()) as insertId;
    `, [discordUserObject.id, discordUserObject.avatar, discordUserObject.username]);

        return response[0][response[0].length - 1][0].insertId + "";
    }

    /**
     * @param playerId The current player's Towngardia player_id
     * @param friendDiscordIDs An array of Discord IDs of friends to (potentially--it won't make dupes) add
     */
    async addDiscordFriends(playerId: string, friendDiscordIDs: string[]): Promise<void> {
        const query = `
        INSERT IGNORE INTO towngardia_player_friends (player_id, friend_id)
        SELECT * FROM (
            SELECT p.id AS player_id, f.id AS friend_id
            FROM towngardia_players p
            JOIN towngardia_players f ON f.discord_id IN (?)
            WHERE p.id = ?
            
            UNION ALL
            
            SELECT f.id AS player_id, p.id AS friend_id
            FROM towngardia_players p
            JOIN towngardia_players f ON f.discord_id IN (?)
            WHERE p.id = ?
        ) AS friend_pairs
        WHERE player_id != friend_id;
        `;
        await this.query(query, [friendDiscordIDs, playerId, friendDiscordIDs, playerId]);
    }

    /**
    * After getting the user info from Facebook's API, call this to ensure that their Facebook data (including their Facebook ID, if they didn't have a record in our DB before) is up-to-date.
    */
    async upsertFacebookPlayer(facebookUserObject: { id: string, name: string, email: string }): Promise<string> {
        const response = await this.query(`
        SET @facebook_id = ?;
        SELECT id INTO @id FROM towngardia_players WHERE facebook_id = @facebook_id;
        INSERT INTO towngardia_players (id, facebook_id, name, email) VALUES (@id, @facebook_id, ?, ?)
        ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email);
        SELECT COALESCE(@id, LAST_INSERT_ID()) as insertId;
    `, [facebookUserObject.id, facebookUserObject.name, facebookUserObject.email]);
        return response[0][response[0].length - 1][0].insertId + "";
    }

    //Same, but for Google sign-in
    async upsertGooglePlayer(googleUserObject: { id: string, name: string, picture: string }): Promise<string> {
        const response = await this.query(`
        SET @google_id = ?;
        SELECT id INTO @id FROM towngardia_players WHERE google_id = @google_id;
        INSERT INTO towngardia_players (id, google_id, display_name, avatar) VALUES (@id, @google_id, ?, ?)
        ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), avatar=VALUES(avatar);
        SELECT COALESCE(@id, LAST_INSERT_ID()) as insertId;
    `, [googleUserObject.id, googleUserObject.name, googleUserObject.picture]);
        return response[0][response[0].length - 1][0].insertId + "";
    }

    //For saving the player JSON data
    async updatePlayer(player: Player): Promise<void> {
        //Check that the player hasn't been updated on another client since it was loaded on that client
        const lastActionTimestamp = await this.query("SELECT last_action FROM towngardia_players WHERE id = ?", [player.id]);
        if (lastActionTimestamp[0].length === 0) throw new Error("Player with ID " + player.id + " not found.");
        if (player.lastSavedUserActionTimestamp < lastActionTimestamp[0][0].last_action) throw new Error("Tried to save outdated version of player data.");
        player.lastSavedUserActionTimestamp = player.lastUserActionTimestamp; //Update the last saved timestamp, or else it'll load incorrectly next time

        const s = new PlayerSerializer();
        await this.query("UPDATE towngardia_players SET other_public = ?, last_action = ? WHERE id = ?", [JSON.stringify(s.player(player, true)), player.lastUserActionTimestamp, player.id]);
    }

    /**
     * After getting the user info from Discord's API and obtaining a player ID, call this to ensure their session record is persisted in case the server reboots.
     * @param {any} sessionObject
     */
    async upsertSession(sessionObject: { sessionId: string, expires: string, playerId: string }): Promise<void> {
        await this.query("INSERT INTO towngardia_sessions (id, expires, player_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE expires=VALUES(expires), player_id=VALUES(player_id);", [sessionObject.sessionId, sessionObject.expires, sessionObject.playerId]);
    }

    /**
     * Load all non-expired sessions from the database
     */
    async loadSessions(): Promise<{ sessionId: string, expires: string, playerId: string }[]> {
        return (await this.query("SELECT id AS sessionId, expires, player_id AS playerId FROM towngardia_sessions WHERE expires > UTC_DATE();", []))[0];
    }

    /**
     * Load just the given session from the database, unless it's expired.
     * @param {string} sessionId The session ID to load
     * @returns The session object if it exists and is not expired, or null if it does not exist or is expired.
     */
    async loadSession(sessionId: string): Promise<{ sessionId: string, expires: string, playerId: string } | null> {
        const [rows] = await this.query("SELECT id AS sessionId, expires, player_id AS playerId FROM towngardia_sessions WHERE id = ? AND expires > UTC_DATE();", [sessionId]);
        return rows[0] ?? null;
    }

    async searchPlayers(name: string): Promise<Array<{ id: string, name: string }>> {
        const query = `
            SELECT id, display_name AS name 
            FROM towngardia_players 
            WHERE display_name LIKE ?
            LIMIT 10
        `;
        const [rows] = await this.query(query, [`${name}%`]);
        return rows;
    }

    async addFriend(playerId: string, friendId: string): Promise<void> {
        // First, check if the friendship already exists
        const checkQuery = `
            SELECT * FROM towngardia_player_friends 
            WHERE (player_id = ? AND friend_id = ?) OR (player_id = ? AND friend_id = ?)
        `;
        const [existingFriendship] = await this.query(checkQuery, [playerId, friendId, friendId, playerId]);

        if (existingFriendship.length > 0) return; //No point in telling them it's an error because they're already friends.

        // If not, add the friendship in both directions //TODO: May consider adding it in one direction only, but only if I end up publishing the game and it gets popular.
        const insertQuery = `
            INSERT INTO towngardia_player_friends (player_id, friend_id) 
            VALUES (?, ?), (?, ?)
        `;
        await this.query(insertQuery, [playerId, friendId, friendId, playerId]);
    }

    parseAssists(rows: any): Assist[] {
        if (!rows.length) return [];

        var c = new CityDeserializer();
        let assists = rows.flatMap((p: any) => {
            let assists = p.assists ?? [];
            if (typeof assists === "string" && assists) assists = JSON.parse(assists) || [];
            return assists.map((a: any) => new Assist(a.cityId, c.events([a.effect])[0], a.startAt, p.player_id));
        });
        assists = assists.filter((a: Assist) => a.startAt > Date.now() - 1000 * 60 * 60 * 24 * 14); //Max age of assists: two weeks. You have to log in or you lose them.
        return assists;
    }

    //Player->friend means player wants that friend to be their friend, so friend can see player's city. Thus, assists *by* player go into player's record.
    //So if you're getting the assists for a city, you need to look for your own ID in the friend_id column.
    async getAssistsForPlayer(playerId: string): Promise<Assist[]> {
        const getter = `SELECT player_id, assists FROM towngardia_player_friends WHERE friend_id = ?`;
        const [rows] = await this.query(getter, [playerId]);
        return this.parseAssists(rows);
    }

    async replaceAssists(playerId: string, friendId: string, assists: Assist[]): Promise<void> {
        const clearer = `UPDATE towngardia_player_friends SET assists = ? WHERE player_id = ? and friend_id = ?`;
        //Specifically not serializing playerId because the row already has both of the relevant player IDs.
        const c = new CitySerializer();
        await this.query(clearer, [JSON.stringify(assists, (key, value) => key === "playerId" ? undefined : key === "effect" ? c.event(value) : value), playerId, friendId]);
    }

    async getAssistsToUpdate(playerId: string, friendId: string): Promise<Assist[]> {
        const getter = `SELECT player_id, assists FROM towngardia_player_friends WHERE player_id = ? and friend_id = ?`;
        const [rows] = await this.query(getter, [playerId, friendId]);
        return this.parseAssists(rows);
    }

    async sendAssist(assist: Assist): Promise<void> { } //Not needed in the database

    async assistFriend(playerId: string, friendId: string, assists: Assist[]): Promise<void> { //Note: NOT an atomic operation. Some data could be lost (but unlikely due to the sub-second completion time)
        const existingAssists = await this.getAssistsToUpdate(playerId, friendId);
        existingAssists.push(...assists);
        await this.replaceAssists(playerId, friendId, existingAssists);
    }
}
