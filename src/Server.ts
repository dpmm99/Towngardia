import express from 'express';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from './storage/Database.js';
import { Player } from './game/Player.js';
import compression from 'compression';
import { CityDeserializer, CitySerializer, PlayerDeserializer, PlayerSerializer } from './storage/Serialization.js';
import https from 'https'; //ONLY for local development
import fs from 'fs'; //ONLY for local development
import { Assist } from './game/Assist.js';
import webpush from 'web-push';

const app = express();
const port = 3005;
const db = new Database(); // Initialize your database

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const urlRootPath = '/towngardia';

// Serve static files from specific places
app.use(urlRootPath + '/assets', express.static(path.join(__dirname, 'assets')));
app.get(urlRootPath + '/bundle.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'bundle.js'));
});
app.get(urlRootPath + '/ui/SubscriptionServiceWorker.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui/SubscriptionServiceWorker.js'));
});

// Middleware to check if user is authenticated
const isAuthenticated = (daysAllowedPastExpiration: number) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const sessionId = <string | null>req.cookies.sessionId;
        if (!sessionId) {
            console.log(new Date().toISOString(), "NoSession", req.originalUrl);
            return res.redirect(urlRootPath + '/');
        }

        const session = await db.loadSession(sessionId, daysAllowedPastExpiration);
        if (!session) {
            console.log(new Date().toISOString(), "SessionExpired", sessionId, req.originalUrl);
            res.clearCookie('sessionId');
            return res.redirect(urlRootPath + '/');
        }

        req.playerId = session.playerId;
        console.log(new Date().toISOString(), req.playerId, req.originalUrl);
        next();
    };
};

// Anti-crash middleware
app.use((err: any, req: any, res: any, next: any) => {
    console.error(new Date().toISOString(), req.playerId ?? "UnknownPlayer", err.stack);
    res.status(500).send('Something went wrong!');
});
const asyncHandler = (fn: any) => (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Routes
app.get('/', (req, res) => { //Redirect for when it's not behind a reverse proxy
    res.redirect(urlRootPath + '/');
});

app.get(urlRootPath + '/', async (req, res) => {
    //If you're still logged in, redirect to game.html.
    const sessionId = <string | null>req.cookies.sessionId;
    if (sessionId) {
        const session = await db.loadSession(sessionId);
        if (session) {
            return res.redirect(urlRootPath + '/game.html');
        }
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(urlRootPath + '/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

//Moderately expired sessions are allowed on every route except this one. The user can keep playing for a while, but if they reload the page, they have to log back in. The point is to avoid interrupting their play time (especially when they finish a minigame).
app.get(urlRootPath + '/game.html', isAuthenticated(0), (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

app.get(urlRootPath + '/auth/logout', (req: any, res: any) => {
    res.clearCookie('sessionId', { httpOnly: true, secure: true });
    res.redirect(urlRootPath + '/index.html');
});

app.post(urlRootPath + '/auth/discord', asyncHandler(async (req: any, res: any) => {
    const { id, avatar, username } = req.body;
    const playerId = await db.upsertDiscordPlayer({ id, avatar, username });
    const sessionId = uuidv4();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week from now
    await db.upsertSession({ sessionId, expires, playerId });
    res.cookie('sessionId', sessionId, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect(urlRootPath + '/game.html');
}));

app.post(urlRootPath + '/auth/facebook', asyncHandler(async (req: any, res: any)  => {
    const { id, name, email } = req.body;
    const playerId = await db.upsertFacebookPlayer({ id, name, email });
    const sessionId = uuidv4();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week from now
    await db.upsertSession({ sessionId, expires, playerId });
    res.cookie('sessionId', sessionId, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect(urlRootPath + '/game.html');
}));

app.post(urlRootPath + '/auth/google', asyncHandler(async (req: any, res: any) => {
    const { id, name, picture } = req.body;
    const playerId = await db.upsertGooglePlayer({ id, name, picture });
    const sessionId = uuidv4();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week from now
    await db.upsertSession({ sessionId, expires, playerId });
    res.cookie('sessionId', sessionId, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect(urlRootPath + '/game.html');
}));

app.get(urlRootPath + '/api/player', isAuthenticated(7), asyncHandler(async (req: any, res: any)  => {
    const s = new PlayerSerializer();
    const playerAndFriends = await db.getPlayerAndFriends(req.playerId);
    res.json(s.player(playerAndFriends));
}));

app.post(urlRootPath + '/api/saveCity', isAuthenticated(7), asyncHandler(async (req: any, res: any)  => { //TODO: When client is outdated, save if possible, but then tell the client to refresh (though if they're doing something like starting a minigame, we don't want to force it right away).
    const d = new CityDeserializer();
    const rebuiltCity = d.city(new Player(req.playerId, ""), req.body); // Validate city (sort of)
    await db.saveCity(req.playerId, rebuiltCity);
    res.json({ id: rebuiltCity.id });
}));

app.get(urlRootPath + '/api/loadCity/:cityId', isAuthenticated(7), asyncHandler(async (req: any, res: any)  => {
    const { cityId } = req.params;
    const player = new Player(req.playerId, ""); //The city looks up THIS player ID to see if it's at least a friend OF the city owner.
    const city = await db.loadCity(player, cityId);
    if (city) {
        const s = new CitySerializer(); //Actually pointless that I deserialize to a proper city and then reserialize to send it to the player
        res.json(s.city(city));
    } else {
        res.sendStatus(404);
    }
}));

app.post(urlRootPath + '/api/savePlayer', isAuthenticated(7), asyncHandler(async (req: any, res: any)  => {
    const d = new PlayerDeserializer();
    const player = d.player(req.body);
    await db.updatePlayer(req.playerId, player);
    res.sendStatus(200);
}));

// Player search API
app.get(urlRootPath + '/api/player-search', isAuthenticated(7), asyncHandler(async (req: any, res: any) => {
    const { name } = req.query;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Invalid search parameter' });
    
    const sanitizedName = name.replace(/[^a-z0-9]/gi, "").substring(0, 32);
    if (!sanitizedName) return res.json([]);
    
    const players = await db.searchPlayers(sanitizedName);
    res.json(players.filter(p => p.id != req.playerId));
}));

// Add friend API
app.post(urlRootPath + '/api/add-friend', isAuthenticated(7), asyncHandler(async (req: any, res: any) => {
    const { friendId } = req.body;
    if (!friendId || typeof friendId !== 'string') return res.status(400).json({ error: 'Invalid friend ID' });
    
    try {
        await db.addFriend(req.playerId, friendId);
        res.json({ success: true });
    } catch (error) {
        console.error(new Date().toISOString(), 'Error adding friend:', error);
        res.status(500).json({ error: 'Failed to add friend' });
    }
}));

// Assist friend API
app.post(urlRootPath + '/api/assist-friend', isAuthenticated(7), asyncHandler(async (req: any, res: any) => {
    const assists = req.body as Assist[];
    if (!assists?.length) return res.status(400).json({ error: 'Incorrect assist format' });

    //At LEAST assert that they're all the same player (for now).
    const friendId = assists[0].playerId;
    if (assists.some(p => !p.playerId || typeof p.playerId !== 'string' || p.playerId !== friendId)) return res.status(400).json({ error: 'Invalid friend ID' });
    
    try {
        await db.assistFriend(req.playerId, friendId, assists);
        res.json({ success: true });
    } catch (error) {
        console.error(new Date().toISOString(), 'Error assisting friend:', error);
        res.status(500).json({ error: 'Failed to assist friend' });
    }
}));

// Generate VAPID keys using webpush.generateVAPIDKeys()
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails('mailto:deprogrammer@aureuscode.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Endpoint to get the public VAPID key
    app.get(urlRootPath + '/api/vapid-public-key', (req, res) => {
        res.json({ publicKey: VAPID_PUBLIC_KEY });
    });

    // Endpoint to save push subscription
    app.post(urlRootPath + '/api/push-subscription', isAuthenticated(7), asyncHandler(async (req: any, res: any) => {
        const subscription = req.body;
        await db.savePushSubscription(req.playerId, subscription);
        res.json({ success: true });
    }));

    // Endpoint to unsubscribe a player from push notifications
    app.post(urlRootPath + '/api/push-unsubscribe', isAuthenticated(7), asyncHandler(async (req: any, res: any) => {
        await db.savePushSubscription(req.playerId, null);
        res.json({ success: true });
    }));

    const pushNotificationMessages: string[] = [
        "Give me some love and attention! I mean, uh, you haven't played in 5 days...just FYI.",
        "Your city is getting lonely. And dusty. And probably a little sad without you.",
        "Remember me? Your virtual urban masterpiece? No? Awkward...",
        "Breaking news: Your citizens are staging a passive-aggressive protest by looking disappointed.",
        "Hey! Your city hasn't been touched in 5 days. The citizens are developing serious abandonment issues.",
        "Psst... your infrastructure misses you. Like, really misses you.",
        "Anarchy levels have reached critical mass. You might wanna check on your city.",
        "Your citizens are writing sad poetry about your absence. Do you want that on your conscience?",
        "Breaking: Local mascot 'lawyers up' to sue for digital neglect.",
        "Warning: Prolonged absence may result in spontaneous urban chaos and pothole rebellion.",
        "Your city just isn't the same without you. Even the virtual pigeons are judging you for your laissez-faire governing.",
        "Your city is staging a silent, pixelated guilt trip.",
        "Your citizens have started a support group for abandoned digital municipalities.",
        "If you keep ghosting your city, the citizens might ghost you right back. With fire."
    ];

    const NOTIFICATION_INTERVAL = 3000 /*3 seconds for testing*/; //30 * 60 * 1000; // 30 minutes in milliseconds
    async function sendPushNotifications() {
        try {
            const subscriptions = await db.getPushSubscriptions();
            for (const subscription of subscriptions) {
                try {
                    await webpush.sendNotification(
                        subscription,
                        JSON.stringify({
                            title: 'Towngardia',
                            body: "(Play reminder) " + pushNotificationMessages[Math.floor(Math.random() * pushNotificationMessages.length)],
                        })
                    );
                    console.log(new Date().toISOString(), 'Push notification sent');
                } catch (error) {
                    console.error(new Date().toISOString(), 'Failed to send push notification:', error);
                }
            }
        } catch (error) {
            console.error(new Date().toISOString(), 'Error in push notification cycle:', error);
        }
    }

    // Schedule push notifications
    setInterval(sendPushNotifications, NOTIFICATION_INTERVAL);
} else {
    console.warn('VAPID keys not found; cannot send push notifications');
}

const DISCORD_CLIENT_ID = process.env.TOWNGARDIA_DISCORD_ID;
const DISCORD_CLIENT_SECRET = process.env.TOWNGARDIA_DISCORD_SECRET;

const FACEBOOK_APP_ID = process.env.TOWNGARDIA_FACEBOOK_ID;
const FACEBOOK_APP_SECRET = process.env.TOWNGARDIA_FACEBOOK_SECRET;

const GOOGLE_APP_ID = process.env.TOWNGARDIA_GOOGLE_ID;
const GOOGLE_APP_SECRET = process.env.TOWNGARDIA_GOOGLE_SECRET;

if (process.env.OS === "Windows_NT") { //ONLY for local development
    //Can generate a self-signed certificate for HTTPS like so:
    //const { execSync } = require('child_process');
    //execSync('openssl req -nodes -new -x509 -keyout private-key.pem -out certificate.pem -days 365 -subj "/C=US/ST=CA/L=Chicago/O=Towngardia/OU=IT/CN=localhost"');
    const options = {
        key: fs.readFileSync('private-key.pem'),
        cert: fs.readFileSync('certificate.pem')
    };

    https.createServer(options, app).listen(port + 1, () => {
        console.log(new Date().toISOString(), `HTTPS Server running at https://localhost:${port + 1}`);
    });
}

app.listen(port, () => {
    console.log(new Date().toISOString(), `Server running at http://localhost:${port}`);
    if (!DISCORD_CLIENT_ID) throw new Error("No Discord client ID.");
    if (!DISCORD_CLIENT_SECRET) throw new Error("No Discord client secret.");
});

function getDiscordCallbackUri(req: express.Request): string {
    const offline = req.headers.host?.includes("127.0.0.1") || req.headers.host?.includes("localhost");
    return offline ? `http://${req.headers.host}${urlRootPath}/auth/discord/callback` : `https://${req.headers.host}${urlRootPath}/auth/discord/callback`;
}

function getFacebookCallbackUri(req: express.Request): string {
    const offline = req.headers.host?.includes("127.0.0.1") || req.headers.host?.includes("localhost");
    return offline ? `http://${req.headers.host}${urlRootPath}/auth/facebook/callback` : `https://${req.headers.host}${urlRootPath}/auth/facebook/callback`;
}

function getGoogleCallbackUri(req: express.Request): string {
    const offline = req.headers.host?.includes("127.0.0.1") || req.headers.host?.includes("localhost");
    return offline ? `http://${req.headers.host}${urlRootPath}/auth/google/callback` : `https://${req.headers.host}${urlRootPath}/auth/google/callback`;
}

// Discord login route
app.get(urlRootPath + '/auth/discord', (req, res) => {
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(getDiscordCallbackUri(req))}&response_type=code&scope=identify`;
    //If the app were verified, could add this to scope: %20relationships.read
    res.redirect(authorizeUrl);
});

// Discord callback route
app.get(urlRootPath + '/auth/discord/callback', asyncHandler(async (req: any, res: any)  => {
    const { code } = req.query;

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams(<Record<string, string>>{
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            code: code as string,
            grant_type: 'authorization_code',
            redirect_uri: getDiscordCallbackUri(req),
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const { access_token } = tokenResponse.data;

        // Use access token to get user info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        // Upsert player in database
        const { id, username, avatar } = userResponse.data;
        const playerId = await db.upsertDiscordPlayer({ id, avatar, username });

        //Disabled because Discord wants a privacy policy, terms of service, and other stuff I'm not going to do for a small app.
        //try {
        //    //Get Discord friends using the same token
        //    const friendsResponse = await axios.get('https://discord.com/api/users/@me/relationships', {
        //        headers: { Authorization: `Bearer ${access_token}`, },
        //    });
        //    const friendDiscordIDs = friendsResponse.data
        //        .filter((relationship: any) => relationship.type === 1)  // Type 1 represents friends
        //        .map((friend: any) => <string>friend.user.id); //Other accessible fields: username: friend.user.username, avatar: friend.user.avatar,

        //    //temporary: just log my friends' IDs
        //    console.log(friendDiscordIDs);

        //    //Add friends in database (no friend removal planned)
        //    db.addDiscordFriends(playerId, friendDiscordIDs);
        //} catch (error) {
        //    console.error('Discord friend-adding error:', error);
        //}

        // Create session
        const sessionId = uuidv4();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "); // 1 week from now
        await db.upsertSession({ sessionId, expires, playerId });

        res.cookie('sessionId', sessionId, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.redirect(urlRootPath + '/game.html');
    } catch (error) {
        console.error('Discord authentication error:', error);
        res.status(500).send('Authentication failed');
    }
}));

// Facebook login route
app.get(urlRootPath + '/auth/facebook', (req, res) => {
    const authorizeUrl = `https://www.facebook.com/v12.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(getFacebookCallbackUri(req))}&scope=public_profile`;
    res.redirect(authorizeUrl);
});

// Facebook callback route
app.get(urlRootPath + '/auth/facebook/callback', asyncHandler(async (req: any, res: any)  => {
    const { code } = req.query;

    try {
        // Exchange code for access token
        const tokenResponse = await axios.get(`https://graph.facebook.com/v12.0/oauth/access_token`, {
            params: {
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                code: code,
                redirect_uri: getFacebookCallbackUri(req),
            },
        });

        const { access_token } = tokenResponse.data;

        // Use access token to get user info
        const userResponse = await axios.get('https://graph.facebook.com/me', {
            params: {
                fields: 'id,name,email',
                access_token,
            },
        });

        const { id, name, email } = userResponse.data;

        // Upsert player in database
        const playerId = await db.upsertFacebookPlayer({ id, name, email });

        // Create session
        const sessionId = uuidv4();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "); // 1 week from now
        await db.upsertSession({ sessionId, expires, playerId });

        res.cookie('sessionId', sessionId, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.redirect(urlRootPath + '/game.html');
    } catch (error) {
        console.error('Facebook authentication error:', error);
        res.status(500).send('Authentication failed');
    }
}));

// Google login route
app.get(urlRootPath + '/auth/google', (req, res) => {
    const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_APP_ID}&redirect_uri=${encodeURIComponent(getGoogleCallbackUri(req))}&response_type=code&scope=profile`;
    res.redirect(authorizeUrl);
});

// Google callback route
app.get(urlRootPath + '/auth/google/callback', asyncHandler(async (req: any, res: any)  => {
    const { code } = req.query;

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams(<Record<string, string>>{
            client_id: GOOGLE_APP_ID,
            client_secret: GOOGLE_APP_SECRET,
            code: code as string,
            grant_type: 'authorization_code',
            redirect_uri: getGoogleCallbackUri(req),
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const { access_token } = tokenResponse.data;

        // Use access token to get user info
        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        const { id, name, picture } = userResponse.data;

        // Upsert player in database
        const playerId = await db.upsertGooglePlayer({ id, name, picture });

        // Create session
        const sessionId = uuidv4();
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "); // 1 week from now
        await db.upsertSession({ sessionId, expires, playerId });

        res.cookie('sessionId', sessionId, { httpOnly: true, secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.redirect(urlRootPath + '/game.html');
    } catch (error) {
        console.error('Google authentication error:', error);
        res.status(500).send('Authentication failed');
    }
}));

process.on('uncaughtException', (err) => {
    console.error(new Date().toISOString(), 'Uncaught Exception:', err);
    // Optionally, you can exit the process or perform other actions
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(new Date().toISOString(), 'Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally, you can exit the process or perform other actions
});
