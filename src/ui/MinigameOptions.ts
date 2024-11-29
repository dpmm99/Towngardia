import { getBuildingType, MinigameMinilab } from "../game/BuildingTypes.js";
import { City } from "../game/City.js";
import { Drawable } from "./Drawable.js";
import { TextureInfo } from "./TextureInfo.js";

//Drawable-generating UI function for options unlocked by the Minigame Minilab. Any word-wrap must be done manually in the callers so that the return nextY is calculable.
//Group: probably just the minigame name (or just one or two letters of it). ID: Should be globally distinct so unlockedMinigameOptions can just be a set. Icon: full ID; won't assume ui/ or anything.
export function drawMinigameOptions(city: City, parent: Drawable, nextY: number, options: { group: string, id: string, text: string, icon: string }[]): number {
    if (!city.presentBuildingCount.get(getBuildingType(MinigameMinilab))) return nextY; //Hasn't been built yet. Don't reeeally care if it was stashed, since stashing it hurts in other ways.
    nextY += 20; //Extra padding at the top

    parent.addChild(new Drawable({
        anchors: ['centerX'],
        centerOnOwnX: true,
        y: nextY,
        width: "100%",
        height: "32px",
        text: "Reward Set Options:",
    }));
    nextY += 42;

    options.forEach(option => {
        //Assume the first option in each group should be selected if the options haven't been set by the player yet.
        if (city.minigameOptions.get(option.group) === undefined) {
            city.unlockedMinigameOptions.add(option.group + option.id);
            city.minigameOptions.set(option.group, option.id);
        }
        const optionBox = parent.addChild(new Drawable({
            y: nextY,
            width: "100%",
            height: "42px",
            fallbackColor: city.minigameOptions.get(option.group) === option.id ? "#223344" : "#00000000",
            onClick: () => { if (city.unlockedMinigameOptions.has(option.group + option.id)) city.minigameOptions.set(option.group, option.id); }
        }));
        if (option.icon) optionBox.addChild(new Drawable({
            x: 10,
            y: 5,
            width: "32px",
            height: "32px",
            image: new TextureInfo(32, 32, option.icon),
            grayscale: !city.unlockedMinigameOptions.has(option.group + option.id),
        }));
        optionBox.addChild(new Drawable({
            x: option.icon ? 50 : 10,
            y: 13,
            width: option.icon ? "calc(100% - 70px)" : "calc(100% - 20px)",
            height: "24px",
            text: option.text,
            grayscale: !city.unlockedMinigameOptions.has(option.group + option.id),
        }));
        //TODO: Consider adding descriptions
        nextY += 52;
    });

    return nextY;
}
