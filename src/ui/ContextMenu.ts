import { Building } from "../game/Building.js";
import { City } from "../game/City.js";
import { GameState } from "../game/GameState.js";
import { Drawable } from "./Drawable.js";
import { IHasDrawable } from "./IHasDrawable.js";
import { TextureInfo } from "./TextureInfo.js";
import { UIManager } from "./UIManager.js";
import { addResourceCosts } from "./UIUtil.js";

export class ContextMenu implements IHasDrawable {
    private x = 0;
    private y = 0;
    private city: City | null = null;
    public building: Building | null = null;
    private lastDrawable: Drawable | null = null;
    public copying: boolean = false;
    public moving: boolean = false;
    public demolishing: boolean = false;
    public reopening: boolean = false;
    public repairing: boolean = false;
    public switchingOutputs: boolean = false;

    constructor(private uiManager: UIManager, private game: GameState) {
    }

    public update(city: City, x: number, y: number) {
        this.city = city;
        const possibleBuildings = this.city.getBuildingsInArea(x, y, 1, 1, 0, 0);
        this.building = possibleBuildings.size === 0 ? null : possibleBuildings.values().next().value || null;
        this.x = x;
        this.y = y;
        this.copying = false;
        this.moving = false;
        this.demolishing = false;
        this.reopening = false;
        this.repairing = false;
        this.switchingOutputs = false;
        if (this.building) city.drawInFrontBuildings = [this.building];
        else city.drawInFrontBuildings = [];
    }

    getPos(): { x: number, y: number } {
        return { x: this.x, y: this.y };
    }

    getLastDrawable(): Drawable | null {
        return this.lastDrawable;
    }

    isShown(): boolean {
        return !!this.building;
    }

    asDrawable(): Drawable {
        if (!this.isShown()) return this.lastDrawable = new Drawable({ width: "0px" }); //Nothing
        const building = this.building!; //Null checked in advance

        //Demolition menu (just price to demolish and an OK button with a backdrop)
        if (this.demolishing) return this.lastDrawable = this.drawDemolitionConfirmation(building);
        if (this.repairing) return this.lastDrawable = this.drawRepairConfirmation(building);
        if (this.reopening) return this.lastDrawable = this.drawReopenConfirmation(building);
        if (this.switchingOutputs) return this.lastDrawable = this.drawOutputSwitch(building);

        //Radial menu
        const menu = new Drawable({
            x: building.x + (building.width - 1) / 2, //These are world coordinates; the dimensions and children are not
            y: building.y - 1 + (building.height - 1) / 2,
            width: "0px",
            height: "0px",
            id: "constructMenu",
        });

        //Before the radial menu, draw another copy of the building itself. This is off by -1/2 tile (both x and y) for a (3,2) size building and off by +1/2 for a (2,3) building. But I think it's better to render out of order.
        //menu.addChild(new Drawable({
        //    x: -building.width / 2 * TILE_WIDTH + building.xDrawOffset,
        //    y: building.height / 2 * TILE_HEIGHT,
        //    anchors: ['selfBottom'],
        //    image: new TextureInfo(0, 0, `building/${building.type}`),
        //}));

        const menuRadius = 48; //This circle goes through the center of the menu items, i.e., 0 would stack them all up on each other, and equaling childWidth and childHeight makes their corners touch if there are 4 of them.
        const childWidth = 48;
        const childHeight = 48;
        if (building.canMove(this.city!) && this.uiManager.isMyCity) {
            menu.addChild(new Drawable({
                image: new TextureInfo(childWidth, childHeight, "ui/move"),
                id: menu.id + ".move",
                onClick: () => { this.moving = true; }
            }));
        }
        if (building.canStow(this.city!) && this.uiManager.isMyCity) {
            menu.addChild(new Drawable({
                image: new TextureInfo(childWidth, childHeight, "ui/remove"), //TODO: Need better icons for these
                id: menu.id + ".remove",
                onClick: () => {
                    this.city?.removeBuilding(building);
                    this.game.fullSave();
                }
            }));
        }
        if (building.canDemolish(this.city!) && this.uiManager.isMyCity) {
            menu.addChild(new Drawable({
                image: new TextureInfo(childWidth, childHeight, "ui/demolish"),
                id: menu.id + ".demo",
                onClick: () => { this.demolishing = true; }
            }));
        }

        menu.addChild(new Drawable({
            image: new TextureInfo(childWidth, childHeight, "ui/info"),
            id: menu.id + ".info",
            onClick: () => this.uiManager.showBuildingInfo(building),
        }));
        if (((building.owned && !building.isResidence) || this.city!.canBuildResources) && this.uiManager.isMyCity && building.isBuyable(this.city!)) {
            menu.addChild(new Drawable({
                image: new TextureInfo(childWidth, childHeight, "ui/buildcopy"),
                id: menu.id + ".buildcopy",
                onClick: () => { this.copying = true; }
            }));
        }
        if (building.owned && this.uiManager.isMyCity && building.outputResourceOptions.length > 1) {
            menu.addChild(new Drawable({
                image: new TextureInfo(childWidth, childHeight, "ui/switch"),
                id: menu.id + ".switch",
                onClick: () => { this.switchingOutputs = true; }
            }));
        }

        const optionCount = menu.children.length;
        const radius = optionCount > 1 ? menuRadius : 0;
        menu.children.forEach((child, index) => {
            const angle = (index / optionCount) * 2 * Math.PI;
            child.x = radius * Math.cos(angle) - childWidth / 2;
            child.y = radius * Math.sin(angle) - childHeight / 2;
            child.width = childWidth + "px";
            child.height = childHeight + "px";
        });

        this.lastDrawable = menu;
        return menu;
    }

    private drawDemolitionConfirmation(building: Building) {
        const confirmation = new Drawable({
            x: building.x + (building.width - 1) / 2 - 2, //-2 x and +3 y for rough centering
            y: building.y - 1 + (building.height - 1) / 2 + 3,
            width: "220px",
            height: "126px",
            fallbackColor: '#554422',
            id: "demolitionMenu",
        });

        //Building type icon (to the left of the demolition icon because that icon is a bulldozer facing left) :)
        confirmation.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, `building/${building.type}`),
        }));

        //Demolish icon
        confirmation.addChild(new Drawable({
            x: 58,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/demolish"),
        }));

        //'Demolish' text
        confirmation.addChild(new Drawable({
            x: 116,
            y: 22,
            width: "94px",
            height: "24px",
            text: "Demolish",
        }));

        confirmation.addChild(new Drawable({
            anchors: ['right', 'bottom'],
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, this.city?.canAffordDemolition(building) ? "ui/ok" : "ui/x"),
            id: confirmation.id + ".confirm",
            onClick: () => {
                if (this.city?.checkAndSpendResources(building.getDemolitionCosts(this.city!))) {
                    this.city?.removeBuilding(building, true);
                    this.game.fullSave();
                }
                this.building = null;
                this.demolishing = false;
            },
        }));

        const costs = building.getDemolitionCosts(this.city!);
        if (costs.length) {
            let nextY = 68;
            const actualCosts = costs.filter(p => p.amount > 0);
            if (actualCosts.length) {
                confirmation.addChild(new Drawable({
                    x: 10,
                    y: nextY,
                    width: "160px",
                    height: "24px",
                    text: "You pay:",
                }));
                nextY += 24;

                addResourceCosts(confirmation, actualCosts, 10, nextY, false, false, false, 32, 4, 24, 4, false, !this.city!.hasResources(actualCosts), this.city!);
                nextY += 70; //resource icon size (32) + padding (4) + font height (24) + some more padding
            } else {
                confirmation.addChild(new Drawable({
                    x: 10,
                    y: nextY,
                    width: "160px",
                    height: "24px",
                    text: "Free",
                }));
                nextY += 24;
            }
            if (actualCosts.length < costs.length) {
                confirmation.addChild(new Drawable({
                    x: 10,
                    y: nextY,
                    width: "160px",
                    height: "24px",
                    text: "You get:",
                }));
                nextY += 24;

                const gains = costs.filter(p => p.amount < 0);
                gains.forEach(p => p.amount = -p.amount);
                addResourceCosts(confirmation, gains, 10, nextY, false, false, false, 32, 4, 24, 4);
                nextY += 70;
            }
            confirmation.height = nextY - 6 + "px";
        } else {
            confirmation.addChild(new Drawable({
                x: 10,
                y: 68,
                width: "160px",
                height: "24px",
                text: "Free",
            }));
        }
        
        return confirmation;
    }

    //SIMILAR to the above, but doesn't show any "you get", and shows 'ui/reopen' instead of the bulldozer. And the accept button calls building.reopenBusiness(city)
    private drawReopenConfirmation(building: Building) {
        const confirmation = new Drawable({
            x: building.x + (building.width - 1) / 2 - 2, //-2 x and +3 y for rough centering
            y: building.y - 1 + (building.height - 1) / 2 + 3,
            width: "330px",
            height: "126px",
            fallbackColor: '#554422',
            id: "reopenMenu",
        });

        //Building type icon (to the left of the demolition icon because that icon is a bulldozer facing left) :)
        confirmation.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, `building/${building.type}`),
        }));

        //Reopen icon
        confirmation.addChild(new Drawable({
            x: 58,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/reopen"),
        }));

        //'Reopen' text
        confirmation.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 22,
            width: "204px",
            height: "24px",
            text: "Reopen",
            rightAlign: true,
        }));

        let nextY = 68;
        confirmation.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "310px",
            height: "24px",
            text: "Failed due to not reaching 10% patronage for a while. It will only reopen if you pay:",
            wordWrap: true,
        }));
        nextY += 56; //Assuming it's two lines

        const cost = [{ type: "flunds", amount: building.businessValue }];
        confirmation.addChild(new Drawable({
            anchors: ['right', 'bottom'],
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, this.city?.hasResources(cost) ? "ui/ok" : "ui/x"),
            id: confirmation.id + ".confirm",
            onClick: () => {
                if (this.city?.hasResources(cost)) {
                    building.reopenBusiness(this.city!);
                    this.game.fullSave();
                }
                this.building = null;
                this.reopening = false;
            },
        }));
        
        nextY += 24;
        addResourceCosts(confirmation, cost, 10, nextY, false, false, false, 32, 4, 24, 4, false, !this.city!.hasResources(cost), this.city!);
        nextY += 70; //resource icon size (32) + padding (4) + font height (24) + some more padding
        confirmation.height = nextY - 6 + "px";

        return confirmation;
    }

    //Basically identical to the above except it's for repairing and only costs a fraction of the flunds and wood (if the building had any wood cost).
    private drawRepairConfirmation(building: Building) {
        const confirmation = new Drawable({
            x: building.x + (building.width - 1) / 2 - 2, //-2 x and +3 y for rough centering
            y: building.y - 1 + (building.height - 1) / 2 + 3,
            width: "330px",
            height: "126px",
            fallbackColor: '#554422',
            id: "repairMenu",
        });

        //Building type icon (to the left of the demolition icon because that icon is a bulldozer facing left) :)
        confirmation.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, `building/${building.type}`),
        }));

        //Repair icon
        confirmation.addChild(new Drawable({
            x: 58,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/fire"),
        }));

        //'Repair' text
        confirmation.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 22,
            width: "204px",
            height: "24px",
            text: "Repair",
            rightAlign: true,
        }));

        let nextY = 68;
        confirmation.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "310px",
            height: "24px",
            text: "Repair this building for part of the original cost:",
            wordWrap: true,
        }));
        nextY += 56; //Assuming it's two lines

        //Cost is a fraction of the original building materials plus flunds. Note: buildings with increasing costs as you build more of them would have much higher repair costs, too.
        const costs = building.getCosts(this.city!).map(p => ({ type: p.type, amount: Math.floor((1 - building.damagedEfficiency) ** 1.5 * p.amount) + (p.type === 'flunds' ? 10 : 0) })).filter(p => p.amount > 0);
        confirmation.addChild(new Drawable({
            anchors: ['right', 'bottom'],
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, this.city?.hasResources(costs) ? "ui/ok" : "ui/x"),
            id: confirmation.id + ".confirm",
            onClick: () => {
                if (this.city?.checkAndSpendResources(costs)) {
                    building.repair(this.city);
                    this.game.fullSave();
                }
                this.building = null;
                this.repairing = false;
            },
        }));

        nextY += 24;
        addResourceCosts(confirmation, costs, 10, nextY, false, false, false, 32, 4, 24, 4, false, !this.city!.hasResources(costs), this.city!);
        nextY += 70; //resource icon size (32) + padding (4) + font height (24) + some more padding
        confirmation.height = nextY - 6 + "px";

        return confirmation;
    }

    //Also similar to the above, but shows a list of output resources (building.outputResourceOptions) and you can click any one of them to switch the building's output.
    private drawOutputSwitch(building: Building) {
        const confirmation = new Drawable({
            x: building.x + (building.width - 1) / 2 - 2, //-2 x and +3 y for rough centering
            y: building.y - 1 + (building.height - 1) / 2 + 3,
            width: "330px",
            height: "500px",
            fallbackColor: '#554422',
            id: "outputSwitchMenu",
        });

        //Building type icon
        confirmation.addChild(new Drawable({
            x: 10,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, `building/${building.type}`),
        }));

        //Current output icon
        confirmation.addChild(new Drawable({
            x: 58,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, `resource/${building.outputResources[0].type}`),
        }));

        //Switch icon
        confirmation.addChild(new Drawable({
            x: 106,
            y: 10,
            width: "48px",
            height: "48px",
            image: new TextureInfo(48, 48, "ui/switch"),
        }));

        //'Switch output' text
        confirmation.addChild(new Drawable({
            anchors: ['right'],
            x: 10,
            y: 22,
            width: "204px",
            height: "24px",
            text: "Switch output",
            rightAlign: true,
        }));

        let nextY = 68;
        confirmation.addChild(new Drawable({
            x: 10,
            y: nextY,
            width: "310px",
            height: "24px",
            text: "Switch this building's output type:",
            wordWrap: true,
        }));
        nextY += 56; //Assuming it's two lines

        building.outputResourceOptions.forEach((resource) => {
            //Icon first, to the left of the text
            confirmation.addChild(new Drawable({
                x: 10,
                y: nextY,
                width: "24px",
                height: "24px",
                image: new TextureInfo(24, 24, `resource/${resource.type}`),
            }));
            confirmation.addChild(new Drawable({
                x: 44,
                y: nextY,
                width: "276px",
                height: "24px",
                text: resource.displayName,
                onClick: () => {
                    //Collect as if you had clicked the building first
                    this.city?.transferResourcesFrom(building.outputResources, "produce");
                    building.outputResources = [resource.clone()];
                    this.game.fullSave();
                    this.building = null;
                    this.switchingOutputs = false;
                },
            }));
            nextY += 30;
        });

        confirmation.height = nextY - 6 + "px";

        return confirmation;
    }
}