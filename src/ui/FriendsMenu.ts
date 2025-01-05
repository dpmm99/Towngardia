import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { Player } from "../game/Player.js";
import { UIManager } from "./UIManager.js";
import { StandardScroller } from "./StandardScroller.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { IOnResizeEvent } from "./IOnResizeEvent.js";
import { City } from "../game/City.js";
import { REGIONS } from "../game/Region.js";

export class FriendsMenu implements IHasDrawable, IOnResizeEvent {
    private lastDrawable: Drawable | null = null;
    private shown: boolean = false;
    private scroller = new StandardScroller(false, true);
    private friendIconSize = 48;
    private cityIconSize = 32;
    private itemPadding = 10;
    private requestedAvatars = new Set<string>();
    private showRegionPicker: boolean = false;

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

    newCity(regionID: string): boolean {
        const newCityName = prompt("Entitle thy new concrete jungle:", this.player.name + "gardia");
        if (!newCityName) return false;
        const newCity = new City(this.player, "", newCityName, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, regionID);
        newCity.startNew();
        this.player.addCity(newCity);
        this.uiManager.switchCity(newCity, this.player);
        return true;
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

        let yOffset = 100 - this.scroller.getScroll();
        let baseY = yOffset;

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
            y: 10,
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
                //if player has regions unlocked, toggle the region picker instead of assuming they want a new Plains city
                if (this.player.achievements.some(p => p.attained && p.id === "plainsandastralplanes")) this.showRegionPicker = !this.showRegionPicker;
                else this.newCity(REGIONS[0].id);
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
            y: 10,
            width: `calc(100% - ${this.friendIconSize + 30}px)`,
            height: "32px",
            text: this.showRegionPicker ? "Pick a region for your new city:" : "New City...",
        }));
        menuDrawable.addChild(newCityContainer);
        yOffset += this.friendIconSize + this.itemPadding;

        if (this.showRegionPicker) {
            //Draw list of regions; clicking one creates a new city instead of newCityContainer doing so
            const regionClickableWidth = this.friendIconSize * 4;
            const regionClickableHeight = this.friendIconSize * 2 + 30; //The extra 30 is for the text.
            const regionPickerHeight = regionClickableHeight * Math.ceil(REGIONS.length / 3) + this.itemPadding * 2;
            const regionPickerContainer = new Drawable({
                x: this.itemPadding,
                y: yOffset,
                width: "100%",
                height: `${regionPickerHeight}px`,
                fallbackColor: '#444444',
            });
            REGIONS.forEach((region, i) => {
                //Clickable area is not the image itself
                const clickable = regionPickerContainer.addChild(new Drawable({
                    x: this.itemPadding + (regionClickableWidth + this.itemPadding) * (i % 3), //Assuming 3 will fit per row
                    y: this.itemPadding + regionClickableHeight * Math.floor(i / 3),
                    width: `${regionClickableWidth}px`,
                    height: `${regionClickableHeight}px`,
                    fallbackColor: '#00000000',
                    onClick: () => {
                        if (this.newCity(region.id)) this.showRegionPicker = false;
                    }
                }));
                clickable.addChild(new Drawable({
                    width: `${this.friendIconSize * 4}px`,
                    height: `${this.friendIconSize * 2}px`,
                    image: new TextureInfo(this.friendIconSize * 2, this.friendIconSize * 4, 'region/' + region.id),
                    fallbackColor: '#00000000',
                }));
                clickable.addChild(new Drawable({
                    anchors: ['bottom', 'centerX'],
                    y: -10,
                    centerOnOwnX: true,
                    width: "calc(100% - 20px)",
                    height: "30px",
                    text: region.displayName,
                }));
            });
            menuDrawable.addChild(regionPickerContainer);
            yOffset += regionPickerHeight + this.itemPadding;
        }

        this.scroller.setChildrenSize(yOffset - baseY + 130); // Add some extra padding at the bottom

        //Top bar (menu icon, title, close button)
        const topContainer = menuDrawable.addChild(new Drawable({
            width: "100%",
            height: "84px",
            fallbackColor: '#222222',
        }));

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
            onClick: () => this.uiManager.hideFriendsMenu()
        }));

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
            Object.entries(urls).filter(([key, val]) => !this.requestedAvatars.has(key)) //Moved the filter into the CanvasRenderer so it knows not to try to lazy-load nonexistent avatars
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
            y: 10,
            text: isCurrentPlayer ? "Your Cities" : !player.finishedTutorial ? `${player.name} (Still in tutorial)` : `${player.name}'s Cities`,
            width: `calc(100% - ${this.cityIconSize + 30}px)`,
            height: "32px"
        }));

        menuDrawable.addChild(playerContainer);
        yOffset += this.friendIconSize + this.itemPadding;

        // Player's cities
        if (player.finishedTutorial)
            player.cities.forEach(city => {
                const isCurrentCity = this.uiManager.game.city === city && this.uiManager.game.visitingCity === null && player === this.player;
                const isLastCity = this.uiManager.game.city === city && this.uiManager.game.visitingCity !== null && player === this.player;
                const cityContainer = new Drawable({
                    x: 20,
                    y: yOffset,
                    width: "100%",
                    height: `${this.cityIconSize}px`,
                    fallbackColor: (isCurrentCity || this.uiManager.game.visitingCity?.id === city.id) ? '#445555' : isLastCity ? '#555555' : '#444444',
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
                    // image: new TextureInfo(this.cityIconSize, this.cityIconSize, `cities/${city.id}`), //TODO: an occasional city snapshot? Seems a bit tough!
                    fallbackColor: '#00000000',
                }));

                cityContainer.addChild(new Drawable({
                    x: this.cityIconSize + 20,
                    y: 8,
                    text: city.name + (isCurrentCity ? " (Tap to rename)" : isLastCity ? " (Playing as)" : ""),
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