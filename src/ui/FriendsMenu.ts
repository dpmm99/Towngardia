import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { Player } from "../game/Player.js";
import { UIManager } from "./UIManager.js";
import { StandardScroller } from "./StandardScroller.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { City } from "../game/City.js";

export class FriendsMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private friendIconSize = 48;
    private cityIconSize = 32;
    private itemPadding = 10;
    private requestedAvatars = new Set<string>();

    constructor(private player: Player, private uiManager: UIManager) { }

    onResize(): void { this.scroller.onResize(); }

    public show(): void {
        this.shown = true;
        this.scroller.resetScroll();
    }

    public isShown(): boolean {
        return this.shown;
    }

    public hide(): void {
        this.shown = false;
    }

    asDrawable(): Drawable {
        if (!this.shown) return this.lastDrawable = new Drawable({ width: "0px" });

        this.startAvatarDownloads();

        const menuDrawable = new Drawable({
            x: 0,
            y: 0,
            width: "100%",
            height: "100%",
            fallbackColor: '#222222',
            id: "friendsMenu",
            onDrag: (x: number, y: number) => {
                this.scroller.handleDrag(y, menuDrawable.screenArea);
            },
            onDragEnd: () => {
                this.scroller.resetDrag();
            }
        });

        // Menu icon
        menuDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "64px",
            height: "64px",
            image: new TextureInfo(64, 64, "ui/friends")
        }));

        // Menu title
        menuDrawable.addChild(new Drawable({
            x: 84,
            y: 26,
            text: "Friends and Cities",
            width: "300px",
            height: "32px",
        }));

        // Close button
        menuDrawable.addChild(new Drawable({
            x: 10,
            y: 10,
            anchors: ['right'],
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/x"),
            biggerOnMobile: true,
            onClick: () => this.hide()
        }));

        let yOffset = 100 - this.scroller.getScroll();
        
        // Add current player's cities
        yOffset = this.addPlayerCities(menuDrawable, this.player, yOffset, true);

        // Add friends and their cities
        this.player.friends.forEach(friend => {
            yOffset = this.addPlayerCities(menuDrawable, friend, yOffset, false);
        });

        //At the very bottom (discouraging long friends lists ;)), a button to add more friends!
        const addFriendContainer = new Drawable({
            x: 10,
            y: yOffset,
            width: "100%",
            height: `${this.friendIconSize}px`,
            fallbackColor: '#333333',
            onClick: () => this.uiManager.showAddFriendDialog()
        });
        addFriendContainer.addChild(new Drawable({
            x: 10,
            width: `${this.friendIconSize}px`,
            height: `${this.friendIconSize}px`,
            image: new TextureInfo(this.friendIconSize, this.friendIconSize, 'ui/addfriend'),
            fallbackColor: '#00000000',
        }));
        addFriendContainer.addChild(new Drawable({
            x: this.friendIconSize + 20,
            y: 8,
            width: `calc(100% - ${this.friendIconSize + 30}px)`,
            height: "32px",
            text: "Add friend...",
        }));
        menuDrawable.addChild(addFriendContainer);
        yOffset += this.friendIconSize + this.itemPadding;

        const newCityContainer = new Drawable({
            x: 10,
            y: yOffset,
            width: "100%",
            height: `${this.friendIconSize}px`,
            fallbackColor: '#444444',
            onClick: () => {
                const newCityName = prompt("Entitle thy new concrete jungle:", this.player.name + "gardia");
                if (!newCityName) return;
                const newCity = new City(this.player, "", newCityName, 64, 64);
                newCity.startNew();
                this.player.addCity(newCity);
                this.uiManager.switchCity(newCity, this.player);
            }
        });
        newCityContainer.addChild(new Drawable({
            x: 10,
            width: `${this.friendIconSize}px`,
            height: `${this.friendIconSize}px`,
            image: new TextureInfo(this.friendIconSize, this.friendIconSize, 'ui/newcity'),
            fallbackColor: '#00000000',
        }));
        newCityContainer.addChild(new Drawable({
            x: this.friendIconSize + 20,
            y: 6,
            width: `calc(100% - ${this.friendIconSize + 30}px)`,
            height: "32px",
            text: "New City...",
        }));
        menuDrawable.addChild(newCityContainer);
        yOffset += this.friendIconSize + this.itemPadding;

        this.scroller.setChildrenSize(yOffset + 50); // Add some extra padding at the bottom

        this.lastDrawable = menuDrawable;
        return menuDrawable;
    }

    private startAvatarDownloads() {
        //Check and load avatars for the player and all their friends
        const urls = {
            [`avatar/${this.player.id}`]: this.player.avatar,
            ...this.player.friends.reduce((acc, friend) => {
                acc[`avatar/${friend.id}`] = friend.avatar;
                return acc;
            }, <{ [key: string]: string; }>{})
        };
        const missingUrls = Object.fromEntries(
            Object.entries(urls).filter(([key, val]) => val && !this.requestedAvatars.has(key))
        );
        for (const url of Object.keys(missingUrls)) this.requestedAvatars.add(url);

        //This function isn't async, so we can't wait for the sprite loads to complete. Instead, above, we've recorded which ones we've ASKED to load so we don't repeat.
        //And we tell the UI Manager to redraw as soon as they're done loading.
        this.uiManager.renderer.loadMoreSprites(this.uiManager.game.city!, missingUrls).then(() => this.uiManager.frameRequested = true);
    }

    private addPlayerCities(menuDrawable: Drawable, player: Player, yOffset: number, isCurrentPlayer: boolean): number {
        // Player name and icon
        const playerContainer = new Drawable({
            x: 10,
            y: yOffset,
            width: "100%",
            height: `${this.friendIconSize}px`,
            fallbackColor: '#333333',
        });

        playerContainer.addChild(new Drawable({
            x: 10,
            width: `${this.friendIconSize}px`,
            height: `${this.friendIconSize}px`,
            image: new TextureInfo(this.friendIconSize, this.friendIconSize, `avatar/${player.id}`),
            fallbackColor: '#00000000',
        }));

        playerContainer.addChild(new Drawable({
            x: this.friendIconSize + 20,
            y: 8,
            text: isCurrentPlayer ? "Your Cities" : `${player.name}'s Cities`,
            width: `calc(100% - ${this.cityIconSize + 30}px)`,
            height: "32px"
        }));

        menuDrawable.addChild(playerContainer);
        yOffset += this.friendIconSize + this.itemPadding;

        // Player's cities
        player.cities.forEach(city => {
            const isCurrentCity = this.uiManager.game.city === city && this.uiManager.game.visitingCity === null && player === this.player;
            const cityContainer = new Drawable({
                x: 20,
                y: yOffset,
                width: "100%",
                height: `${this.cityIconSize}px`,
                fallbackColor: '#444444',
                onClick: () => {
                    if (isCurrentCity) {
                        //You're in this city already. Clicking renames it instead.
                        const newCityName = prompt("Re-entitle thy existing concrete jungle:", city.name);
                        if (newCityName) city.name = newCityName;
                    }
                    else this.uiManager.switchCity(city instanceof City ? city : (<any>city).id, player);
                }
            });

            cityContainer.addChild(new Drawable({
                x: 10,
                width: `${this.cityIconSize}px`,
                height: `${this.cityIconSize}px`,
                image: new TextureInfo(this.cityIconSize, this.cityIconSize, `cities/${city.id}`), //TODO: an occasional city snapshot? Seems a bit tough!
                fallbackColor: '#00000000',
            }));

            cityContainer.addChild(new Drawable({
                x: this.cityIconSize + 20,
                y: 6,
                text: city.name + (isCurrentCity ? " (Tap to rename)" : ""),
                width: `calc(100% - ${this.cityIconSize + 30}px)`,
                height: "20px"
            }));

            menuDrawable.addChild(cityContainer);
            yOffset += this.cityIconSize + this.itemPadding;
        });

        return yOffset + this.itemPadding;
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }
}